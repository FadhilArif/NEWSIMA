create or replace function public.consume_login_attempt(
  p_key_hash text,
  p_scope text,
  p_window_seconds integer default 900,
  p_max_attempts integer default 5
)
returns table(allowed boolean, retry_after integer, attempts integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.login_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry integer;
begin
  if p_scope not in ('ip','email') then
    raise exception 'INVALID_RATE_LIMIT_SCOPE';
  end if;

  insert into public.login_rate_limits(
    key_hash, scope, attempts, window_started_at, blocked_until, last_attempt_at
  )
  values(p_key_hash, p_scope, 0, v_now, null, v_now)
  on conflict(key_hash) do nothing;

  select *
  into v_row
  from public.login_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from(v_row.blocked_until-v_now)))::integer);
    return query select false,v_retry,v_row.attempts;
    return;
  end if;

  if v_now >= v_row.window_started_at + make_interval(secs=>p_window_seconds) then
    update public.login_rate_limits
    set attempts=1, window_started_at=v_now, blocked_until=null, last_attempt_at=v_now
    where key_hash=p_key_hash;
    return query select true,0,1;
    return;
  end if;

  if v_row.attempts >= p_max_attempts then
    update public.login_rate_limits
    set blocked_until=v_now+make_interval(secs=>p_window_seconds), last_attempt_at=v_now
    where key_hash=p_key_hash;
    return query select false,p_window_seconds,v_row.attempts;
    return;
  end if;

  update public.login_rate_limits
  set attempts=public.login_rate_limits.attempts+1, last_attempt_at=v_now
  where key_hash=p_key_hash
  returning public.login_rate_limits.attempts into v_row.attempts;

  return query select true,0,v_row.attempts;
end;
$$;

revoke all on function public.consume_login_attempt(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text,text,integer,integer) to service_role;