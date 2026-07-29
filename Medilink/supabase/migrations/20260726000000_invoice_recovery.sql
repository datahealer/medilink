-- Invoice Recovery System
-- ============================================================================
-- Guarantees that every PAID payment eventually has an invoice, with durable
-- retry state, safe concurrency, crash recovery, and a full attempt log.
--
-- Model: an invoice is still 1:1 with a payment (deterministic storage path
-- `invoices/{payment_id}.pdf` + payments.invoice_url), so duplicates are
-- impossible by construction. This migration adds the LIFECYCLE around that:
-- pending -> generating -> generated | failed, an advisory-locked claim so only
-- one worker generates per payment at a time (double-checked), a finalize step
-- that records success/failure + logs the attempt, and a sweeper worklist with
-- exponential backoff + stale-'generating' reclaim (server-crash recovery).
--
-- Additive & idempotent (IF NOT EXISTS / CREATE OR REPLACE). Safe to re-run.
-- ============================================================================

-- 1. Lifecycle columns on payments -------------------------------------------
-- NOTE: `invoice_number` is written by the generate-invoice edge function but was
-- MISSING from the schema (the edge fn's unchecked UPDATE silently failed on it,
-- which is a root cause of "paid but no invoice"). Added here IF NOT EXISTS.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_number          TEXT,
  ADD COLUMN IF NOT EXISTS invoice_status          TEXT        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invoice_attempts        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_last_error      TEXT,
  ADD COLUMN IF NOT EXISTS invoice_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_generated_at    TIMESTAMPTZ;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_status_chk;
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_status_chk
  CHECK (invoice_status IN ('pending', 'generating', 'generated', 'failed'));

-- Backfill existing rows so the new state is consistent with reality.
UPDATE public.payments
  SET invoice_status = 'generated',
      invoice_generated_at = COALESCE(invoice_generated_at, updated_at)
  WHERE invoice_url IS NOT NULL AND invoice_status <> 'generated';

-- Partial index sized for the sweeper's hot query (only unresolved paid rows).
CREATE INDEX IF NOT EXISTS ix_payments_invoice_recovery
  ON public.payments (invoice_status, invoice_last_attempt_at)
  WHERE status = 'paid' AND invoice_url IS NULL;

-- 2. Attempt log (one row per generation attempt; observability + audit) ------
CREATE TABLE IF NOT EXISTS public.invoice_generation_attempts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  UUID        NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  attempt_no  INTEGER     NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('success', 'failed')),
  source      TEXT,       -- 'webhook' | 'verify' | 'manual' | 'cron'
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_invoice_attempts_payment
  ON public.invoice_generation_attempts (payment_id, created_at DESC);

-- RLS ON with no policy => only service_role (which bypasses RLS) can touch it.
-- Patients never read the attempt log directly.
ALTER TABLE public.invoice_generation_attempts ENABLE ROW LEVEL SECURITY;

-- 3. claim_invoice_generation() ----------------------------------------------
-- Atomically claims a payment for invoice generation. A per-payment advisory
-- xact lock serializes concurrent generators (webhook + verify + cron); after
-- acquiring it we RE-READ (double-checked locking) so we never regenerate an
-- invoice that already exists or is being generated. Returns the existing
-- invoice when present (idempotent, no duplicates).
CREATE OR REPLACE FUNCTION public.claim_invoice_generation(p_payment_id UUID)
RETURNS TABLE (outcome TEXT, invoice_url TEXT, invoice_number TEXT, attempt_no INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay           public.payments%ROWTYPE;
  v_stale_minutes CONSTANT INT := 5;
BEGIN
  -- Serialize all generators for THIS payment; released automatically at txn end.
  PERFORM pg_advisory_xact_lock(hashtext('invoice:' || p_payment_id::text));

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  -- Already generated -> return the existing invoice (idempotent).
  IF v_pay.invoice_url IS NOT NULL THEN
    RETURN QUERY SELECT 'already_generated'::TEXT, v_pay.invoice_url, v_pay.invoice_number, v_pay.invoice_attempts;
    RETURN;
  END IF;

  -- Only paid payments get invoices.
  IF v_pay.status <> 'paid' THEN
    RETURN QUERY SELECT 'not_paid'::TEXT, NULL::TEXT, NULL::TEXT, v_pay.invoice_attempts;
    RETURN;
  END IF;

  -- Another worker is actively generating and it isn't stale -> let it finish.
  IF v_pay.invoice_status = 'generating'
     AND v_pay.invoice_last_attempt_at IS NOT NULL
     AND v_pay.invoice_last_attempt_at > now() - make_interval(mins => v_stale_minutes) THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, NULL::TEXT, NULL::TEXT, v_pay.invoice_attempts;
    RETURN;
  END IF;

  -- Claim it (covers 'pending', 'failed', and stale 'generating' = crash recovery).
  UPDATE public.payments
    SET invoice_status          = 'generating',
        invoice_attempts        = invoice_attempts + 1,
        invoice_last_attempt_at = now()
    WHERE id = p_payment_id;

  RETURN QUERY SELECT 'claimed'::TEXT, NULL::TEXT, NULL::TEXT, (v_pay.invoice_attempts + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_invoice_generation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_generation(UUID) TO service_role;

-- 4. finalize_invoice_generation() -------------------------------------------
-- Records the terminal result of a claimed attempt and logs it. This replaces
-- the edge function's previously-UNCHECKED payments UPDATE, so a storage/DB
-- failure now flips status to 'failed' (making the row a sweeper candidate)
-- instead of silently leaving invoice_url NULL.
CREATE OR REPLACE FUNCTION public.finalize_invoice_generation(
  p_payment_id     UUID,
  p_ok             BOOLEAN,
  p_invoice_url    TEXT,
  p_invoice_number TEXT,
  p_error          TEXT,
  p_source         TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt INTEGER;
BEGIN
  SELECT invoice_attempts INTO v_attempt FROM public.payments WHERE id = p_payment_id;

  IF p_ok THEN
    UPDATE public.payments
      SET invoice_url          = p_invoice_url,
          invoice_number       = COALESCE(p_invoice_number, invoice_number),
          invoice_status       = 'generated',
          invoice_generated_at = now(),
          invoice_last_error   = NULL,
          updated_at           = now()
      WHERE id = p_payment_id;
  ELSE
    UPDATE public.payments
      SET invoice_status     = 'failed',
          invoice_last_error = LEFT(COALESCE(p_error, 'unknown error'), 500),
          updated_at         = now()
      WHERE id = p_payment_id;
  END IF;

  INSERT INTO public.invoice_generation_attempts (payment_id, attempt_no, status, source, error)
    VALUES (
      p_payment_id,
      COALESCE(v_attempt, 0),
      CASE WHEN p_ok THEN 'success' ELSE 'failed' END,
      p_source,
      CASE WHEN p_ok THEN NULL ELSE LEFT(COALESCE(p_error, 'unknown error'), 500) END
    );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_invoice_generation(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_invoice_generation(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 5. payments_needing_invoice() ----------------------------------------------
-- Sweeper worklist: paid payments still lacking an invoice that are either
-- (a) pending/failed, under the attempt cap, and past an exponential backoff, or
-- (b) stuck in 'generating' beyond the stale window (crashed worker -> reclaim).
CREATE OR REPLACE FUNCTION public.payments_needing_invoice(
  p_limit         INT DEFAULT 50,
  p_max_attempts  INT DEFAULT 8,
  p_stale_minutes INT DEFAULT 5
) RETURNS TABLE (payment_id UUID, attempts INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, invoice_attempts
  FROM public.payments
  WHERE status = 'paid'
    AND invoice_url IS NULL
    AND (
      (invoice_status IN ('pending', 'failed')
        AND invoice_attempts < p_max_attempts
        AND (invoice_last_attempt_at IS NULL
             OR invoice_last_attempt_at < now() - make_interval(mins => LEAST(60, power(2, invoice_attempts)::int))))
      OR
      (invoice_status = 'generating'
        AND invoice_last_attempt_at < now() - make_interval(mins => p_stale_minutes))
    )
  ORDER BY invoice_last_attempt_at NULLS FIRST
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.payments_needing_invoice(INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payments_needing_invoice(INT, INT, INT) TO service_role;

-- 6. Automatic retry scheduling (OPTIONAL — configure once, no secrets in SQL) -
-- The sweeper is the `retry-invoices` edge function. Schedule it every 5 min via
-- EITHER of these (both keep secrets out of source control):
--
--   (a) Supabase Dashboard -> Edge Functions -> Schedules: cron `*/5 * * * *`.
--
--   (b) pg_cron + pg_net + Vault (run once in the SQL editor, not in this file):
--       select cron.schedule('invoice-recovery-sweeper', '*/5 * * * *', $$
--         select net.http_post(
--           url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/retry-invoices',
--           headers := jsonb_build_object('Authorization',
--                        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--           body    := '{}'::jsonb
--         );
--       $$);
--
--   (c) Vercel Cron -> POST /api/payments/invoices/retry (x-internal-secret).
-- ============================================================================
