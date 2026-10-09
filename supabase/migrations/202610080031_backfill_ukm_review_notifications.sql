-- Backfill notifications for UKM proposal/LPJ items already waiting at the coordinator stage.
-- Idempotent: an account receives at most one notification per review:<proker_id> link.

insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
select distinct
  pc.akun_id,
  p.organisasi_id,
  case
    when p.review_stage='ukm_koordinator_lpj'
      then 'LPJ "'||coalesce(p.nama,'program kerja')||'" menunggu review Koordinator UKM.'
    else 'Proposal "'||coalesce(p.nama,'program kerja')||'" menunggu review Koordinator UKM.'
  end,
  'review:'||p.id::text
from public.proker p
join public.organisasi o on o.id=p.organisasi_id and o.tipe='UKM'::public.tipe_org
join public.penugasan_koordinator pc on pc.organisasi_id=o.id and pc.status='aktif'
where (
  (p.status='proposal_diajukan' and p.review_stage='ukm_koordinator')
  or
  (p.status='lpj_diajukan' and p.review_stage='ukm_koordinator_lpj')
)
and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
and not exists(
  select 1 from public.notifikasi n
  where n.akun_id=pc.akun_id and n.tautan='review:'||p.id::text
);
