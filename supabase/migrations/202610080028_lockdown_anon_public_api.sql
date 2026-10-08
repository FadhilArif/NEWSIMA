-- NEWSIMA is authenticated-only. Anonymous browser access only needs
-- Supabase Auth/Edge Function entry points, not direct public tables/RPCs.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke all on function public.add_penggunaan_dana(uuid,bigint,date,text) from anon;
grant execute on function public.add_penggunaan_dana(uuid,bigint,date,text) to authenticated;

revoke all on function public.transition_proker(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_proker(uuid,text,text,bigint) to authenticated;

revoke all on function public.transition_ukm_proker(uuid,text,text,bigint) from public,anon;
grant execute on function public.transition_ukm_proker(uuid,text,text,bigint) to authenticated;
