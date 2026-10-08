-- Simplified organization fund-usage ledger.
-- The approved campus budget remains the source of the organization's balance.
-- Usage entries only describe actual spending and never change the campus plafond.

create table if not exists public.penggunaan_dana (
  id uuid primary key default gen_random_uuid(),
  proker_id uuid not null references public.proker(id) on delete cascade,
  jumlah bigint not null check (jumlah > 0),
  tanggal date not null default current_date,
  keterangan text not null,
  dicatat_oleh uuid references public.profiles(id),
  dibuat_pada timestamptz not null default now()
);

create index if not exists penggunaan_dana_proker_idx
  on public.penggunaan_dana(proker_id);

alter table public.penggunaan_dana enable row level security;

drop policy if exists "penggunaan_dana_bph_select" on public.penggunaan_dana;
drop policy if exists "penggunaan_dana_bph_insert" on public.penggunaan_dana;
drop policy if exists "penggunaan_dana_bph_update" on public.penggunaan_dana;
drop policy if exists "penggunaan_dana_bph_delete" on public.penggunaan_dana;

create policy "penggunaan_dana_bph_select"
on public.penggunaan_dana
for select
to authenticated
using (
  exists (
    select 1
    from public.proker p
    join public.keanggotaan k on k.organisasi_id=p.organisasi_id
    join public.organisasi o on o.id=p.organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where p.id=penggunaan_dana.proker_id
      and k.akun_id=auth.uid()
      and k.status='aktif'
      and o.tipe in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org)
      and j.aktif=true
      and (
        (o.tipe='BEM'::public.tipe_org and j.kode in ('presiden','wakil_presiden','bendahara','sekretaris'))
        or
        (o.tipe='HMJ'::public.tipe_org and j.kode in ('ketua','wakil_ketua','bendahara','sekretaris'))
      )
  )
);

create policy "penggunaan_dana_bph_insert"
on public.penggunaan_dana
for insert
to authenticated
with check (
  exists (
    select 1
    from public.proker p
    join public.keanggotaan k on k.organisasi_id=p.organisasi_id
    join public.organisasi o on o.id=p.organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where p.id=penggunaan_dana.proker_id
      and k.akun_id=auth.uid()
      and k.status='aktif'
      and o.tipe in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org)
      and j.aktif=true
      and (
        (o.tipe='BEM'::public.tipe_org and j.kode in ('presiden','wakil_presiden','bendahara','sekretaris'))
        or
        (o.tipe='HMJ'::public.tipe_org and j.kode in ('ketua','wakil_ketua','bendahara','sekretaris'))
      )
  )
  and dicatat_oleh=auth.uid()
);

create policy "penggunaan_dana_bph_update"
on public.penggunaan_dana
for update
to authenticated
using (
  dicatat_oleh=auth.uid()
  and exists (
    select 1
    from public.proker p
    join public.keanggotaan k on k.organisasi_id=p.organisasi_id
    join public.organisasi o on o.id=p.organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where p.id=penggunaan_dana.proker_id
      and k.akun_id=auth.uid()
      and k.status='aktif'
      and o.tipe in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org)
      and j.aktif=true
      and (
        (o.tipe='BEM'::public.tipe_org and j.kode in ('presiden','wakil_presiden','bendahara','sekretaris'))
        or
        (o.tipe='HMJ'::public.tipe_org and j.kode in ('ketua','wakil_ketua','bendahara','sekretaris'))
      )
  )
)
with check (dicatat_oleh=auth.uid());

create policy "penggunaan_dana_bph_delete"
on public.penggunaan_dana
for delete
to authenticated
using (dicatat_oleh=auth.uid());

create or replace function public.add_penggunaan_dana(
  p_proker_id uuid,
  p_jumlah bigint,
  p_tanggal date,
  p_keterangan text
)
returns public.penggunaan_dana
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_org_id uuid;
  v_org_tipe public.tipe_org;
  v_allowed boolean;
  v_approved bigint;
  v_used bigint;
  v_row public.penggunaan_dana;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if nullif(trim(coalesce(p_keterangan,'')),'') is null then
    raise exception 'DESCRIPTION_REQUIRED';
  end if;

  select p.organisasi_id, o.tipe
    into v_org_id, v_org_tipe
  from public.proker p
  join public.organisasi o on o.id=p.organisasi_id
  where p.id=p_proker_id
    and p.anggaran_disetujui > 0;

  if v_org_id is null or v_org_tipe not in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then
    raise exception 'PROKER_NOT_ELIGIBLE';
  end if;

  select exists(
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where k.akun_id=auth.uid()
      and k.organisasi_id=v_org_id
      and k.status='aktif'
      and j.aktif=true
      and (
        (v_org_tipe='BEM'::public.tipe_org and j.kode in ('presiden','wakil_presiden','bendahara','sekretaris'))
        or
        (v_org_tipe='HMJ'::public.tipe_org and j.kode in ('ketua','wakil_ketua','bendahara','sekretaris'))
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'FORBIDDEN_FUND_USAGE';
  end if;

  select coalesce(sum(jumlah),0)
    into v_used
  from public.penggunaan_dana
  where proker_id=p_proker_id;

  select anggaran_disetujui
    into v_approved
  from public.proker
  where id=p_proker_id;

  if v_used + p_jumlah > v_approved then
    raise exception 'USAGE_EXCEEDS_APPROVED_BUDGET';
  end if;

  insert into public.penggunaan_dana(
    proker_id,jumlah,tanggal,keterangan,dicatat_oleh
  ) values (
    p_proker_id,p_jumlah,coalesce(p_tanggal,current_date),trim(p_keterangan),auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.add_penggunaan_dana(uuid,bigint,date,text) from public;
grant execute on function public.add_penggunaan_dana(uuid,bigint,date,text) to authenticated;
