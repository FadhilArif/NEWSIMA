-- Remove direct PostgREST access to legacy wrapper RPCs that are no longer
-- called by the current frontend. Their implementations remain available for
-- internal SECURITY DEFINER call chains.

revoke execute on function public.approve_proker(uuid,bigint,text) from authenticated,anon,public;
revoke execute on function public.revise_proker(uuid,text) from authenticated,anon,public;
revoke execute on function public.sync_proker_kolaborator(uuid,jsonb) from authenticated,anon,public;
