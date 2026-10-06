create index if not exists idx_penugasan_koordinator_ditunjuk_oleh on public.penugasan_koordinator(ditunjuk_oleh);
create index if not exists idx_org_relasi_dibuat_oleh on public.organisasi_relasi(dibuat_oleh);
create index if not exists idx_anggota_non_akun_dibuat_oleh on public.anggota_non_akun(dibuat_oleh);
