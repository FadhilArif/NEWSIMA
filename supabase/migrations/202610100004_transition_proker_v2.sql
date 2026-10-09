-- New stage-aware workflow RPC. The older transition_proker RPC remains intact
-- for the current production UI until the New-Proces branch is promoted.
create or replace function public.transition_proker_v2(
  p_proker_id uuid,
  p_action text,
  p_comment text default null,
  p_anggaran_disetujui bigint default null
)
returns public.proker
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_p public.proker%rowtype;
  v_org public.organisasi%rowtype;
  v_doc public.dokumen%rowtype;
  v_uid uuid := auth.uid();
  v_comment text := nullif(trim(coalesce(p_comment,'')),'');
  v_owner boolean := false;
  v_is_coordinator boolean := false;
  v_is_president boolean := false;
  v_is_kaprodi boolean := false;
  v_is_dekan boolean := false;
  v_is_rektor boolean := false;
  v_hitung_plafon boolean := false;
  v_approved bigint := greatest(coalesce(p_anggaran_disetujui,0),0);
  v_budget public.anggaran_periode%rowtype;
  v_used bigint := 0;
  v_remaining bigint := 0;
  v_target_stage text;
  v_audit_stage text;
  v_as_role text;
  v_is_lpj boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_p from public.proker where id=p_proker_id for update;
  if not found then raise exception 'PROKER_NOT_FOUND'; end if;

  select * into v_org from public.organisasi where id=v_p.organisasi_id;
  if not found then raise exception 'ORGANIZATION_INVALID'; end if;

  if not exists(select 1 from public.profiles where id=v_uid and aktif=true) then
    raise exception 'ACCOUNT_INACTIVE';
  end if;

  v_owner := coalesce(private.has_org_permission(v_org.id,'proker.create'),false)
          or coalesce(private.has_org_permission(v_org.id,'proker.edit'),false);
  v_is_rektor := coalesce(private.is_wakil_rektor(),false);

  v_is_coordinator := exists(
    select 1
    from public.penugasan_koordinator pc
    join public.organisasi child on child.id=pc.organisasi_id
    join public.keanggotaan parent_member
      on parent_member.organisasi_id=child.induk_organisasi_id
     and parent_member.akun_id=pc.akun_id
     and parent_member.status='aktif'
    where pc.organisasi_id=v_org.id
      and pc.akun_id=v_uid
      and pc.status='aktif'
      and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
      and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
  );

  v_is_president := exists(
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.profiles p on p.id=k.akun_id and p.aktif=true
    where k.organisasi_id=v_org.induk_organisasi_id
      and k.akun_id=v_uid
      and k.status='aktif'
      and j.kode='presiden'
      and j.aktif=true
  );

  v_is_kaprodi := v_org.tipe='HMJ' and exists(
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.unit_kerja u on u.id=k.unit_id
    join public.profiles p on p.id=k.akun_id
    where k.organisasi_id=v_org.id
      and k.akun_id=v_uid
      and k.status='aktif'
      and p.aktif=true
      and p.peran::text='kaprodi'
      and j.kode='kaprodi'
      and j.aktif=true
      and u.organisasi_id=v_org.id
      and u.jenis='program_studi'
  );

  v_is_dekan := v_org.tipe='HMJ' and exists(
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.profiles p on p.id=k.akun_id
    where k.organisasi_id=v_org.id
      and k.akun_id=v_uid
      and k.status='aktif'
      and p.aktif=true
      and p.peran::text='dekan'
      and j.kode='dekan'
      and j.aktif=true
  );

  select coalesce(s.hitung_plafon,false) into v_hitung_plafon
  from public.sumber_dana s where s.kode=v_p.sumber_dana_kode;

  -- Draft proposal submission/revision always enters the first stage for the
  -- relevant organization type. BEM goes directly to WR1.
  if p_action in ('submit','resubmit') then
    if not v_owner then raise exception 'FORBIDDEN_PROKER_SUBMIT'; end if;
    if p_action='submit' and v_p.status<>'direncanakan' then raise exception 'INVALID_STATUS_FOR_SUBMIT'; end if;
    if p_action='resubmit' and v_p.status<>'revisi' then raise exception 'INVALID_STATUS_FOR_RESUBMIT'; end if;

    select * into v_doc from public.dokumen
    where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok
    order by uploaded_at desc nulls last,id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;

    if v_org.tipe='BEM' then
      v_target_stage:='wakil_rektor';
    elsif v_org.tipe='HMJ' then
      if v_org.induk_organisasi_id is null then raise exception 'HMJ_PARENT_BEM_REQUIRED'; end if;
      if not exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=v_org.id and pc.status='aktif' and (pc.mulai_pada is null or pc.mulai_pada<=current_date) and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)) then
        raise exception 'COORDINATOR_NOT_ASSIGNED';
      end if;
      v_target_stage:='koordinator_hmj';
    elsif v_org.tipe in ('UKM'::public.tipe_org,'CLUB'::public.tipe_org) then
      if v_org.induk_organisasi_id is null then raise exception 'UKM_PARENT_BEM_REQUIRED'; end if;
      if not exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=v_org.id and pc.status='aktif' and (pc.mulai_pada is null or pc.mulai_pada<=current_date) and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)) then
        raise exception 'COORDINATOR_NOT_ASSIGNED';
      end if;
      v_target_stage:='koordinator_ukm';
    else
      raise exception 'ORGANIZATION_TYPE_NOT_SUPPORTED';
    end if;

    perform private.assert_proker_collaborators_confirmed(p_proker_id);
    update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
    update public.proker set status='proposal_diajukan',review_stage=v_target_stage where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  -- Workflow stage forwarding by the BEM-appointed coordinator.
  if p_action='forward' then
    if v_p.status='proposal_diajukan' and v_p.review_stage in ('koordinator_hmj','koordinator_ukm') then
      if not v_is_coordinator then raise exception 'FORBIDDEN_COORDINATOR_FORWARD'; end if;
      perform private.assert_proker_collaborators_confirmed(p_proker_id);
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by uploaded_at desc nulls last,id desc limit 1;
      if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
      v_target_stage:=case when v_p.review_stage='koordinator_hmj' then 'presiden_bem_hmj' else 'presiden_bem_ukm' end;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'koordinator','teruskan',v_comment,v_uid,case when v_p.review_stage='koordinator_hmj' then 'koordinator_hmj' else 'koordinator_ukm' end);
      update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
      update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      return v_p;
    elsif v_p.status='lpj_diajukan' and v_p.review_stage in ('koordinator_hmj_lpj','koordinator_ukm_lpj') then
      if not v_is_coordinator then raise exception 'FORBIDDEN_COORDINATOR_FORWARD'; end if;
      perform private.assert_proker_collaborators_confirmed(p_proker_id);
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
      if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
      v_target_stage:=case when v_p.review_stage='koordinator_hmj_lpj' then 'presiden_bem_hmj_lpj' else 'presiden_bem_ukm_lpj' end;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'koordinator','teruskan',v_comment,v_uid,case when v_p.review_stage='koordinator_hmj_lpj' then 'koordinator_hmj' else 'koordinator_ukm' end);
      update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
      update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    raise exception 'INVALID_COORDINATOR_FORWARD_STAGE';
  end if;

  -- President revision is routed back through the coordinator before reaching
  -- the owning organization. The coordinator must explicitly return it.
  if p_action='return_to_org' then
    if not v_is_coordinator then raise exception 'FORBIDDEN_COORDINATOR_RETURN'; end if;
    if v_p.status='proposal_diajukan' and v_p.review_stage in ('koordinator_hmj_revisi','koordinator_ukm_revisi') then
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by uploaded_at desc nulls last,id desc limit 1;
      if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'koordinator','teruskan',v_comment,v_uid,'koordinator_bem');
      update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
      update public.proker set status='revisi',review_stage=null where id=p_proker_id returning * into v_p;
      return v_p;
    elsif v_p.status='lpj_diajukan' and v_p.review_stage in ('koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi') then
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
      if not found then raise exception 'LPJ_NOT_FOUND'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'koordinator','teruskan',v_comment,v_uid,'koordinator_bem');
      update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
      update public.proker set status='selesai',review_stage=null where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    raise exception 'INVALID_COORDINATOR_RETURN_STAGE';
  end if;

  -- HMJ sends the already-reviewed document to the designated academic reviewer
  -- or WR1. These actions do not assign budget; only WR1's final approval may.
  if p_action in ('send_kaprodi','send_dekan','send_wakil_rektor') then
    if not v_owner or v_org.tipe<>'HMJ' then raise exception 'FORBIDDEN_HMJ_FORWARD'; end if;
    if v_p.status='proposal_diajukan' then
      v_doc.kind := null; -- no-op removed below
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by uploaded_at desc nulls last,id desc limit 1;
      if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
      if p_action='send_kaprodi' and v_p.review_stage='hmj_lanjut_kaprodi' then v_target_stage:='kaprodi_hmj';
      elsif p_action='send_dekan' and v_p.review_stage='hmj_lanjut_dekan' then v_target_stage:='dekan_hmj';
      elsif p_action='send_wakil_rektor' and v_p.review_stage='hmj_lanjut_wakil_rektor' then v_target_stage:='wakil_rektor_hmj';
      else raise exception 'INVALID_HMJ_FORWARD_STAGE'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bph','teruskan',v_comment,v_uid,'pengurus_hmj');
      update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
      update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      return v_p;
    elsif v_p.status='lpj_diajukan' then
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
      if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
      if p_action='send_kaprodi' and v_p.review_stage='hmj_lanjut_kaprodi_lpj' then v_target_stage:='kaprodi_hmj_lpj';
      elsif p_action='send_dekan' and v_p.review_stage='hmj_lanjut_dekan_lpj' then v_target_stage:='dekan_hmj_lpj';
      elsif p_action='send_wakil_rektor' and v_p.review_stage='hmj_lanjut_wakil_rektor_lpj' then v_target_stage:='wakil_rektor_hmj_lpj';
      else raise exception 'INVALID_HMJ_LPJ_FORWARD_STAGE'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bph','teruskan',v_comment,v_uid,'pengurus_hmj');
      update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
      update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    raise exception 'INVALID_HMJ_FORWARD_STATUS';
  end if;

  if p_action='review_forward' then
    if not v_is_dekan then raise exception 'FORBIDDEN_DEKAN_REVIEW'; end if;
    if v_p.status='proposal_diajukan' and v_p.review_stage='dekan_hmj' then
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by uploaded_at desc nulls last,id desc limit 1;
      if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai) values(v_doc.id,'dekan','teruskan',v_comment,v_uid,'dekan');
      update public.dokumen set status='diajukan',tahap='hmj_lanjut_wakil_rektor' where id=v_doc.id;
      update public.proker set review_stage='hmj_lanjut_wakil_rektor' where id=p_proker_id returning * into v_p;
      return v_p;
    elsif v_p.status='lpj_diajukan' and v_p.review_stage='dekan_hmj_lpj' then
      select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
      if not found then raise exception 'LPJ_NOT_FOUND'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai) values(v_doc.id,'dekan_lpj','teruskan',v_comment,v_uid,'dekan');
      update public.dokumen set status='diajukan',tahap='hmj_lanjut_wakil_rektor_lpj' where id=v_doc.id;
      update public.proker set review_stage='hmj_lanjut_wakil_rektor_lpj' where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    raise exception 'INVALID_DEKAN_REVIEW_STAGE';
  end if;

  if p_action='start' then
    if not v_owner then raise exception 'FORBIDDEN_PROKER_START'; end if;
    if v_p.status<>'disetujui' then raise exception 'INVALID_STATUS_FOR_START'; end if;
    update public.proker as pr
    set status='berjalan',
        batas_lpj=(select current_date+coalesce(per.batas_lpj_hari,7) from public.organisasi org join public.periode per on per.id=org.periode_id where org.id=pr.organisasi_id)
    where pr.id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='finish' then
    if not v_owner then raise exception 'FORBIDDEN_PROKER_FINISH'; end if;
    if v_p.status<>'berjalan' then raise exception 'INVALID_STATUS_FOR_FINISH'; end if;
    update public.proker set status='selesai',review_stage=null where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='submit_lpj' then
    if not v_owner then raise exception 'FORBIDDEN_LPJ_SUBMIT'; end if;
    if v_p.status<>'selesai' then raise exception 'INVALID_STATUS_FOR_LPJ_SUBMIT'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    if v_org.tipe='BEM' then
      v_target_stage:='wakil_rektor_lpj';
    elsif v_org.tipe='HMJ' then
      if not exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=v_org.id and pc.status='aktif' and (pc.mulai_pada is null or pc.mulai_pada<=current_date) and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)) then raise exception 'COORDINATOR_NOT_ASSIGNED'; end if;
      v_target_stage:='koordinator_hmj_lpj';
    elsif v_org.tipe in ('UKM'::public.tipe_org,'CLUB'::public.tipe_org) then
      if not exists(select 1 from public.penugasan_koordinator pc where pc.organisasi_id=v_org.id and pc.status='aktif' and (pc.mulai_pada is null or pc.mulai_pada<=current_date) and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)) then raise exception 'COORDINATOR_NOT_ASSIGNED'; end if;
      v_target_stage:='koordinator_ukm_lpj';
    else raise exception 'ORGANIZATION_TYPE_NOT_SUPPORTED'; end if;
    perform private.assert_proker_collaborators_confirmed(p_proker_id);
    update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
    update public.proker set status='lpj_diajukan',review_stage=v_target_stage where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve','revise') then
    if v_p.status<>'proposal_diajukan' then raise exception 'INVALID_STATUS_FOR_PROPOSAL_REVIEW'; end if;
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by uploaded_at desc nulls last,id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
    if p_action='revise' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

    if v_p.review_stage in ('presiden_bem_ukm','presiden_bem_hmj') then
      if not v_is_president then raise exception 'FORBIDDEN_BEM_PRESIDENT_REVIEW'; end if;
      perform private.assert_proker_collaborators_confirmed(p_proker_id);
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bem',case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,'presiden_bem');
      if p_action='approve' then
        v_target_stage:=case when v_p.review_stage='presiden_bem_hmj' then 'hmj_lanjut_kaprodi' else 'wakil_rektor_ukm' end;
        update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
        update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      else
        v_target_stage:=case when v_p.review_stage='presiden_bem_hmj' then 'koordinator_hmj_revisi' else 'koordinator_ukm_revisi' end;
        update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
        update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    elsif v_p.review_stage='kaprodi_hmj' then
      if not v_is_kaprodi then raise exception 'FORBIDDEN_KAPRODI_REVIEW'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'kaprodi',case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,'kaprodi');
      if p_action='approve' then
        update public.dokumen set status='diajukan',tahap='hmj_lanjut_dekan' where id=v_doc.id;
        update public.proker set review_stage='hmj_lanjut_dekan' where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
        update public.proker set status='revisi',review_stage=null where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    elsif v_p.review_stage in ('wakil_rektor','wakil_rektor_ukm','wakil_rektor_hmj') then
      if not v_is_rektor then raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW'; end if;
      if p_action='revise' then
        if v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
        insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
        values(v_doc.id,'wakil_rektor','revisi',v_comment,v_uid,'wakil_rektor');
        update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
        update public.proker set status='revisi',review_stage=null,anggaran_disetujui=0,anggaran_disetujui_oleh=null,anggaran_disetujui_pada=null where id=p_proker_id returning * into v_p;
        return v_p;
      end if;

      if v_hitung_plafon then
        if p_anggaran_disetujui is null then raise exception 'APPROVED_BUDGET_REQUIRED'; end if;
        if v_approved>v_p.anggaran_diajukan then raise exception 'APPROVED_BUDGET_EXCEEDS_REQUEST'; end if;
        select * into v_budget from public.anggaran_periode where periode_id=v_org.periode_id for update;
        if not found then raise exception 'PERIOD_BUDGET_NOT_SET'; end if;
        select coalesce(sum(pr.anggaran_disetujui),0)::bigint into v_used
        from public.proker pr join public.organisasi o on o.id=pr.organisasi_id
        where o.periode_id=v_org.periode_id and pr.id<>p_proker_id and pr.anggaran_disetujui>0;
        v_remaining:=greatest(v_budget.plafon-v_used,0);
        if v_approved>v_remaining then raise exception 'INSUFFICIENT_PERIOD_BUDGET'; end if;
      else
        v_approved:=0;
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'wakil_rektor','setuju',
        case when v_hitung_plafon then concat(coalesce(v_comment,''),case when v_comment is null then '' else E'\n' end,'Anggaran disetujui: Rp',to_char(v_approved,'FM999G999G999G999G999')) else v_comment end,
        v_uid,'wakil_rektor');
      update public.dokumen set status='disetujui',tahap='bph' where id=v_doc.id;
      update public.proker set status='disetujui',review_stage=null,
        anggaran_disetujui=case when v_hitung_plafon then v_approved else 0 end,
        anggaran_disetujui_oleh=case when v_hitung_plafon then v_uid else null end,
        anggaran_disetujui_pada=case when v_hitung_plafon then now() else null end
      where id=p_proker_id returning * into v_p;
      return v_p;
    end if;
    raise exception 'INVALID_PROPOSAL_REVIEW_STAGE';
  end if;

  if p_action in ('approve_lpj','reject_lpj') then
    if v_p.status<>'lpj_diajukan' then raise exception 'INVALID_STATUS_FOR_LPJ_REVIEW'; end if;
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    if p_action='reject_lpj' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis in ('laporan_akhir'::public.jenis_dok,'lpj'::public.jenis_dok) order by (jenis='laporan_akhir'::public.jenis_dok) desc,uploaded_at desc nulls last,id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;

    if v_p.review_stage in ('presiden_bem_ukm_lpj','presiden_bem_hmj_lpj') then
      if not v_is_president then raise exception 'FORBIDDEN_BEM_PRESIDENT_LPJ_REVIEW'; end if;
      perform private.assert_proker_collaborators_confirmed(p_proker_id);
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bem_lpj',case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,'presiden_bem');
      if p_action='approve_lpj' then
        v_target_stage:=case when v_p.review_stage='presiden_bem_hmj_lpj' then 'hmj_lanjut_kaprodi_lpj' else 'wakil_rektor_ukm_lpj' end;
        update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
        update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      else
        v_target_stage:=case when v_p.review_stage='presiden_bem_hmj_lpj' then 'koordinator_hmj_lpj_revisi' else 'koordinator_ukm_lpj_revisi' end;
        update public.dokumen set status='diajukan',tahap=v_target_stage where id=v_doc.id;
        update public.proker set review_stage=v_target_stage where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    elsif v_p.review_stage='kaprodi_hmj_lpj' then
      if not v_is_kaprodi then raise exception 'FORBIDDEN_KAPRODI_LPJ_REVIEW'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'kaprodi_lpj',case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,'kaprodi');
      if p_action='approve_lpj' then
        update public.dokumen set status='diajukan',tahap='hmj_lanjut_dekan_lpj' where id=v_doc.id;
        update public.proker set review_stage='hmj_lanjut_dekan_lpj' where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
        update public.proker set status='selesai',review_stage=null where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    elsif v_p.review_stage in ('wakil_rektor_lpj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj') then
      if not v_is_rektor then raise exception 'FORBIDDEN_WAKIL_REKTOR_LPJ_REVIEW'; end if;
      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'wakil_rektor_lpj',case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,'wakil_rektor');
      if p_action='approve_lpj' then
        update public.dokumen set status='disetujui',tahap='bph' where id=v_doc.id;
        update public.proker set status='lpj_disetujui',review_stage=null where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='revisi' where id=v_doc.id;
        update public.proker set status='selesai',review_stage=null where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    end if;
    raise exception 'INVALID_LPJ_REVIEW_STAGE';
  end if;

  raise exception 'UNKNOWN_WORKFLOW_ACTION';
end;
$function$;

revoke all on function public.transition_proker_v2(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_proker_v2(uuid,text,text,bigint) to authenticated;

-- Only Wakil Rektor 1 may set the campus-period ceiling.
do $restriction$
declare
  v_def text;
  v_old text := 'if not (private.is_admin() or private.is_wakil_rektor()) then';
  v_new text := 'if not private.is_wakil_rektor() then';
begin
  select pg_get_functiondef('public.set_anggaran_periode(uuid,bigint)'::regprocedure) into v_def;
  if position(v_old in v_def)>0 then
    v_def:=replace(v_def,v_old,v_new);
    execute v_def;
  elsif position(v_new in v_def)=0 then
    raise exception 'Unexpected set_anggaran_periode authorization check; migration stopped.';
  end if;
end
$restriction$;
