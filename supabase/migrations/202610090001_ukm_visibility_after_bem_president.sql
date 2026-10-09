-- UKM proker/document visibility after BEM President approval.
-- Before approval, access remains stage-based (assigned coordinator or BEM President).
-- Once forwarded to Wakil Rektor, all active members of the UKM's parent BEM can
-- view the proposal/LPJ read-only; they may continue to view it after approval.

drop policy if exists proker_select_ukm_parent_bem_after_president on public.proker;
create policy proker_select_ukm_parent_bem_after_president
on public.proker
for select
to authenticated
using (
  exists (
    select 1
    from public.organisasi ukm
    join public.keanggotaan k
      on k.organisasi_id = ukm.induk_organisasi_id
    where ukm.id = proker.organisasi_id
      and ukm.tipe = 'UKM'::public.tipe_org
      and k.akun_id = (select auth.uid())
      and k.status = 'aktif'
      and (
        (proker.status = 'proposal_diajukan' and proker.review_stage = 'wakil_rektor')
        or (proker.status = 'lpj_diajukan' and proker.review_stage = 'wakil_rektor_lpj')
        or (
          proker.review_stage is null
          and proker.status in ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip')
        )
      )
  )
);

drop policy if exists dokumen_select_ukm_parent_bem_after_president on public.dokumen;
create policy dokumen_select_ukm_parent_bem_after_president
on public.dokumen
for select
to authenticated
using (
  exists (
    select 1
    from public.proker p
    join public.organisasi ukm on ukm.id = p.organisasi_id
    join public.keanggotaan k on k.organisasi_id = ukm.induk_organisasi_id
    where p.id = dokumen.proker_id
      and ukm.tipe = 'UKM'::public.tipe_org
      and k.akun_id = (select auth.uid())
      and k.status = 'aktif'
      and (
        (p.status = 'proposal_diajukan' and p.review_stage = 'wakil_rektor')
        or (p.status = 'lpj_diajukan' and p.review_stage = 'wakil_rektor_lpj')
        or (
          p.review_stage is null
          and p.status in ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip')
        )
      )
  )
);
