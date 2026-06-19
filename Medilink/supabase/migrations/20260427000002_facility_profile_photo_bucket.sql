INSERT INTO storage.buckets (id, name, public)
VALUES ('facility-profile-photo', 'facility-profile-photo', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "facility_logo_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'facility-profile-photo'
  AND (
    EXISTS (SELECT 1 FROM public.facility_admins WHERE user_id = auth.uid() AND revoked_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
);

CREATE POLICY "facility_logo_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'facility-profile-photo'
  AND (
    EXISTS (SELECT 1 FROM public.facility_admins WHERE user_id = auth.uid() AND revoked_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
);

CREATE POLICY "facility_logo_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'facility-profile-photo');
