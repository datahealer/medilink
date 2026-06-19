-- Add custom_type column to facilities table.
-- Used when facility type = 'other' to store a user-defined description.
-- ENUM column stays strict; free text lives in a separate nullable column.

ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS custom_type TEXT;
