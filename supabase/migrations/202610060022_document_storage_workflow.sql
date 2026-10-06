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


create or replace function public.transition_proker(
  p_proker_id uuid,p_action text,p_comment text default null
)
returns public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_p public.proker%rowtype;
  v_doc public.dokumen%rowtype;
  v_org uuid;
  v_uid uuid := auth.uid();
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_p from public.proker where id=p_proker_id for update;
  if not found then raise exception 'PROKER_NOT_FOUND'; end if;
  v_org:=v_p.organisasi_id;

  if p_action in ('submit','resubmit') then
    if not (private.has_org_permission(v_org,'proker.create') or private.has_org_permission(v_org,'proker.edit')) then raise exception 'FORBIDDEN_PROKER_SUBMIT'; end if;
    if p_action='submit' and v_p.status<>'direncanakan' then raise exception 'INVALID_STATUS_FOR_SUBMIT'; end if;
    if p_action='resubmit' and v_p.status<>'revisi' then raise exception 'INVALID_STATUS_FOR_RESUBMIT'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
    update public.dokumen set status='diajukan',tahap='koordinator' where id=v_doc.id;
    update public.proker set status='proposal_diajukan' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve','revise') then
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    if not private.has_org_permission(v_org,'dokumen.review') then raise exception 'FORBIDDEN_PROKER_REVIEW'; end if;
    if v_p.status<>'proposal_diajukan' then raise exception 'INVALID_STATUS_FOR_REVIEW'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
    if p_action='revise' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(v_doc.id,'koordinator',case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,coalesce(private.current_position_code(v_org),'reviewer'));
    update public.dokumen set status=case when p_action='approve' then 'disetujui' else 'revisi' end,tahap=case when p_action='approve' then 'bph' else 'koordinator' end where id=v_doc.id;
    update public.proker set status=case when p_action='approve' then 'disetujui' else 'revisi' end where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='start' then
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_PROKER_START'; end if;
    if v_p.status<>'disetujui' then raise exception 'INVALID_STATUS_FOR_START'; end if;
    update public.proker set status='berjalan' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='finish' then
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_PROKER_FINISH'; end if;
    if v_p.status<>'berjalan' then raise exception 'INVALID_STATUS_FOR_FINISH'; end if;
    update public.proker set status='selesai' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='submit_lpj' then
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_LPJ_SUBMIT'; end if;
    if v_p.status<>'selesai' then raise exception 'INVALID_STATUS_FOR_LPJ_SUBMIT'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    update public.dokumen set status='diajukan',tahap='pembimbing' where id=v_doc.id;
    update public.proker set status='lpj_diajukan' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve_lpj','reject_lpj') then
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    if not private.has_org_permission(v_org,'laporan.review') and not private.has_org_permission(v_org,'dokumen.review') then raise exception 'FORBIDDEN_LPJ_REVIEW'; end if;
    if v_p.status<>'lpj_diajukan' then raise exception 'INVALID_STATUS_FOR_LPJ_REVIEW'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    if p_action='reject_lpj' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(v_doc.id,'pembimbing',case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,coalesce(private.current_position_code(v_org),'reviewer'));
    update public.dokumen set status=case when p_action='approve_lpj' then 'disetujui' else 'revisi' end,tahap='pembimbing' where id=v_doc.id;
    update public.proker set status=case when p_action='approve_lpj' then 'lpj_disetujui' else 'selesai' end where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  raise exception 'UNKNOWN_PROKER_ACTION';
end;
$$;

revoke all on function public.transition_proker(uuid,text,text) from public,anon;
grant execute on function public.transition_proker(uuid,text,text) to authenticated;
