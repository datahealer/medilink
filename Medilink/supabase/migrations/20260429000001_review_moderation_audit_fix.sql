-- 1. Add review_created to audit_action enum
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'review_created';

-- 2. Drop DB triggers that use auth.uid() (NULL under service_role)
DROP TRIGGER IF EXISTS audit_moderation_request ON public.moderation_requests;
DROP FUNCTION IF EXISTS public.hams_audit_moderation_request();
DROP TRIGGER IF EXISTS audit_review_moderation ON public.reviews;
DROP FUNCTION IF EXISTS public.hams_audit_review_moderation();

-- 3. Unique partial index — prevents race-condition duplicate flagging at DB level
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_flag_per_review
  ON public.moderation_requests (review_id)
  WHERE status = 'pending';

-- 4. Performance indexes for review queries (high-read paths)
CREATE INDEX IF NOT EXISTS idx_reviews_target
  ON public.reviews (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_reviews_patient
  ON public.reviews (patient_id);

-- 5. Correct audit actions for review lifecycle
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'review_hidden';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'review_replied';

-- 7. Doctor onboarding audit action (used by invite_doctor RPC)
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'doctor_created';

-- 6. Performance index for moderation_requests lookups
CREATE INDEX IF NOT EXISTS idx_moderation_review_id
  ON public.moderation_requests (review_id);

-- 8. Audit action for blocked access attempts
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'unauthorized_access_attempt';
