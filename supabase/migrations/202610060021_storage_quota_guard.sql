-- Supabase Storage safety guard for the SIMA Free-plan setup.
-- 900 MiB: admin warning threshold
-- 950 MiB: application hard upload limit
-- Supabase Free currently includes 1 GB Storage quota.

create or replace function public.get_storage_usage_status(
  p_incoming_bytes bigint default 0
)
returns table(
  used_bytes bigint,
  projected_bytes bigint,
  warning_bytes bigint,
  hard_limit_bytes bigint,
  percent_used numeric,
  warning boolean,
  can_upload boolean
)
language sql
security definer
set search_path=pg_catalog,storage,public
as $$
  with usage as (
    select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0)::bigint as used
    from storage.objects
  ),
  limits as (
    select
      (900::bigint * 1024 * 1024) as warning_bytes,
      (950::bigint * 1024 * 1024) as hard_limit_bytes
  )
  select
    usage.used as used_bytes,
    usage.used + greatest(coalesce(p_incoming_bytes,0),0) as projected_bytes,
    limits.warning_bytes,
    limits.hard_limit_bytes,
    round((usage.used::numeric / limits.hard_limit_bytes::numeric) * 100, 2) as percent_used,
    usage.used >= limits.warning_bytes as warning,
    (usage.used + greatest(coalesce(p_incoming_bytes,0),0)) < limits.hard_limit_bytes as can_upload
  from usage cross join limits;
$$;

revoke all on function public.get_storage_usage_status(bigint) from public,anon;
grant execute on function public.get_storage_usage_status(bigint) to authenticated;
