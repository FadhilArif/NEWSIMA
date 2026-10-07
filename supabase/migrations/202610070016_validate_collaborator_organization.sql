-- Collaborators may only be BEM, UKM, or HMJ and never the owner organization.
create or replace function private.validate_proker_kolaborator_org()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_owner_org uuid;
  v_type public.tipe_org;
begin
  select organisasi_id into v_owner_org
  from public.proker
  where id=new.proker_id;

  if v_owner_org is null then
    raise exception 'PROKER_NOT_FOUND';
  end if;

  if new.organisasi_id=v_owner_org then
    raise exception 'OWNER_ORGANIZATION_CANNOT_BE_COLLABORATOR';
  end if;

  select tipe into v_type
  from public.organisasi
  where id=new.organisasi_id;

  if v_type is null then
    raise exception 'COLLABORATOR_ORGANIZATION_NOT_FOUND';
  end if;

  if v_type not in ('BEM'::public.tipe_org,'UKM'::public.tipe_org,'HMJ'::public.tipe_org) then
    raise exception 'INVALID_COLLABORATOR_ORGANIZATION_TYPE';
  end if;

  new.porsi_plafon:=0;
  return new;
end;
$$;

drop trigger if exists trg_validate_proker_kolaborator_org on public.proker_kolaborator;
create trigger trg_validate_proker_kolaborator_org
before insert or update of proker_id,organisasi_id,porsi_plafon
on public.proker_kolaborator
for each row
execute function private.validate_proker_kolaborator_org();

revoke all on function private.validate_proker_kolaborator_org() from public,anon,authenticated;
