-- Account/position support for the new academic workflow.
-- Kaprodi is scoped to an HMJ and its program_studi unit.
-- Dekan is a faculty-wide profile role and must not be assigned to a keanggotaan row.

alter table public.profiles drop constraint if exists profiles_peran_allowed;
alter table public.profiles
  add constraint profiles_peran_allowed
  check (peran = any (array[
    'user'::public.peran_akun,
    'mahasiswa'::public.peran_akun,
    'pembimbing'::public.peran_akun,
    'wakil_rektor'::public.peran_akun,
    'staf_keuangan'::public.peran_akun,
    'admin'::public.peran_akun,
    'kaprodi'::public.peran_akun,
    'dekan'::public.peran_akun
  ])) not valid;

insert into public.jabatan_organisasi
  (kode,nama,tingkat,cakupan,aktif,berlaku_tipe,unit_wajib,unit_jenis_wajib)
values
  ('kaprodi','Kepala Program Studi',75,'organisasi',true,array['HMJ']::public.tipe_org[],true,'program_studi')
on conflict (kode) do update set
  nama=excluded.nama,
  cakupan=excluded.cakupan,
  aktif=true,
  berlaku_tipe=excluded.berlaku_tipe,
  unit_wajib=excluded.unit_wajib,
  unit_jenis_wajib=excluded.unit_jenis_wajib;

insert into public.hak_akses_jabatan(jabatan_id,kode)
select j.id,perm.kode
from public.jabatan_organisasi j
cross join (values
  ('beranda.view'),
  ('proker.view'),
  ('dokumen.review'),
  ('laporan.review'),
  ('struktur.view')
) as perm(kode)
where j.kode='kaprodi'
on conflict (jabatan_id,kode) do nothing;

create or replace function public.assign_organization_membership(
  p_account_id uuid,
  p_organisasi_id uuid,
  p_jabatan_kode text,
  p_unit_id uuid default null
)
returns public.keanggotaan
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_position public.jabatan_organisasi%rowtype;
  v_org public.organisasi%rowtype;
  v_profile public.profiles%rowtype;
  v_unit public.unit_kerja%rowtype;
  v_row public.keanggotaan;
begin
  if not ((select private.is_admin_or_rektor()) or (select private.has_org_permission(p_organisasi_id,'anggota.manage'))) then
    raise exception 'FORBIDDEN_MEMBERSHIP_ASSIGNMENT';
  end if;

  select * into v_profile from public.profiles where id=p_account_id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select * into v_org from public.organisasi where id=p_organisasi_id;
  if not found then raise exception 'ORGANIZATION_INVALID'; end if;
  if v_profile.peran='staf_keuangan' then raise exception 'FINANCE_STAFF_HAS_NO_ORGANIZATION'; end if;

  select * into v_position from public.jabatan_organisasi where kode=p_jabatan_kode and aktif=true;
  if not found then raise exception 'JABATAN_INVALID'; end if;
  if not (v_org.tipe=any(v_position.berlaku_tipe)) then raise exception 'POSITION_NOT_ALLOWED_FOR_ORGANIZATION_TYPE'; end if;

  if v_profile.peran='wakil_rektor' and (v_org.tipe<>'BEM' or v_position.kode<>'wakil_rektor') then
    raise exception 'VICE_RECTOR_MUST_USE_BEM_WAKIL_REKTOR';
  end if;
  if v_profile.peran='pembimbing' and v_position.kode<>'reviewer' then
    raise exception 'SUPERVISOR_MUST_USE_REVIEWER';
  end if;
  if v_profile.peran='kaprodi' and (v_org.tipe<>'HMJ' or v_position.kode<>'kaprodi') then
    raise exception 'KAPRODI_MUST_USE_HMJ_KAPRODI_POSITION';
  end if;
  if v_profile.peran='dekan' then
    raise exception 'DEKAN_GLOBAL_ROLE_DOES_NOT_USE_ORG_MEMBERSHIP';
  end if;

  if v_position.unit_wajib and p_unit_id is null then raise exception 'UNIT_REQUIRED_FOR_POSITION'; end if;
  if p_unit_id is not null then
    select * into v_unit from public.unit_kerja where id=p_unit_id;
    if not found then raise exception 'UNIT_NOT_FOUND'; end if;
    if v_position.unit_jenis_wajib='rektorat' then
      if v_unit.jenis<>'rektorat' or v_unit.organisasi_id is not null then raise exception 'VICE_RECTOR_REQUIRES_REKTORAT_UNIT'; end if;
    elsif v_unit.organisasi_id<>p_organisasi_id or (v_position.unit_jenis_wajib is not null and v_unit.jenis<>v_position.unit_jenis_wajib) then
      raise exception 'UNIT_NOT_ALLOWED_FOR_POSITION';
    end if;
  end if;

  if exists(select 1 from public.keanggotaan where akun_id=p_account_id and organisasi_id=p_organisasi_id and status='aktif') then
    raise exception 'ACCOUNT_ALREADY_ACTIVE_IN_ORGANIZATION';
  end if;

  insert into public.keanggotaan(akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status)
  values(p_account_id,p_organisasi_id,p_unit_id,v_position.id,v_position.nama,'aktif')
  returning * into v_row;
  return v_row;
end;
$function$;

-- BEM President can read the active coordination roster for the children of their own BEM.
drop policy if exists coordinator_select_bem_president on public.penugasan_koordinator;
create policy coordinator_select_bem_president
on public.penugasan_koordinator
for select to authenticated
using (
  status='aktif'
  and exists (
    select 1
    from public.organisasi child
    join public.keanggotaan k on k.organisasi_id=child.induk_organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where child.id=penugasan_koordinator.organisasi_id
      and child.tipe in ('HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org)
      and k.akun_id=(select auth.uid())
      and k.status='aktif'
      and j.kode='presiden'
      and j.aktif=true
  )
);
