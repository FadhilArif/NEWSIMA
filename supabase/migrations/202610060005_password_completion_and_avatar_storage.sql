create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.profiles set wajib_ganti_sandi=false where id=(select auth.uid());
  return found;
end;
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

insert into storage.buckets(id,name,public)
values('avatars','avatars',true)
on conflict(id) do update set public=true;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
for select to public using(bucket_id='avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
for update to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
for delete to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
