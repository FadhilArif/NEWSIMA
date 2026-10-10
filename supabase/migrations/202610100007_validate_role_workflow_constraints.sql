-- Validate workflow role/history constraints after the production data audit.
-- The preflight query found no existing rows outside either allowed set.
alter table public.profiles
  validate constraint profiles_peran_allowed;

alter table public.persetujuan
  validate constraint persetujuan_tahap_check;
