alter table public.persetujuan
  drop constraint if exists persetujuan_tahap_check;

alter table public.persetujuan
  add constraint persetujuan_tahap_check
  check (
    tahap = any(array[
      'menteri'::text,
      'koordinator'::text,
      'bph'::text,
      'pembimbing'::text,
      'pembimbing_hmj'::text,
      'bem'::text,
      'wakil_rektor'::text
    ])
  );