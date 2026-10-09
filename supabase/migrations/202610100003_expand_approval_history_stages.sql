-- Extend the decision-history vocabulary for the new HMJ academic review stages.
alter table public.persetujuan drop constraint if exists persetujuan_tahap_check;
alter table public.persetujuan
  add constraint persetujuan_tahap_check
  check (tahap = any (array[
    'menteri','koordinator','bph','pembimbing','pembimbing_hmj',
    'pembimbing_hmj_lpj','bem','bem_lpj','wakil_rektor','wakil_rektor_lpj',
    'kaprodi','dekan','kaprodi_lpj','dekan_lpj'
  ]::text[])) not valid;
