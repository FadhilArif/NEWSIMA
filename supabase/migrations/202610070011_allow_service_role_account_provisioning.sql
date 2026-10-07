-- Allow the trusted server-side admin Edge Function to perform
-- privileged account provisioning while keeping browser clients locked down.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if coalesce(auth.role(),'') not in ('service_role','supabase_admin')
     and not (select private.is_admin_or_rektor()) then

    if new.peran is distinct from old.peran then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;
    if new.email is distinct from old.email then
      raise exception 'EMAIL_CHANGE_FORBIDDEN';
    end if;
    if new.aktif is distinct from old.aktif then
      raise exception 'ACCOUNT_STATUS_CHANGE_FORBIDDEN';
    end if;
    if new.wajib_ganti_sandi is distinct from old.wajib_ganti_sandi then
      raise exception 'PASSWORD_FLAG_CHANGE_FORBIDDEN';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_profile_update() from public,anon,authenticated;
