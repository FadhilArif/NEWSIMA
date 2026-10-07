-- Correct reviewer visibility:
-- Pembimbing HMJ behaves like a reviewer: only sees submissions explicitly
-- routed to that Pembimbing.
-- BEM and Wakil Rektor can view all activity photos.
-- HMJ accounts only see their own organization's activity photos.

create or replace function private.is_bem_account()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.keanggotaan k
  join public.organisasi o on o.id=k.organisasi_id
  where k.akun_id=auth.uid()
    and k.status='aktif'
    and o.tipe='BEM'::public.tipe_org
);
$$;

revoke all on function private.is_bem_account() from public,anon,authenticated;
grant execute on function private.is_bem_account() to authenticated;

-- PROKER visibility
drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()

  -- Pembimbing sees only proposals explicitly routed to that Pembimbing.
  or (
    review_stage='pembimbing_hmj'
    and private.is_hmj_pembimbing(organisasi_id)
  )

  -- Normal organization members see their own organization's Proker.
  or (
    private.has_org_permission(organisasi_id,'proker.view')
    and coalesce(
      (select p.peran from public.profiles p where p.id=auth.uid()),
      ''::public.peran_akun
    ) <> 'pembimbing'::public.peran_akun
  )

  -- Joined collaborators can see approved/collaborative Proker.
  or private.is_joined_collaborator(id)

  -- BEM reviewers can see HMJ proposals routed to BEM.
  or (
    review_stage in ('bem','bem_from_wakil_rektor')
    and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view')
  )
);

-- DOCUMENT visibility follows the same reviewer routing.
drop policy if exists dokumen_select_authorized on public.dokumen;
create policy dokumen_select_authorized
on public.dokumen
for select to authenticated
using (
  private.is_admin_or_rektor()
  or (
    coalesce(
      (select p.peran from public.profiles p where p.id=auth.uid()),
      ''::public.peran_akun
    ) <> 'pembimbing'::public.peran_akun
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
  or (
    status='disetujui'
    and private.is_joined_collaborator(proker_id)
  )
);

-- REVIEW HISTORY visibility for the Pembimbing who currently owns the stage.
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

-- PHOTO METADATA visibility:
-- Admin/Wakil Rektor/BEM = all organizations.
-- Pembimbing = only their assigned HMJ.
-- HMJ account = own HMJ only.
drop policy if exists foto_kegiatan_select_access on public.foto_kegiatan;
create policy foto_kegiatan_select_access
on public.foto_kegiatan
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or private.is_bem_account()
  or exists(
    select 1
    from public.proker p
    where p.id=foto_kegiatan.proker_id
      and (
        (
          exists(
            select 1
            from public.profiles me
            where me.id=auth.uid()
              and me.peran='pembimbing'::public.peran_akun
          )
          and private.is_hmj_pembimbing(p.organisasi_id)
        )
        or (
          p.organisasi_id in (select private.user_org_ids())
          and exists(
            select 1
            from public.profiles me
            where me.id=auth.uid()
              and me.peran<>'pembimbing'::public.peran_akun
          )
        )
      )
  )
);

-- Storage objects must follow the same visibility as foto_kegiatan.
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
          (
            exists(
              select 1
              from public.profiles me
              where me.id=auth.uid()
                and me.peran='pembimbing'::public.peran_akun
            )
            and private.is_hmj_pembimbing(p.organisasi_id)
          )
          or (
            p.organisasi_id in (select private.user_org_ids())
            and exists(
              select 1
              from public.profiles me
              where me.id=auth.uid()
                and me.peran<>'pembimbing'::public.peran_akun
            )
          )
        )
    )
  )
);

-- Make reviewer pages deterministic: the database exposes only actionable
-- Pembimbing-stage Proker to the assigned Pembimbing.
