-- Allow only BPH BEM to read campus-budget proposal details in addition to
-- the existing admin / Wakil Rektor / Staf Keuangan access.
create or replace function public.get_anggaran_periode_proposals(p_periode_id uuid)
returns table(
  proker_id uuid,
  proker_nama text,
  organisasi_id uuid,
  organisasi_nama text,
  status text,
  anggaran_diajukan bigint,
  anggaran_disetujui bigint,
  anggaran_disetujui_pada timestamp with time zone
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_role public.peran_akun;
  v_is_bem_bph boolean;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select peran
    into v_role
  from public.profiles
  where id=auth.uid()
    and aktif=true;

  select exists(
    select 1
    from public.keanggotaan k
    join public.organisasi o on o.id=k.organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where k.akun_id=auth.uid()
      and k.status='aktif'
      and o.tipe='BEM'::public.tipe_org
      and j.aktif=true
      and j.kode in ('presiden','wakil_presiden','sekretaris','bendahara')
  )
    into v_is_bem_bph;

  if not (
    v_role in (
      'admin'::public.peran_akun,
      'wakil_rektor'::public.peran_akun,
      'staf_keuangan'::public.peran_akun
    )
    or v_is_bem_bph
  ) then
    raise exception 'FORBIDDEN_BUDGET_VIEW';
  end if;

  return query
  select
    p.id,
    p.nama,
    o.id,
    o.nama,
    p.status,
    p.anggaran_diajukan,
    p.anggaran_disetujui,
    p.anggaran_disetujui_pada
  from public.proker as p
  join public.organisasi as o on o.id=p.organisasi_id
  where o.periode_id=p_periode_id
    and p.sumber_dana_kode='KAMPUS'
    and p.anggaran_disetujui > 0
  order by p.anggaran_disetujui_pada desc nulls last, p.nama;
end;
$function$;
