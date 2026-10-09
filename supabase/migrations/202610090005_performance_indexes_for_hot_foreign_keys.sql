-- Index foreign-key columns surfaced by the Supabase performance advisor.
-- These indexes improve common joins/lookups without changing access semantics.

create index if not exists idx_foto_kegiatan_dokumen_id
  on public.foto_kegiatan (dokumen_id);

create index if not exists idx_penggunaan_dana_dicatat_oleh
  on public.penggunaan_dana (dicatat_oleh);

create index if not exists idx_profiles_unit_kerja_id
  on public.profiles (unit_kerja_id);

create index if not exists idx_proker_anggaran_disetujui_oleh
  on public.proker (anggaran_disetujui_oleh);

create index if not exists idx_anggaran_periode_diatur_oleh
  on public.anggaran_periode (diatur_oleh);
