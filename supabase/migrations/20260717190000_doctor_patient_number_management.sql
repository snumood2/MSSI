BEGIN;

CREATE OR REPLACE FUNCTION public.doctor_lookup_patient_number(
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
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_hospital_code TEXT;
BEGIN
  SELECT p.role, p.hospital_code
  INTO v_role, v_hospital_code
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role IS DISTINCT FROM 'doctor' OR v_hospital_code IS NULL THEN
    RAISE EXCEPTION '승인된 의사 권한과 병원코드가 필요합니다.';
  END IF;

  p_patient_number := pg_catalog.btrim(p_patient_number);
  IF p_patient_number !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION '8자리 번호를 확인하세요.';
  END IF;

  RETURN QUERY
  SELECT p.hospital_code, p.patient_number, p.username, p.dob,
         pg_catalog.count(sr.id) FILTER (WHERE sr.status = 'completed' OR sr.completed = TRUE)
  FROM public.profiles p
  LEFT JOIN public.survey_responses sr
    ON COALESCE(sr.patient_user_id, sr.patient_id) = p.id
  WHERE p.role = 'patient'
    AND p.hospital_code = v_hospital_code
    AND p.patient_number = p_patient_number
  GROUP BY p.id, p.hospital_code, p.patient_number, p.username, p.dob;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_change_patient_number(
  p_current_patient_number TEXT,
  p_new_patient_number TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_hospital_code TEXT;
  v_patient public.profiles%ROWTYPE;
  v_request_id UUID;
  v_updated_results INTEGER;
BEGIN
  SELECT p.role, p.hospital_code
  INTO v_role, v_hospital_code
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role IS DISTINCT FROM 'doctor' OR v_hospital_code IS NULL THEN
    RAISE EXCEPTION '승인된 의사 권한과 병원코드가 필요합니다.';
  END IF;

  p_current_patient_number := pg_catalog.btrim(p_current_patient_number);
  p_new_patient_number := pg_catalog.btrim(p_new_patient_number);
  IF p_current_patient_number !~ '^[0-9]{8}$'
     OR p_new_patient_number !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION '현재 번호와 새 번호를 8자리 숫자로 입력하세요.';
  END IF;
  IF p_current_patient_number = p_new_patient_number THEN
    RAISE EXCEPTION '현재 번호와 새 번호가 같습니다.';
  END IF;

  SELECT *
  INTO v_patient
  FROM public.profiles p
  WHERE p.role = 'patient'
    AND p.hospital_code = v_hospital_code
    AND p.patient_number = p_current_patient_number
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '내 병원에서 해당 환자 계정을 찾을 수 없습니다.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_hospital_code || ':' || p_new_patient_number, 0)
  );
  IF NOT public.patient_number_is_available(v_hospital_code, p_new_patient_number, v_patient.id) THEN
    RAISE EXCEPTION '새 번호가 이미 등록되어 있습니다.';
  END IF;

  PERFORM pg_catalog.set_config('app.patient_number_change_authorized', 'on', true);
  UPDATE public.profiles
  SET patient_number = p_new_patient_number, updated_at = pg_catalog.now()
  WHERE id = v_patient.id;

  UPDATE public.survey_responses
  SET patient_number = p_new_patient_number,
      assessment_key = CASE
        WHEN assessment_no IS NULL THEN NULL
        ELSE p_new_patient_number || '-' || assessment_no
      END,
      updated_at = pg_catalog.now()
  WHERE COALESCE(patient_user_id, patient_id) = v_patient.id;
  GET DIAGNOSTICS v_updated_results = ROW_COUNT;

  UPDATE public.patient_number_change_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = pg_catalog.now(),
      review_note = '의사 직접 변경으로 대체됨'
  WHERE patient_id = v_patient.id AND status = 'pending';

  INSERT INTO public.patient_number_change_requests (
    patient_id, hospital_code, old_patient_number, new_patient_number,
    status, reason, reviewed_by, reviewed_at, review_note, sheet_sync_status
  ) VALUES (
    v_patient.id, v_hospital_code, p_current_patient_number, p_new_patient_number,
    'approved', '의사 직접 변경', auth.uid(), pg_catalog.now(),
    pg_catalog.left(COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), '의사 대시보드에서 직접 변경'), 500),
    'pending'
  ) RETURNING id INTO v_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'approved',
    'request_id', v_request_id,
    'new_patient_number', p_new_patient_number,
    'updated_results', v_updated_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_lookup_patient_number(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_change_patient_number(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_lookup_patient_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_change_patient_number(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
