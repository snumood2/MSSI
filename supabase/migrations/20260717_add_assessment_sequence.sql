-- Keep the stable 8-digit patient number separate from each survey occurrence.
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS assessment_no integer,
  ADD COLUMN IF NOT EXISTS assessment_key text;

-- Existing responses receive deterministic occurrence numbers in creation order.
WITH numbered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY hospital_code, patient_number
           ORDER BY created_at, id
         )::integer AS assessment_no
  FROM public.survey_responses
  WHERE NULLIF(patient_number, '') IS NOT NULL
)
UPDATE public.survey_responses sr
SET assessment_no = numbered.assessment_no,
    assessment_key = sr.patient_number || '-' || numbered.assessment_no
FROM numbered
WHERE sr.id = numbered.id
  AND (sr.assessment_no IS NULL OR sr.assessment_key IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_responses_assessment_no_positive'
      AND conrelid = 'public.survey_responses'::regclass
  ) THEN
    ALTER TABLE public.survey_responses
      ADD CONSTRAINT survey_responses_assessment_no_positive
      CHECK (assessment_no IS NULL OR assessment_no >= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_assessment_occurrence
  ON public.survey_responses(hospital_code, patient_number, assessment_no)
  WHERE NULLIF(patient_number, '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survey_assessment_key
  ON public.survey_responses(assessment_key);

CREATE OR REPLACE FUNCTION public.assign_survey_assessment_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(NEW.patient_number, '') IS NULL THEN
    NEW.assessment_no := NULL;
    NEW.assessment_key := NULL;
    RETURN NEW;
  END IF;

  -- Serialize numbering for one hospital/patient pair without blocking others.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(COALESCE(NEW.hospital_code, '') || ':' || NEW.patient_number, 0)
  );

  IF NEW.assessment_no IS NULL THEN
    SELECT COALESCE(MAX(sr.assessment_no), 0) + 1
    INTO NEW.assessment_no
    FROM public.survey_responses sr
    WHERE sr.hospital_code IS NOT DISTINCT FROM NEW.hospital_code
      AND sr.patient_number = NEW.patient_number;
  END IF;

  NEW.assessment_key := NEW.patient_number || '-' || NEW.assessment_no;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_survey_assessment_sequence
  ON public.survey_responses;
CREATE TRIGGER trg_assign_survey_assessment_sequence
BEFORE INSERT OR UPDATE OF hospital_code, patient_number, assessment_no
ON public.survey_responses
FOR EACH ROW
EXECUTE FUNCTION public.assign_survey_assessment_sequence();
