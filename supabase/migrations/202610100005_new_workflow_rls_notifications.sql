-- Stage-based access for the new BEM/UKM/HMJ workflow and matching notifications.
-- Existing policies remain in place for the old workflow while main is still in use.

drop policy if exists proker_select_new_workflow_reviewers on public.proker;
create policy proker_select_new_workflow_reviewers
on public.proker for select to authenticated
using (
  -- Only the assigned BEM coordinator can see the first/revision-return stage.
  exists (
    select 1
    from public.penugasan_koordinator pc
    join public.organisasi child on child.id=pc.organisasi_id
    join public.keanggotaan parent_member
      on parent_member.organisasi_id=child.induk_organisasi_id
     and parent_member.akun_id=pc.akun_id
     and parent_member.status='aktif'
    where pc.organisasi_id=proker.organisasi_id
      and pc.akun_id=(select auth.uid())
      and pc.status='aktif'
      and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
      and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
      and proker.review_stage in (
        'koordinator_hmj','koordinator_ukm',
        'koordinator_hmj_lpj','koordinator_ukm_lpj',
        'koordinator_hmj_revisi','koordinator_ukm_revisi',
        'koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi'
      )
  )
  or
  -- Only the active President of the parent BEM sees the President stage.
  exists (
    select 1
    from public.organisasi child
    join public.keanggotaan k on k.organisasi_id=child.induk_organisasi_id
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
    where child.id=proker.organisasi_id
      and child.tipe in ('HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org)
      and k.akun_id=(select auth.uid())
      and k.status='aktif' and j.kode='presiden' and j.aktif=true
      and proker.review_stage in ('presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj')
  )
  or
  -- Kaprodi can read only the HMJ review stage they are explicitly assigned to.
  exists (
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.unit_kerja u on u.id=k.unit_id
    join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
    where k.organisasi_id=proker.organisasi_id
      and k.akun_id=(select auth.uid()) and k.status='aktif'
      and profile.peran::text='kaprodi'
      and j.kode='kaprodi' and j.aktif=true
      and u.organisasi_id=k.organisasi_id and u.jenis='program_studi'
      and proker.review_stage in ('kaprodi_hmj','kaprodi_hmj_lpj')
  )
  or
  -- Dean is a review-only actor, scoped to assigned HMJ.
  exists (
    select 1
    from public.keanggotaan k
    join public.jabatan_organisasi j on j.id=k.jabatan_id
    join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
    where k.organisasi_id=proker.organisasi_id
      and k.akun_id=(select auth.uid()) and k.status='aktif'
      and profile.peran::text='dekan'
      and j.kode='dekan' and j.aktif=true
      and proker.review_stage in ('dekan_hmj','dekan_hmj_lpj')
  )
  or
  private.is_wakil_rektor()
  and proker.review_stage in (
    'wakil_rektor','wakil_rektor_lpj',
    'wakil_rektor_ukm','wakil_rektor_hmj',
    'wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'
  )
  or
  -- After President BEM approves an UKM/UKM Minat Bakat item, active members
  -- of the parent BEM can see it read-only while it is at WR1 and afterwards.
  exists (
    select 1
    from public.organisasi child
    join public.keanggotaan k on k.organisasi_id=child.induk_organisasi_id
    where child.id=proker.organisasi_id
      and child.tipe in ('UKM'::public.tipe_org,'CLUB'::public.tipe_org)
      and k.akun_id=(select auth.uid()) and k.status='aktif'
      and (
        (proker.status='proposal_diajukan' and proker.review_stage='wakil_rektor_ukm')
        or (proker.status='lpj_diajukan' and proker.review_stage='wakil_rektor_ukm_lpj')
        or (
          proker.review_stage is null
          and proker.status in ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip')
        )
      )
  )
);

drop policy if exists dokumen_select_new_workflow_reviewers on public.dokumen;
create policy dokumen_select_new_workflow_reviewers
on public.dokumen for select to authenticated
using (
  exists (
    select 1 from public.proker p
    where p.id=dokumen.proker_id
      and (
        exists (
          select 1
          from public.penugasan_koordinator pc
          join public.organisasi child on child.id=pc.organisasi_id
          join public.keanggotaan parent_member
            on parent_member.organisasi_id=child.induk_organisasi_id
           and parent_member.akun_id=pc.akun_id and parent_member.status='aktif'
          where pc.organisasi_id=p.organisasi_id
            and pc.akun_id=(select auth.uid()) and pc.status='aktif'
            and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
            and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
            and p.review_stage in (
              'koordinator_hmj','koordinator_ukm',
              'koordinator_hmj_lpj','koordinator_ukm_lpj',
              'koordinator_hmj_revisi','koordinator_ukm_revisi',
              'koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi'
            )
        )
        or exists (
          select 1
          from public.organisasi child
          join public.keanggotaan k on k.organisasi_id=child.induk_organisasi_id
          join public.jabatan_organisasi j on j.id=k.jabatan_id
          join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
          where child.id=p.organisasi_id
            and child.tipe in ('HMJ'::public.tipe_org,'UKM'::public.tipe_org,'CLUB'::public.tipe_org)
            and k.akun_id=(select auth.uid()) and k.status='aktif'
            and j.kode='presiden' and j.aktif=true
            and p.review_stage in ('presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj')
        )
        or exists (
          select 1
          from public.keanggotaan k
          join public.jabatan_organisasi j on j.id=k.jabatan_id
          join public.unit_kerja u on u.id=k.unit_id
          join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
          where k.organisasi_id=p.organisasi_id and k.akun_id=(select auth.uid()) and k.status='aktif'
            and profile.peran::text='kaprodi' and j.kode='kaprodi' and j.aktif=true
            and u.organisasi_id=k.organisasi_id and u.jenis='program_studi'
            and p.review_stage in ('kaprodi_hmj','kaprodi_hmj_lpj')
        )
        or exists (
          select 1
          from public.keanggotaan k
          join public.jabatan_organisasi j on j.id=k.jabatan_id
          join public.profiles profile on profile.id=k.akun_id and profile.aktif=true
          where k.organisasi_id=p.organisasi_id and k.akun_id=(select auth.uid()) and k.status='aktif'
            and profile.peran::text='dekan' and j.kode='dekan' and j.aktif=true
            and p.review_stage in ('dekan_hmj','dekan_hmj_lpj')
        )
        or (private.is_wakil_rektor() and p.review_stage in (
          'wakil_rektor','wakil_rektor_lpj',
          'wakil_rektor_ukm','wakil_rektor_hmj',
          'wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'
        ))
        or exists (
          select 1 from public.organisasi child
          join public.keanggotaan k on k.organisasi_id=child.induk_organisasi_id
          where child.id=p.organisasi_id and child.tipe in ('UKM'::public.tipe_org,'CLUB'::public.tipe_org)
            and k.akun_id=(select auth.uid()) and k.status='aktif'
            and (
              (p.status='proposal_diajukan' and p.review_stage='wakil_rektor_ukm')
              or (p.status='lpj_diajukan' and p.review_stage='wakil_rektor_ukm_lpj')
              or (p.review_stage is null and p.status in ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip'))
            )
        )
      )
  )
);

create or replace function private.notify_new_workflow_stage()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_org public.organisasi%rowtype;
  v_stage text;
  v_message text;
  v_targets uuid[] := array[]::uuid[];
  v_id uuid;
begin
  if tg_op='UPDATE' then
    if old.status is not distinct from new.status and old.review_stage is not distinct from new.review_stage then return new; end if;
    if new.review_stage is null and old.review_stage is not null
       and new.status in ('revisi','selesai','disetujui','lpj_disetujui') then
      v_message:=case
        when new.status='revisi' then 'Program kerja "'||coalesce(new.nama,'program kerja')||'" perlu direvisi dan dikirim ulang.'
        when new.status='selesai' then 'Program kerja "'||coalesce(new.nama,'program kerja')||'" selesai dilaksanakan.'
        else 'Program kerja "'||coalesce(new.nama,'program kerja')||'" telah mendapat keputusan akhir.'
      end;
      if new.dibuat_oleh is not null and new.dibuat_oleh is distinct from auth.uid()
         and not exists(select 1 from public.notifikasi n where n.akun_id=new.dibuat_oleh and n.organisasi_id=new.organisasi_id and n.tautan='review:'||new.id::text and n.pesan=v_message) then
        insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
        values(new.dibuat_oleh,new.organisasi_id,v_message,'review:'||new.id::text);
      end if;
      return new;
    end if;
    v_stage:=new.review_stage;
  else
    v_stage:=new.review_stage;
  end if;

  if v_stage is null then return new; end if;
  if v_stage not in (
    'koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj',
    'koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi',
    'presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj',
    'hmj_lanjut_kaprodi','hmj_lanjut_kaprodi_lpj','kaprodi_hmj','kaprodi_hmj_lpj',
    'hmj_lanjut_dekan','hmj_lanjut_dekan_lpj','dekan_hmj','dekan_hmj_lpj',
    'hmj_lanjut_wakil_rektor','hmj_lanjut_wakil_rektor_lpj',
    'wakil_rektor_ukm','wakil_rektor_hmj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'
  ) then return new; end if;

  select * into v_org from public.organisasi where id=new.organisasi_id;
  if not found then return new; end if;

  -- BEM direct submissions already use the established WR1 trigger, so don't duplicate it.
  if v_org.tipe='BEM'::public.tipe_org and v_stage in ('wakil_rektor','wakil_rektor_lpj') then return new; end if;

  if v_stage in ('koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj',
                 'koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi') then
    v_targets:=coalesce((
      select array_agg(distinct pc.akun_id)
      from public.penugasan_koordinator pc
      where pc.organisasi_id=new.organisasi_id and pc.status='aktif'
        and (pc.mulai_pada is null or pc.mulai_pada<=current_date)
        and (pc.berakhir_pada is null or pc.berakhir_pada>=current_date)
    ),array[]::uuid[]);
    v_message:=case when v_stage like '%lpj%' then 'LPJ "' else 'Proposal "' end||coalesce(new.nama,'program kerja')||'" menunggu tindakan Koordinator BEM.';
  elsif v_stage in ('presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj') then
    v_targets:=coalesce((
      select array_agg(distinct k.akun_id)
      from public.keanggotaan k join public.jabatan_organisasi j on j.id=k.jabatan_id
      where k.organisasi_id=v_org.induk_organisasi_id and k.status='aktif' and j.kode='presiden' and j.aktif=true
    ),array[]::uuid[]);
    v_message:=case when v_stage like '%lpj%' then 'LPJ "' else 'Proposal "' end||coalesce(new.nama,'program kerja')||'" menunggu keputusan Presiden BEM.';
  elsif v_stage in ('kaprodi_hmj','kaprodi_hmj_lpj') then
    v_targets:=coalesce((
      select array_agg(distinct k.akun_id)
      from public.keanggotaan k join public.jabatan_organisasi j on j.id=k.jabatan_id
      join public.profiles p on p.id=k.akun_id and p.aktif=true
      join public.unit_kerja u on u.id=k.unit_id and u.organisasi_id=k.organisasi_id and u.jenis='program_studi'
      where k.organisasi_id=new.organisasi_id and k.status='aktif' and p.peran::text='kaprodi' and j.kode='kaprodi' and j.aktif=true
    ),array[]::uuid[]);
    v_message:=case when v_stage like '%lpj%' then 'LPJ "' else 'Proposal "' end||coalesce(new.nama,'program kerja')||'" menunggu review Kaprodi.';
  elsif v_stage in ('dekan_hmj','dekan_hmj_lpj') then
    v_targets:=coalesce((
      select array_agg(distinct k.akun_id)
      from public.keanggotaan k join public.jabatan_organisasi j on j.id=k.jabatan_id
      join public.profiles p on p.id=k.akun_id and p.aktif=true
      where k.organisasi_id=new.organisasi_id and k.status='aktif' and p.peran::text='dekan' and j.kode='dekan' and j.aktif=true
    ),array[]::uuid[]);
    v_message:=case when v_stage like '%lpj%' then 'LPJ "' else 'Proposal "' end||coalesce(new.nama,'program kerja')||'" menunggu review Dekan Fakultas.';
  elsif v_stage in ('hmj_lanjut_kaprodi','hmj_lanjut_dekan','hmj_lanjut_wakil_rektor',
                    'hmj_lanjut_kaprodi_lpj','hmj_lanjut_dekan_lpj','hmj_lanjut_wakil_rektor_lpj') then
    v_targets:=coalesce((
      select array_agg(distinct k.akun_id)
      from public.keanggotaan k join public.hak_akses_jabatan h on h.jabatan_id=k.jabatan_id and h.kode='proker.edit'
      where k.organisasi_id=new.organisasi_id and k.status='aktif'
    ),array[]::uuid[]);
    v_message:='Program kerja "'||coalesce(new.nama,'program kerja')||'" menunggu tindakan pengurus HMJ.';
  elsif v_stage in ('wakil_rektor_ukm','wakil_rektor_hmj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj') then
    v_targets:=coalesce((
      select array_agg(distinct p.id) from public.profiles p
      where p.aktif=true and p.peran::text='wakil_rektor'
    ),array[]::uuid[]);
    v_message:=case when v_stage like '%lpj%' then 'LPJ "' else 'Proposal "' end||coalesce(new.nama,'program kerja')||'" menunggu persetujuan Wakil Rektor 1.';
  end if;

  foreach v_id in array coalesce(v_targets,array[]::uuid[]) loop
    if v_id is not null and v_id is distinct from auth.uid() and not exists(
      select 1 from public.notifikasi n
      where n.akun_id=v_id and n.organisasi_id=new.organisasi_id
        and n.tautan='review:'||new.id::text and n.pesan=v_message
    ) then
      insert into public.notifikasi(akun_id,organisasi_id,pesan,tautan)
      values(v_id,new.organisasi_id,v_message,'review:'||new.id::text);
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function private.notify_new_workflow_stage() from public,anon,authenticated;

drop trigger if exists trg_notify_new_workflow_stage on public.proker;
create trigger trg_notify_new_workflow_stage
after insert or update of status,review_stage on public.proker
for each row execute function private.notify_new_workflow_stage();

-- Keep the legacy trigger active for old workflows, but bypass it for the new
-- distinct stage names to prevent outdated/duplicate reviewer notifications.
drop trigger if exists trg_notify_proker_workflow on public.proker;
create trigger trg_notify_proker_workflow
after insert or update of status,review_stage on public.proker
for each row
when (
  new.review_stage is null
  or new.review_stage not in (
    'koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj',
    'koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi',
    'presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj',
    'hmj_lanjut_kaprodi','hmj_lanjut_kaprodi_lpj','kaprodi_hmj','kaprodi_hmj_lpj',
    'hmj_lanjut_dekan','hmj_lanjut_dekan_lpj','dekan_hmj','dekan_hmj_lpj',
    'hmj_lanjut_wakil_rektor','hmj_lanjut_wakil_rektor_lpj',
    'wakil_rektor_ukm','wakil_rektor_hmj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'
  )
)
execute function private.notify_proker_workflow();


-- Parent BEM members may view HMJ proposal/LPJ only from the point the
-- President BEM has approved it and returned it to HMJ, plus later stages.
drop policy if exists proker_select_hmj_parent_bem_after_president on public.proker;
create policy proker_select_hmj_parent_bem_after_president
on public.proker
for select
to authenticated
using (
  exists (
    select 1
    from public.organisasi hmj
    join public.keanggotaan k on k.organisasi_id = hmj.induk_organisasi_id
    where hmj.id = proker.organisasi_id
      and hmj.tipe = 'HMJ'::public.tipe_org
      and k.akun_id = (select auth.uid())
      and k.status = 'aktif'
      and (
        (proker.status = 'proposal_diajukan' and proker.review_stage in
          ('hmj_lanjut_kaprodi','kaprodi_hmj','hmj_lanjut_dekan','dekan_hmj','hmj_lanjut_wakil_rektor','wakil_rektor_hmj'))
        or
        (proker.status = 'lpj_diajukan' and proker.review_stage in
          ('hmj_lanjut_kaprodi_lpj','kaprodi_hmj_lpj','hmj_lanjut_dekan_lpj','dekan_hmj_lpj','hmj_lanjut_wakil_rektor_lpj','wakil_rektor_hmj_lpj'))
        or
        (proker.review_stage is null and proker.status in
          ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip'))
      )
  )
);

drop policy if exists dokumen_select_hmj_parent_bem_after_president on public.dokumen;
create policy dokumen_select_hmj_parent_bem_after_president
on public.dokumen
for select
to authenticated
using (
  exists (
    select 1
    from public.proker p
    join public.organisasi hmj on hmj.id = p.organisasi_id
    join public.keanggotaan k on k.organisasi_id = hmj.induk_organisasi_id
    where p.id = dokumen.proker_id
      and hmj.tipe = 'HMJ'::public.tipe_org
      and k.akun_id = (select auth.uid())
      and k.status = 'aktif'
      and (
        (p.status = 'proposal_diajukan' and p.review_stage in
          ('hmj_lanjut_kaprodi','kaprodi_hmj','hmj_lanjut_dekan','dekan_hmj','hmj_lanjut_wakil_rektor','wakil_rektor_hmj'))
        or
        (p.status = 'lpj_diajukan' and p.review_stage in
          ('hmj_lanjut_kaprodi_lpj','kaprodi_hmj_lpj','hmj_lanjut_dekan_lpj','dekan_hmj_lpj','hmj_lanjut_wakil_rektor_lpj','wakil_rektor_hmj_lpj'))
        or
        (p.review_stage is null and p.status in
          ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip'))
      )
  )
);
