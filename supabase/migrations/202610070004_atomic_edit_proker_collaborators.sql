-- Atomic draft edit with collaborator synchronization.
create or replace function public.update_proker_draft_with_collaborators(
  p_proker_id uuid,
  p_nama text,
  p_jenis text,
  p_tanggal_mulai date,
  p_tanggal_selesai date,
  p_tempat text,
  p_deskripsi text,
  p_sumber_dana_kode text,
  p_sumber_dana_detail text,
  p_anggaran_total bigint,
  p_collaborators jsonb default '[]'::jsonb
)
returns public.proker
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v public.proker%rowtype;
begin
  v := public.update_proker_draft(
    p_proker_id,
    p_nama,
    p_jenis,
    p_tanggal_mulai,
    p_tanggal_selesai,
    p_tempat,
    p_deskripsi,
    p_sumber_dana_kode,
    p_sumber_dana_detail,
    p_anggaran_total
  );

  perform public.sync_proker_kolaborator(
    p_proker_id,
    coalesce(p_collaborators,'[]'::jsonb)
  );

  return v;
end;
$$;

revoke all on function public.update_proker_draft_with_collaborators(uuid,text,text,date,date,text,text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.update_proker_draft_with_collaborators(uuid,text,text,date,date,text,text,text,text,bigint,jsonb) to authenticated;
