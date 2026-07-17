BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_lookup_patient_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_change_patient_number(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
