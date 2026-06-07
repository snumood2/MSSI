-- Block patient survey writes when the hospital has no approved doctor.
-- Existing completed results remain readable, but new/in-progress survey writes are blocked.

BEGIN;

CREATE OR REPLACE FUNCTION public.patient_can_use_hospital()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles patient
    JOIN public.profiles doctor
      ON doctor.hospital_code = patient.hospital_code
     AND doctor.role = 'doctor'
    WHERE patient.id = auth.uid()
      AND patient.role = 'patient'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_patient_write_survey(p_patient_id UUID, p_hospital_code TEXT)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles patient
    JOIN public.profiles doctor
      ON doctor.hospital_code = patient.hospital_code
     AND doctor.role = 'doctor'
    WHERE patient.id = auth.uid()
      AND patient.id = p_patient_id
      AND patient.role = 'patient'
      AND patient.hospital_code = p_hospital_code
  );
$$;

DROP POLICY IF EXISTS "survey_insert_own" ON public.survey_responses;
DROP POLICY IF EXISTS "survey_patient_all" ON public.survey_responses;
CREATE POLICY "survey_insert_own" ON public.survey_responses
  FOR INSERT WITH CHECK (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  );

DROP POLICY IF EXISTS "survey_update_own" ON public.survey_responses;
CREATE POLICY "survey_update_own" ON public.survey_responses
  FOR UPDATE USING (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  )
  WITH CHECK (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  );

COMMIT;

SELECT public.patient_can_use_hospital() AS patient_can_use_hospital_function_available;
