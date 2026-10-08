-- Pembimbing HMJ is a read-only observer for every Proker
-- owned by the HMJ they supervise. Action rights are still stage-gated
-- separately in the RPC/UI.

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or (
    private.is_hmj_pembimbing(organisasi_id)
    and exists(
      select 1 from public.profiles me
      where me.id=auth.uid()
        and me.peran='pembimbing'::public.peran_akun
        and me.aktif
    )
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
  or (
    exists(
      select 1
      from public.proker p
      where p.id=dokumen.proker_id
        and private.is_hmj_pembimbing(p.organisasi_id)
        and exists(
          select 1 from public.profiles me
          where me.id=auth.uid()
            and me.peran='pembimbing'::public.peran_akun
            and me.aktif
        )
    )
  )
  or exists(
    select 1
    from public.proker p
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
  or private.is_joined_collaborator(
    (select d.proker_id from public.dokumen d where d.id=persetujuan.dokumen_id)
  )
  or exists(
    select 1
    from public.dokumen d
    join public.proker pr on pr.id=d.proker_id
    where d.id=persetujuan.dokumen_id
      and (
        (
          private.is_hmj_pembimbing(pr.organisasi_id)
          and exists(
            select 1 from public.profiles me
            where me.id=auth.uid()
              and me.peran='pembimbing'::public.peran_akun
              and me.aktif
          )
        )
        or private.has_org_permission(d.organisasi_id,'dokumen.review')
        or (
          pr.review_stage in ('bem','bem_from_wakil_rektor','bem_lpj')
          and private.has_bem_review_permission_for_hmj(pr.organisasi_id,'dokumen.review')
        )
      )
  )
);