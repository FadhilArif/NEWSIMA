insert into public.jabatan_organisasi(kode,nama,tingkat,cakupan,unit_wajib,unit_jenis_wajib,berlaku_tipe,aktif)
values
('ketua','Ketua',90,'organisasi',false,null,array['HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org],true),
('wakil_ketua','Wakil Ketua',80,'organisasi',false,null,array['HMJ'::public.tipe_org,'UKM'::public.tipe_org],true)
on conflict(kode) do update set nama=excluded.nama,tingkat=excluded.tingkat,cakupan=excluded.cakupan,unit_wajib=excluded.unit_wajib,unit_jenis_wajib=excluded.unit_jenis_wajib,berlaku_tipe=excluded.berlaku_tipe,aktif=true;

with permissions(kode,permission) as (
  select 'ketua',x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage',
    'dokumen.review','rapat.manage','laporan.review','struktur.view','struktur.manage','anggota.manage',
    'club.member.view','club.member.manage','organisasi.relation.manage']) x
  union all
  select 'wakil_ketua',x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage','struktur.view']) x
)
insert into public.hak_akses_jabatan(jabatan_id,kode)
select j.id,p.permission from public.jabatan_organisasi j join permissions p on p.kode=j.kode
on conflict do nothing;
