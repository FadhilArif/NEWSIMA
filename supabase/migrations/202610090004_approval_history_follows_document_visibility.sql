-- Approval history follows the access to its linked document.
-- Users may read history only when RLS lets them read the corresponding document.
drop policy if exists persetujuan_select_via_readable_document on public.persetujuan;
create policy persetujuan_select_via_readable_document
on public.persetujuan
for select
to authenticated
using (
  exists (
    select 1
    from public.dokumen d
    where d.id = persetujuan.dokumen_id
  )
);
