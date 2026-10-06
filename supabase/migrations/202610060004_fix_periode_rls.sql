drop policy if exists periode_select_authenticated on public.periode;
create policy periode_select_authenticated
on public.periode for select
to authenticated using(true);

drop policy if exists periode_admin_write on public.periode;
create policy periode_admin_write
on public.periode for all
to authenticated
using((select private.is_admin_or_rektor()))
with check((select private.is_admin_or_rektor()));