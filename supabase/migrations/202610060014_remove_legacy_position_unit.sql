-- Remove the legacy "President" record that incorrectly represented a
-- position as a unit_kerja row. Position is now modeled by jabatan_organisasi.
delete from public.unit_kerja u
where u.jenis='presiden'
  and u.nama='Badan Pengurus Harian'
  and not exists(select 1 from public.keanggotaan k where k.unit_id=u.id)
  and not exists(select 1 from public.proker p where p.unit_id=u.id)
  and not exists(select 1 from public.organisasi o where o.kementerian_id=u.id);
