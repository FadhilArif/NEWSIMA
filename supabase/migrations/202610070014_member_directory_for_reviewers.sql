-- Read-only member directory for reviewer roles.
-- Pembimbing: HMJ yang dinaungi (termasuk histori periode dengan nama HMJ yang sama).
-- Wakil Rektor: BEM pada periode yang dipilih.

create or replace function public.get_visible_member_directory(p_periode_id uuid)
returns table(
  akun_id uuid,
  nama text,
  nim text,
  email text,
  organisasi_id uuid,
  organisasi_nama text,
  organisasi_tipe public.tipe_org,
  periode_id uuid,
  periode_nama text,
  unit_nama text,
  jabatan text,
  jabatan_nama text
)
language plpgsql
security definer
stable
set search_path=pg_catalog,public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.peran_akun;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select p.peran into v_role
  from public.profiles p
  where p.id=v_uid;

  if v_role not in ('pembimbing'::public.peran_akun,'wakil_rektor'::public.peran_akun) then
    raise exception 'MEMBER_DIRECTORY_FORBIDDEN';
  end if;

  return query
  select
    k.akun_id,
    p.nama,
    p.nim,
    p.email,
    o.id,
    o.nama,
    o.tipe,
    o.periode_id,
    per.nama,
    u.nama,
    k.jabatan,
    j.nama
  from public.keanggotaan k
  join public.profiles p on p.id=k.akun_id and p.aktif
  join public.organisasi o on o.id=k.organisasi_id
  join public.periode per on per.id=o.periode_id
  left join public.unit_kerja u on u.id=k.unit_id
  left join public.jabatan_organisasi j on j.id=k.jabatan_id
  where k.status='aktif'
    and o.periode_id=p_periode_id
    and (
      (
        v_role='wakil_rektor'::public.peran_akun
        and o.tipe='BEM'::public.tipe_org
      )
      or (
        v_role='pembimbing'::public.peran_akun
        and o.tipe='HMJ'::public.tipe_org
        and exists(
          select 1
          from public.pembimbing_organisasi pb
          join public.organisasi supervised on supervised.id=pb.organisasi_id
          where pb.akun_id=v_uid
            and pb.status='aktif'
            and supervised.tipe='HMJ'::public.tipe_org
            and lower(supervised.nama)=lower(o.nama)
        )
      )
    )
  order by p.nama;
end;
$$;

revoke all on function public.get_visible_member_directory(uuid) from public,anon;
grant execute on function public.get_visible_member_directory(uuid) to authenticated;
