alter table public.pembimbing_organisasi
  add constraint pembimbing_organisasi_organisasi_akun_key
  unique (organisasi_id,akun_id);