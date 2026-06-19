---drop table

DROP TABLE IF EXISTS public.otp_records;

---create table
CREATE TABLE public.otp_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🔗 MUST match your code
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- OTP (hash recommended later)
  hash          TEXT NOT NULL,

  -- expiry
  expires_at    TIMESTAMPTZ NOT NULL,

  -- security
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
  locked_until  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ✅ IMPORTANT: only one active OTP per user
  UNIQUE (user_id)
);

---create index
CREATE INDEX ix_otp_user_id ON public.otp_records(user_id);
CREATE INDEX ix_otp_expires ON public.otp_records(expires_at);
CREATE INDEX ix_otp_locked_until ON public.otp_records(locked_until);


---RLS
ALTER TABLE public.otp_records ENABLE ROW LEVEL SECURITY;

-- Only backend (service role) can access OTP
CREATE POLICY "otp_service_only"
ON public.otp_records
FOR ALL
TO service_role
USING (true);

CREATE POLICY "otp_authenticated_insert"
ON public.otp_records
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "otp_authenticated_update"
ON public.otp_records
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "otp_authenticated_select"
ON public.otp_records
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "otp_authenticated_delete"
ON public.otp_records
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

---Grants 
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_records TO authenticated;
GRANT ALL ON public.otp_records TO service_role;

