-- LPJ deadline is configured as a duration on the period.
-- The per-proker deadline is calculated by the database when status changes to "berjalan".

alter table public.periode
  add column if not exists batas_lpj_hari integer;

alter table public.periode
  drop constraint if exists periode_batas_lpj_hari_check;

alter table public.periode
  add constraint periode_batas_lpj_hari_check
  check (batas_lpj_hari is null or (batas_lpj_hari >= 1 and batas_lpj_hari <= 365));

alter table public.proker drop column if exists batas_lpj;
alter table public.proker add column batas_lpj date;

create or replace function private.apply_proker_lpj_deadline()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer;
begin
  if new.status = 'berjalan' and (tg_op = 'INSERT' or old.status is distinct from 'berjalan') then
    select pe.batas_lpj_hari
      into v_days
    from public.organisasi o
    join public.periode pe on pe.id = o.periode_id
    where o.id = new.organisasi_id
    limit 1;

    if v_days is not null then
      new.batas_lpj := current_date + v_days;
    else
      new.batas_lpj := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_proker_lpj_deadline on public.proker;
create trigger trg_apply_proker_lpj_deadline
before insert or update of status on public.proker
for each row
execute function private.apply_proker_lpj_deadline();

revoke all on function private.apply_proker_lpj_deadline() from public, anon, authenticated;

create index if not exists idx_proker_batas_lpj on public.proker(batas_lpj);

update public.proker p
set batas_lpj = current_date + pe.batas_lpj_hari
from public.organisasi o
join public.periode pe on pe.id = o.periode_id
where p.organisasi_id = o.id
  and p.status = 'berjalan'
  and p.batas_lpj is null
  and pe.batas_lpj_hari is not null;
