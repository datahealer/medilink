-- =========================================================
-- F-18 FIXES MIGRATION (FINAL CORRECTED)
-- =========================================================


-- =========================================================
-- 0. EXTENSION (MUST BE FIRST)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_net;


-- =========================================================
-- 1. PREVENT DUPLICATE FLAGGING
-- =========================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_review_flag'
  ) THEN
    ALTER TABLE public.moderation_requests
    ADD CONSTRAINT unique_review_flag UNIQUE (review_id);
  END IF;
END $$;


-- =========================================================
-- 2. INDEX OPTIMIZATION
-- =========================================================

CREATE INDEX IF NOT EXISTS ix_moderation_status 
ON public.moderation_requests (status);

CREATE INDEX IF NOT EXISTS ix_moderation_review 
ON public.moderation_requests (review_id);

CREATE INDEX IF NOT EXISTS ix_reviews_visible 
ON public.reviews (is_visible);

CREATE INDEX IF NOT EXISTS ix_reviews_created 
ON public.reviews (created_at DESC);


-- =========================================================
-- 3. FIX RLS: SECURE FACILITY OWNERSHIP
-- =========================================================

-- Remove old unsafe policy
DROP POLICY IF EXISTS "reviews_facility_reply" ON public.reviews;
DROP POLICY IF EXISTS "reviews_facility_own" ON public.reviews;

-- Secure policy
CREATE POLICY "reviews_facility_own"
ON public.reviews
FOR UPDATE
TO authenticated
USING (
  -- Super admin can always update
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )

  OR

  -- Facility admin / doctor can update ONLY their facility reviews
  EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = public.reviews.target_id
      AND public.reviews.target_type = 'facility'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )

  OR

  EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.facility_id = public.reviews.target_id
      AND public.reviews.target_type = 'facility'
  )
);


-- =========================================================
-- 4. TRIGGER → CALL EDGE FUNCTION (EMAIL)
-- =========================================================

CREATE OR REPLACE FUNCTION public.notify_moderation_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://zojrwuvxrkmgnlwyuypg.functions.supabase.co/send-moderation-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'review_id', NEW.review_id,
      'reason', NEW.reason,
      'flagged_by', NEW.flagged_by
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;


-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_notify_moderation ON public.moderation_requests;

-- Create trigger
CREATE TRIGGER trigger_notify_moderation
AFTER INSERT ON public.moderation_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_moderation_request();


-- =========================================================
-- 5. AUDIT LOG HELPER (AUTO LOGGING)
-- =========================================================

CREATE OR REPLACE FUNCTION public.log_review_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    NEW.flagged_by,
    'review_flagged',
    'review',
    NEW.review_id,
    jsonb_build_object('reason', NEW.reason)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_review_flag ON public.moderation_requests;

CREATE TRIGGER trigger_audit_review_flag
AFTER INSERT ON public.moderation_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_review_flag();


-- =========================================================
-- 
-- =========================================================