DROP POLICY IF EXISTS facilities_admin_write ON facilities;

CREATE POLICY "facilities_admin_write"
ON facilities
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'facility_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'facility_admin'
  )
);