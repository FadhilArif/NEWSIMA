-- Collaborator read-only access.
-- Joined collaborators can see the owning organization's proker.
-- They can read only final (approved) documents.
-- All mutation permissions remain tied to the owning organization.

create or replace function private.is_joined_collaborator(p_proker_id uuid)
returns boolean
language sql
security definer
set search_path=pg_catalog,public,private
stable
as $$
  select exists (
    select 1
    from public.proker_kolaborator pk
    where pk.proker_id=p_proker_id
      and pk.organisasi_id in (select private.user_org_ids())
      and pk.status='bergabung'
  );
$$;

create or replace function private.can_read_final_document_path(p_path text)
returns boolean
language sql
security definer
set search_path=pg_catalog,public,private
stable
as $$
  select exists (
    select 1
    from public.dokumen d
    where d.file_path=p_path
      and d.status='disetujui'
      and private.is_joined_collaborator(d.proker_id)
  );
$$;

grant execute on function private.is_joined_collaborator(uuid) to authenticated;
grant execute on function private.can_read_final_document_path(text) to authenticated;

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin_or_rektor()
  or private.has_org_permission(proker.organisasi_id,'proker.view')
  or private.is_joined_collaborator(proker.id)
);

drop policy if exists dokumen_select_authorized on public.dokumen;
create policy dokumen_select_authorized
on public.dokumen
for select to authenticated
using (
  private.is_admin_or_rektor()
  or organisasi_id in (select private.user_org_ids())
  or (
    status='disetujui'
    and private.is_joined_collaborator(proker_id)
  )
);

drop policy if exists dokumen_insert_authorized on public.dokumen;
create policy dokumen_insert_authorized
on public.dokumen
for insert to authenticated
with check (
  private.is_admin_or_rektor()
  or organisasi_id in (select private.user_org_ids())
);

drop policy if exists dokumen_update_authorized on public.dokumen;
create policy dokumen_update_authorized
on public.dokumen
for update to authenticated
using (
  private.is_admin_or_rektor()
  or organisasi_id in (select private.user_org_ids())
)
with check (
  private.is_admin_or_rektor()
  or organisasi_id in (select private.user_org_ids())
);

drop policy if exists dokumen_delete_authorized on public.dokumen;
create policy dokumen_delete_authorized
on public.dokumen
for delete to authenticated
using (
  private.is_admin_or_rektor()
  or organisasi_id in (select private.user_org_ids())
);

drop policy if exists documents_select_member on storage.objects;
create policy documents_select_member
on storage.objects
for select to authenticated
using (
  bucket_id='documents'
  and (
    private.is_admin_or_rektor()
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and p.organisasi_id in (select private.user_org_ids())
    )
    or private.can_read_final_document_path(name)
  )
);
