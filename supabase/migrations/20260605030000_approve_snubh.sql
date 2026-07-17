-- Approve 분당기분팀 (SNUBH01) as doctor
UPDATE auth.users
SET 
  raw_user_meta_data = raw_user_meta_data || '{"role": "doctor"}'::jsonb,
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmation_sent_at = COALESCE(confirmation_sent_at, now())
WHERE email = 'snubh-team@doctor.local';
