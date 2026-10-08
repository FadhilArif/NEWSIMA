CREATE OR REPLACE FUNCTION private.notify_proker_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_org_name text;
  v_org_type public.tipe_org;
  v_parent_bem uuid;
  v_message text;
begin
  if tg_op='UPDATE'
     and old.status is not distinct from new.status
     and old.review_stage is not distinct from new.review_stage then
    return new;
  end if;

  select o.nama,o.tipe,o.induk_organisasi_id
    into v_org_name,v_org_type,v_parent_bem
  from public.organisasi o
  where o.id=new.organisasi_id;

  if new.review_stage in ('hmj_from_bem','hmj_from_pembimbing') then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      case new.review_stage
        when 'hmj_from_bem' then 'Proker "'||coalesce(new.nama,'program kerja')||'" dikembalikan BEM ke HMJ untuk revisi. HMJ dapat konsul lagi ke Pembimbing atau melewati Pembimbing.'
        else 'Proker "'||coalesce(new.nama,'program kerja')||'" dikembalikan Pembimbing HMJ untuk revisi.'
      end,
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='bem_from_wakil_rektor' then
    if v_org_type='HMJ' then
      v_message:='Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
        coalesce(v_org_name,'HMJ')||' mendapat revisi Wakil Rektor dan dikembalikan ke BEM.';

      insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
      select distinct k.akun_id,new.organisasi_id,v_message,'review:'||new.id::text
      from public.keanggotaan k
      join public.jabatan_organisasi j on j.id=k.jabatan_id
      join public.hak_akses_jabatan h on h.jabatan_id=j.id
      where k.organisasi_id=v_parent_bem
        and k.status='aktif'
        and j.aktif
        and h.kode='dokumen.review';
    else
      insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
      select new.dibuat_oleh,new.organisasi_id,
        'Proker "'||coalesce(new.nama,'program kerja')||'" mendapat revisi Wakil Rektor dan perlu ditindaklanjuti BEM.',
        'review:'||new.id::text
      where new.dibuat_oleh is not null;
    end if;
    return new;
  end if;

  if new.review_stage='pembimbing_hmj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select pb.akun_id,new.organisasi_id,
      'Proker "'||coalesce(new.nama,'program kerja')||'" dari '||coalesce(v_org_name,'HMJ')||' menunggu review Pembimbing HMJ.',
      'review:'||new.id::text
    from public.pembimbing_organisasi pb
    join public.profiles p on p.id=pb.akun_id
    where pb.organisasi_id=new.organisasi_id
      and pb.status='aktif'
      and p.aktif
      and p.peran='pembimbing'::public.peran_akun;
    return new;
  end if;

  if new.review_stage='hmj_from_pembimbing_approved' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      'Proker "'||coalesce(new.nama,'program kerja')||'" telah disetujui Pembimbing HMJ. HMJ dapat meneruskan pengajuan ini ke BEM.',
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='pembimbing_hmj_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select pb.akun_id,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dari '||coalesce(v_org_name,'HMJ')||' menunggu review Pembimbing HMJ.',
      'review:'||new.id::text
    from public.pembimbing_organisasi pb
    join public.profiles p on p.id=pb.akun_id
    where pb.organisasi_id=new.organisasi_id
      and pb.status='aktif'
      and p.aktif
      and p.peran='pembimbing'::public.peran_akun;
    return new;
  end if;

  if new.review_stage='hmj_from_pembimbing_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" telah disetujui Pembimbing HMJ. HMJ dapat meneruskannya ke BEM.',
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='hmj_from_pembimbing_lpj_revision' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dikembalikan Pembimbing HMJ untuk diperbaiki.',
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='bem_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select distinct k.akun_id,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dari '||coalesce(v_org_name,'HMJ')||' menunggu review BEM.',
      'review:'||new.id::text
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.hak_akses_jabatan h on h.jabatan_id=j.id
    where k.organisasi_id=v_parent_bem
      and k.status='aktif'
      and j.aktif
      and h.kode='laporan.review';
    return new;
  end if;

  if new.review_stage='wakil_rektor_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select p.id,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dari HMJ menunggu review Wakil Rektor.',
      'review:'||new.id::text
    from public.profiles p
    where p.peran='wakil_rektor'::public.peran_akun
      and p.aktif;
    return new;
  end if;

  if new.review_stage='hmj_from_wakil_rektor_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dikembalikan Wakil Rektor untuk diperbaiki.',
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='hmj_from_bem_lpj' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      'LPJ "'||coalesce(new.nama,'program kerja')||'" dikembalikan BEM ke HMJ untuk diperbaiki.',
      'review:'||new.id::text
    where new.dibuat_oleh is not null;
    return new;
  end if;

  if new.review_stage='bem' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select distinct k.akun_id,new.organisasi_id,
      'Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
      coalesce(v_org_name,'HMJ')||' menunggu review BEM setelah konsultasi Pembimbing.',
      'review:'||new.id::text
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.hak_akses_jabatan h on h.jabatan_id=j.id
    where k.organisasi_id=v_parent_bem
      and k.status='aktif'
      and j.aktif
      and h.kode='dokumen.review';
    return new;
  end if;

  if new.review_stage='wakil_rektor' then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select p.id,new.organisasi_id,
      'Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
      coalesce(v_org_name,'BEM/HMJ')||' menunggu review Wakil Rektor.',
      'review:'||new.id::text
    from public.profiles p
    where p.aktif
      and p.peran='wakil_rektor'::public.peran_akun;
    return new;
  end if;

  return new;
end;
$function$
;