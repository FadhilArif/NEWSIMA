-- Organizational domain v2:
-- BEM hierarchy, HMJ/UKM parent, Club relations, position applicability,
-- Club non-account members, and UKM coordinator assignment.

alter table public.organisasi add column if not exists induk_organisasi_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='organisasi_induk_fk' and conrelid='public.organisasi'::regclass) then
    alter table public.organisasi add constraint organisasi_induk_fk foreign key (induk_organisasi_id) references public.organisasi(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='organisasi_induk_not_self' and conrelid='public.organisasi'::regclass) then
    alter table public.organisasi add constraint organisasi_induk_not_self check (induk_organisasi_id is null or induk_organisasi_id <> id);
  end if;
end $$;

create index if not exists idx_organisasi_induk_id on public.organisasi(induk_organisasi_id);
create unique index if not exists uq_bem_per_period on public.organisasi(periode_id) where tipe='BEM'::public.tipe_org;

update public.organisasi hmj
set induk_organisasi_id=bem.id
from public.organisasi bem
where hmj.tipe='HMJ'::public.tipe_org
  and bem.tipe='BEM'::public.tipe_org
  and bem.periode_id=hmj.periode_id
  and hmj.induk_organisasi_id is null;

create table if not exists public.organisasi_relasi (
  organisasi_id uuid not null references public.organisasi(id) on delete cascade,
  terhubung_dengan_id uuid not null references public.organisasi(id) on delete cascade,
  hubungan text not null default 'terhubung',
  dibuat_oleh uuid references public.profiles(id),
  dibuat_pada timestamptz not null default now(),
  primary key (organisasi_id,terhubung_dengan_id),
  check (organisasi_id <> terhubung_dengan_id)
);

create index if not exists idx_org_relasi_target on public.organisasi_relasi(terhubung_dengan_id);

alter table public.jabatan_organisasi
  add column if not exists berlaku_tipe public.tipe_org[] not null default array['BEM'::public.tipe_org,'HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org];
alter table public.jabatan_organisasi add column if not exists unit_jenis_wajib text;
alter table public.jabatan_organisasi drop constraint if exists jabatan_unit_jenis_wajib_check;
alter table public.jabatan_organisasi add constraint jabatan_unit_jenis_wajib_check check (unit_jenis_wajib is null or unit_jenis_wajib in ('kementerian','divisi'));

update public.jabatan_organisasi
set berlaku_tipe=case kode
  when 'presiden' then array['BEM'::public.tipe_org]
  when 'wakil_presiden' then array['BEM'::public.tipe_org]
  when 'sekretaris' then array['BEM'::public.tipe_org,'HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org]
  when 'bendahara' then array['BEM'::public.tipe_org,'HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org]
  when 'ketua' then array['HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org]
  when 'wakil_ketua' then array['HMJ'::public.tipe_org,'UKM'::public.tipe_org]
  when 'ketua_divisi' then array['HMJ'::public.tipe_org]
  when 'staff_divisi' then array['HMJ'::public.tipe_org]
  when 'menteri' then array['BEM'::public.tipe_org]
  when 'staff_kementerian' then array['BEM'::public.tipe_org]
  else berlaku_tipe end,
 unit_jenis_wajib=case kode
  when 'menteri' then 'kementerian'
  when 'staff_kementerian' then 'kementerian'
  when 'ketua_divisi' then 'divisi'
  when 'staff_divisi' then 'divisi'
  else null end;

insert into public.jabatan_organisasi(kode,nama,tingkat,cakupan,unit_wajib,unit_jenis_wajib,berlaku_tipe,aktif)
values
 ('menteri','Menteri',70,'divisi',true,'kementerian',array['BEM'::public.tipe_org],true),
 ('staff_kementerian','Staff Kementerian',40,'divisi',true,'kementerian',array['BEM'::public.tipe_org],true)
on conflict(kode) do update set
 nama=excluded.nama,tingkat=excluded.tingkat,cakupan=excluded.cakupan,unit_wajib=excluded.unit_wajib,
 unit_jenis_wajib=excluded.unit_jenis_wajib,berlaku_tipe=excluded.berlaku_tipe,aktif=true;

create table if not exists public.anggota_non_akun (
  id uuid primary key default gen_random_uuid(),
  organisasi_id uuid not null references public.organisasi(id) on delete cascade,
  nama text not null,
  nim text not null,
  dibuat_oleh uuid references public.profiles(id),
  dibuat_pada timestamptz not null default now(),
  aktif boolean not null default true
);
create unique index if not exists uq_club_non_account_member on public.anggota_non_akun(organisasi_id,nim);

alter table public.penugasan_koordinator
  add column if not exists ditunjuk_oleh uuid references public.profiles(id),
  add column if not exists ditunjuk_pada timestamptz not null default now(),
  add column if not exists mulai_pada date not null default current_date,
  add column if not exists berakhir_pada date;

alter table public.penugasan_koordinator drop constraint if exists penugasan_koordinator_status_check;
alter table public.penugasan_koordinator add constraint penugasan_koordinator_status_check check(status in ('aktif','dicabut','selesai'));

create unique index if not exists uq_active_ukm_coordinator
on public.penugasan_koordinator(organisasi_id) where status='aktif';

create or replace function private.is_president_of_bem_for_ukm(p_ukm_id uuid,p_account_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.organisasi ukm
  join public.organisasi bem on bem.id=ukm.induk_organisasi_id and bem.tipe='BEM'::public.tipe_org
  join public.keanggotaan k on k.organisasi_id=bem.id and k.akun_id=p_account_id and k.status='aktif'
  join public.jabatan_organisasi j on j.id=k.jabatan_id and j.kode='presiden'
  where ukm.id=p_ukm_id and ukm.tipe='UKM'::public.tipe_org
)
$$;

create or replace function private.is_active_bem_member_for_ukm(p_ukm_id uuid,p_account_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.organisasi ukm
  join public.organisasi bem on bem.id=ukm.induk_organisasi_id and bem.tipe='BEM'::public.tipe_org
  join public.keanggotaan k on k.organisasi_id=bem.id and k.akun_id=p_account_id and k.status='aktif'
  where ukm.id=p_ukm_id and ukm.tipe='UKM'::public.tipe_org
)
$$;

create or replace function public.assign_ukm_coordinator(p_ukm_id uuid,p_account_id uuid)
returns public.penugasan_koordinator
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_row public.penugasan_koordinator;
begin
  if not private.is_president_of_bem_for_ukm(p_ukm_id,(select auth.uid())) then
    raise exception 'ONLY_BEM_PRESIDENT_CAN_APPOINT_UKM_COORDINATOR';
  end if;
  if not private.is_active_bem_member_for_ukm(p_ukm_id,p_account_id) then
    raise exception 'COORDINATOR_MUST_BE_ACTIVE_BEM_MEMBER';
  end if;
  update public.penugasan_koordinator set status='dicabut',berakhir_pada=coalesce(berakhir_pada,current_date)
  where organisasi_id=p_ukm_id and status='aktif';
  insert into public.penugasan_koordinator(organisasi_id,akun_id,status,ditunjuk_oleh,ditunjuk_pada,mulai_pada)
  values(p_ukm_id,p_account_id,'aktif',(select auth.uid()),now(),current_date)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.assign_ukm_coordinator(uuid,uuid) from public,anon;
grant execute on function public.assign_ukm_coordinator(uuid,uuid) to authenticated;

create or replace function public.get_ukm_coordinator_candidates(p_ukm_id uuid)
returns table(id uuid,nama text,nim text)
language sql security definer set search_path=pg_catalog,public
as $$
select p.id,p.nama,p.nim
from public.profiles p
join public.keanggotaan k on k.akun_id=p.id and k.status='aktif'
join public.organisasi ukm on ukm.id=p_ukm_id
join public.organisasi bem on bem.id=ukm.induk_organisasi_id
where k.organisasi_id=bem.id
  and bem.tipe='BEM'::public.tipe_org
  and ukm.tipe='UKM'::public.tipe_org
  and private.is_president_of_bem_for_ukm(p_ukm_id,(select auth.uid()))
order by p.nama
$$;

revoke all on function public.get_ukm_coordinator_candidates(uuid) from public,anon;
grant execute on function public.get_ukm_coordinator_candidates(uuid) to authenticated;
