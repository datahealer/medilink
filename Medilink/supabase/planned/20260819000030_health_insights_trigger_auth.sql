-- =============================================================================
-- Give the health-insights trigger a credential, so verify_jwt can be turned back on
-- =============================================================================
-- ⚠️ NOT APPLIED. Prepared for review.
-- ⚠️ GATED on the pending SUPABASE_SERVICE_ROLE_KEY rotation — see docs/ROTATION_PLAN.md.
--    Storing the current key in Vault immediately before rotating it is wasted work, and if the
--    key is in an attacker's hands from the build-time implant then nothing built on it is
--    trustworthy yet. Rotate first, then apply this.
-- ⚠️ NO CREDENTIAL VALUE APPEARS IN THIS FILE, and none should ever be added. The operator
--    creates the Vault secret by hand (step 1 below) so the key never enters git.
--
-- ── THE DEFECT (audit finding H-7) ──
--
-- `generate-health-insights` ran with `verify_jwt = false`, i.e. it required no credential at all.
-- Confirmed against production: an unauthenticated POST with a bogus note id returned
-- `404 {"error":"Note not found"}`, proving the function executed its service-role query for a
-- caller with no credentials.
--
-- The reason `verify_jwt` was off is this trigger. It builds its headers as:
--
--     headers := jsonb_build_object('Content-Type', 'application/json')
--
-- with no Authorization header, so the function could not have been reached any other way. A
-- legitimate integration gap was closed by removing the security boundary.
--
-- The same shape exists in the `refund-status-check` cron, which posts to `poll-refund-status`
-- with no Authorization header while that function HAS `verify_jwt = true` deployed. Verified:
-- an unauthenticated POST to it returns `401 UNAUTHORIZED_NO_AUTH_HEADER`, so that cron has been
-- failing on every five-minute run. Nothing is stuck today because zero refunds exist, but refund
-- reconciliation would never run. Tracked separately as finding N-1; the same Vault secret and the
-- same header pattern fix it, and doing both in one window is sensible.
--
-- ── WHAT IS ALREADY FIXED WITHOUT THIS MIGRATION ──
--
-- The damaging half of H-7 is closed in code and deployed: the function now derives the
-- appointment from the NOTE ROW instead of trusting a second, independent `appointment_id`
-- parameter. Before that, anyone holding one note id could write that note's clinical summary onto
-- any other appointment and have it delivered to that patient. Deriving it from the note makes the
-- cross-appointment write structurally impossible.
--
-- What remains is caller authentication: an unauthenticated caller who knows a valid note id can
-- still cause that note's OWN summary to be regenerated, re-notifying its own doctor and patient
-- and consuming Groq quota. Abuse, not disclosure — which is why this is prepared rather than
-- rushed.
--
-- ── WHY NOT SIMPLY SET verify_jwt = true NOW ──
--
-- Because this trigger sends no credential, so every call would 401 and AI visit summaries would
-- silently stop being generated for every appointment note. That is a clinical-facing feature
-- regression traded for an abuse-only risk. The correct order is: give the trigger a credential
-- (this file), then flip verify_jwt.
--
-- ── APPLY ORDER ──
--
--   1. OPERATOR, BY HAND (never in git):
--        SELECT vault.create_secret('<the rotated service role key>', 'edge_service_role_key',
--               'Bearer token for pg_net calls from DB triggers to Edge Functions');
--      Verify with:  SELECT name FROM vault.secrets;      -- expect edge_service_role_key
--      (There are currently 0 rows in vault.secrets and no app.* GUCs, so this is new.)
--   2. Apply this migration.
--   3. Insert a test appointment_note on a NON-PRODUCTION database and confirm the summary is
--      written. On production, watch for the next real note.
--   4. Only then set verify_jwt = true for generate-health-insights in config.toml and redeploy:
--        npx supabase functions deploy generate-health-insights --use-api
--   5. Re-run the unauthenticated probe; it must now return 401 rather than 404/400.
--
-- ── ROLLBACK ──
--
--   Re-create the function with the original headers expression (no Authorization), and set
--   verify_jwt = false again. Rolling back restores the unauthenticated-abuse surface.
-- =============================================================================

BEGIN;

-- ── Refuse to run if the Vault secret is absent ──
--
-- Without this the function would be replaced with one that sends `Bearer ` and nothing else,
-- which fails closed at the Edge Function and would stop summaries with no obvious cause. Fail
-- loudly here instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edge_service_role_key') THEN
    RAISE EXCEPTION
      'vault secret "edge_service_role_key" not found — create it first (step 1 of the apply order)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_generate_health_insights()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, vault, net, pg_temp
AS $function$
DECLARE
  v_key text;
BEGIN
  /**
   * Read the credential at call time rather than baking it into the function body, so rotating
   * the Vault secret does not require re-deploying this trigger.
   */
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'edge_service_role_key';

  IF v_key IS NULL THEN
    -- Never fail the doctor's note insert because a notification could not be dispatched.
    RAISE WARNING '[health-insights] vault secret missing; summary not requested for note %', NEW.id;
    RETURN NEW;
  END IF;

  /**
   * `appointment_id` is still sent, but the function now treats it only as an assertion to check
   * against the note row — it derives the real target from the note itself. Sending it keeps the
   * mismatch check meaningful as a tripwire.
   */
  PERFORM net.http_post(
    url     := 'https://zojrwuvxrkmgnlwyuypg.supabase.co/functions/v1/generate-health-insights',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'appointment_note_id', NEW.id,
                 'appointment_id',      NEW.appointment_id
               )
  );

  RETURN NEW;

EXCEPTION
  /**
   * The original function had no handler. `net.http_post` raising inside an AFTER INSERT trigger
   * rolls the whole statement back, so a transient pg_net or network fault would have stopped a
   * doctor saving a clinical note. A missing AI summary must never cost a note.
   */
  WHEN OTHERS THEN
    RAISE WARNING '[health-insights] dispatch failed for note % (%): %', NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$function$;

COMMIT;

-- =============================================================================
-- VERIFICATION AFTER APPLYING (read-only)
-- =============================================================================
--   -- the secret must exist, and its VALUE must never be selected into a log or a report:
--   SELECT name FROM vault.secrets WHERE name = 'edge_service_role_key';
--
--   -- the function must be SECURITY DEFINER with a pinned search_path and an EXCEPTION handler:
--   SELECT prosecdef, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'trigger_generate_health_insights';
--
--   -- the trigger must still be attached exactly once:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.appointment_notes'::regclass
--     AND NOT tgisinternal;
--
--   -- and from a shell, AFTER step 4, the unauthenticated probe must be refused:
--   --   curl -s -X POST "$SUPABASE_URL/functions/v1/generate-health-insights" \
--   --     -H 'Content-Type: application/json' -d '{}'        -> expect 401
-- =============================================================================
