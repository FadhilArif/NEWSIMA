do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname='profiles_peran_allowed'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_peran_allowed;
  end if;

  alter table public.profiles
    add constraint profiles_peran_allowed
    check (peran in (
      'user'::public.peran_akun,
      'mahasiswa'::public.peran_akun,
      'pembimbing'::public.peran_akun,
      'wakil_rektor'::public.peran_akun,
      'staf_keuangan'::public.peran_akun,
      'admin'::public.peran_akun
    ))
    not valid;
exception when duplicate_object then
  null;
end $$;

drop policy if exists proker_insert_member on public.proker;
create policy proker_insert_member
on public.proker
for insert to authenticated
with check (
  (select private.is_admin_or_rektor())
  or (
    (select private.current_role()) in (
      'user'::public.peran_akun,
      'mahasiswa'::public.peran_akun,
      'pembimbing'::public.peran_akun
    )
    and exists (
      select 1 from public.keanggotaan k
      where k.akun_id=(select auth.uid())
        and k.organisasi_id=proker.organisasi_id
        and k.status='aktif'
    )
  )
);

drop policy if exists proker_update_authorized on public.proker;
create policy proker_update_authorized
on public.proker
for update to authenticated
using (
  (select private.is_admin_or_rektor())
  or (
    (select private.current_role()) in (
      'user'::public.peran_akun,
      'mahasiswa'::public.peran_akun,
      'pembimbing'::public.peran_akun
    )
    and exists (
      select 1 from public.keanggotaan k
      where k.akun_id=(select auth.uid())
        and k.organisasi_id=proker.organisasi_id
        and k.status='aktif'
    )
  )
)
with check (
  (select private.is_admin_or_rektor())
  or (
    (select private.current_role()) in (
      'user'::public.peran_akun,
      'mahasiswa'::public.peran_akun,
      'pembimbing'::public.peran_akun
    )
    and exists (
      select 1 from public.keanggotaan k
      where k.akun_id=(select auth.uid())
        and k.organisasi_id=proker.organisasi_id
        and k.status='aktif'
    )
  )
);
