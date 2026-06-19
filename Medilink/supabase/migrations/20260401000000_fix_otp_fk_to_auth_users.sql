-- Fix: otp_records.user_id FK was referencing public.profiles(id)
-- which breaks when a profile hasn't been created yet (e.g. trigger failure).
-- OTP only needs the auth user to exist — change FK to auth.users(id).

ALTER TABLE public.otp_records
  DROP CONSTRAINT otp_records_user_id_fkey;

ALTER TABLE public.otp_records
  ADD CONSTRAINT otp_records_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
