drop policy if exists proker_select_authorized on public.proker;
create policy proker_select_authorized
on public.proker
for select to authenticated
using (
  private.is_admin()
  or private.is_wakil_rektor()
  or (
    private.is_hmj_pembimbing(organisasi_id)
    and exists(
      select 1 from public.profiles me
      where me.id=auth.uid() and me.peran='pembimbing'::public.peran_akun and me.aktif
    )
  )
  or (
    private.has_org_permission(organisasi_id,'proker.view')
    and (select p.peran from public.profiles p where p.id=auth.uid())
      is distinct from 'pembimbing'::public.peran_akun
  )
  or private.is_joined_collaborator(id)
  or (
    review_stage in ('bem','bem_from_wakil_rektor','bem_lpj')
    and private.has_bem_review_permission_for_hmj(organisasi_id,'proker.view')
  )
);