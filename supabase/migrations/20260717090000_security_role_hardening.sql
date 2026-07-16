BEGIN;

-- Profiles are created only by the auth.users trigger. Direct inserts are not
-- part of the application contract and make role assignment bypassable.
DROP POLICY IF EXISTS "profiles_insert_anyone" ON public.profiles;
REVOKE INSERT ON public.profiles FROM anon, authenticated;

-- An authenticated user may update non-security presentation fields on their
-- own profile, but the resulting row must remain their own row and role.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role = public.get_user_role()
    AND hospital_code IS NOT DISTINCT FROM public.get_user_hospital_code()
  );

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND (
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

DROP TRIGGER IF EXISTS trg_protect_profile_security_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_security_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

-- Never trust the role supplied in sign-up metadata. The only public sign-up
-- roles are patient and doctor_pending; approved/admin states are server-only.
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
  IF requested_role = 'doctor_pending' THEN
    v_role := 'doctor_pending';
  ELSIF requested_role = 'patient' THEN
    v_role := 'patient';
  ELSE
    RAISE EXCEPTION '허용되지 않은 가입 역할입니다.';
  END IF;

  IF char_length(COALESCE(meta->>'username', '')) > 80
     OR char_length(COALESCE(meta->>'doctor_name', '')) > 100
     OR char_length(COALESCE(meta->>'hospital_name', '')) > 150 THEN
    RAISE EXCEPTION '가입 정보가 허용 길이를 초과했습니다.';
  END IF;

  IF v_role = 'patient' THEN
    IF v_hospital_code IS NULL THEN
      RAISE EXCEPTION '병원코드가 필요합니다.';
    END IF;
    IF v_patient_number IS NULL OR v_patient_number !~ '^[0-9]{8}$' THEN
      RAISE EXCEPTION '환자번호는 8자리 숫자여야 합니다.';
    END IF;
    IF v_dob IS NULL OR v_dob !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION '생년월 형식이 올바르지 않습니다.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE hospital_code = v_hospital_code
        AND role = 'doctor'
    ) THEN
      RAISE EXCEPTION '존재하지 않거나 미승인된 병원코드입니다.';
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
    id, email, username, role,
    doctor_name, hospital_name, hospital_code,
    dob, patient_number, full_name
  ) VALUES (
    NEW.id,
    NEW.email,
    LEFT(COALESCE(NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1)), 80),
    v_role,
    CASE WHEN v_role = 'doctor_pending' THEN LEFT(NULLIF(BTRIM(meta->>'doctor_name'), ''), 100) END,
    CASE WHEN v_role = 'doctor_pending' THEN LEFT(NULLIF(BTRIM(meta->>'hospital_name'), ''), 150) END,
    v_hospital_code,
    v_dob,
    v_patient_number,
    LEFT(COALESCE(NULLIF(BTRIM(meta->>'doctor_name'), ''), NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1)), 100)
  );

  RETURN NEW;
END;
$$;

-- Reduce callable surface. These functions already perform role checks, and
-- revoking anon adds another independent authorization boundary.
REVOKE ALL ON FUNCTION public.approve_doctor(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_doctor_approval(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_password(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_get_patient_results(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_list_patients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_doctor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_doctor_approval(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_get_patient_results(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_patients() TO authenticated;

COMMIT;
