-- Fix UKM workflow approval history values to match persetujuan_tahap_check.
-- Internal proker.review_stage values (ukm_*) remain unchanged for routing;
-- persetujuan.tahap must use the established audit-stage vocabulary.

do $fix$
declare
  v_definition text;
  v_old_proposal text := $old$v_doc.id,v_p.review_stage,case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,$old$;
  v_new_proposal text := $new$v_doc.id,case when v_p.review_stage='ukm_koordinator' then 'koordinator' when v_p.review_stage='ukm_presiden_bem' then 'bem' when v_p.review_stage='wakil_rektor' then 'wakil_rektor' else v_p.review_stage end,case when p_action='approve' then 'setuju' else 'revisi' end,v_comment,v_uid,$new$;
  v_old_lpj text := $old$v_doc.id,v_p.review_stage,case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,$old$;
  v_new_lpj text := $new$v_doc.id,case when v_p.review_stage='ukm_koordinator_lpj' then 'koordinator' when v_p.review_stage='ukm_presiden_bem_lpj' then 'bem_lpj' when v_p.review_stage='wakil_rektor_lpj' then 'wakil_rektor_lpj' else v_p.review_stage end,case when p_action='approve_lpj' then 'setuju' else 'revisi' end,v_comment,v_uid,$new$;
begin
  select pg_get_functiondef('public.transition_ukm_proker(uuid,text,text,bigint)'::regprocedure)
  into v_definition;

  if position(v_old_proposal in v_definition)>0 then
    v_definition:=replace(v_definition,v_old_proposal,v_new_proposal);
  elsif position(v_new_proposal in v_definition)=0 then
    raise exception 'Cannot find or verify UKM proposal audit stage mapping';
  end if;

  if position(v_old_lpj in v_definition)>0 then
    v_definition:=replace(v_definition,v_old_lpj,v_new_lpj);
  elsif position(v_new_lpj in v_definition)=0 then
    raise exception 'Cannot find or verify UKM LPJ audit stage mapping';
  end if;

  execute v_definition;
end
$fix$;
