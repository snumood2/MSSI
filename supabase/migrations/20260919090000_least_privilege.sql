-- Remove privileges the browser never needs. Preserve all row policies,
-- authenticated application CRUD, and service-role access.
BEGIN;

REVOKE ALL ON TABLE public.profiles, public.survey_responses FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.profiles, public.survey_responses FROM authenticated;

-- New tables and functions must opt in to browser access explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- PostgreSQL's built-in PUBLIC EXECUTE default is global; a schema-level
-- REVOKE alone cannot remove it from newly created functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
