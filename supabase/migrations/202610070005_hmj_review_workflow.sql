-- HMJ-specific proposal review workflow.
-- HMJ: HMJ -> Pembimbing HMJ -> BEM -> Wakil Rektor
-- BEM: BEM -> Wakil Rektor
-- Revisions:
--   Wakil Rektor -> BEM -> HMJ
--   HMJ may consult its Pembimbing again or skip directly back to BEM.
--
-- No existing organization assignments are fabricated here.

alter table public.jabatan_organisasi
  add column if not exists berlaku_tipe public.tipe_org[] null;

insert into public.jabatan_organisasi(
  kode,nama,tingkat,cakupan,unit_wajib,unit_jenis_wajib,berlaku_tipe,aktif
)
values (
  'pembimbing_hmj','Pembimbing HMJ',75,'organisasi',false,null,
  array['HMJ'::public.tipe_org],true
)
on conflict(kode) do update set
  nama=excluded.nama,
  tingkat=excluded.tingkat,
  cakupan=excluded.cakupan,
  unit_wajib=excluded.unit_wajib,
  unit_jenis_wajib=excluded.unit_jenis_wajib,
  berlaku_tipe=excluded.berlaku_tipe,
  aktif=true;

insert into public.hak_akses_jabatan(jabatan_id,kode)
select j.id,p.kode
from public.jabatan_organisasi j
cross join (values
  ('beranda.view'),
  ('proker.view'),
  ('dokumen.review'),
  ('laporan.review')
) p(kode)
where j.kode='pembimbing_hmj'
on conflict do nothing;

-- The workflow stage is intentionally stored separately from the broad status.
-- status answers "draft/revision/pending/approved"; review_stage answers "who is next".
alter table public.proker
  add column if not exists review_stage text;

create index if not exists idx_proker_review_stage
  on public.proker(review_stage);

-- A profile with the Pembimbing role can only be bound to an HMJ through the
-- organization relationship. Membership remains useful for account context,
-- but the authoritative routing relation is pembimbing_organisasi.
create or replace function private.sync_pembimbing_hmj_binding()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_role public.peran_akun;
  v_type public.tipe_org;
begin
  select p.peran into v_role
  from public.profiles p
  where p.id=new.akun_id;

  if v_role='pembimbing'::public.peran_akun then
    select o.tipe into v_type
    from public.organisasi o
    where o.id=new.organisasi_id;

    if v_type<>'HMJ'::public.tipe_org then
      raise exception 'PEMBIMBING_MUST_BE_BOUND_TO_HMJ';
    end if;

    if new.status='aktif' then
      insert into public.pembimbing_organisasi(organisasi_id,akun_id,status)
      values(new.organisasi_id,new.akun_id,'aktif')
      on conflict (organisasi_id,akun_id) do update
        set status='aktif';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_pembimbing_hmj_binding on public.keanggotaan;
create trigger trg_sync_pembimbing_hmj_binding
after insert or update of organisasi_id,status,akun_id on public.keanggotaan
for each row execute function private.sync_pembimbing_hmj_binding();

create or replace function private.sync_pembimbing_hmj_binding_delete()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_role public.peran_akun;
begin
  select p.peran into v_role
  from public.profiles p
  where p.id=old.akun_id;

  if v_role='pembimbing'::public.peran_akun then
    update public.pembimbing_organisasi
    set status='nonaktif'
    where organisasi_id=old.organisasi_id
      and akun_id=old.akun_id
      and not exists(
        select 1 from public.keanggotaan k
        where k.akun_id=old.akun_id
          and k.organisasi_id=old.organisasi_id
          and k.status='aktif'
      );
  end if;

  return old;
end;
$$;

drop trigger if exists trg_sync_pembimbing_hmj_binding_delete on public.keanggotaan;
create trigger trg_sync_pembimbing_hmj_binding_delete
after delete on public.keanggotaan
for each row execute function private.sync_pembimbing_hmj_binding_delete();

revoke all on function private.sync_pembimbing_hmj_binding() from public,anon,authenticated;
revoke all on function private.sync_pembimbing_hmj_binding_delete() from public,anon,authenticated;

-- Generic authorization helpers.
create or replace function private.is_hmj_pembimbing(p_hmj_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.pembimbing_organisasi pb
  join public.profiles p on p.id=pb.akun_id
  where pb.organisasi_id=p_hmj_id
    and pb.akun_id=(select auth.uid())
    and pb.status='aktif'
    and p.aktif
    and p.peran='pembimbing'::public.peran_akun
);
$$;

create or replace function private.has_bem_review_permission_for_hmj(p_hmj_id uuid,p_code text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.organisasi hmj
  join public.keanggotaan k on k.organisasi_id=hmj.induk_organisasi_id
  join public.jabatan_organisasi j on j.id=k.jabatan_id
  join public.hak_akses_jabatan h on h.jabatan_id=j.id
  where hmj.id=p_hmj_id
    and hmj.tipe='HMJ'::public.tipe_org
    and k.akun_id=(select auth.uid())
    and k.status='aktif'
    and j.aktif
    and h.kode=p_code
);
$$;

revoke all on function private.is_hmj_pembimbing(uuid) from public,anon,authenticated;
revoke all on function private.has_bem_review_permission_for_hmj(uuid,text) from public,anon,authenticated;

grant execute on function private.is_hmj_pembimbing(uuid) to authenticated;
grant execute on function private.has_bem_review_permission_for_hmj(uuid,text) to authenticated;


-- Replace proposal lifecycle with explicit review routing.
create or replace function public.transition_proker(
  p_proker_id uuid,
  p_action text,
  p_comment text default null,
  p_anggaran_disetujui bigint default null
)
returns public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_p public.proker%rowtype;
  v_doc public.dokumen%rowtype;
  v_org uuid;
  v_org_type public.tipe_org;
  v_parent_bem uuid;
  v_periode_id uuid;
  v_budget public.anggaran_periode%rowtype;
  v_used bigint;
  v_remaining bigint;
  v_uid uuid := auth.uid();
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
  v_approved bigint := greatest(coalesce(p_anggaran_disetujui,0),0);
  v_hitung_plafon boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_p
  from public.proker
  where id=p_proker_id
  for update;

  if not found then raise exception 'PROKER_NOT_FOUND'; end if;

  v_org:=v_p.organisasi_id;

  select o.tipe,o.induk_organisasi_id,o.periode_id
    into v_org_type,v_parent_bem,v_periode_id
  from public.organisasi o
  where o.id=v_org;

  select coalesce(s.hitung_plafon,false)
    into v_hitung_plafon
  from public.sumber_dana s
  where s.kode=v_p.sumber_dana_kode;

  -- ----------------------------------------------------------
  -- Submission / resubmission
  -- ----------------------------------------------------------
  if p_action in ('submit','resubmit','resubmit_hmj_consult','resubmit_hmj_skip') then
    if private.is_wakil_rektor() then
      raise exception 'VICE_RECTOR_READ_ONLY';
    end if;

    if not (private.has_org_permission(v_org,'proker.create') or private.has_org_permission(v_org,'proker.edit')) then
      raise exception 'FORBIDDEN_PROKER_SUBMIT';
    end if;

    if p_action='submit' and v_p.status<>'direncanakan' then
      raise exception 'INVALID_STATUS_FOR_SUBMIT';
    end if;

    if p_action='resubmit' and v_p.status<>'revisi' then
      raise exception 'INVALID_STATUS_FOR_RESUBMIT';
    end if;

    if p_action in ('resubmit_hmj_consult','resubmit_hmj_skip') and not (v_p.status='revisi' and v_org_type='HMJ') then
      raise exception 'INVALID_HMJ_RESUBMIT';
    end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then
      raise exception 'PROPOSAL_FILE_REQUIRED';
    end if;

    if v_org_type='HMJ' then
      if p_action='submit' then
        if not exists(
          select 1 from public.pembimbing_organisasi pb
          join public.profiles pp on pp.id=pb.akun_id
          where pb.organisasi_id=v_org
            and pb.status='aktif'
            and pp.aktif
            and pp.peran='pembimbing'::public.peran_akun
        ) then
          raise exception 'HMJ_PEMBIMBING_NOT_ASSIGNED';
        end if;
        v_p.review_stage:='pembimbing_hmj';

      elsif p_action='resubmit_hmj_consult' then
        if v_p.review_stage<>'hmj_from_bem' then
          raise exception 'HMJ_CONSULT_REVIEW_NOT_REQUIRED';
        end if;

        if not exists(
          select 1 from public.pembimbing_organisasi pb
          join public.profiles pp on pp.id=pb.akun_id
          where pb.organisasi_id=v_org
            and pb.status='aktif'
            and pp.aktif
            and pp.peran='pembimbing'::public.peran_akun
        ) then
          raise exception 'HMJ_PEMBIMBING_NOT_ASSIGNED';
        end if;

        v_p.review_stage:='pembimbing_hmj';

      elsif p_action='resubmit_hmj_skip' then
        if v_p.review_stage<>'hmj_from_bem' then
          raise exception 'HMJ_SKIP_REVIEW_NOT_ALLOWED';
        end if;
        if v_parent_bem is null then
          raise exception 'HMJ_PARENT_BEM_NOT_FOUND';
        end if;
        v_p.review_stage:='bem';

      elsif v_p.review_stage='hmj_from_pembimbing' then
        v_p.review_stage:='pembimbing_hmj';

      else
        -- Plain resubmit for an HMJ is only valid for a revision returned by
        -- the Pembimbing. A BEM-returned revision must explicitly choose
        -- "consult" or "skip".
        if p_action='resubmit' and v_p.review_stage<>'hmj_from_pembimbing' then
          raise exception 'HMJ_REVISION_ROUTE_REQUIRED';
        end if;
        v_p.review_stage:='pembimbing_hmj';
      end if;

    elsif v_org_type='BEM' then
      if p_action='submit' or p_action='resubmit' then
        v_p.review_stage:='wakil_rektor';
      end if;

    else
      -- Keep legacy behavior for UKM/Club/other organizations.
      v_p.review_stage:=null;
    end if;

    update public.dokumen
    set status='diajukan',
        tahap=coalesce(v_p.review_stage,'koordinator')
    where id=v_doc.id;

    update public.proker
    set status='proposal_diajukan',
        review_stage=v_p.review_stage
    where id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  -- ----------------------------------------------------------
  -- Approve / revise proposal
  -- ----------------------------------------------------------
  if p_action in ('approve','revise') then
    if v_p.dibuat_oleh=v_uid then
      raise exception 'SELF_REVIEW_NOT_ALLOWED';
    end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then
      raise exception 'PROPOSAL_FILE_REQUIRED';
    end if;

    -- HMJ: Pembimbing HMJ -> BEM.
    if v_org_type='HMJ' and v_p.review_stage='pembimbing_hmj' then
      if not private.is_hmj_pembimbing(v_org) then
        raise exception 'FORBIDDEN_HMJ_PEMBIMBING_REVIEW';
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(
        v_doc.id,'pembimbing_hmj',
        case when p_action='approve' then 'setuju' else 'revisi' end,
        v_comment,v_uid,'pembimbing_hmj'
      );

      if p_action='approve' then
        update public.dokumen
        set status='diajukan',tahap='bem'
        where id=v_doc.id;

        update public.proker
        set review_stage='bem',status='proposal_diajukan'
        where id=p_proker_id
        returning * into v_p;
      else
        update public.dokumen
        set status='revisi',tahap='hmj_from_pembimbing'
        where id=v_doc.id;

        update public.proker
        set review_stage='hmj_from_pembimbing',status='revisi'
        where id=p_proker_id
        returning * into v_p;
      end if;

      return v_p;
    end if;

    -- HMJ: BEM review before Wakil Rektor.
    if v_org_type='HMJ' and v_p.review_stage='bem' then
      if not private.has_bem_review_permission_for_hmj(v_org,'dokumen.review') then
        raise exception 'FORBIDDEN_BEM_REVIEW_FOR_HMJ';
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(
        v_doc.id,'bem',
        case when p_action='approve' then 'setuju' else 'revisi' end,
        v_comment,v_uid,'bem'
      );

      if p_action='approve' then
        update public.dokumen
        set status='diajukan',tahap='wakil_rektor'
        where id=v_doc.id;

        update public.proker
        set review_stage='wakil_rektor',status='proposal_diajukan'
        where id=p_proker_id
        returning * into v_p;
      else
        update public.dokumen
        set status='revisi',tahap='hmj_from_bem'
        where id=v_doc.id;

        update public.proker
        set review_stage='hmj_from_bem',status='revisi'
        where id=p_proker_id
        returning * into v_p;
      end if;

      return v_p;
    end if;

    -- BEM: final proposal review belongs to Wakil Rektor.
    if v_org_type='BEM' and v_p.review_stage='wakil_rektor' then
      if not private.is_wakil_rektor() then
        raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW';
      end if;
    elsif v_org_type='BEM' then
      -- Backward compatibility for an old BEM proposal with no stage.
      if not private.is_wakil_rektor() then
        raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW';
      end if;
    elsif v_org_type='HMJ' then
      raise exception 'INVALID_HMJ_REVIEW_STAGE';
    else
      if not private.has_org_permission(v_org,'dokumen.review') then
        raise exception 'FORBIDDEN_PROKER_REVIEW';
      end if;
    end if;

    if p_action='revise' then
      if v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(
        v_doc.id,
        case when v_org_type='BEM' then 'wakil_rektor' else 'koordinator' end,
        'revisi',
        v_comment,
        v_uid,
        case when v_org_type='BEM' then 'wakil_rektor' else coalesce(private.current_position_code(v_org),'reviewer') end
      );

      if v_org_type='BEM' then
        update public.dokumen
        set status='revisi',tahap='bem_from_wakil_rektor'
        where id=v_doc.id;

        update public.proker
        set status='revisi',review_stage='bem_from_wakil_rektor'
        where id=p_proker_id
        returning * into v_p;
      else
        update public.dokumen
        set status='revisi',tahap='koordinator'
        where id=v_doc.id;

        update public.proker
        set status='revisi',review_stage=null
        where id=p_proker_id
        returning * into v_p;
      end if;

      return v_p;
    end if;

    -- Approval. Only the Wakil Rektor can finalize a Campus-budget proposal.
    if v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org)
       and not private.is_wakil_rektor() then
      if v_org_type='HMJ' then
        -- This path is intentionally blocked because HMJ approval must first
        -- pass through the BEM stage above.
        raise exception 'HMJ_NOT_READY_FOR_FINAL_APPROVAL';
      end if;
      raise exception 'BUDGET_REQUIRES_WAKIL_REKTOR';
    end if;

    if v_hitung_plafon and private.is_wakil_rektor() then
      if p_anggaran_disetujui is null then raise exception 'APPROVED_BUDGET_REQUIRED'; end if;
      if v_approved>v_p.anggaran_diajukan then raise exception 'APPROVED_BUDGET_EXCEEDS_REQUEST'; end if;

      select * into v_budget
      from public.anggaran_periode
      where periode_id=v_periode_id
      for update;

      if not found then raise exception 'PERIOD_BUDGET_NOT_SET'; end if;

      select coalesce(sum(pr.anggaran_disetujui),0)::bigint
        into v_used
      from public.proker pr
      join public.organisasi org on org.id=pr.organisasi_id
      where org.periode_id=v_periode_id
        and pr.id<>p_proker_id
        and pr.anggaran_disetujui>0;

      v_remaining:=greatest(v_budget.plafon-v_used,0);
      if v_approved>v_remaining then raise exception 'INSUFFICIENT_PERIOD_BUDGET'; end if;
    elsif not v_hitung_plafon and private.is_wakil_rektor() then
      v_approved:=0;
    else
      v_approved:=0;
    end if;

    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(
      v_doc.id,
      case when v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then 'wakil_rektor' else 'koordinator' end,
      'setuju',
      case
        when v_hitung_plafon and private.is_wakil_rektor()
        then concat(
          coalesce(v_comment,''),
          case when v_comment is null then '' else E'\\n' end,
          'Anggaran disetujui: Rp',
          to_char(v_approved,'FM999G999G999G999G999')
        )
        else v_comment
      end,
      v_uid,
      case when v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then 'wakil_rektor' else coalesce(private.current_position_code(v_org),'reviewer') end
    );

    update public.dokumen
    set status='disetujui',tahap='bph'
    where id=v_doc.id;

    update public.proker
    set status='disetujui',
        review_stage=null,
        anggaran_disetujui=case when v_hitung_plafon and private.is_wakil_rektor() then v_approved else 0 end,
        anggaran_disetujui_oleh=case when v_hitung_plafon and private.is_wakil_rektor() then v_uid else null end,
        anggaran_disetujui_pada=case when v_hitung_plafon and private.is_wakil_rektor() then now() else null end
    where id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  -- ----------------------------------------------------------
  -- Start / finish / LPJ
  -- ----------------------------------------------------------
  if p_action='start' then
    if private.is_wakil_rektor() then raise exception 'VICE_RECTOR_READ_ONLY'; end if;
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_PROKER_START'; end if;
    if v_p.status<>'disetujui' then raise exception 'INVALID_STATUS_FOR_START'; end if;

    update public.proker as pr
    set status='berjalan',
        batas_lpj=(
          select current_date+coalesce(per.batas_lpj_hari,7)
          from public.organisasi org
          join public.periode per on per.id=org.periode_id
          where org.id=pr.organisasi_id
        )
    where pr.id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  if p_action='finish' then
    if private.is_wakil_rektor() then raise exception 'VICE_RECTOR_READ_ONLY'; end if;
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_PROKER_FINISH'; end if;
    if v_p.status<>'berjalan' then raise exception 'INVALID_STATUS_FOR_FINISH'; end if;

    update public.proker set status='selesai'
    where id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  if p_action='submit_lpj' then
    if private.is_wakil_rektor() then raise exception 'VICE_RECTOR_READ_ONLY'; end if;
    if not private.has_org_permission(v_org,'proker.edit') then raise exception 'FORBIDDEN_LPJ_SUBMIT'; end if;
    if v_p.status<>'selesai' then raise exception 'INVALID_STATUS_FOR_LPJ_SUBMIT'; end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;

    update public.dokumen set status='diajukan',tahap='pembimbing' where id=v_doc.id;
    update public.proker set status='lpj_diajukan' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve_lpj','reject_lpj') then
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    if not private.has_org_permission(v_org,'laporan.review') and not private.has_org_permission(v_org,'dokumen.review') then raise exception 'FORBIDDEN_LPJ_REVIEW'; end if;
    if v_p.status<>'lpj_diajukan' then raise exception 'INVALID_STATUS_FOR_LPJ_REVIEW'; end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    if p_action='reject_lpj' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(
      v_doc.id,'pembimbing',
      case when p_action='approve_lpj' then 'setuju' else 'revisi' end,
      v_comment,v_uid,
      coalesce(private.current_position_code(v_org),'reviewer')
    );

    update public.dokumen
    set status=case when p_action='approve_lpj' then 'disetujui' else 'revisi' end,
        tahap='pembimbing'
    where id=v_doc.id;

    update public.proker
    set status=case when p_action='approve_lpj' then 'lpj_disetujui' else 'selesai' end
    where id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  raise exception 'UNKNOWN_PROKER_ACTION';
end;
$$;

revoke all on function public.transition_proker(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_proker(uuid,text,text,bigint) to authenticated;

-- Keep older RPC entry points compatible.
create or replace function public.approve_proker(
  p_proker_id uuid,
  p_anggaran_disetujui bigint,
  p_comment text
)
returns setof public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  return query
  select public.transition_proker(
    p_proker_id,'approve',p_comment,p_anggaran_disetujui
  );
end;
$$;

create or replace function public.revise_proker(
  p_proker_id uuid,
  p_comment text
)
returns setof public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  return query
  select public.transition_proker(
    p_proker_id,'revise',p_comment,null
  );
end;
$$;

revoke all on function public.approve_proker(uuid,bigint,text) from public,anon;
revoke all on function public.revise_proker(uuid,text) from public,anon;
grant execute on function public.approve_proker(uuid,bigint,text) to authenticated;
grant execute on function public.revise_proker(uuid,text) to authenticated;


-- Workflow notifications follow review_stage, not merely status.
create or replace function private.notify_proker_workflow()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_org_name text;
  v_org_type public.tipe_org;
  v_parent_bem uuid;
  v_message text;
begin
  if tg_op='UPDATE'
     and old.status is not distinct from new.status
     and old.review_stage is not distinct from new.review_stage then
    return new;
  end if;

  select o.nama,o.tipe,o.induk_organisasi_id
    into v_org_name,v_org_type,v_parent_bem
  from public.organisasi o
  where o.id=new.organisasi_id;

  -- Revision returned to the proposer.
  if new.review_stage in ('hmj_from_bem','hmj_from_pembimbing','bem_from_wakil_rektor') then
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select new.dibuat_oleh,new.organisasi_id,
      case new.review_stage
        when 'hmj_from_bem' then 'Proker "'||coalesce(new.nama,'program kerja')||'" dikembalikan BEM ke HMJ untuk revisi. HMJ dapat konsul lagi ke Pembimbing atau melewati Pembimbing.'
        when 'hmj_from_pembimbing' then 'Proker "'||coalesce(new.nama,'program kerja')||'" dikembalikan Pembimbing HMJ untuk revisi.'
        else 'Proker "'||coalesce(new.nama,'program kerja')||'" dikembalikan Wakil Rektor ke BEM untuk ditindaklanjuti.'
      end,
      'review:'||new.id::text
    where new.dibuat_oleh is not null;

    return new;
  end if;

  if new.review_stage='pembimbing_hmj' then
    v_message:='Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
      coalesce(v_org_name,'HMJ')||' menunggu konsultasi/review Pembimbing HMJ.';

    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select pb.akun_id,new.organisasi_id,v_message,'review:'||new.id::text
    from public.pembimbing_organisasi pb
    join public.profiles p on p.id=pb.akun_id
    where pb.organisasi_id=new.organisasi_id
      and pb.status='aktif'
      and p.aktif
      and p.peran='pembimbing'::public.peran_akun;

    return new;
  end if;

  if new.review_stage='bem' then
    v_message:='Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
      coalesce(v_org_name,'HMJ')||' sudah dikonsulkan Pembimbing dan menunggu review BEM.';

    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select distinct k.akun_id,new.organisasi_id,v_message,'review:'||new.id::text
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.hak_akses_jabatan h on h.jabatan_id=j.id
    where k.organisasi_id=v_parent_bem
      and k.status='aktif'
      and j.aktif
      and h.kode='dokumen.review';

    return new;
  end if;

  if new.review_stage='wakil_rektor' then
    v_message:='Proker "'||coalesce(new.nama,'program kerja')||'" dari '||
      coalesce(v_org_name,'BEM/HMJ')||' menunggu review Wakil Rektor.';

    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select p.id,new.organisasi_id,v_message,'review:'||new.id::text
    from public.profiles p
    where p.aktif
      and p.peran='wakil_rektor'::public.peran_akun;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_proker_workflow() from public,anon,authenticated;

drop trigger if exists trg_notify_proker_workflow on public.proker;
create trigger trg_notify_proker_workflow
after insert or update of status,review_stage on public.proker
for each row execute function private.notify_proker_workflow();
