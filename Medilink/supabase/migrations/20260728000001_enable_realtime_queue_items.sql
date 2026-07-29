-- ============================================================================
-- PHASE 1 — Enable Supabase Realtime for queue_items
-- ============================================================================
-- Context: src/app/dashboard/dashboardpages/scheduling/Queue.tsx has subscribed
-- to postgres_changes on public.queue_items since the F22 work landed, but the
-- table was never added to the supabase_realtime publication. That subscription
-- has therefore been silently dead — staff only ever saw their own mutations.
--
-- MediLink additionally needs this so a patient can watch their own queue row
-- change from 'waiting' -> 'called' without polling.
--
-- Migration-only by design: no Supabase dashboard toggling. A fresh
-- `supabase db reset` reproduces the exact production behaviour.
-- ============================================================================

-- REPLICA IDENTITY FULL makes the OLD row available in UPDATE/DELETE payloads.
-- Required for two reasons:
--   1. Realtime evaluates RLS against the row to decide who may receive it.
--      With the default (primary key only) identity, a filtered/RLS-scoped
--      subscription cannot be authorised on UPDATE and events are dropped.
--   2. Clients filtering on facility_id need that column present in the payload.
ALTER TABLE public.queue_items REPLICA IDENTITY FULL;

-- Idempotent publication add. ALTER PUBLICATION ... ADD TABLE raises
-- duplicate_object if the table is already a member, which would abort an
-- otherwise valid re-run (e.g. a repeated `supabase db push`).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_items;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      -- Publication missing entirely (bare Postgres, not Supabase). Create it
      -- so local/self-hosted environments still converge to the same state.
      CREATE PUBLICATION supabase_realtime FOR TABLE public.queue_items;
  END;
END $$;

-- Verification helper: returns the tables currently broadcast by Realtime.
-- Lets CI assert `SELECT public.realtime_published_tables()` contains
-- 'queue_items' instead of relying on a manual dashboard check.
CREATE OR REPLACE FUNCTION public.realtime_published_tables()
RETURNS TABLE (table_name TEXT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT tablename::TEXT
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
  ORDER BY tablename;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_published_tables() TO authenticated, service_role;
