-- Allow BEM reviewers to read HMJ proposals that are explicitly waiting at the BEM stage.
-- This is read/review visibility only; edit policies remain scoped to the owning HMJ.

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or private.has_org_permission(organisasi_id,'proker.view')
  or private.is_joined_collaborator(id)
  or (
    review_stage='bem'
    and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view')
  )
);

drop policy if exists dokumen_select_authorized on public.dokumen;
create policy dokumen_select_authorized
on public.dokumen
for select to authenticated
using (
  private.is_admin_or_rektor()
  or (organisasi_id in (select private.user_org_ids()))
  or (
    exists(
      select 1
      from public.proker p
      where p.id=dokumen.proker_id
        and p.review_stage='bem'
        and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
    )
  )
  or (
    status='disetujui'
    and private.is_joined_collaborator(proker_id)
  )
);

drop policy if exists persetujuan_select_access on public.persetujuan;
create policy persetujuan_select_access
on public.persetujuan
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or exists(
    select 1
    from public.dokumen d
    where d.id=persetujuan.dokumen_id
      and (
        private.has_org_permission(d.organisasi_id,'dokumen.review')
        or (
          exists(
            select 1
            from public.proker p
            where p.id=d.proker_id
              and p.review_stage='bem'
              and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
          )
        )
      )
  )
  or exists(
    select 1
    from public.dokumen d
    where d.id=persetujuan.dokumen_id
      and private.has_org_permission(d.organisasi_id,'struktur.view')
  )
);

drop policy if exists proker_kolab_select on public.proker_kolaborator;
create policy proker_kolab_select
on public.proker_kolaborator
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or (organisasi_id in (select private.user_org_ids()))
  or exists(
    select 1
    from public.proker p
    where p.id=proker_kolaborator.proker_id
      and (
        p.organisasi_id in (select private.user_org_ids())
        or (
          p.review_stage='bem'
          and private.has_bem_review_permission_for_hmj(p.organisasi_id,'proker.view')
        )
      )
  )
);
