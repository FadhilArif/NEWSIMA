-- Break the cross-table RLS cycle between proker and proker_kolaborator.
-- Read helpers are SECURITY DEFINER and therefore do not recurse through RLS.

create or replace function private.can_read_proker_collaborator(p_proker_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $$
  select
    private.is_admin()
    or private.is_wakil_rektor()
    or exists(
      select 1
      from public.proker p
      where p.id=p_proker_id
        and (
          p.organisasi_id in (select private.user_org_ids())
          or private.is_joined_collaborator(p.id)
          or (
            p.review_stage in ('bem','bem_from_wakil_rektor')
            and private.has_bem_review_permission_for_hmj(p.organisasi_id,'proker.view')
          )
        )
    );
$$;

revoke all on function private.can_read_proker_collaborator(uuid) from public,anon,authenticated;
grant execute on function private.can_read_proker_collaborator(uuid) to authenticated;

drop policy if exists proker_kolab_select on public.proker_kolaborator;
create policy proker_kolab_select
on public.proker_kolaborator
for select to authenticated
using (
  private.can_read_proker_collaborator(proker_id)
);

drop policy if exists proker_kolab_insert on public.proker_kolaborator;
create policy proker_kolab_insert
on public.proker_kolaborator
for insert to authenticated
with check (
  private.is_admin()
  or exists(
    select 1
    from public.proker p
    where p.id=proker_kolaborator.proker_id
      and p.organisasi_id in (select private.user_org_ids())
  )
);

drop policy if exists proker_kolab_update on public.proker_kolaborator;
create policy proker_kolab_update
on public.proker_kolaborator
for update to authenticated
using (
  private.is_admin()
  or exists(
    select 1
    from public.proker p
    where p.id=proker_kolaborator.proker_id
      and p.organisasi_id in (select private.user_org_ids())
  )
)
with check (
  private.is_admin()
  or exists(
    select 1
    from public.proker p
    where p.id=proker_kolaborator.proker_id
      and p.organisasi_id in (select private.user_org_ids())
  )
);

drop policy if exists proker_kolab_delete on public.proker_kolaborator;
create policy proker_kolab_delete
on public.proker_kolaborator
for delete to authenticated
using (
  private.is_admin()
  or exists(
    select 1
    from public.proker p
    where p.id=proker_kolaborator.proker_id
      and p.organisasi_id in (select private.user_org_ids())
  )
);

-- Keep the Proker policy simple: the helper itself is security-definer.
drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or (
    review_stage='pembimbing_hmj'
    and private.is_hmj_pembimbing(organisasi_id)
  )
  or (
    private.has_org_permission(organisasi_id,'proker.view')
    and (select p.peran from public.profiles p where p.id=auth.uid())
      is distinct from 'pembimbing'::public.peran_akun
  )
  or private.is_joined_collaborator(id)
  or (
    review_stage in ('bem','bem_from_wakil_rektor')
    and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view')
  )
);