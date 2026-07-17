BEGIN;

CREATE OR REPLACE FUNCTION public.list_patient_number_sheet_sync_failures()
RETURNS TABLE (
  request_id UUID,
  patient_id UUID,
  hospital_code TEXT,
  old_patient_number TEXT,
  new_patient_number TEXT,
  requested_at TIMESTAMPTZ,
  username TEXT,
  sheet_sync_status TEXT,
  sheet_sync_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hospital TEXT;
BEGIN
  SELECT p.role, p.hospital_code INTO v_role, v_hospital
  FROM public.profiles p
  WHERE p.id = auth.uid();
  IF v_role NOT IN ('doctor', 'admin') THEN
    RAISE EXCEPTION '조회 권한이 없습니다.';
  END IF;

  RETURN QUERY
  SELECT r.id, r.patient_id, r.hospital_code, r.old_patient_number,
         r.new_patient_number, r.requested_at, p.username,
         r.sheet_sync_status, r.sheet_sync_error
  FROM public.patient_number_change_requests r
  JOIN public.profiles p ON p.id = r.patient_id
  WHERE r.status = 'approved'
    AND r.sheet_sync_status IN ('pending', 'failed')
    AND (v_role = 'admin' OR r.hospital_code = v_hospital)
  ORDER BY r.requested_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_patient_number_sheet_sync_failures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_number_sheet_sync_failures() TO authenticated;

COMMIT;
