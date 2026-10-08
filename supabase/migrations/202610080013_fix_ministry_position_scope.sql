-- Ministry positions are organization-level positions attached to a
-- kementerian unit. They must not be classified as divisi positions.
update public.jabatan_organisasi
set cakupan='organisasi',
    unit_wajib=true,
    unit_jenis_wajib='kementerian',
    berlaku_tipe=array['BEM'::public.tipe_org],
    aktif=true
where kode in ('menteri','staff_kementerian');
