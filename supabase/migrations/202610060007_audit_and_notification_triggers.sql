create schema if not exists private;

create or replace function private.write_audit()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_old jsonb; v_new jsonb; v_id uuid;
begin
  v_old:=case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end;
  v_new:=case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end;
  v_id:=coalesce(
    nullif(coalesce(v_new,v_old)->>'id','')::uuid,
    nullif(coalesce(v_new,v_old)->>'proker_id','')::uuid,
    nullif(coalesce(v_new,v_old)->>'dokumen_id','')::uuid
  );
  insert into public.jejak_audit(akun_id,aksi,objek,objek_id,lama,baru)
  values((select auth.uid()),TG_OP,TG_TABLE_NAME,v_id,v_old,v_new);
  return coalesce(NEW,OLD);
end;
$$;

revoke all on function private.write_audit() from public, anon, authenticated;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after insert or update or delete on public.profiles for each row execute function private.write_audit();
drop trigger if exists trg_audit_keanggotaan on public.keanggotaan;
create trigger trg_audit_keanggotaan after insert or update or delete on public.keanggotaan for each row execute function private.write_audit();
drop trigger if exists trg_audit_proker on public.proker;
create trigger trg_audit_proker after insert or update or delete on public.proker for each row execute function private.write_audit();
drop trigger if exists trg_audit_proker_kolaborator on public.proker_kolaborator;
create trigger trg_audit_proker_kolaborator after insert or update or delete on public.proker_kolaborator for each row execute function private.write_audit();
drop trigger if exists trg_audit_dokumen on public.dokumen;
create trigger trg_audit_dokumen after insert or update or delete on public.dokumen for each row execute function private.write_audit();
drop trigger if exists trg_audit_persetujuan on public.persetujuan;
create trigger trg_audit_persetujuan after insert or update or delete on public.persetujuan for each row execute function private.write_audit();
drop trigger if exists trg_audit_pencairan on public.pencairan_dana;
create trigger trg_audit_pencairan after insert or update or delete on public.pencairan_dana for each row execute function private.write_audit();

create or replace function private.notify_proker_created()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
  select p.id,new.organisasi_id,'Program kerja "'||new.nama||'" baru dibuat dan menunggu perhatian reviewer.','review:'||new.id::text
  from public.profiles p
  where p.aktif=true and p.id is distinct from new.dibuat_oleh
    and p.peran in ('admin'::public.peran_akun,'wakil_rektor'::public.peran_akun,'pembimbing'::public.peran_akun);
  return new;
end;
$$;
drop trigger if exists trg_notify_proker_created on public.proker;
create trigger trg_notify_proker_created after insert on public.proker for each row execute function private.notify_proker_created();

create or replace function private.notify_collaboration_invite()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_proker_name text;
begin
  select p.nama into v_proker_name from public.proker p where p.id=new.proker_id;
  insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
  select k.akun_id,new.organisasi_id,'Organisasi Anda diundang berkolaborasi pada "'||coalesce(v_proker_name,'program kerja')||'".','undangan'
  from public.keanggotaan k
  where k.organisasi_id=new.organisasi_id and k.status='aktif';
  return new;
end;
$$;
drop trigger if exists trg_notify_collaboration_invite on public.proker_kolaborator;
create trigger trg_notify_collaboration_invite after insert on public.proker_kolaborator for each row execute function private.notify_collaboration_invite();

create or replace function private.notify_persetujuan()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_proker_id uuid; v_owner uuid; v_name text;
begin
  select d.proker_id into v_proker_id from public.dokumen d where d.id=new.dokumen_id;
  select p.dibuat_oleh,p.nama into v_owner,v_name from public.proker p where p.id=v_proker_id;
  if v_owner is not null and v_owner <> (select auth.uid()) then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select v_owner,p.organisasi_id,'Proposal "'||coalesce(v_name,'program kerja')||'" mendapat keputusan: '||new.keputusan||'.','review:'||coalesce(v_proker_id::text,'')
    from public.proker p where p.id=v_proker_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_persetujuan on public.persetujuan;
create trigger trg_notify_persetujuan after insert on public.persetujuan for each row execute function private.notify_persetujuan();

revoke all on function private.notify_proker_created() from public, anon, authenticated;
revoke all on function private.notify_collaboration_invite() from public, anon, authenticated;
revoke all on function private.notify_persetujuan() from public, anon, authenticated;