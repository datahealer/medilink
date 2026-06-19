-- =========================================================
-- FINAL PATCH: F-22 + F-20 PRODUCTION FIXES
-- SAFE (only adds missing pieces, no breaking changes)
-- =========================================================

-- ================================
-- F-22 FIXES (STAFF + QUEUE)
-- ================================

-- 1. Invite type
DO $$
BEGIN
  ALTER TYPE public.invite_type ADD VALUE IF NOT EXISTS 'staff';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. facility_staff RLS
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;

-- staff can read own
DO $$
BEGIN
  CREATE POLICY facility_staff_select_own
  ON public.facility_staff
  FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- facility_admin full access
DO $$
BEGIN
  CREATE POLICY facility_staff_admin_all
  ON public.facility_staff
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.facility_admins fa
      WHERE fa.user_id = auth.uid()
      AND fa.facility_id = facility_staff.facility_id
      AND fa.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facility_admins fa
      WHERE fa.user_id = auth.uid()
      AND fa.facility_id = facility_staff.facility_id
      AND fa.revoked_at IS NULL
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- super_admin read-only
DO $$
BEGIN
  CREATE POLICY facility_staff_super_admin
  ON public.facility_staff
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ================================
-- 3. QUEUE POLICY FIX (STRICT)
-- ================================

DROP POLICY IF EXISTS queue_items_access ON public.queue_items;

CREATE POLICY queue_items_access
ON public.queue_items
FOR ALL
USING (
  -- facility_admin
  EXISTS (
    SELECT 1 FROM public.facility_admins fa
    WHERE fa.user_id = auth.uid()
    AND fa.facility_id = queue_items.facility_id
    AND fa.revoked_at IS NULL
  )

  OR

  -- staff (active only)
  EXISTS (
    SELECT 1 FROM public.facility_staff fs
    WHERE fs.user_id = auth.uid()
    AND fs.facility_id = queue_items.facility_id
    AND fs.is_active = TRUE
  )

  OR

  -- doctor (OWN patients only)
  EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.user_id = auth.uid()
    AND d.id = queue_items.doctor_id
    AND d.is_active = TRUE
  )

  OR

  -- super admin read
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'super_admin'
  )
)

WITH CHECK (
  -- ONLY staff + facility_admin can WRITE
  EXISTS (
    SELECT 1 FROM public.facility_admins fa
    WHERE fa.user_id = auth.uid()
    AND fa.facility_id = queue_items.facility_id
    AND fa.revoked_at IS NULL
  )
  OR
  EXISTS (
    SELECT 1 FROM public.facility_staff fs
    WHERE fs.user_id = auth.uid()
    AND fs.facility_id = queue_items.facility_id
    AND fs.is_active = TRUE
  )
);

-- ================================
-- 4. QUEUE IMPROVEMENTS
-- ================================

-- position must be valid
ALTER TABLE public.queue_items
DROP CONSTRAINT IF EXISTS chk_queue_position;

ALTER TABLE public.queue_items
ADD CONSTRAINT chk_queue_position CHECK (position > 0);

-- indexes
CREATE INDEX IF NOT EXISTS ix_queue_items_facility_status
ON public.queue_items(facility_id, status);

CREATE INDEX IF NOT EXISTS ix_queue_items_facility_position
ON public.queue_items(facility_id, position);

-- ================================
-- F-20 FIXES (APPOINTMENTS)
-- ================================

-- SAFE cancel function upgrade
CREATE OR REPLACE FUNCTION public.cancel_appointment_safe(
  p_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_time TIMESTAMP;
  v_cutoff INTEGER := 2;
BEGIN
  SELECT slot_date + slot_start
  INTO v_slot_time
  FROM public.appointments
  WHERE id = p_id;

  IF v_slot_time IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - INTERVAL '2 hours') THEN
    RETURN json_build_object('success', false, 'error', 'Too late to cancel');
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      cancelled_by = p_user_id,
      cancelled_at = NOW(),
      cancellation_reason = p_reason
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;

-- SAFE reschedule function upgrade
CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  p_id UUID,
  p_user_id UUID,
  p_new_date DATE,
  p_new_start TIME,
  p_new_end TIME,
  p_skip_cutoff BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_time TIMESTAMP;
BEGIN
  SELECT slot_date + slot_start
  INTO v_slot_time
  FROM public.appointments
  WHERE id = p_id;

  IF v_slot_time IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Appointment not found');
  END IF;

  IF NOT p_skip_cutoff AND NOW() > (v_slot_time - INTERVAL '2 hours') THEN
    RETURN json_build_object('success', false, 'error', 'Too late to reschedule');
  END IF;

  UPDATE public.appointments
  SET previous_slot_date = slot_date,
      previous_slot_start = slot_start,
      slot_date = p_new_date,
      slot_start = p_new_start,
      slot_end = p_new_end
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;