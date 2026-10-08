drop policy if exists dokumen_select_owner on public.dokumen;
create policy dokumen_select_owner
on public.dokumen
for select to authenticated
using (
  exists(
    select 1
    from public.proker p
    where p.id=dokumen.proker_id
      and p.dibuat_oleh=auth.uid()
  )
  or dokumen.uploaded_by=auth.uid()
);

drop policy if exists persetujuan_select_owner on public.persetujuan;
create policy persetujuan_select_owner
on public.persetujuan
for select to authenticated
using (
  exists(
    select 1
    from public.dokumen d
    join public.proker p on p.id=d.proker_id
    where d.id=persetujuan.dokumen_id
      and p.dibuat_oleh=auth.uid()
  )
);