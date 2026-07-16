--══════════════════════════════════════════════════════════════
--MSSI 설문조사 시스템 - Supabase 마이그레이션
--실행: Supabase Dashboard → SQL Editor → 붙여넣기 → 실행
--══════════════════════════════════════════════════════════════

--1. 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--══════════════════════════════════════════════════════════════
--2. profiles 테이블
--══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  --역할 (patient, doctor, doctor_pending, doctor_revoked, admin)
  role          TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','doctor','doctor_pending','doctor_revoked','admin')),

  --공통
  email         TEXT,
  username      TEXT,
  full_name     TEXT,

  --의사 전용
  doctor_name   TEXT,
  hospital_name TEXT,
  hospital_code TEXT UNIQUE,
  approved_at   TIMESTAMPTZ,

  --환자 전용
  dob           TEXT,         --생년월 (YYYY-MM)
  patient_number TEXT
);

--인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_code ON public.profiles(hospital_code);
CREATE INDEX IF NOT EXISTS idx_profiles_patient_number ON public.profiles(patient_number);

--patient_number는 선택값이므로 UNIQUE 제약을 두지 않는다. 기존 운영 DB에 잘못 생긴 UNIQUE도 제거한다.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%patient_number%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.profiles ALTER COLUMN patient_number DROP NOT NULL;
UPDATE public.profiles SET patient_number = NULL WHERE patient_number = '';

--══════════════════════════════════════════════════════════════
--3. survey_responses 테이블
--══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  --환자 정보 (FK)
  patient_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id UUID,               --중복 조회용

  --메타
  hospital_code   TEXT,
  patient_number  TEXT,
  assessment_no   INTEGER,
  assessment_key  TEXT,

  --설문 데이터
  answers         JSONB DEFAULT '{}'::jsonb,
  progress        JSONB DEFAULT '{}'::jsonb,  --{ sectionIndex: N }
  scores          JSONB DEFAULT NULL,
  report          JSONB DEFAULT NULL,

  --상태
  status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','completed')),
  completed       BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ
);

--인덱스
CREATE INDEX IF NOT EXISTS idx_survey_patient_id ON public.survey_responses(patient_id);
CREATE INDEX IF NOT EXISTS idx_survey_status ON public.survey_responses(status);
CREATE INDEX IF NOT EXISTS idx_survey_completed ON public.survey_responses(completed);
CREATE INDEX IF NOT EXISTS idx_survey_hospital_code ON public.survey_responses(hospital_code);
CREATE INDEX IF NOT EXISTS idx_survey_patient_number ON public.survey_responses(patient_number);
CREATE INDEX IF NOT EXISTS idx_survey_created_at ON public.survey_responses(created_at DESC);

--같은 병원/환자 번호의 반복 설문은 별도 회차로 관리한다.
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS assessment_no INTEGER,
  ADD COLUMN IF NOT EXISTS assessment_key TEXT;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_assessment_occurrence
  ON public.survey_responses(hospital_code, patient_number, assessment_no)
  WHERE NULLIF(patient_number, '') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_survey_assessment_key
  ON public.survey_responses(assessment_key);

CREATE OR REPLACE FUNCTION public.assign_survey_assessment_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(NEW.patient_number, '') IS NULL THEN
    NEW.assessment_no := NULL;
    NEW.assessment_key := NULL;
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_assign_survey_assessment_sequence ON public.survey_responses;
CREATE TRIGGER trg_assign_survey_assessment_sequence
BEFORE INSERT OR UPDATE OF hospital_code, patient_number, assessment_no
ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION public.assign_survey_assessment_sequence();

--══════════════════════════════════════════════════════════════
--4. RLS (Row Level Security) 정책
--══════════════════════════════════════════════════════════════

--profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--Helper: security definer 함수 (RLS recursion 방지)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_hospital_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT hospital_code FROM public.profiles WHERE id = auth.uid();
$$;

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

--프로필은 auth.users 트리거에서만 생성
DROP POLICY IF EXISTS "profiles_insert_anyone" ON public.profiles;
REVOKE INSERT ON public.profiles FROM anon, authenticated;
--자신의 프로필은 읽기 가능
CREATE POLICY IF NOT EXISTS "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

--의사/관리자는 같은 병원코드 환자 프로필 조회 가능 (SECURITY DEFINER helper 사용, RLS recursion 방지)
DROP POLICY IF EXISTS "profiles_select_doctor_hospital" ON public.profiles;
CREATE POLICY "profiles_select_doctor_hospital" ON public.profiles
  FOR SELECT USING (
    public.get_user_role() IN ('doctor'::text, 'admin'::text)
    AND (
      public.get_user_role() = 'admin'::text
      OR profiles.hospital_code = public.get_user_hospital_code()
    )
  );

--자신의 비보안 프로필 필드만 수정
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role = public.get_user_role()
    AND hospital_code IS NOT DISTINCT FROM public.get_user_hospital_code()
  );

--survey_responses
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

--환자는 자신의 설문만 INSERT
DROP POLICY IF EXISTS "survey_insert_own" ON public.survey_responses;
DROP POLICY IF EXISTS "survey_patient_all" ON public.survey_responses;
CREATE POLICY IF NOT EXISTS "survey_insert_own" ON public.survey_responses
  FOR INSERT WITH CHECK (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  );

--환자는 자신의 설문만 SELECT
CREATE POLICY IF NOT EXISTS "survey_select_own" ON public.survey_responses
  FOR SELECT USING (
    auth.uid() = patient_id
  );

--의사는 같은 병원코드의 완료된 설문 SELECT 가능
CREATE POLICY IF NOT EXISTS "survey_select_doctor" ON public.survey_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.role IN ('doctor', 'admin')
        AND (
          viewer.role = 'admin'
          OR viewer.hospital_code = survey_responses.hospital_code
        )
    )
  );

--환자는 자신의 설문만 UPDATE
DROP POLICY IF EXISTS "survey_update_own" ON public.survey_responses;
CREATE POLICY IF NOT EXISTS "survey_update_own" ON public.survey_responses
  FOR UPDATE USING (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  )
  WITH CHECK (
    auth.uid() = patient_id
    AND public.can_patient_write_survey(patient_id, hospital_code)
  );

--══════════════════════════════════════════════════════════════
--5. RPC (원격 프로시저) 함수
--══════════════════════════════════════════════════════════════

--5a. 의사 승인 (admin → doctor)
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

--5b. 의사 승인취소 (admin → doctor_revoked)
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

--5c. 비밀번호 초기화 (admin)
CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id UUID, new_password TEXT)
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

  IF new_password IS NULL OR char_length(new_password) < 12 THEN
    RAISE EXCEPTION '임시 비밀번호는 12자 이상이어야 합니다.';
  END IF;

  UPDATE auth.users u
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  FROM public.profiles p
  WHERE u.id = target_user_id
    AND p.id = target_user_id
    AND p.role IN ('doctor', 'doctor_pending', 'doctor_revoked');

  IF NOT FOUND THEN
    RAISE EXCEPTION '비밀번호를 초기화할 수 있는 의사 계정이 아닙니다.';
  END IF;
END;
$$;

--5c. 의사가 환자 번호로 결과 검색
CREATE OR REPLACE FUNCTION public.doctor_get_patient_results(p_patient_number TEXT)
RETURNS SETOF survey_responses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_role TEXT;
  v_viewer_hcode TEXT;
BEGIN
  SELECT role, hospital_code INTO v_viewer_role, v_viewer_hcode
  FROM public.profiles WHERE id = auth.uid();

  IF v_viewer_role NOT IN ('doctor', 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  IF v_viewer_role = 'doctor' THEN
    RETURN QUERY
    SELECT sr.*
    FROM survey_responses sr
    WHERE sr.patient_number = p_patient_number
      AND sr.status = 'completed'
      AND sr.hospital_code = v_viewer_hcode
    ORDER BY sr.completed_at DESC;
  ELSE
    RETURN QUERY
    SELECT sr.*
    FROM survey_responses sr
    WHERE sr.patient_number = p_patient_number
      AND sr.status = 'completed'
    ORDER BY sr.completed_at DESC;
  END IF;
END;
$$;

--5d. 의사가 자신의 병원 환자 목록 조회
CREATE OR REPLACE FUNCTION public.doctor_list_patients()
RETURNS SETOF survey_responses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_role TEXT;
  v_viewer_hcode TEXT;
BEGIN
  SELECT role, hospital_code INTO v_viewer_role, v_viewer_hcode
  FROM public.profiles WHERE id = auth.uid();

  IF v_viewer_role NOT IN ('doctor', 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  IF v_viewer_role = 'doctor' THEN
    RETURN QUERY
    SELECT sr.*
    FROM survey_responses sr
    WHERE sr.status = 'completed'
      AND sr.hospital_code = v_viewer_hcode
    ORDER BY sr.completed_at DESC;
  ELSE
    RETURN QUERY
    SELECT sr.*
    FROM survey_responses sr
    WHERE sr.status = 'completed'
    ORDER BY sr.completed_at DESC;
  END IF;
END;
$$;

--══════════════════════════════════════════════════════════════
--6. 트리거: 회원가입 시 자동으로 profiles 레코드 생성
--══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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
      SELECT 1 FROM public.profiles
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
    dob, patient_number,
    full_name
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
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
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_security_fields();

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

--══════════════════════════════════════════════════════════════
--7. updated_at 자동 갱신 트리거
--══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_survey_updated_at
  BEFORE UPDATE ON public.survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

--══════════════════════════════════════════════════════════════
--8. 기존 DB migration: contact_email 컬럼 제거 (2026-05-30)
--══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'contact_email'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN contact_email;
  END IF;
END $$;

--══════════════════════════════════════════════════════════════
--9. updated_at 컬럼 보강 (기존 DB 누락 방지, 2026-06-04)
--══════════════════════════════════════════════════════════════
--profiles 테이블과 survey_responses 테이블의 updated_at 컬럼이
--트리거에서 참조되나 초기 마이그레이션에서 누락될 수 있음.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'survey_responses' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.survey_responses ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

--══════════════════════════════════════════════════════════════
--서비스 설정
--══════════════════════════════════════════════════════════════
--Supabase Auth 설정:
--1. Settings → Auth → Email Auth → Confirm email: OFF
--2. Settings → Auth → Security → Allow multiple accounts with same email: ON (선택)

--══════════════════════════════════════════════════════════════
--✅ 완료
--══════════════════════════════════════════════════════════════
