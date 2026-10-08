-- Route HMJ LPJ: Pembimbing -> HMJ -> BEM -> Wakil Rektor -> selesai.
CREATE OR REPLACE FUNCTION public.transition_proker(p_proker_id uuid, p_action text, p_comment text DEFAULT NULL::text, p_anggaran_disetujui bigint DEFAULT NULL::bigint)
 RETURNS proker
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  select * into v_p from public.proker where id=p_proker_id for update;
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

  -- Collaborators must confirm before any forward transition.
  -- Revising backward is allowed; it does not advance the workflow.
  if p_action in (
    'submit',
    'resubmit',
    'resubmit_hmj_consult',
    'resubmit_hmj_skip',
    'forward_hmj_to_bem',
    'approve',
    'start',
    'finish',
    'submit_lpj',
    'forward_lpj_to_bem',
    'approve_lpj',
    'reject_lpj'
  ) then
    perform private.assert_proker_collaborators_confirmed(p_proker_id);
  end if;

  -- ----------------------------------------------------------
  -- Submission / resubmission
  -- ----------------------------------------------------------

  if p_action='resubmit'
     and v_org_type='HMJ'
     and v_p.review_stage='bem_from_wakil_rektor' then

    if not private.has_bem_review_permission_for_hmj(v_org,'dokumen.review') then
      raise exception 'FORBIDDEN_BEM_REVIEW_FOR_HMJ';
    end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id
      and jenis='proposal'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then
      raise exception 'PROPOSAL_FILE_REQUIRED';
    end if;

    update public.dokumen
    set status='diajukan',tahap='wakil_rektor'
    where id=v_doc.id;

    update public.proker
    set status='proposal_diajukan',review_stage='wakil_rektor'
    where id=p_proker_id
    returning * into v_p;

    return v_p;
  end if;

  if p_action='forward_hmj_to_bem' then
    if private.is_wakil_rektor() then raise exception 'VICE_RECTOR_READ_ONLY'; end if;
    if v_org_type<>'HMJ' then raise exception 'ONLY_HMJ_CAN_FORWARD_TO_BEM'; end if;
    if not (private.has_org_permission(v_org,'proker.create') or private.has_org_permission(v_org,'proker.edit')) then
      raise exception 'FORBIDDEN_PROKER_FORWARD_TO_BEM';
    end if;
    if v_p.status<>'proposal_diajukan' or v_p.review_stage<>'hmj_from_pembimbing_approved' then
      raise exception 'INVALID_HMJ_FORWARD_TO_BEM';
    end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='proposal'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'PROPOSAL_FILE_REQUIRED'; end if;
    update public.dokumen set status='diajukan',tahap='bem' where id=v_doc.id;
    update public.proker set status='proposal_diajukan',review_stage='bem' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

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

    if p_action in ('resubmit_hmj_consult','resubmit_hmj_skip')
       and not (v_p.status='revisi' and v_org_type='HMJ') then
      raise exception 'INVALID_HMJ_RESUBMIT';
    end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id
      and jenis='proposal'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then
      raise exception 'PROPOSAL_FILE_REQUIRED';
    end if;

    if v_org_type='HMJ' then
      if p_action='submit' then
        if not exists(
          select 1
          from public.pembimbing_organisasi pb
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
          select 1
          from public.pembimbing_organisasi pb
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
        if p_action='resubmit' and v_p.review_stage<>'hmj_from_pembimbing' then
          raise exception 'HMJ_REVISION_ROUTE_REQUIRED';
        end if;
        v_p.review_stage:='pembimbing_hmj';
      end if;

    elsif v_org_type='BEM' then
      if p_action in ('submit','resubmit') then
        v_p.review_stage:='wakil_rektor';
      end if;

    else
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
    where proker_id=p_proker_id
      and jenis='proposal'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then
      raise exception 'PROPOSAL_FILE_REQUIRED';
    end if;

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
        set status='diajukan',tahap='hmj_from_pembimbing_approved'
        where id=v_doc.id;

        update public.proker
        set review_stage='hmj_from_pembimbing_approved',status='proposal_diajukan'
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

    if v_org_type='HMJ' and v_p.review_stage='bem_from_wakil_rektor' then
      if p_action<>'revise' then
        raise exception 'INVALID_BEM_WR_FOLLOWUP_ACTION';
      end if;

      if not private.has_bem_review_permission_for_hmj(v_org,'dokumen.review') then
        raise exception 'FORBIDDEN_BEM_REVIEW_FOR_HMJ';
      end if;

      if v_comment is null then
        raise exception 'REVIEW_COMMENT_REQUIRED';
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bem','revisi',v_comment,v_uid,'bem');

      update public.dokumen
      set status='revisi',tahap='hmj_from_bem'
      where id=v_doc.id;

      update public.proker
      set status='revisi',review_stage='hmj_from_bem'
      where id=p_proker_id
      returning * into v_p;

      return v_p;
    end if;

    if v_org_type='BEM' and v_p.review_stage='wakil_rektor' then
      if not private.is_wakil_rektor() then
        raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW';
      end if;
    elsif v_org_type='BEM' then
      if not private.is_wakil_rektor() then
        raise exception 'FORBIDDEN_WAKIL_REKTOR_REVIEW';
      end if;
    elsif v_org_type='HMJ' and v_p.review_stage='wakil_rektor' then
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
        case
          when v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then 'wakil_rektor'
          else 'koordinator'
        end,
        'revisi',
        v_comment,
        v_uid,
        case
          when v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then 'wakil_rektor'
          else coalesce(private.current_position_code(v_org),'reviewer')
        end
      );

      if v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org) then
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

    if v_org_type in ('BEM'::public.tipe_org,'HMJ'::public.tipe_org)
       and not private.is_wakil_rektor() then
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
    update public.proker set status='selesai' where id=p_proker_id returning * into v_p;
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
    update public.dokumen set status='diajukan',tahap='pembimbing_hmj_lpj' where id=v_doc.id;
    update public.proker set status='lpj_diajukan',review_stage='pembimbing_hmj_lpj' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action='forward_lpj_to_bem' then
    if private.is_wakil_rektor() then raise exception 'VICE_RECTOR_READ_ONLY'; end if;
    if v_org_type<>'HMJ' then raise exception 'ONLY_HMJ_CAN_FORWARD_LPJ_TO_BEM'; end if;
    if not (private.has_org_permission(v_org,'proker.create') or private.has_org_permission(v_org,'proker.edit')) then
      raise exception 'FORBIDDEN_LPJ_FORWARD_TO_BEM';
    end if;
    if v_p.status<>'lpj_diajukan' or v_p.review_stage not in ('hmj_from_pembimbing_lpj','hmj_from_bem_lpj') then
      raise exception 'INVALID_LPJ_FORWARD_TO_BEM';
    end if;
    select * into v_doc from public.dokumen where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok order by id desc limit 1;
    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    update public.dokumen set status='diajukan',tahap='bem_lpj' where id=v_doc.id;
    update public.proker set status='lpj_diajukan',review_stage='bem_lpj' where id=p_proker_id returning * into v_p;
    return v_p;
  end if;

  if p_action in ('approve_lpj','reject_lpj') then
    if v_p.dibuat_oleh=v_uid then raise exception 'SELF_REVIEW_NOT_ALLOWED'; end if;
    if v_p.status<>'lpj_diajukan' then raise exception 'INVALID_STATUS_FOR_LPJ_REVIEW'; end if;

    select * into v_doc
    from public.dokumen
    where proker_id=p_proker_id and jenis='laporan_akhir'::public.jenis_dok
    order by id desc limit 1;

    if not found or nullif(v_doc.file_path,'') is null then raise exception 'LPJ_FILE_REQUIRED'; end if;
    if p_action='reject_lpj' and v_comment is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;

    if v_org_type='HMJ' and v_p.review_stage='pembimbing_hmj_lpj' then
      if not private.is_hmj_pembimbing(v_org) then raise exception 'FORBIDDEN_HMJ_PEMBIMBING_REVIEW'; end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'pembimbing_hmj_lpj',
        case when p_action='approve_lpj' then 'setuju' else 'revisi' end,
        v_comment,v_uid,'pembimbing_hmj');

      if p_action='approve_lpj' then
        update public.dokumen set status='diajukan',tahap='hmj_from_pembimbing_lpj' where id=v_doc.id;
        update public.proker set status='lpj_diajukan',review_stage='hmj_from_pembimbing_lpj'
        where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='hmj_from_pembimbing_lpj_revision' where id=v_doc.id;
        update public.proker set status='selesai',review_stage='hmj_from_pembimbing_lpj_revision'
        where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    end if;

    if v_org_type='HMJ' and v_p.review_stage='wakil_rektor_lpj' then
      if not private.is_wakil_rektor() then
        raise exception 'FORBIDDEN_WAKIL_REKTOR_LPJ_REVIEW';
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'wakil_rektor_lpj',
        case when p_action='approve_lpj' then 'setuju' else 'revisi' end,
        v_comment,v_uid,'wakil_rektor');

      if p_action='approve_lpj' then
        update public.dokumen set status='disetujui',tahap='bph' where id=v_doc.id;
        update public.proker set status='lpj_disetujui',review_stage=null
        where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='hmj_from_wakil_rektor_lpj' where id=v_doc.id;
        update public.proker set status='selesai',review_stage='hmj_from_wakil_rektor_lpj'
        where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    end if;

    if v_org_type='HMJ' and v_p.review_stage='bem_lpj' then
      if not private.has_bem_review_permission_for_hmj(v_org,'laporan.review') then
        raise exception 'FORBIDDEN_BEM_LPJ_REVIEW';
      end if;

      insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
      values(v_doc.id,'bem_lpj',
        case when p_action='approve_lpj' then 'setuju' else 'revisi' end,
        v_comment,v_uid,'bem');

      if p_action='approve_lpj' then
        update public.dokumen set status='diajukan',tahap='wakil_rektor_lpj' where id=v_doc.id;
        update public.proker set status='lpj_diajukan',review_stage='wakil_rektor_lpj'
        where id=p_proker_id returning * into v_p;
      else
        update public.dokumen set status='revisi',tahap='hmj_from_bem_lpj' where id=v_doc.id;
        update public.proker set status='selesai',review_stage='hmj_from_bem_lpj'
        where id=p_proker_id returning * into v_p;
      end if;
      return v_p;
    end if;

    if not private.has_org_permission(v_org,'laporan.review')
       and not private.has_org_permission(v_org,'dokumen.review') then
      raise exception 'FORBIDDEN_LPJ_REVIEW';
    end if;

    insert into public.persetujuan(dokumen_id,tahap,keputusan,komentar,oleh,sebagai)
    values(v_doc.id,'pembimbing',
      case when p_action='approve_lpj' then 'setuju' else 'revisi' end,
      v_comment,v_uid,coalesce(private.current_position_code(v_org),'reviewer'));

    update public.dokumen
    set status=case when p_action='approve_lpj' then 'disetujui' else 'revisi' end,
        tahap='pembimbing'
    where id=v_doc.id;

    update public.proker
    set status=case when p_action='approve_lpj' then 'lpj_disetujui' else 'selesai' end,
        review_stage=null
    where id=p_proker_id returning * into v_p;

    return v_p;
  end if;

  raise exception 'UNKNOWN_PROKER_ACTION';
end;
$function$
;

revoke all on function public.transition_proker(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_proker(uuid,text,text,bigint) to authenticated;