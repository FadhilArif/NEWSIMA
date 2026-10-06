-- NEWSIMA position-based RLS and permission enforcement
create or replace function private.has_org_permission(p_org uuid,p_code text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
select
  exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.aktif
      and p.peran in ('admin'::public.peran_akun,'wakil_rektor'::public.peran_akun)
  )
  or exists(
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.hak_akses_jabatan h on h.jabatan_id=j.id
    where k.akun_id=(select auth.uid())
      and k.organisasi_id=p_org
      and k.status='aktif'
      and j.aktif and h.kode=p_code
  )
$$;

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized on public.proker
for select to authenticated
using((select private.has_org_permission(organisasi_id,'proker.view')));

drop policy if exists proker_insert_member on public.proker;
create policy proker_insert_member on public.proker
for insert to authenticated
with check((select private.has_org_permission(organisasi_id,'proker.create')) and (dibuat_oleh is null or dibuat_oleh=(select auth.uid())));

drop policy if exists proker_update_authorized on public.proker;
create policy proker_update_authorized on public.proker
for update to authenticated
using((select private.has_org_permission(organisasi_id,'proker.edit')))
with check((select private.has_org_permission(organisasi_id,'proker.edit')));

drop policy if exists proker_delete_admin on public.proker;
create policy proker_delete_admin on public.proker
for delete to authenticated
using((select private.has_org_permission(organisasi_id,'struktur.manage')));

-- Canonical membership permissions
drop policy if exists keanggotaan_position_insert on public.keanggotaan;
drop policy if exists keanggotaan_position_update on public.keanggotaan;
drop policy if exists keanggotaan_position_delete on public.keanggotaan;
create policy keanggotaan_position_insert on public.keanggotaan
for insert to authenticated
with check((select private.has_org_permission(organisasi_id,'anggota.manage')));
create policy keanggotaan_position_update on public.keanggotaan
for update to authenticated
using((select private.has_org_permission(organisasi_id,'anggota.manage')))
with check((select private.has_org_permission(organisasi_id,'anggota.manage')));
create policy keanggotaan_position_delete on public.keanggotaan
for delete to authenticated
using((select private.has_org_permission(organisasi_id,'anggota.manage')));

-- Organization unit management
drop policy if exists unit_kerja_manage_insert on public.unit_kerja;
drop policy if exists unit_kerja_manage_update on public.unit_kerja;
drop policy if exists unit_kerja_manage_delete on public.unit_kerja;
create policy unit_kerja_manage_insert on public.unit_kerja
for insert to authenticated with check((select private.has_org_permission(organisasi_id,'unit.manage')));
create policy unit_kerja_manage_update on public.unit_kerja
for update to authenticated using((select private.has_org_permission(organisasi_id,'unit.manage')))
with check((select private.has_org_permission(organisasi_id,'unit.manage')));
create policy unit_kerja_manage_delete on public.unit_kerja
for delete to authenticated using((select private.has_org_permission(organisasi_id,'unit.manage')));

-- Finance, meetings, review
drop policy if exists pencairan_position_select on public.pencairan_dana;
drop policy if exists pencairan_select_position on public.pencairan_dana;
create policy pencairan_select_position on public.pencairan_dana
for select to authenticated
using(exists(select 1 from public.proker p where p.id=proker_id and (select private.has_org_permission(p.organisasi_id,'keuangan.view'))));

create policy pencairan_manage_position_insert on public.pencairan_dana
for insert to authenticated
with check(exists(select 1 from public.proker p where p.id=proker_id and (select private.has_org_permission(p.organisasi_id,'keuangan.manage'))));

create policy pencairan_manage_position_update on public.pencairan_dana
for update to authenticated
using(exists(select 1 from public.proker p where p.id=proker_id and (select private.has_org_permission(p.organisasi_id,'keuangan.manage'))))
with check(exists(select 1 from public.proker p where p.id=proker_id and (select private.has_org_permission(p.organisasi_id,'keuangan.manage'))));

create policy pencairan_manage_position_delete on public.pencairan_dana
for delete to authenticated
using(exists(select 1 from public.proker p where p.id=proker_id and (select private.has_org_permission(p.organisasi_id,'keuangan.manage'))));

drop policy if exists persetujuan_position_insert on public.persetujuan;
drop policy if exists persetujuan_position_update on public.persetujuan;
drop policy if exists persetujuan_position_delete on public.persetujuan;
create policy persetujuan_position_insert on public.persetujuan
for insert to authenticated
with check((oleh is null or oleh=(select auth.uid())) and exists(
  select 1 from public.dokumen d where d.id=dokumen_id and (select private.has_org_permission(d.organisasi_id,'dokumen.review'))
));
create policy persetujuan_position_update on public.persetujuan
for update to authenticated
using(exists(select 1 from public.dokumen d where d.id=dokumen_id and (select private.has_org_permission(d.organisasi_id,'dokumen.review'))))
with check(exists(select 1 from public.dokumen d where d.id=dokumen_id and (select private.has_org_permission(d.organisasi_id,'dokumen.review'))));
create policy persetujuan_position_delete on public.persetujuan
for delete to authenticated
using(exists(select 1 from public.dokumen d where d.id=dokumen_id and (select private.has_org_permission(d.organisasi_id,'dokumen.review'))));
