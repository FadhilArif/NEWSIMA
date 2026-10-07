-- Atomic collaborator editing for draft/revision program work.
create or replace function public.sync_proker_kolaborator(
  p_proker_id uuid,
  p_rows jsonb
)
returns setof public.proker_kolaborator
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_p public.proker%rowtype;
  v_uid uuid := auth.uid();
  v_rows jsonb := coalesce(p_rows,'[]'::jsonb);
  v_sum bigint := 0;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select *
    into v_p
  from public.proker
  where id=p_proker_id
  for update;

  if not found then
    raise exception 'PROKER_NOT_FOUND';
  end if;

  if v_p.status not in ('direncanakan','revisi') then
    raise exception 'COLLABORATOR_EDIT_NOT_ALLOWED';
  end if;

  if not private.has_org_permission(v_p.organisasi_id,'proker.edit') then
    raise exception 'FORBIDDEN_PROKER_COLLABORATOR_EDIT';
  end if;

  with rows as (
    select distinct
      nullif(x->>'organisasi_id','')::uuid as organisasi_id,
      greatest(0,(x->>'porsi_plafon')::bigint) as porsi_plafon
    from jsonb_array_elements(v_rows) x
  )
  select count(*),coalesce(sum(porsi_plafon),0)
    into v_count,v_sum
  from rows
  where organisasi_id is not null;

  if (
    select count(*)
    from (
      select nullif(x->>'organisasi_id','')::uuid as organisasi_id
      from jsonb_array_elements(v_rows) x
      where nullif(x->>'organisasi_id','') is not null
    ) d
  ) <> v_count then
    raise exception 'DUPLICATE_COLLABORATOR';
  end if;

  if exists (
    select 1
    from (
      select nullif(x->>'organisasi_id','')::uuid as organisasi_id
      from jsonb_array_elements(v_rows) x
      where nullif(x->>'organisasi_id','') is not null
    ) d
    where d.organisasi_id = v_p.organisasi_id
  ) then
    raise exception 'OWNER_ORGANIZATION_CANNOT_BE_COLLABORATOR';
  end if;

  if v_sum > greatest(coalesce(v_p.anggaran_diajukan,0),0) then
    raise exception 'COLLABORATOR_ALLOCATION_EXCEEDS_BUDGET';
  end if;

  -- Remove collaborators omitted from the edited form.
  delete from public.proker_kolaborator k
  where k.proker_id=p_proker_id
    and not exists (
      select 1
      from jsonb_array_elements(v_rows) x
      where nullif(x->>'organisasi_id','')::uuid=k.organisasi_id
    );

  -- Preserve an existing invitation/join status; new organizations start invited.
  insert into public.proker_kolaborator(
    proker_id,organisasi_id,status,porsi_plafon,dikonfirmasi_oleh
  )
  select
    p_proker_id,
    x.organisasi_id,
    coalesce(existing.status,'diundang'),
    x.porsi_plafon,
    existing.dikonfirmasi_oleh
  from (
    select distinct
      nullif(j->>'organisasi_id','')::uuid as organisasi_id,
      greatest(0,(j->>'porsi_plafon')::bigint) as porsi_plafon
    from jsonb_array_elements(v_rows) j
    where nullif(j->>'organisasi_id','') is not null
  ) x
  left join public.proker_kolaborator existing
    on existing.proker_id=p_proker_id
   and existing.organisasi_id=x.organisasi_id
  on conflict (proker_id,organisasi_id)
  do update set
    porsi_plafon=excluded.porsi_plafon;

  return query
  select k.*
  from public.proker_kolaborator k
  where k.proker_id=p_proker_id
  order by k.organisasi_id;
end;
$$;

revoke all on function public.sync_proker_kolaborator(uuid,jsonb) from public,anon;
grant execute on function public.sync_proker_kolaborator(uuid,jsonb) to authenticated;
