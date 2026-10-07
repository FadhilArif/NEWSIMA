-- Pembimbing HMJ must be bound to the HMJ's program-study unit.
update public.jabatan_organisasi
set unit_wajib=true,
    unit_jenis_wajib='program_studi',
    berlaku_tipe=array['HMJ'::public.tipe_org],
    aktif=true
where kode='pembimbing_hmj';

-- The existing OHSA program-study unit is the D4 K3 program.
update public.unit_kerja
set nama='D4 K3'
where organisasi_id='a7f56e7c-6418-4bf3-aec7-f709674739e8'
  and jenis='program_studi'
  and nama='K3';