-- ============================================================================
-- PHASE 5 (schema) — Patient acknowledgement of a queue call
-- ============================================================================
-- Lets a patient confirm either "I've seen the call" or "I'm on my way" so
-- reception can distinguish a patient who is en route from one who has gone
-- silent, before marking a no-show.
--
-- Columns live on queue_items rather than appointments because acknowledgement
-- is a property of one visit's turn in the queue, not of the booking.
-- ============================================================================

ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_kind TEXT;

-- 'seen'       = patient has read the call notification
-- 'on_my_way'  = patient is physically heading to the room
DO $$
BEGIN
  ALTER TABLE public.queue_items
    ADD CONSTRAINT chk_queue_acknowledged_kind
    CHECK (acknowledged_kind IS NULL OR acknowledged_kind IN ('seen', 'on_my_way'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Both columns are set together or neither is.
DO $$
BEGIN
  ALTER TABLE public.queue_items
    ADD CONSTRAINT chk_queue_acknowledged_pair
    CHECK (
      (acknowledged_at IS NULL AND acknowledged_kind IS NULL)
      OR (acknowledged_at IS NOT NULL AND acknowledged_kind IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.queue_items.acknowledged_at IS
  'When the patient confirmed the call. Written only by acknowledge_queue_call().';
COMMENT ON COLUMN public.queue_items.acknowledged_kind IS
  'seen | on_my_way — which confirmation the patient sent.';
