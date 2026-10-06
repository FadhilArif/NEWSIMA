-- NEWSIMA position/permission model
create table if not exists public.jabatan_organisasi (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  nama text not null,
  tingkat integer not null default 10,
  cakupan text not null check (cakupan in ('organisasi','divisi')),
  unit_wajib boolean not null default false,
  aktif boolean not null default true
);

create table if not exists public.hak_akses_jabatan (
  jabatan_id uuid not null references public.jabatan_organisasi(id) on delete cascade,
  kode text not null,
  primary key (jabatan_id,kode)
);

insert into public.jabatan_organisasi(kode,nama,tingkat,cakupan,unit_wajib) values
('presiden','Presiden',100,'organisasi',false),
('wakil_presiden','Wakil Presiden',90,'organisasi',false),
('sekretaris','Sekretaris',80,'organisasi',false),
('bendahara','Bendahara',80,'organisasi',false),
('ketua_divisi','Ketua Divisi',60,'divisi',true),
('staff_divisi','Staff Divisi',40,'divisi',true)
on conflict(kode) do update set nama=excluded.nama,tingkat=excluded.tingkat,cakupan=excluded.cakupan,unit_wajib=excluded.unit_wajib,aktif=true;

with permissions(kode,permission) as (
  select 'presiden', x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage',
    'dokumen.review','rapat.manage','laporan.review','struktur.view','struktur.manage','anggota.manage',
    'keuangan.view','keuangan.manage','periode.view','organisasi.view','unit.manage']) x
  union all select 'wakil_presiden', x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage',
    'dokumen.review','rapat.manage','laporan.review','struktur.view','struktur.manage','anggota.manage',
    'keuangan.view','periode.view','organisasi.view','unit.manage']) x
  union all select 'sekretaris', x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage',
    'dokumen.review','rapat.manage','laporan.review','struktur.view','struktur.manage','anggota.manage']) x
  union all select 'bendahara', x from unnest(array[
    'beranda.view','proker.view','kolaborasi.view','keuangan.view','keuangan.manage']) x
  union all select 'ketua_divisi', x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','kolaborasi.manage','struktur.view']) x
  union all select 'staff_divisi', x from unnest(array[
    'beranda.view','proker.view','proker.create','proker.edit','kolaborasi.view','struktur.view']) x
)
insert into public.hak_akses_jabatan(jabatan_id,kode)
select j.id,p.permission from public.jabatan_organisasi j join permissions p on p.kode=j.kode
on conflict do nothing;

alter table public.keanggotaan add column if not exists jabatan_id uuid references public.jabatan_organisasi(id);
create index if not exists idx_keanggotaan_jabatan_id on public.keanggotaan(jabatan_id);

create or replace function private.has_org_permission(p_org uuid,p_code text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
select
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.aktif and p.peran in ('admin'::public.peran_akun,'wakil_rektor'::public.peran_akun))
  or exists(
    select 1 from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.hak_akses_jabatan h on h.jabatan_id=j.id
    where k.akun_id=(select auth.uid()) and k.organisasi_id=p_org and k.status='aktif' and j.aktif and h.kode=p_code
  )
$$;

create or replace function private.current_position_code(p_org uuid)
returns text language sql stable security definer
set search_path = pg_catalog, public
as $$
select j.kode
from public.keanggotaan k
join public.jabatan_organisasi j on j.id=k.jabatan_id
where k.akun_id=(select auth.uid()) and k.organisasi_id=p_org and k.status='aktif' and j.aktif
order by j.tingkat desc limit 1
$$;

alter table public.jabatan_organisasi enable row level security;
alter table public.hak_akses_jabatan enable row level security;
revoke all on table public.jabatan_organisasi from public,anon;
revoke all on table public.hak_akses_jabatan from public,anon;
grant select on public.jabatan_organisasi to authenticated;
grant select on public.hak_akses_jabatan to authenticated;

drop policy if exists jabatan_select_authenticated on public.jabatan_organisasi;
create policy jabatan_select_authenticated on public.jabatan_organisasi for select to authenticated using (aktif=true);
drop policy if exists hak_akses_select_authenticated on public.hak_akses_jabatan;
create policy hak_akses_select_authenticated on public.hak_akses_jabatan for select to authenticated using (exists(select 1 from public.jabatan_organisasi j where j.id=jabatan_id and j.aktif=true));

drop policy if exists jabatan_admin_insert on public.jabatan_organisasi;
create policy jabatan_admin_insert on public.jabatan_organisasi for insert to authenticated with check ((select private.is_admin_or_rektor()));
drop policy if exists jabatan_admin_update on public.jabatan_organisasi;
create policy jabatan_admin_update on public.jabatan_organisasi for update to authenticated using ((select private.is_admin_or_rektor())) with check ((select private.is_admin_or_rektor()));
drop policy if exists jabatan_admin_delete on public.jabatan_organisasi;
create policy jabatan_admin_delete on public.jabatan_organisasi for delete to authenticated using ((select private.is_admin_or_rektor()));

drop policy if exists hak_akses_admin_insert on public.hak_akses_jabatan;
create policy hak_akses_admin_insert on public.hak_akses_jabatan for insert to authenticated with check ((select private.is_admin_or_rektor()));
drop policy if exists hak_akses_admin_update on public.hak_akses_jabatan;
create policy hak_akses_admin_update on public.hak_akses_jabatan for update to authenticated using ((select private.is_admin_or_rektor())) with check ((select private.is_admin_or_rektor()));
drop policy if exists hak_akses_admin_delete on public.hak_akses_jabatan;
create policy hak_akses_admin_delete on public.hak_akses_jabatan for delete to authenticated using ((select private.is_admin_or_rektor()));
