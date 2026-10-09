-- UKM workflow chain
-- Proposal: UKM -> Koordinator UKM -> Presiden BEM -> Wakil Rektor
-- LPJ:      UKM -> Koordinator UKM -> Presiden BEM -> Wakil Rektor
-- Revisi pada setiap tahap kembali ke UKM; resubmit selalu masuk lagi ke Koordinator.

create or replace function public.transition_ukm_proker(
  p_proker_id uuid,p_action text,p_comment text default null,p_anggaran_disetujui bigint default null
)
returns public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_p public.proker%rowtype;
  v_doc public.dokumen%rowtype;
  v_org public.organisasi%rowtype;
  v_uid uuid:=auth.uid();
  v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
  v_hitung_plafon boolean:=false;
  v_approved bigint:=greatest(coalesce(p_anggaran_disetujui,0),0);
  v_budget public.anggaran_periode%rowtype;
  v_used bigint:=0;
  v_remaining bigint:=0;
  v_coordinator boolean:=false;
  v_president boolean:=false;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_p from public.proker where id=p_proker_id for update;
  if not found then raise exception 'PROKER_NOT_FOUND'; end if;
  select * into v_org from public.organisasi where id=v_p.organisasi_id;
  if not found or v_org.tipe<>'UKM'::public.tipe_org then raise exception 'ONLY_UKM_SUPPORTED'; end if;
  if v_org.induk_organisasi_id is null then raise exception 'UKM_PARENT_BEM_REQUIRED'; end if;

  v_coordinator:=exists(
    select 1 from public.penugasan_koordinator pc
    where pc.organisasi_id=v_org.id and pc.akun_id=v_uid and pc.status='aktif'
      and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
      and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
  );
  v_president:=exists(
    select 1 from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    where k.organisasi_id=v_org.induk_organisasi_id and k.akun_id=v_uid
      and k.status='aktif' and j.kode='presiden' and j.aktif=true
  );
  select coalesce(s.hitung_plafon,false) into v_hitung_plafon
  from public.sumber_dana s where s.kode=v_p.sumber_dana_kode;

  if p_action in ('submit','resubmit','approve','revise','start','finish','submit_lpj','approve_lpj','reject_lpj') then
    perform private.assert_proker_collaborators_confirmed(p_proker_id);
  end if;

  if p_action in ('submit','resubmit') then
    if not(private.has_org_permission(v_org.id,'proker.create') or private.has_org_permission(v_org.id,'proker.edit')) then raise exception 'FORBIDDEN_PROKER_SUBMIT'; end if;
    if p_action='submit' and v_p.status<>'direncanakan' then raise exception 'INVALID_STATUS_FOR_SUBMIT'; end if;
    if p_action='resubmit' and v_p.status<>'revisi' then raise exception 'INVALID_STATUS_FOR_RESUBMIT'; end if;
    if not exists(
      select 1 from public.penugasan_koordinator pc
      where pc.organisasi_id=v_org.id and pc.status='aktif'
        and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
        and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
    ) then raise exception 'UKM_COORDINATOR_NOT_ASSIGNED'; end if;

    select * into v_doc from public.dokumen
    where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;

    update public.dokumen set status='diajukan',tahap='ukm_koordinator' where id=v_doc.id;
    update public.proker set status='proposal_diajukan',review_stage='ukm_koordinator'
    where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve','revise') then
    if v_p.status<>'proposal_diajukan' then raise exception 'INVALID_STATUS_FOR_REVIEW'; end if;
    select * into v_doc from public.dokumen
    where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
    if p_action='revise' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

    if v_p.review_stage='ukm_koordinator' then
      if not v_coordinator then raise exception 'FORBIDDEN_UKM_COORDINATOR_REVIEW'; end if;
    elsif v_p.review_stage='ukm_presiden_bem' then
      if not v_president then raise exception 'FORBIDDEN_UKM_PRESIDENT_REVIEW'; end if;
    elsif v_p.review_stage='wakil_rektor' then
      if not private.is_wakil_rektor() then raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW'; end if;
    else raise exception 'INVALID_UKM_REVIEW_STAGE'; end if;

    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(v_doc.id,case when v_p.review_stage='ukm_koordinator' then 'koordinator' when v_p.review_stage='ukm_presiden_bem' then 'bem' when v_p.review_stage='wakil_rektor' then 'wakil_rektor' else v_p.review_stage end,case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,
      case when v_p.review_stage='ukm_koordinator' then 'koordinator_ukm'
           when v_p.review_stage='ukm_presiden_bem' then 'presiden_bem'
           else 'wakil_rektor' end);

    if p_action='revise' then
      update public.dokumen set status='revisi',tahap=v_p.review_stage where id=v_doc.id;
      update public.proker set status='revisi',review_stage=v_p.review_stage where id=p_proker_id returning * into v_p;
      return v_p;
    end if;

    if v_p.review_stage='ukm_koordinator' then
      update public.dokumen set status='diajukan',tahap='ukm_presiden_bem' where id=v_doc.id;
      update public.proker set status='proposal_diajukan',review_stage='ukm_presiden_bem' where id=p_proker_id returning * into v_p;
      return v_p;
    end if;

    if v_p.review_stage='ukm_presiden_bem' then
      update public.dokumen set status='diajukan',tahap='wakil_rektor' where id=v_doc.id;
      update public.proker set status='proposal_diajukan',review_stage='wakil_rektor' where id=p_proker_id returning * into v_p;
      return v_p;
    end if;

    if v_hitung_plafon then
      if p_anggaran_disetujui is null then raise exception 'APPROVED_BUDGET_REQUIRED'; end if;
      if v_approved>v_p.anggaran_diajukan then raise exception 'APPROVED_BUDGET_EXCEEDS_REQUEST'; end if;
      select * into v_budget from public.anggaran_periode where periode_id=v_org.periode_id for update;
      if not found then raise exception 'PERIOD_BUDGET_NOT_SET'; end if;
      select coalesce(sum(pr.anggaran_disetujui),0)::bigint into v_used
      from public.proker pr join public.organisasi org on org.id=pr.organisasi_id
      where org.periode_id=v_org.periode_id and pr.id<>p_proker_id and pr.anggaran_disetujui>0;
      v_remaining:=greatest(v_budget.plafon-v_used,0);
      if v_approved>v_remaining then raise exception 'INSUFFICIENT_PERIOD_BUDGET'; end if;
    else
      v_approved:=0;
    end if;

    update public.dokumen set status='disetujui',tahap='bph' where id=v_doc.id;
    update public.proker
    set status='disetujui',review_stage=null,
        anggaran_disetujui=case when v_hitung_plafon then v_approved else 0 end,
        anggaran_disetujui_oleh=case when v_hitung_plafon then v_uid else null end,
        anggaran_disetujui_pada=case when v_hitung_plafon then now() else null end
    where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='start' then
    if not private.has_org_permission(v_org.id,'proker.edit') then raise exception 'FORBIDDEN_PROKER_START'; end if;
    if v_p.status<>'disetujui' then raise exception 'INVALID_STATUS_FOR_START'; end if;
    update public.proker set status='berjalan',review_stage=null,
      batas_lpj=(select current_date+coalesce(per.batas_lpj_hari,7) from public.periode per where per.id=v_org.periode_id)
    where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='finish' then
    if not private.has_org_permission(v_org.id,'proker.edit') then raise exception 'FORBIDDEN_PROKER_FINISH'; end if;
    if v_p.status<>'berjalan' then raise exception 'INVALID_STATUS_FOR_FINISH'; end if;
    update public.proker set status='selesai',review_stage=null where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='submit_lpj' then
    if not private.has_org_permission(v_org.id,'proker.edit') then raise exception 'FORBIDDEN_LPJ_SUBMIT'; end if;
    if v_p.status<>'selesai' then raise exception 'INVALID_STATUS_FOR_LPJ_SUBMIT'; end if;
    if not exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=v_org.id and pc.status='aktif') then raise exception 'UKM_COORDINATOR_NOT_ASSIGNED'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    update public.dokumen set status='diajukan',tahap='ukm_koordinator_lpj' where id=v_doc.id;
    update public.proker set status='lpj_diajukan',review_stage='ukm_koordinator_lpj' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve_lpj','reject_lpj') then
    if v_p.status<>'lpj_diajukan' then raise exception 'INVALID_STATUS_FOR_LPJ_REVIEW'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    if p_action='reject_lpj' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

    if v_p.review_stage='ukm_koordinator_lpj' then
      if not v_coordinator then raise exception 'FORBIDDEN_UKM_COORDINATOR_LPJ_REVIEW'; end if;
    elsif v_p.review_stage='ukm_presiden_bem_lpj' then
      if not v_president then raise exception 'FORBIDDEN_UKM_PRESIDENT_LPJ_REVIEW'; end if;
    elsif v_p.review_stage='wakil_rektor_lpj' then
      if not private.is_wakil_rektor() then raise exception 'FORBIDDEN_WAKIL_REKTOR_LPJ_REVIEW'; end if;
    else raise exception 'INVALID_UKM_LPJ_REVIEW_STAGE'; end if;

    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(v_doc.id,case when v_p.review_stage='ukm_koordinator_lpj' then 'koordinator' when v_p.review_stage='ukm_presiden_bem_lpj' then 'bem_lpj' when v_p.review_stage='wakil_rektor_lpj' then 'wakil_rektor_lpj' else v_p.review_stage end,case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,
      case when v_p.review_stage='ukm_koordinator_lpj' then 'koordinator_ukm'
           when v_p.review_stage='ukm_presiden_bem_lpj' then 'presiden_bem'
           else 'wakil_rektor' end);

    if p_action='reject_lpj' then
      update public.dokumen set status='revisi',tahap=v_p.review_stage where id=v_doc.id;
      update public.proker set status='selesai',review_stage=v_p.review_stage where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    if v_p.review_stage='ukm_koordinator_lpj' then
      update public.dokumen set status='diajukan',tahap='ukm_presiden_bem_lpj' where id=v_doc.id;
      update public.proker set status='lpj_diajukan',review_stage='ukm_presiden_bem_lpj' where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    if v_p.review_stage='ukm_presiden_bem_lpj' then
      update public.dokumen set status='diajukan',tahap='wakil_rektor_lpj' where id=v_doc.id;
      update public.proker set status='lpj_diajukan',review_stage='wakil_rektor_lpj' where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    update public.dokumen set status='disetujui',tahap='bph' where id=v_doc.id;
    update public.proker set status='lpj_disetujui',review_stage=null where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  raise exception 'UNKNOWN_UKM_ACTION';
end;
$$;

revoke all on function public.transition_ukm_proker(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_ukm_proker(uuid,text,text,bigint) to authenticated;

drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized on public.proker for select to authenticated using (
  private.is_admin() or private.is_wakil_rektor()
  or (private.is_hmj_pembimbing(organisasi_id) and exists(select 1 from public.profiles me where me.id=auth.uid() and me.peran='pembimbing'::public.peran_akun and me.aktif))
  or (private.has_org_permission(organisasi_id,'proker.view') and (select p.peran from public.profiles p where p.id=auth.uid()) is distinct from 'pembimbing'::public.peran_akun)
  or private.is_joined_collaborator(id)
  or (review_stage=any(array['bem','bem_from_wakil_rektor','bem_lpj']::text[]) and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view'))
  or (review_stage=any(array['ukm_koordinator','ukm_koordinator_lpj']::text[]) and exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=proker.organisasi_id and pc.akun_id=auth.uid() and pc.status='aktif'))
  or (review_stage=any(array['ukm_presiden_bem','ukm_presiden_bem_lpj']::text[]) and exists(select 1 from public.organisasi ukm join public.keanggotaan k on k.organisasi_id=ukm.induk_organisasi_id join public.jabatan_organisasi j on j.id=k.jabatan_id where ukm.id=proker.organisasi_id and k.akun_id=auth.uid() and k.status='aktif' and j.kode='presiden' and j.aktif=true))
);

drop policy if exists dokumen_select_authorized on public.dokumen;
create policy dokumen_select_authorized on public.dokumen for select to authenticated using (
  private.is_admin_or_rektor()
  or ((select p.peran from public.profiles p where p.id=auth.uid()) is distinct from 'pembimbing'::public.peran_akun and organisasi_id in(select private.user_org_ids()))
  or exists(select 1 from public.proker p where p.id=dokumen.proker_id and private.is_hmj_pembimbing(p.organisasi_id) and exists(select 1 from public.profiles me where me.id=auth.uid() and me.peran='pembimbing'::public.peran_akun and me.aktif))
  or exists(select 1 from public.proker p where p.id=dokumen.proker_id and p.review_stage=any(array['bem','bem_from_wakil_rektor','bem_lpj']::text[]) and private.has_bem_review_permission_for_hmj(p.organisasi_id,'dokumen.review'))
  or exists(select 1 from public.proker p where p.id=dokumen.proker_id and p.review_stage=any(array['ukm_koordinator','ukm_koordinator_lpj']::text[]) and exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=p.organisasi_id and pc.akun_id=auth.uid() and pc.status='aktif'))
  or exists(select 1 from public.proker p join public.organisasi ukm on ukm.id=p.organisasi_id join public.keanggotaan k on k.organisasi_id=ukm.induk_organisasi_id join public.jabatan_organisasi j on j.id=k.jabatan_id where p.id=dokumen.proker_id and p.review_stage=any(array['ukm_presiden_bem','ukm_presiden_bem_lpj']::text[]) and k.akun_id=auth.uid() and k.status='aktif' and j.kode='presiden' and j.aktif=true)
  or private.is_joined_collaborator(proker_id)
);

create or replace function private.notify_proker_workflow()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_org_name text; v_org_type public.tipe_org; v_message text; v_permission text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.review_stage is not distinct from new.review_stage then return new; end if;
  if new.status not in ('proposal_diajukan','lpj_diajukan') then return new; end if;
  select o.nama,o.tipe into v_org_name,v_org_type from public.organisasi o where o.id=new.organisasi_id;
  if v_org_type='UKM'::public.tipe_org then return new; end if;
  if new.status='proposal_diajukan' then
    v_message:='Proposal "'||coalesce(new.nama,'program kerja')||'" dari '||coalesce(v_org_name,'organisasi')||' menunggu review Anda.';
    v_permission:='dokumen.review';
  else
    v_message:='LPJ "'||coalesce(new.nama,'program kerja')||'" dari '||coalesce(v_org_name,'organisasi')||' menunggu review Anda.';
    v_permission:='laporan.review';
  end if;
  insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
  select distinct p.id,new.organisasi_id,v_message,'review:'||new.id::text
  from public.profiles p
  where p.aktif=true and p.id is distinct from new.dibuat_oleh
    and (
      (v_org_type='BEM'::public.tipe_org and p.peran='wakil_rektor'::public.peran_akun)
      or (v_org_type<>'BEM'::public.tipe_org and exists(select 1 from public.pembimbing_organisasi pb where pb.organisasi_id=new.organisasi_id and pb.akun_id=p.id and pb.status='aktif'))
      or (v_org_type<>'BEM'::public.tipe_org and exists(select 1 from public.keanggotaan k join public.hak_akses_jabatan h on h.jabatan_id=k.jabatan_id and h.kode=v_permission where k.akun_id=p.id and k.organisasi_id=new.organisasi_id and k.status='aktif'))
    );
  return new;
end; $$;

create or replace function private.notify_ukm_workflow()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_org public.organisasi%rowtype; v_message text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.review_stage is not distinct from new.review_stage then return new; end if;
  if new.status not in ('proposal_diajukan','lpj_diajukan') then return new; end if;
  select * into v_org from public.organisasi where id=new.organisasi_id;
  if not found or v_org.tipe<>'UKM'::public.tipe_org then return new; end if;
  if new.review_stage='ukm_koordinator' then
    v_message:='Proposal "'||coalesce(new.nama,'program kerja')||'" menunggu review Koordinator UKM.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan) select pc.akun_id,new.organisasi_id,v_message,'review:'||new.id::text from public.penugasan_koordinator pc where pc.organisasi_id=new.organisasi_id and pc.status='aktif';
  elsif new.review_stage='ukm_presiden_bem' then
    v_message:='Proposal "'||coalesce(new.nama,'program kerja')||'" menunggu persetujuan Presiden BEM.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select k.akun_id,new.organisasi_id,v_message,'review:'||new.id::text
    from public.keanggotaan k join public.jabatan_organisasi j on j.id=k.jabatan_id
    where k.organisasi_id=v_org.induk_organisasi_id and k.status='aktif' and j.kode='presiden' and j.aktif=true;
  elsif new.review_stage='wakil_rektor' then
    v_message:='Proposal "'||coalesce(new.nama,'program kerja')||'" UKM menunggu persetujuan Wakil Rektor.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select p.id,new.organisasi_id,v_message,'review:'||new.id::text from public.profiles p
    where p.id<>new.dibuat_oleh and p.aktif=true and p.peran='wakil_rektor'::public.peran_akun;
  elsif new.review_stage='ukm_koordinator_lpj' then
    v_message:='LPJ "'||coalesce(new.nama,'program kerja')||'" menunggu review Koordinator UKM.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan) select pc.akun_id,new.organisasi_id,v_message,'review:'||new.id::text from public.penugasan_koordinator pc where pc.organisasi_id=new.organisasi_id and pc.status='aktif';
  elsif new.review_stage='ukm_presiden_bem_lpj' then
    v_message:='LPJ "'||coalesce(new.nama,'program kerja')||'" menunggu persetujuan Presiden BEM.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select k.akun_id,new.organisasi_id,v_message,'review:'||new.id::text
    from public.keanggotaan k join public.jabatan_organisasi j on j.id=k.jabatan_id
    where k.organisasi_id=v_org.induk_organisasi_id and k.status='aktif' and j.kode='presiden' and j.aktif=true;
  elsif new.review_stage='wakil_rektor_lpj' then
    v_message:='LPJ "'||coalesce(new.nama,'program kerja')||'" UKM menunggu persetujuan Wakil Rektor.';
    insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
    select p.id,new.organisasi_id,v_message,'review:'||new.id::text from public.profiles p
    where p.id<>new.dibuat_oleh and p.aktif=true and p.peran='wakil_rektor'::public.peran_akun;
  end if;
  return new;
end; $$;

revoke all on function private.notify_ukm_workflow() from public,anon,authenticated;
drop trigger if exists trg_notify_ukm_workflow on public.proker;
create trigger trg_notify_ukm_workflow after insert or update of status,review_stage on public.proker
for each row execute function private.notify_ukm_workflow();
