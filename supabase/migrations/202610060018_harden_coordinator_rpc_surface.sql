create or replace function public.assign_organization_membership(
  p_account_id uuid,p_organisasi_id uuid,p_jabatan_kode text,p_unit_id uuid default null
)
returns public.keanggotaan
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare v_position public.jabatan_organisasi%rowtype; v_org public.organisasi%rowtype; v_row public.keanggotaan;
begin
  if not ((select private.is_admin_or_rektor()) or (select private.has_org_permission(p_organisasi_id,'anggota.manage'))) then raise exception 'FORBIDDEN_MEMBERSHIP_ASSIGNMENT'; end if;
  select * into v_org from public.organisasi where id=p_organisasi_id;
  if not found then raise exception 'ORGANIZATION_INVALID'; end if;
  select * into v_position from public.jabatan_organisasi where kode=p_jabatan_kode and aktif=true;
  if not found then raise exception 'JABATAN_INVALID'; end if;
  if not (v_org.tipe=any(v_position.berlaku_tipe)) then raise exception 'POSITION_NOT_ALLOWED_FOR_ORGANIZATION_TYPE'; end if;
  if v_position.unit_wajib and p_unit_id is null then raise exception 'UNIT_REQUIRED_FOR_POSITION'; end if;
  if p_unit_id is not null and not exists(select 1 from public.unit_kerja u where u.id=p_unit_id and u.organisasi_id=p_organisasi_id and (v_position.unit_jenis_wajib is null or u.jenis=v_position.unit_jenis_wajib)) then raise exception 'UNIT_NOT_ALLOWED_FOR_POSITION'; end if;
  if exists(select 1 from public.keanggotaan where akun_id=p_account_id and organisasi_id=p_organisasi_id and status='aktif') then raise exception 'ACCOUNT_ALREADY_ACTIVE_IN_ORGANIZATION'; end if;
  insert into public.keanggotaan(akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status)
  values(p_account_id,p_organisasi_id,p_unit_id,v_position.id,v_position.nama,'aktif')
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.assign_organization_membership(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.assign_organization_membership(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.assign_ukm_coordinator(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_ukm_coordinator_candidates(uuid) from public,anon,authenticated;

drop policy if exists penugasan_select_scoped on public.penugasan_koordinator;
drop policy if exists plafon_select_access on public.plafon_anggaran;
