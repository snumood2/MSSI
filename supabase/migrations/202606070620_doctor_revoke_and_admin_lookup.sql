-- Add reversible doctor approval state.
-- Run in Supabase Dashboard SQL Editor for existing deployments.

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('patient', 'doctor', 'doctor_pending', 'doctor_revoked', 'admin'));

CREATE OR REPLACE FUNCTION public.approve_doctor(p_doctor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  UPDATE public.profiles
  SET role = 'doctor',
      approved_at = now()
  WHERE id = p_doctor_id
    AND role IN ('doctor_pending', 'doctor_revoked');
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_doctor_approval(p_doctor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  UPDATE public.profiles
  SET role = 'doctor_revoked'
  WHERE id = p_doctor_id
    AND role = 'doctor';
END;
$$;

COMMIT;
