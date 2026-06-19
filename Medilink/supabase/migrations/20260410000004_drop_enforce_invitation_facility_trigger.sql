-- Discard the trigger-based approach for facility enforcement.
-- The correct fix is in the RPC + API accept flow (see next migrations).

DROP TRIGGER IF EXISTS trg_enforce_invitation_facility ON public.invitations;
DROP FUNCTION IF EXISTS public.enforce_invitation_facility();
