-- NEWSIMA security baseline
-- Apply this migration to the Supabase project before using the secure login flow.
-- Roles: admin, pembimbing, staf_keuangan, mahasiswa
--
-- SECURITY MODEL
-- 1) Browser never performs an open/demo login.
-- 2) Database authorization is enforced by PostgreSQL RLS.
-- 3) Role checks are evaluated from the profiles table, not from client state.
-- 4) Rate limiting is server-side through SECURITY DEFINER functions invoked
--    only by the secure-login Edge Function via service_role.

create schema if not exists private;

-- ------------------------------------------------------------
-- Role helpers
-- ------------------------------------------------------------

create or replace function private.current_role()
returns public.peran_akun
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.peran
  from public.profiles p
  where p.id = (select auth.uid())
    and p.aktif = true
  limit 1;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_role()) in ('admin'::public.peran_akun,'wakil_rektor'::public.peran_akun);
$$;

create or replace function private.is_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_role()) = 'staf_keuangan';
$$;

create or replace function private.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_role()) in ('admin'::public.peran_akun,'wakil_rektor'::public.peran_akun,'pembimbing'::public.peran_akun);
$$;

revoke all on function private.current_role() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_finance() from public, anon;
revoke all on function private.is_reviewer() from public, anon;

grant execute on function private.current_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_finance() to authenticated;
grant execute on function private.is_reviewer() to authenticated;
grant usage on schema private to authenticated;

-- ------------------------------------------------------------
-- Role values
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_peran_allowed'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_peran_allowed
      check (peran in ('admin','pembimbing','wakil_rektor','staf_keuangan','mahasiswa'))
      not valid;
  end if;
end $$;

-- Prevent a normal user from promoting themselves or changing protected
-- account fields directly through the Data API.
create or replace function private.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    if new.id is distinct from old.id then
      raise exception 'PROFILE_ID_IMMUTABLE';
    end if;

    if new.peran is distinct from old.peran then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;

    if new.email is distinct from old.email then
      raise exception 'EMAIL_CHANGE_FORBIDDEN';
    end if;
  end if;

  if new.peran is null
     or new.peran not in ('admin','pembimbing','wakil_rektor','staf_keuangan','mahasiswa') then
    raise exception 'INVALID_ROLE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_changes on public.profiles;
create trigger trg_guard_profile_changes
before update on public.profiles
for each row execute function private.guard_profile_changes();

revoke all on function private.guard_profile_changes() from public, anon, authenticated;

create or replace function private.guard_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Direct/self-service signups can never select a privileged role.
  -- Trusted server-side account creation uses service_role.
  if current_user not in ('postgres','service_role') then
    new.peran := 'mahasiswa';
  end if;

  if new.peran is null
     or new.peran not in ('admin','pembimbing','wakil_rektor','staf_keuangan','mahasiswa') then
    raise exception 'INVALID_ROLE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_insert on public.profiles;
create trigger trg_guard_profile_insert
before insert on public.profiles
for each row execute function private.guard_profile_insert();

revoke all on function private.guard_profile_insert() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Server-side login rate limiting
-- 5 attempts per 15 minutes per IP AND per normalized email.
-- A blocked key is held for another 15 minutes.
-- The service-side Edge Function is the only caller allowed.
-- ------------------------------------------------------------

create table if not exists public.login_rate_limits (
  key_hash text primary key,
  scope text not null check (scope in ('ip','email')),
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

create index if not exists idx_login_rate_limits_blocked_until
  on public.login_rate_limits(blocked_until);

alter table public.login_rate_limits enable row level security;
revoke all on table public.login_rate_limits from anon, authenticated;

create or replace function public.consume_login_attempt(
  p_key_hash text,
  p_scope text,
  p_window_seconds integer default 900,
  p_max_attempts integer default 5
)
returns table (
  allowed boolean,
  retry_after integer,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.login_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry integer := 0;
begin
  if p_scope not in ('ip','email') then
    raise exception 'INVALID_RATE_LIMIT_SCOPE';
  end if;

  insert into public.login_rate_limits(
    key_hash, scope, attempts, window_started_at, blocked_until, last_attempt_at
  )
  values (
    p_key_hash, p_scope, 0, v_now, null, v_now
  )
  on conflict (key_hash) do nothing;

  select *
  into v_row
  from public.login_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_row.attempts = 0
     and v_row.window_started_at = v_now then
    update public.login_rate_limits
    set attempts = 1,
        last_attempt_at = v_now
    where key_hash = p_key_hash;

    return query select true, 0, 1;
    return;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer
    );
    return query select false, v_retry, v_row.attempts;
    return;
  end if;

  if v_now >= v_row.window_started_at + make_interval(secs => p_window_seconds) then
    update public.login_rate_limits
    set attempts = 1,
        window_started_at = v_now,
        blocked_until = null,
        last_attempt_at = v_now
    where key_hash = p_key_hash;

    return query select true, 0, 1;
    return;
  end if;

  if v_row.attempts >= p_max_attempts then
    update public.login_rate_limits
    set blocked_until = v_now + make_interval(secs => p_window_seconds),
        last_attempt_at = v_now
    where key_hash = p_key_hash;

    return query select false, p_window_seconds, v_row.attempts;
    return;
  end if;

  update public.login_rate_limits
  set attempts = public.login_rate_limits.attempts + 1,
      last_attempt_at = v_now
  where key_hash = p_key_hash
  returning public.login_rate_limits.attempts into v_row.attempts;

  return query select true, 0, v_row.attempts;
end;
$$;

create or replace function public.reset_login_rate_limit(
  p_key_hash text,
  p_scope text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_rate_limits
  where key_hash = p_key_hash
    and scope = p_scope;
$$;

revoke all on function public.consume_login_attempt(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.reset_login_rate_limit(text,text) from public, anon, authenticated;

grant execute on function public.consume_login_attempt(text,text,integer,integer) to service_role;
grant execute on function public.reset_login_rate_limit(text,text) to service_role;

-- The live application uses public.notifikasi. Authentication notifications are
-- protected by later policies/triggers and are not duplicated into a second table here.

-- ------------------------------------------------------------
-- Profiles RLS
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.is_admin())
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  or (select private.is_admin())
)
with check (
  (select auth.uid()) = id
  or (select private.is_admin())
);

-- ------------------------------------------------------------
-- Organization membership
-- ------------------------------------------------------------

alter table public.keanggotaan enable row level security;
revoke all on table public.keanggotaan from anon;
grant select, insert, update, delete on table public.keanggotaan to authenticated;

drop policy if exists keanggotaan_select_self_or_admin on public.keanggotaan;
create policy keanggotaan_select_self_or_admin
on public.keanggotaan
for select
to authenticated
using (
  (select auth.uid()) = akun_id
  or (select private.is_admin())
);

drop policy if exists keanggotaan_admin_write on public.keanggotaan;
create policy keanggotaan_admin_write
on public.keanggotaan
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Organizations are readable to authenticated users, but writable only by admins.
alter table public.organisasi enable row level security;
revoke all on table public.organisasi from anon;
grant select, insert, update, delete on table public.organisasi to authenticated;

drop policy if exists organisasi_select_authenticated on public.organisasi;
create policy organisasi_select_authenticated
on public.organisasi
for select
to authenticated
using (true);

drop policy if exists organisasi_admin_write on public.organisasi;
create policy organisasi_admin_write
on public.organisasi
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- ------------------------------------------------------------
-- Program kerja
-- ------------------------------------------------------------

alter table public.proker enable row level security;
revoke all on table public.proker from anon;
grant select, insert, update on table public.proker to authenticated;

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select
to authenticated
using (
  (select private.is_admin())
  or (select private.is_finance())
  or exists (
    select 1
    from public.keanggotaan k
    where k.akun_id = (select auth.uid())
      and k.organisasi_id = proker.organisasi_id
      and k.status = 'aktif'
  )
);

drop policy if exists proker_insert_member on public.proker;
create policy proker_insert_member
on public.proker
for insert
to authenticated
with check (
  (select private.is_admin())
  or (
    (select private.current_role()) in ('mahasiswa','pembimbing')
    and exists (
      select 1
      from public.keanggotaan k
      where k.akun_id = (select auth.uid())
        and k.organisasi_id = proker.organisasi_id
        and k.status = 'aktif'
    )
  )
);

drop policy if exists proker_update_authorized on public.proker;
create policy proker_update_authorized
on public.proker
for update
to authenticated
using (
  (select private.is_admin())
  or (
    (select private.current_role()) in ('mahasiswa','pembimbing')
    and exists (
      select 1
      from public.keanggotaan k
      where k.akun_id = (select auth.uid())
        and k.organisasi_id = proker.organisasi_id
        and k.status = 'aktif'
    )
  )
)
with check (
  (select private.is_admin())
  or (
    (select private.current_role()) in ('mahasiswa','pembimbing')
    and exists (
      select 1
      from public.keanggotaan k
      where k.akun_id = (select auth.uid())
        and k.organisasi_id = proker.organisasi_id
        and k.status = 'aktif'
    )
  )
);

drop policy if exists proker_delete_admin on public.proker;
create policy proker_delete_admin
on public.proker
for delete
to authenticated
using ((select private.is_admin()));

-- Helpful indexes for RLS predicates.
create index if not exists idx_keanggotaan_akun_org_status
  on public.keanggotaan(akun_id, organisasi_id, status);

create index if not exists idx_proker_organisasi
  on public.proker(organisasi_id);
