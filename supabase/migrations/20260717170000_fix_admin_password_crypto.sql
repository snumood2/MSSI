BEGIN;

CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id UUID, new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_role TEXT;
BEGIN
  SELECT role
  INTO v_admin_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  IF new_password IS NULL OR pg_catalog.char_length(new_password) < 12 THEN
    RAISE EXCEPTION '임시 비밀번호는 12자 이상이어야 합니다.';
  END IF;

  UPDATE auth.users u
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = pg_catalog.now()
  FROM public.profiles p
  WHERE u.id = target_user_id
    AND p.id = target_user_id
    AND p.role IN ('doctor', 'doctor_pending', 'doctor_revoked');

  IF NOT FOUND THEN
    RAISE EXCEPTION '비밀번호를 초기화할 수 있는 의사 계정이 아닙니다.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO authenticated;

COMMIT;
