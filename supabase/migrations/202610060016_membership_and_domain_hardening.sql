-- Complete the organizational domain model and membership workflow.
-- This migration is intentionally idempotent so it can follow 202610060015.

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

create or replace function private.validate_organisasi_hierarchy()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_parent public.organisasi%rowtype;
begin
  if new.tipe='BEM'::public.tipe_org then
    if new.induk_organisasi_id is not null then raise exception 'BEM_CANNOT_HAVE_PARENT'; end if;
  elsif new.tipe in ('HMJ'::public.tipe_org,'UKM'::public.tipe_org) then
    if new.induk_organisasi_id is null then raise exception 'PARENT_BEM_REQUIRED'; end if;
    select * into v_parent from public.organisasi where id=new.induk_organisasi_id;
    if not found or v_parent.tipe<>'BEM'::public.tipe_org then raise exception 'PARENT_MUST_BE_BEM'; end if;
    if v_parent.periode_id <> new.periode_id then raise exception 'PARENT_BEM_MUST_USE_SAME_PERIOD'; end if;
  elsif new.tipe='CLUB'::public.tipe_org then
    if new.induk_organisasi_id is not null then raise exception 'CLUB_USES_RELATION_TABLE_NOT_SINGLE_PARENT'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_organisasi_hierarchy on public.organisasi;
create trigger trg_validate_organisasi_hierarchy
before insert or update of tipe,periode_id,induk_organisasi_id on public.organisasi
for each row execute function private.validate_organisasi_hierarchy();
revoke all on function private.validate_organisasi_hierarchy() from public,anon,authenticated;

create table if not exists public.organisasi_relasi (
  organisasi_id uuid not null references public.organisasi(id) on delete cascade,
  terhubung_dengan_id uuid not null references public.organisasi(id) on delete cascade,
  hubungan text not null default 'terhubung',
  dibuat_oleh uuid references public.profiles(id),
  dibuat_pada timestamptz not null default now(),
  primary key (organisasi_id,terhubung_dengan_id),
  check (organisasi_id<>terhubung_dengan_id)
);

create index if not exists idx_org_relasi_target on public.organisasi_relasi(terhubung_dengan_id);

create or replace function private.validate_organisasi_relasi()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_type public.tipe_org;
begin
  select tipe into v_type from public.organisasi where id=new.organisasi_id;
  if v_type<>'CLUB'::public.tipe_org then raise exception 'ONLY_CLUB_CAN_HAVE_ORGANIZATION_RELATIONS'; end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_organisasi_relasi on public.organisasi_relasi;
create trigger trg_validate_organisasi_relasi before insert or update on public.organisasi_relasi
for each row execute function private.validate_organisasi_relasi();
revoke all on function private.validate_organisasi_relasi() from public,anon,authenticated;

alter table public.jabatan_organisasi add column if not exists berlaku_tipe public.tipe_org[] not null default array['BEM'::public.tipe_org,'HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org];
alter table public.jabatan_organisasi add column if not exists unit_jenis_wajib text;
alter table public.jabatan_organisasi drop constraint if exists jabatan_unit_jenis_wajib_check;
alter table public.jabatan_organisasi add constraint jabatan_unit_jenis_wajib_check check(unit_jenis_wajib is null or unit_jenis_wajib in('kementerian','divisi'));

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
on conflict(kode) do update set nama=excluded.nama,tingkat=excluded.tingkat,cakupan=excluded.cakupan,unit_wajib=excluded.unit_wajib,unit_jenis_wajib=excluded.unit_jenis_wajib,berlaku_tipe=excluded.berlaku_tipe,aktif=true;

with permissions(kode,permission) as (
select 'presiden',x from unnest(array['koordinator.view','koordinator.manage','club.member.view','club.member.manage','organisasi.relation.manage']) x
union all select 'ketua',x from unnest(array['club.member.view','club.member.manage','organisasi.relation.manage']) x
)
insert into public.hak_akses_jabatan(jabatan_id,kode)
select j.id,p.permission from public.jabatan_organisasi j join permissions p on p.kode=j.kode
on conflict do nothing;

create unique index if not exists uq_active_membership_account_org on public.keanggotaan(akun_id,organisasi_id) where status='aktif';

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

create unique index if not exists uq_active_ukm_coordinator on public.penugasan_koordinator(organisasi_id) where status='aktif';

create or replace function public.assign_organization_membership(p_account_id uuid,p_organisasi_id uuid,p_jabatan_kode text,p_unit_id uuid default null)
returns public.keanggotaan language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_position public.jabatan_organisasi%rowtype; v_org public.organisasi%rowtype; v_row public.keanggotaan;
begin
 if not ((select private.is_admin_or_rektor()) or (select private.has_org_permission(p_organisasi_id,'anggota.manage'))) then raise exception 'FORBIDDEN_MEMBERSHIP_ASSIGNMENT'; end if;
 select * into v_org from public.organisasi where id=p_organisasi_id;
 if not found then raise exception 'ORGANIZATION_INVALID'; end if;
 select * into v_position from public.jabatan_organisasi where kode=p_jabatan_kode and aktif=true;
 if not found then raise exception 'JABATAN_INVALID'; end if;
 if not (v_org.tipe=any(v_position.berlaku_tipe)) then raise exception 'POSITION_NOT_ALLOWED_FOR_ORGANIZATION_TYPE'; end if;
 if exists(select 1 from public.keanggotaan where akun_id=p_account_id and organisasi_id=p_organisasi_id and status='aktif') then raise exception 'ACCOUNT_ALREADY_ACTIVE_IN_ORGANIZATION'; end if;
 insert into public.keanggotaan(akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status)
 values(p_account_id,p_organisasi_id,p_unit_id,v_position.id,v_position.nama,'aktif')
 returning * into v_row;
 return v_row;
end;
$$;
revoke all on function public.assign_organization_membership(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.assign_organization_membership(uuid,uuid,text,uuid) to authenticated;
