-- Add 'approved' as a valid appointment status for the emergency approval-first workflow.
-- Emergency appointments transition: pending → approved → confirmed (after payment)
-- This is idempotent: safe to run multiple times.

DO $$
BEGIN
  -- If status is a PostgreSQL enum, add the new value
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'appointment_status'
  ) THEN
    ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'approved';
  END IF;
END $$;

-- If status is a plain text column with a CHECK constraint, update it.
-- Detect and replace the constraint if it exists and doesn't include 'approved'.
DO $$
DECLARE
  v_constraint_name TEXT;
  v_constraint_def  TEXT;
BEGIN
  SELECT conname, pg_get_constraintdef(oid)
  INTO v_constraint_name, v_constraint_def
  FROM pg_constraint
  WHERE conrelid = 'appointments'::regclass
    AND contype = 'c'
    AND conname ILIKE '%status%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL AND v_constraint_def NOT LIKE '%approved%' THEN
    EXECUTE format('ALTER TABLE appointments DROP CONSTRAINT %I', v_constraint_name);
    EXECUTE format(
      'ALTER TABLE appointments ADD CONSTRAINT %I CHECK (status IN (''pending'', ''approved'', ''confirmed'', ''cancelled'', ''completed'', ''checked_in'', ''no_show''))',
      v_constraint_name
    );
    RAISE NOTICE 'Updated constraint % to include approved status', v_constraint_name;
  END IF;
END $$;
