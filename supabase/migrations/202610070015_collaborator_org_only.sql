-- Collaborators are organization relationships only.
-- porsi_plafon is retained for backward compatibility but is always normalized to zero.

update public.proker_kolaborator
set porsi_plafon=0
where porsi_plafon<>0;

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
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_p
  from public.proker
  where id=p_proker_id
  for update;

  if not found then raise exception 'PROKER_NOT_FOUND'; end if;
  if v_p.status not in ('direncanakan','revisi') then raise exception 'COLLABORATOR_EDIT_NOT_ALLOWED'; end if;
  if not private.has_org_permission(v_p.organisasi_id,'proker.edit') then
    raise exception 'FORBIDDEN_PROKER_COLLABORATOR_EDIT';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_rows) x
    join public.organisasi o
      on o.id=nullif(x->>'organisasi_id','')::uuid
    where o.tipe not in ('BEM'::public.tipe_org,'UKM'::public.tipe_org,'HMJ'::public.tipe_org)
  ) then
    raise exception 'INVALID_COLLABORATOR_ORGANIZATION_TYPE';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(v_rows) x
    where nullif(x->>'organisasi_id','')::uuid=v_p.organisasi_id
  ) then
    raise exception 'OWNER_ORGANIZATION_CANNOT_BE_COLLABORATOR';
  end if;

  if (
    select count(*)
    from (
      select nullif(x->>'organisasi_id','')::uuid as organisasi_id
      from jsonb_array_elements(v_rows) x
      where nullif(x->>'organisasi_id','') is not null
      group by nullif(x->>'organisasi_id','')::uuid
    ) d
  ) <>
  (
    select count(*)
    from jsonb_array_elements(v_rows) x
    where nullif(x->>'organisasi_id','') is not null
  ) then
    raise exception 'DUPLICATE_COLLABORATOR';
  end if;

  delete from public.proker_kolaborator k
  where k.proker_id=p_proker_id
    and not exists(
      select 1
      from jsonb_array_elements(v_rows) x
      where nullif(x->>'organisasi_id','')::uuid=k.organisasi_id
    );

  insert into public.proker_kolaborator(
    proker_id,organisasi_id,status,porsi_plafon,dikonfirmasi_oleh
  )
  select
    p_proker_id,
    x.organisasi_id,
    coalesce(existing.status,'diundang'),
    0,
    existing.dikonfirmasi_oleh
  from (
    select distinct nullif(j->>'organisasi_id','')::uuid as organisasi_id
    from jsonb_array_elements(v_rows) j
    where nullif(j->>'organisasi_id','') is not null
  ) x
  left join public.proker_kolaborator existing
    on existing.proker_id=p_proker_id
   and existing.organisasi_id=x.organisasi_id
  on conflict (proker_id,organisasi_id)
  do update set
    porsi_plafon=0;

  return query
  select k.*
  from public.proker_kolaborator k
  where k.proker_id=p_proker_id
  order by k.organisasi_id;
end;
$$;

revoke all on function public.sync_proker_kolaborator(uuid,jsonb) from public,anon;
grant execute on function public.sync_proker_kolaborator(uuid,jsonb) to authenticated;


revoke all on function public.sync_proker_kolaborator(uuid,jsonb) from public,anon;
grant execute on function public.sync_proker_kolaborator(uuid,jsonb) to authenticated;
