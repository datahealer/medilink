-- ✅ Allow authenticated users to upload files
create policy "Allow authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'patient-docs'
);

-- ✅ Allow authenticated users to read files
create policy "Allow authenticated read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'patient-docs'
);

-- ✅ Allow users to delete their own files (optional but good)
create policy "Allow delete own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'patient-docs'
);