do $
begin
  alter table public.unit_kerja
    drop constraint if exists unit_kerja_jenis_check;


  alter table public.unit_kerja
    drop constraint if exists unit_kerja_jenis_allowed;

  alter table public.unit_kerja
    add constraint unit_kerja_jenis_allowed
    check (jenis in (
      'presiden',
      'wakil_presiden',
      'sekretaris',
      'bendahara',
      'ketua',
      'wakil_ketua',
      'kementerian',
      'divisi'
    ))
    not valid;
exception when duplicate_object then
  null;
end $$;

create unique index if not exists uq_unit_kerja_core_leader_per_org
on public.unit_kerja(organisasi_id,jenis)
where jenis in (
  'presiden',
  'wakil_presiden',
  'sekretaris',
  'bendahara',
  'ketua',
  'wakil_ketua'
);
