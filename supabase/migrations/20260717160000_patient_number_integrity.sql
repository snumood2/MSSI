BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_number_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_code TEXT NOT NULL,
  old_patient_number TEXT NOT NULL CHECK (old_patient_number ~ '^[0-9]{8}$'),
  new_patient_number TEXT NOT NULL CHECK (new_patient_number ~ '^[0-9]{8}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_patient_number_change_pending
  ON public.patient_number_change_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_patient_number_change_patient
  ON public.patient_number_change_requests(patient_id, requested_at DESC);

ALTER TABLE public.patient_number_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_number_change_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id
     AND COALESCE(current_setting('app.patient_number_change_authorized', true), '') <> 'on'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.hospital_code IS DISTINCT FROM OLD.hospital_code
       OR NEW.patient_number IS DISTINCT FROM OLD.patient_number
       OR NEW.dob IS DISTINCT FROM OLD.dob
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     ) THEN
    RAISE EXCEPTION '보안 관련 프로필 필드는 직접 변경할 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_number_is_available(
  p_hospital_code TEXT,
  p_patient_number TEXT,
  p_exclude_patient_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'patient'
      AND p.hospital_code = p_hospital_code
      AND p.patient_number = p_patient_number
      AND (p_exclude_patient_id IS NULL OR p.id <> p_exclude_patient_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.survey_responses sr
    WHERE sr.hospital_code = p_hospital_code
      AND sr.patient_number = p_patient_number
      AND (
        p_exclude_patient_id IS NULL
        OR COALESCE(sr.patient_user_id, sr.patient_id) IS NULL
        OR COALESCE(sr.patient_user_id, sr.patient_id) <> p_exclude_patient_id
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  requested_role TEXT := COALESCE(NULLIF(meta->>'role', ''), 'patient');
  v_role TEXT;
  v_hospital_code TEXT := UPPER(NULLIF(BTRIM(meta->>'hospital_code'), ''));
  v_patient_number TEXT := NULLIF(BTRIM(meta->>'patient_number'), '');
  v_dob TEXT := NULLIF(BTRIM(meta->>'dob'), '');
BEGIN
  IF requested_role = 'doctor_pending' THEN v_role := 'doctor_pending';
  ELSIF requested_role = 'patient' THEN v_role := 'patient';
  ELSE RAISE EXCEPTION '허용되지 않은 가입 역할입니다.';
  END IF;

  IF char_length(COALESCE(meta->>'username', '')) > 80
     OR char_length(COALESCE(meta->>'doctor_name', '')) > 100
     OR char_length(COALESCE(meta->>'hospital_name', '')) > 150 THEN
    RAISE EXCEPTION '가입 정보가 허용 길이를 초과했습니다.';
  END IF;

  IF v_role = 'patient' THEN
    IF v_hospital_code IS NULL THEN RAISE EXCEPTION '병원코드가 필요합니다.'; END IF;
    IF v_patient_number IS NULL OR v_patient_number !~ '^[0-9]{8}$' THEN
      RAISE EXCEPTION '환자번호는 8자리 숫자여야 합니다.';
    END IF;
    IF v_dob IS NULL OR v_dob !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION '생년월 형식이 올바르지 않습니다.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE hospital_code = v_hospital_code AND role = 'doctor'
    ) THEN
      RAISE EXCEPTION '존재하지 않거나 미승인된 병원코드입니다.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_hospital_code || ':' || v_patient_number, 0));
    IF NOT public.patient_number_is_available(v_hospital_code, v_patient_number, NULL) THEN
      RAISE EXCEPTION '이미 등록된 환자번호입니다.';
    END IF;
  ELSE
    IF NULLIF(BTRIM(meta->>'doctor_name'), '') IS NULL
       OR NULLIF(BTRIM(meta->>'hospital_name'), '') IS NULL
       OR v_hospital_code IS NULL THEN
      RAISE EXCEPTION '의사 가입 정보가 부족합니다.';
    END IF;
    v_patient_number := NULL;
    v_dob := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, email, username, role, doctor_name, hospital_name, hospital_code,
    dob, patient_number, full_name
  ) VALUES (
    NEW.id, NEW.email,
    LEFT(COALESCE(NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1)), 80),
    v_role,
    CASE WHEN v_role = 'doctor_pending' THEN LEFT(NULLIF(BTRIM(meta->>'doctor_name'), ''), 100) END,
    CASE WHEN v_role = 'doctor_pending' THEN LEFT(NULLIF(BTRIM(meta->>'hospital_name'), ''), 150) END,
    v_hospital_code, v_dob, v_patient_number,
    LEFT(COALESCE(NULLIF(BTRIM(meta->>'doctor_name'), ''), NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1)), 100)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_patient_number_change(p_new_patient_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_request_id UUID;
  v_has_completed BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  p_new_patient_number := BTRIM(p_new_patient_number);
  IF p_new_patient_number !~ '^[0-9]{8}$' THEN RAISE EXCEPTION '환자번호는 8자리 숫자여야 합니다.'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid AND role = 'patient' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '환자 계정만 번호를 변경할 수 있습니다.'; END IF;
  IF v_profile.patient_number = p_new_patient_number THEN RAISE EXCEPTION '현재 번호와 같습니다.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_profile.hospital_code || ':' || p_new_patient_number, 0));
  IF NOT public.patient_number_is_available(v_profile.hospital_code, p_new_patient_number, v_uid) THEN
    RAISE EXCEPTION '이미 등록된 번호입니다. 담당자에게 문의하세요.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.survey_responses
    WHERE COALESCE(patient_user_id, patient_id) = v_uid AND (status = 'completed' OR completed = TRUE)
  ) INTO v_has_completed;

  UPDATE public.patient_number_change_requests
  SET status = 'rejected', reviewed_at = now(), review_note = '새 변경 요청으로 대체됨'
  WHERE patient_id = v_uid AND status = 'pending';

  INSERT INTO public.patient_number_change_requests (
    patient_id, hospital_code, old_patient_number, new_patient_number, status, reason,
    reviewed_by, reviewed_at, review_note
  ) VALUES (
    v_uid, v_profile.hospital_code, v_profile.patient_number, p_new_patient_number,
    CASE WHEN v_has_completed THEN 'pending' ELSE 'approved' END,
    CASE WHEN v_has_completed THEN '환자 본인 변경 요청' ELSE '완료 결과 생성 전 본인 수정' END,
    CASE WHEN v_has_completed THEN NULL ELSE v_uid END,
    CASE WHEN v_has_completed THEN NULL ELSE now() END,
    CASE WHEN v_has_completed THEN NULL ELSE '완료 결과가 없어 즉시 적용됨' END
  ) RETURNING id INTO v_request_id;

  IF NOT v_has_completed THEN
    PERFORM set_config('app.patient_number_change_authorized', 'on', true);
    UPDATE public.profiles SET patient_number = p_new_patient_number, updated_at = now() WHERE id = v_uid;
    UPDATE public.survey_responses
    SET patient_number = p_new_patient_number,
        assessment_key = CASE WHEN assessment_no IS NULL THEN NULL ELSE p_new_patient_number || '-' || assessment_no END,
        updated_at = now()
    WHERE COALESCE(patient_user_id, patient_id) = v_uid;
    RETURN jsonb_build_object('status', 'applied', 'request_id', v_request_id, 'new_patient_number', p_new_patient_number);
  END IF;
  RETURN jsonb_build_object('status', 'pending', 'request_id', v_request_id, 'new_patient_number', p_new_patient_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_patient_number_change_requests()
RETURNS TABLE (
  request_id UUID, patient_id UUID, hospital_code TEXT, old_patient_number TEXT,
  new_patient_number TEXT, requested_at TIMESTAMPTZ, username TEXT, dob TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role TEXT; v_hospital TEXT;
BEGIN
  SELECT role, p.hospital_code INTO v_role, v_hospital FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role NOT IN ('doctor', 'admin') THEN RAISE EXCEPTION '조회 권한이 없습니다.'; END IF;
  RETURN QUERY
  SELECT r.id, r.patient_id, r.hospital_code, r.old_patient_number, r.new_patient_number,
         r.requested_at, p.username, p.dob
  FROM public.patient_number_change_requests r
  JOIN public.profiles p ON p.id = r.patient_id
  WHERE r.status = 'pending' AND (v_role = 'admin' OR r.hospital_code = v_hospital)
  ORDER BY r.requested_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_patient_number_change(
  p_request_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT; v_hospital TEXT;
  v_request public.patient_number_change_requests%ROWTYPE;
BEGIN
  SELECT role, p.hospital_code INTO v_role, v_hospital FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role NOT IN ('doctor', 'admin') THEN RAISE EXCEPTION '승인 권한이 없습니다.'; END IF;
  SELECT * INTO v_request FROM public.patient_number_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN RAISE EXCEPTION '처리할 수 없는 요청입니다.'; END IF;
  IF v_role = 'doctor' AND v_request.hospital_code <> v_hospital THEN RAISE EXCEPTION '다른 병원의 요청입니다.'; END IF;

  IF p_approve THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_request.hospital_code || ':' || v_request.new_patient_number, 0));
    IF NOT public.patient_number_is_available(v_request.hospital_code, v_request.new_patient_number, v_request.patient_id) THEN
      RAISE EXCEPTION '새 번호가 이미 등록되어 승인할 수 없습니다.';
    END IF;
    PERFORM set_config('app.patient_number_change_authorized', 'on', true);
    UPDATE public.profiles SET patient_number = v_request.new_patient_number, updated_at = now()
    WHERE id = v_request.patient_id AND role = 'patient';
    IF NOT FOUND THEN RAISE EXCEPTION '환자 프로필을 찾을 수 없습니다.'; END IF;
    UPDATE public.survey_responses
    SET patient_number = v_request.new_patient_number,
        assessment_key = CASE WHEN assessment_no IS NULL THEN NULL ELSE v_request.new_patient_number || '-' || assessment_no END,
        updated_at = now()
    WHERE COALESCE(patient_user_id, patient_id) = v_request.patient_id;
  END IF;

  UPDATE public.patient_number_change_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = LEFT(NULLIF(BTRIM(p_note), ''), 500)
  WHERE id = p_request_id;
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, 'request_id', p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.patient_number_is_available(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_patient_number_change(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_patient_number_change_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_patient_number_change(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_patient_number_change(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_patient_number_change_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_patient_number_change(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

COMMIT;
