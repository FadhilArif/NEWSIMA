-- Joined collaborators can inspect the full Proker process in read-only mode.
-- No write policy is added here; workflow mutations remain protected by permissions/RPCs.

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
        and p.review_stage='pembimbing_hmj'
        and private.is_hmj_pembimbing(p.organisasi_id)
    )
  )
  or (
    exists(
      select 1
      from public.proker p
      where p.id=dokumen.proker_id
        and p.review_stage in ('bem','bem_from_wakil_rektor')
        and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
    )
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
    where d.id=persetujuan.dokumen_id
      and (
        private.has_org_permission(d.organisasi_id,'dokumen.review')
        or (
          exists(
            select 1
            from public.proker p
            where p.id=d.proker_id
              and p.review_stage='pembimbing_hmj'
              and private.is_hmj_pembimbing(p.organisasi_id)
          )
        )
        or (
          exists(
            select 1
            from public.proker p
            where p.id=d.proker_id
              and p.review_stage in ('bem','bem_from_wakil_rektor')
              and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review')
          )
        )
      )
  )
);

drop policy if exists foto_kegiatan_select_access on public.foto_kegiatan;
create policy foto_kegiatan_select_access
on public.foto_kegiatan
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or private.is_bem_account()
  or private.is_joined_collaborator(proker_id)
  or exists(
    select 1
    from public.proker p
    where p.id=foto_kegiatan.proker_id
      and (
        (
          exists(
            select 1 from public.profiles me
            where me.id=auth.uid()
              and me.peran='pembimbing'::public.peran_akun
          )
          and private.is_hmj_pembimbing(p.organisasi_id)
        )
        or (
          p.organisasi_id in (select private.user_org_ids())
          and exists(
            select 1 from public.profiles me
            where me.id=auth.uid()
              and me.peran<>'pembimbing'::public.peran_akun
          )
        )
      )
  )
);

drop policy if exists activity_photos_select on storage.objects;
create policy activity_photos_select
on storage.objects
for select to authenticated
using (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or private.is_wakil_rektor()
    or private.is_bem_account()
    or exists(
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and (
          private.is_joined_collaborator(p.id)
          or (
            exists(
              select 1 from public.profiles me
              where me.id=auth.uid()
                and me.peran='pembimbing'::public.peran_akun
            )
            and private.is_hmj_pembimbing(p.organisasi_id)
          )
          or (
            p.organisasi_id in (select private.user_org_ids())
            and exists(
              select 1 from public.profiles me
              where me.id=auth.uid()
                and me.peran<>'pembimbing'::public.peran_akun
            )
          )
        )
    )
  )
);