-- Add additional fields to technicians table for comprehensive onboarding
ALTER TABLE public.technicians
ADD COLUMN email TEXT,
ADD COLUMN phone TEXT,
ADD COLUMN qualifications TEXT[],
ADD COLUMN license_number TEXT,
ADD COLUMN license_expiry DATE,
ADD COLUMN certifications TEXT,
ADD COLUMN bio TEXT;

-- Add unique constraint on email per facility (optional, for data integrity)
-- ALTER TABLE public.technicians ADD CONSTRAINT technicians_facility_email_unique UNIQUE (facility_id, email);

-- Update RLS policies to allow facility admins to manage these fields
-- The existing policies should already cover this since they allow ALL operations for facility admins