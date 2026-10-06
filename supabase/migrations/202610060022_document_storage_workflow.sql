-- Document storage workflow for proposals and LPJ.
-- Supabase Storage bucket: private "documents", max 15 MiB per file.
-- Object path: <organisasi_id>/<proker_id>/<jenis>/<timestamp>_<filename>

alter table public.dokumen
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists uploaded_at timestamptz;

create index if not exists idx_dokumen_proker_jenis on public.dokumen(proker_id,jenis);
create index if not exists idx_dokumen_uploaded_by on public.dokumen(uploaded_by);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'documents','documents',false,15728640,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public=false,
  file_size_limit=15728640,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists documents_select_member on storage.objects;
create policy documents_select_member on storage.objects
for select to authenticated
using (
  bucket_id='documents' and (
    private.is_admin_or_rektor()
    or exists(
      select 1 from public.proker p
      join public.keanggotaan k on k.organisasi_id=p.organisasi_id
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id=(storage.foldername(name))[1]::uuid
        and k.akun_id=auth.uid() and k.status='aktif'
    )
  )
);

drop policy if exists documents_insert_member on storage.objects;
create policy documents_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id='documents' and (
    private.is_admin_or_rektor()
    or exists(
      select 1 from public.proker p
      join public.keanggotaan k on k.organisasi_id=p.organisasi_id
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id=(storage.foldername(name))[1]::uuid
        and k.akun_id=auth.uid() and k.status='aktif'
    )
  )
);

drop policy if exists documents_update_member on storage.objects;
create policy documents_update_member on storage.objects
for update to authenticated
using (
  bucket_id='documents' and (
    private.is_admin_or_rektor()
    or owner_id=auth.uid()::text
    or exists(
      select 1 from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id in (select private.user_org_ids())
    )
  )
)
with check (
  bucket_id='documents' and (
    private.is_admin_or_rektor()
    or owner_id=auth.uid()::text
    or exists(
      select 1 from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id in (select private.user_org_ids())
    )
  )
);

drop policy if exists documents_delete_member on storage.objects;
create policy documents_delete_member on storage.objects
for delete to authenticated
using (
  bucket_id='documents' and (
    private.is_admin_or_rektor()
    or owner_id=auth.uid()::text
    or exists(
      select 1 from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id in (select private.user_org_ids())
    )
  )
);

-- The lifecycle RPC now requires a real uploaded file before proposal/LPJ submission.
