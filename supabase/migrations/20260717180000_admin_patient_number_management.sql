BEGIN;

ALTER TABLE public.patient_number_change_requests
  ADD COLUMN IF NOT EXISTS sheet_sync_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (sheet_sync_status IN ('not_required', 'pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS sheet_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sheet_sync_error TEXT;

CREATE OR REPLACE FUNCTION public.admin_lookup_patient_number(
  p_hospital_code TEXT,
  p_patient_number TEXT
)
RETURNS TABLE (
  hospital_code TEXT,
  patient_number TEXT,
  username TEXT,
  dob TEXT,
  completed_results BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;

  p_hospital_code := UPPER(BTRIM(p_hospital_code));
  p_patient_number := BTRIM(p_patient_number);
  IF p_hospital_code = '' OR p_patient_number !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION '병원코드와 8자리 번호를 확인하세요.';
  END IF;

  RETURN QUERY
  SELECT p.hospital_code, p.patient_number, p.username, p.dob,
         COUNT(sr.id) FILTER (WHERE sr.status = 'completed' OR sr.completed = TRUE)
  FROM public.profiles p
  LEFT JOIN public.survey_responses sr
    ON COALESCE(sr.patient_user_id, sr.patient_id) = p.id
  WHERE p.role = 'patient'
    AND p.hospital_code = p_hospital_code
    AND p.patient_number = p_patient_number
  GROUP BY p.id, p.hospital_code, p.patient_number, p.username, p.dob;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_patient_number(
  p_hospital_code TEXT,
  p_current_patient_number TEXT,
  p_new_patient_number TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_patient public.profiles%ROWTYPE;
  v_request_id UUID;
  v_updated_results INTEGER;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;

  p_hospital_code := UPPER(BTRIM(p_hospital_code));
  p_current_patient_number := BTRIM(p_current_patient_number);
  p_new_patient_number := BTRIM(p_new_patient_number);
  IF p_hospital_code = ''
     OR p_current_patient_number !~ '^[0-9]{8}$'
     OR p_new_patient_number !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION '병원코드와 8자리 번호를 확인하세요.';
  END IF;
  IF p_current_patient_number = p_new_patient_number THEN
    RAISE EXCEPTION '현재 번호와 새 번호가 같습니다.';
  END IF;

  SELECT * INTO v_patient
  FROM public.profiles p
  WHERE p.role = 'patient'
    AND p.hospital_code = p_hospital_code
    AND p.patient_number = p_current_patient_number
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '해당 환자 계정을 찾을 수 없습니다.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_hospital_code || ':' || p_new_patient_number, 0));
  IF NOT public.patient_number_is_available(p_hospital_code, p_new_patient_number, v_patient.id) THEN
    RAISE EXCEPTION '새 번호가 이미 등록되어 있습니다.';
  END IF;

  PERFORM set_config('app.patient_number_change_authorized', 'on', true);
  UPDATE public.profiles
  SET patient_number = p_new_patient_number, updated_at = now()
  WHERE id = v_patient.id;

  UPDATE public.survey_responses
  SET patient_number = p_new_patient_number,
      assessment_key = CASE
        WHEN assessment_no IS NULL THEN NULL
        ELSE p_new_patient_number || '-' || assessment_no
      END,
      updated_at = now()
  WHERE COALESCE(patient_user_id, patient_id) = v_patient.id;
  GET DIAGNOSTICS v_updated_results = ROW_COUNT;

  UPDATE public.patient_number_change_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = '관리자 직접 변경으로 대체됨'
  WHERE patient_id = v_patient.id AND status = 'pending';

  INSERT INTO public.patient_number_change_requests (
    patient_id, hospital_code, old_patient_number, new_patient_number,
    status, reason, reviewed_by, reviewed_at, review_note, sheet_sync_status
  ) VALUES (
    v_patient.id, p_hospital_code, p_current_patient_number, p_new_patient_number,
    'approved', '관리자 직접 변경', auth.uid(), now(),
    LEFT(COALESCE(NULLIF(BTRIM(p_note), ''), '관리자 대시보드에서 직접 변경'), 500),
    'pending'
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'status', 'approved',
    'request_id', v_request_id,
    'new_patient_number', p_new_patient_number,
    'updated_results', v_updated_results
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_patient_number_sheet_sync(p_request_id UUID)
RETURNS TABLE (
  request_id UUID,
  patient_id UUID,
  hospital_code TEXT,
  old_patient_number TEXT,
  new_patient_number TEXT,
  sheet_sync_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hospital TEXT;
  v_request public.patient_number_change_requests%ROWTYPE;
BEGIN
  SELECT p.role, p.hospital_code INTO v_role, v_hospital
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role NOT IN ('doctor', 'admin') THEN RAISE EXCEPTION '처리 권한이 없습니다.'; END IF;

  SELECT * INTO v_request
  FROM public.patient_number_change_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'approved' THEN
    RAISE EXCEPTION '승인된 번호 변경 기록을 찾을 수 없습니다.';
  END IF;
  IF v_role = 'doctor' AND v_request.hospital_code <> v_hospital THEN
    RAISE EXCEPTION '다른 병원의 변경 기록입니다.';
  END IF;

  IF v_request.sheet_sync_status <> 'synced' THEN
    UPDATE public.patient_number_change_requests
    SET sheet_sync_status = 'pending', sheet_sync_error = NULL
    WHERE id = p_request_id;
    v_request.sheet_sync_status := 'pending';
  END IF;

  RETURN QUERY SELECT v_request.id, v_request.patient_id, v_request.hospital_code,
    v_request.old_patient_number, v_request.new_patient_number, v_request.sheet_sync_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_patient_number_sheet_sync(
  p_request_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hospital TEXT;
  v_request public.patient_number_change_requests%ROWTYPE;
BEGIN
  SELECT p.role, p.hospital_code INTO v_role, v_hospital
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role NOT IN ('doctor', 'admin') THEN RAISE EXCEPTION '처리 권한이 없습니다.'; END IF;
  SELECT * INTO v_request FROM public.patient_number_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION '번호 변경 기록을 찾을 수 없습니다.'; END IF;
  IF v_role = 'doctor' AND v_request.hospital_code <> v_hospital THEN
    RAISE EXCEPTION '다른 병원의 변경 기록입니다.';
  END IF;

  UPDATE public.patient_number_change_requests
  SET sheet_sync_status = CASE WHEN p_success THEN 'synced' ELSE 'failed' END,
      sheet_synced_at = CASE WHEN p_success THEN now() ELSE NULL END,
      sheet_sync_error = CASE WHEN p_success THEN NULL ELSE LEFT(COALESCE(p_error, 'unknown error'), 500) END
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lookup_patient_number(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_change_patient_number(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lookup_patient_number(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_patient_number(TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_patient_number_sheet_sync(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_patient_number_sheet_sync(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_patient_number_sheet_sync(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_patient_number_sheet_sync(UUID, BOOLEAN, TEXT) TO authenticated;

COMMIT;
