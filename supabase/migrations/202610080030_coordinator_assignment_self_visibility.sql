-- Assigned coordinators may read only their own effective active assignment.
-- This is required for the coordinator inbox and the proker/dokumen RLS predicates.
drop policy if exists coordinator_select_assignee on public.penugasan_koordinator;
create policy coordinator_select_assignee
on public.penugasan_koordinator
for select
to authenticated
using (
  akun_id = (select auth.uid())
  and status = 'aktif'
  and (mulai_pada is null or mulai_pada <= current_date)
  and (berakhir_pada is null or berakhir_pada >= current_date)
);
