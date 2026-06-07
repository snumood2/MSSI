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

--누구나 프로필 생성 가능 (회원가입 시)
DROP POLICY IF EXISTS "profiles_insert_anyone" ON public.profiles;
CREATE POLICY "profiles_insert_anyone" ON public.profiles
  FOR INSERT WITH CHECK (true);
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

--자신의 프로필만 수정
CREATE POLICY IF NOT EXISTS "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

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

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
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
  meta JSONB := NEW.raw_user_meta_data;
  v_role TEXT;
  v_hospital_code TEXT;
  v_patient_number TEXT;
BEGIN
  v_role := COALESCE(NULLIF(meta->>'role', ''), 'patient');
  v_hospital_code := NULLIF(meta->>'hospital_code', '');
  v_patient_number := NULLIF(meta->>'patient_number', '');

  IF v_role = 'patient' THEN
    IF v_hospital_code IS NULL THEN
      RAISE EXCEPTION '병원코드가 필요합니다.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE hospital_code = v_hospital_code
        AND role = 'doctor'
    ) THEN
      RAISE EXCEPTION '존재하지 않거나 미승인된 병원코드입니다.';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id, email, username, role,
    doctor_name, hospital_name, hospital_code,
    dob, patient_number,
    full_name
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1)),
    v_role,
    NULLIF(meta->>'doctor_name', ''),
    NULLIF(meta->>'hospital_name', ''),
    v_hospital_code,
    NULLIF(meta->>'dob', ''),
    v_patient_number,
    COALESCE(NULLIF(meta->>'doctor_name', ''), NULLIF(meta->>'username', ''), SPLIT_PART(NEW.email, '@', 1))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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
