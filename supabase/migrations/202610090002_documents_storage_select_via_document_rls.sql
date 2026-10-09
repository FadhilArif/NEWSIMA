-- Permit signed URL creation for a document only when its row is readable
-- under the public.dokumen RLS policy. This covers an assigned UKM coordinator,
-- the parent BEM President at their stage, and parent BEM members after approval,
-- without making the documents bucket public.

drop policy if exists documents_select_via_authorized_document on storage.objects;
create policy documents_select_via_authorized_document
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.dokumen d
    where d.file_path = objects.name
  )
);
