-- HMJ supervisor and BEM reviewer visibility for LPJ workflow.
drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or (
    review_stage in ('pembimbing_hmj','pembimbing_hmj_lpj')
    and private.is_hmj_pembimbing(organisasi_id)
  )
  or (
    private.has_org_permission(organisasi_id,'proker.view')
    and (select p.peran from public.profiles p where p.id=auth.uid())
      is distinct from 'pembimbing'::public.peran_akun
  )
  or private.is_joined_collaborator(id)
  or (
    review_stage in ('bem','bem_from_wakil_rektor','bem_lpj')
    and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view')
  )
);

drop policy if exists dokumen_select_authorized on public.dokumen;
create policy dokumen_select_authorized
on public.dokumen
for select to authenticated
using (
  private.is_admin_or_rektor()
  or (
    (select p.peran from public.profiles p where p.id=auth.uid())
      is distinct from 'pembimbing'::public.peran_akun
    and organisasi_id in (select private.user_org_ids())
  )
  or exists(
    select 1 from public.proker p
    where p.id=dokumen.proker_id
      and p.review_stage in ('pembimbing_hmj','pembimbing_hmj_lpj')
      and private.is_hmj_pembimbing(p.organisasi_id)
  )
  or exists(
    select 1 from public.proker p
    where p.id=dokumen.proker_id
      and p.review_stage in ('bem','bem_from_wakil_rektor','bem_lpj')
      and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
  )
  or private.is_joined_collaborator(proker_id)
);

drop policy if exists persetujuan_select_access on public.persetujuan;
create policy persetujuan_select_access
on public.persetujuan
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or private.is_joined_collaborator((select d.proker_id from public.dokumen d where d.id=persetujuan.dokumen_id))
  or exists(
    select 1 from public.dokumen d
    where d.id=persetujuan.dokumen_id
      and (
        private.has_org_permission(d.organisasi_id,'dokumen.review')
        or exists(
          select 1 from public.proker p
          where p.id=d.proker_id
            and p.review_stage in ('pembimbing_hmj','pembimbing_hmj_lpj')
            and private.is_hmj_pembimbing(p.organisasi_id)
        )
        or exists(
          select 1 from public.proker p
          where p.id=d.proker_id
            and p.review_stage in ('bem','bem_from_wakil_rektor','bem_lpj')
            and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
        )
      )
  )
);