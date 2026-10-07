-- Workflow notification routing and realtime delivery.
-- Notifications are generated when an action actually becomes pending for a reviewer,
-- and when collaboration invitations change state.

create or replace function private.notify_proker_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org_name text;
  v_org_type public.tipe_org;
  v_message text;
  v_permission text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('proposal_diajukan','lpj_diajukan') then
    return new;
  end if;

  select o.nama, o.tipe
    into v_org_name, v_org_type
  from public.organisasi o
  where o.id = new.organisasi_id;

  if new.status = 'proposal_diajukan' then
    v_message := 'Proposal "' || coalesce(new.nama,'program kerja') || '" dari ' ||
      coalesce(v_org_name,'organisasi') || ' menunggu review Anda.';
    v_permission := 'dokumen.review';
  else
    v_message := 'LPJ "' || coalesce(new.nama,'program kerja') || '" dari ' ||
      coalesce(v_org_name,'organisasi') || ' menunggu review Anda.';
    v_permission := 'laporan.review';
  end if;

  insert into public.notifikasi(akun_id, organisasi_id, pesan, tautan)
  select distinct p.id, new.organisasi_id, v_message, 'review:' || new.id::text
  from public.profiles p
  where p.aktif = true
    and p.id is distinct from new.dibuat_oleh
    and (
      -- BEM submissions are reviewed by Wakil Rektor.
      (v_org_type = 'BEM'::public.tipe_org
       and p.peran = 'wakil_rektor'::public.peran_akun)

      or

      -- Other organizations route to an explicitly assigned pembimbing.
      (v_org_type <> 'BEM'::public.tipe_org
       and exists (
         select 1
         from public.pembimbing_organisasi pb
         where pb.organisasi_id = new.organisasi_id
           and pb.akun_id = p.id
           and pb.status = 'aktif'
       ))

      or

      -- Also support reviewers granted by the organization position model.
      (v_org_type <> 'BEM'::public.tipe_org
       and exists (
         select 1
         from public.keanggotaan k
         join public.hak_akses_jabatan h
           on h.jabatan_id = k.jabatan_id
          and h.kode = v_permission
         where k.akun_id = p.id
           and k.organisasi_id = new.organisasi_id
           and k.status = 'aktif'
       ))
    );

  return new;
end;
$$;

revoke all on function private.notify_proker_workflow() from public, anon, authenticated;

drop trigger if exists trg_notify_proker_created on public.proker;
drop trigger if exists trg_notify_proker_workflow on public.proker;

create trigger trg_notify_proker_workflow
after insert or update of status on public.proker
for each row
execute function private.notify_proker_workflow();


create or replace function private.notify_persetujuan()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proker_id uuid;
  v_owner uuid;
  v_name text;
  v_org uuid;
  v_kind text;
begin
  select d.proker_id, d.organisasi_id, d.jenis
    into v_proker_id, v_org, v_kind
  from public.dokumen d
  where d.id = new.dokumen_id;

  select p.dibuat_oleh, p.nama
    into v_owner, v_name
  from public.proker p
  where p.id = v_proker_id;

  if v_owner is not null and v_owner <> (select auth.uid()) then
    insert into public.notifikasi(akun_id, organisasi_id, pesan, tautan)
    values (
      v_owner,
      v_org,
      case
        when v_kind = 'laporan_akhir'::public.jenis_dok
          then 'LPJ "' || coalesce(v_name,'program kerja') || '" mendapat keputusan: ' || new.keputusan || '.'
        else
          'Proposal "' || coalesce(v_name,'program kerja') || '" mendapat keputusan: ' || new.keputusan || '.'
      end,
      'review:' || coalesce(v_proker_id::text,'')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_persetujuan() from public, anon, authenticated;


create or replace function private.notify_collaboration_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
  v_name text;
  v_org_name text;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('bergabung','ditolak') then
    return new;
  end if;

  select p.dibuat_oleh, p.nama, o.nama
    into v_owner, v_name, v_org_name
  from public.proker p
  join public.organisasi o on o.id = new.organisasi_id
  where p.id = new.proker_id;

  if v_owner is not null and v_owner <> (select auth.uid()) then
    insert into public.notifikasi(akun_id, organisasi_id, pesan, tautan)
    values (
      v_owner,
      new.organisasi_id,
      'Organisasi ' || coalesce(v_org_name,'kolaborator') || ' ' ||
      case when new.status='bergabung' then 'menerima' else 'menolak' end ||
      ' undangan kolaborasi pada "' || coalesce(v_name,'program kerja') || '".',
      'undangan'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_collaboration_status() from public, anon, authenticated;

drop trigger if exists trg_notify_collaboration_status on public.proker_kolaborator;
create trigger trg_notify_collaboration_status
after update of status on public.proker_kolaborator
for each row
execute function private.notify_collaboration_status();


-- Enable Supabase Realtime for the notification inbox.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifikasi'
  ) then
    execute 'alter publication supabase_realtime add table public.notifikasi';
  end if;
end
$$;
