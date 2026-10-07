-- Activity photo upload workflow.
-- Up to 5 photos per completed program work, 10 MiB per file.
-- Photos are stored privately in Supabase Storage.

alter table public.foto_kegiatan
  alter column dokumen_id drop not null,
  alter column drive_file_id drop not null;

alter table public.foto_kegiatan
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists uploaded_at timestamptz not null default now();

alter table public.foto_kegiatan
  drop constraint if exists foto_kegiatan_dokumen_id_urutan_key;

alter table public.foto_kegiatan
  drop constraint if exists foto_kegiatan_urutan_check;

alter table public.foto_kegiatan
  add constraint foto_kegiatan_urutan_check
  check (urutan >= 1 and urutan <= 5);

create unique index if not exists foto_kegiatan_proker_urutan_key
  on public.foto_kegiatan(proker_id, urutan);

create index if not exists idx_foto_kegiatan_proker
  on public.foto_kegiatan(proker_id, urutan);

-- Enforce the 5-photo limit server-side, including concurrent inserts.
create or replace function private.enforce_foto_kegiatan_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_status text;
begin
  select status::text
    into v_status
  from public.proker
  where id = new.proker_id
  for update;

  if v_status is null then
    raise exception 'PROKER_NOT_FOUND';
  end if;

  if v_status not in ('selesai','lpj_diajukan','lpj_disetujui') then
    raise exception 'PHOTO_UPLOAD_ONLY_AFTER_FINISH';
  end if;

  select count(*)::integer
    into v_count
  from public.foto_kegiatan
  where proker_id = new.proker_id
    and id is distinct from new.id;

  if v_count >= 5 then
    raise exception 'MAX_ACTIVITY_PHOTOS_REACHED';
  end if;

  if new.urutan is null then
    select coalesce(max(urutan),0)+1
      into new.urutan
    from public.foto_kegiatan
    where proker_id = new.proker_id;
  end if;

  if new.urutan < 1 or new.urutan > 5 then
    raise exception 'INVALID_ACTIVITY_PHOTO_ORDER';
  end if;

  if new.ukuran_byte is null or new.ukuran_byte > (10 * 1024 * 1024) then
    raise exception 'ACTIVITY_PHOTO_TOO_LARGE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_foto_kegiatan_limit on public.foto_kegiatan;
create trigger trg_enforce_foto_kegiatan_limit
before insert or update on public.foto_kegiatan
for each row
execute function private.enforce_foto_kegiatan_limit();

revoke all on function private.enforce_foto_kegiatan_limit() from public, anon, authenticated;

-- Table permissions / RLS.
alter table public.foto_kegiatan enable row level security;
grant select, insert, update, delete on public.foto_kegiatan to authenticated;

drop policy if exists foto_kegiatan_select_access on public.foto_kegiatan;
create policy foto_kegiatan_select_access
on public.foto_kegiatan
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or exists (
    select 1
    from public.proker p
    where p.id = foto_kegiatan.proker_id
      and private.has_org_permission(p.organisasi_id,'proker.view')
  )
);

drop policy if exists foto_kegiatan_insert_access on public.foto_kegiatan;
create policy foto_kegiatan_insert_access
on public.foto_kegiatan
for insert to authenticated
with check (
  private.is_admin()
  or exists (
    select 1
    from public.proker p
    where p.id = foto_kegiatan.proker_id
      and p.status in ('selesai','lpj_diajukan','lpj_disetujui')
      and private.has_org_permission(p.organisasi_id,'proker.edit')
  )
);

drop policy if exists foto_kegiatan_update_access on public.foto_kegiatan;
create policy foto_kegiatan_update_access
on public.foto_kegiatan
for update to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.proker p
    where p.id = foto_kegiatan.proker_id
      and private.has_org_permission(p.organisasi_id,'proker.edit')
  )
)
with check (
  private.is_admin()
  or exists (
    select 1
    from public.proker p
    where p.id = foto_kegiatan.proker_id
      and p.status in ('selesai','lpj_diajukan','lpj_disetujui')
      and private.has_org_permission(p.organisasi_id,'proker.edit')
  )
);

drop policy if exists foto_kegiatan_delete_access on public.foto_kegiatan;
create policy foto_kegiatan_delete_access
on public.foto_kegiatan
for delete to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.proker p
    where p.id = foto_kegiatan.proker_id
      and private.has_org_permission(p.organisasi_id,'proker.edit')
  )
);

-- Private bucket dedicated to activity photos.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'activity-photos',
  'activity-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public=false,
  file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists activity_photos_select on storage.objects;
create policy activity_photos_select
on storage.objects
for select to authenticated
using (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or private.is_wakil_rektor()
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and private.has_org_permission(p.organisasi_id,'proker.view')
    )
  )
);

drop policy if exists activity_photos_insert on storage.objects;
create policy activity_photos_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and p.status in ('selesai','lpj_diajukan','lpj_disetujui')
        and private.has_org_permission(p.organisasi_id,'proker.edit')
    )
  )
);

drop policy if exists activity_photos_update on storage.objects;
create policy activity_photos_update
on storage.objects
for update to authenticated
using (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or owner_id=auth.uid()::text
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and private.has_org_permission(p.organisasi_id,'proker.edit')
    )
  )
)
with check (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or owner_id=auth.uid()::text
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and private.has_org_permission(p.organisasi_id,'proker.edit')
    )
  )
);

drop policy if exists activity_photos_delete on storage.objects;
create policy activity_photos_delete
on storage.objects
for delete to authenticated
using (
  bucket_id='activity-photos'
  and (
    private.is_admin()
    or owner_id=auth.uid()::text
    or exists (
      select 1
      from public.proker p
      where p.id=(storage.foldername(name))[2]::uuid
        and private.has_org_permission(p.organisasi_id,'proker.edit')
    )
  )
);
