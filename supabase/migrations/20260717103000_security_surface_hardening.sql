BEGIN;

-- Anonymous users sign up through GoTrue and the auth.users trigger. They do
-- not need to discover either clinical table through PostgREST/GraphQL.
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.survey_responses FROM anon;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.survey_responses TO authenticated;

ALTER FUNCTION public.update_updated_at() SET search_path = public;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_hospital_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.patient_can_use_hospital() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_patient_write_survey(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_hospital_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_can_use_hospital() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_patient_write_survey(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_survey_assessment_sequence() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.check_hospital_code(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.check_hospital_code(TEXT) SET search_path = public';
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_hospital_code(TEXT) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated';
  END IF;
END;
$$;

COMMIT;
