-- Replace recursive approval-history SELECT policies with one direct, SECURITY DEFINER permission check.
-- This avoids re-evaluating the full dokumen RLS tree for every persetujuan row.
CREATE OR REPLACE FUNCTION private.can_read_approval_history(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dokumen d
    JOIN public.proker p ON p.id = d.proker_id
    WHERE d.id = p_document_id
      AND (
        private.is_admin_or_rektor()
        OR p.dibuat_oleh = (SELECT auth.uid())
        OR d.uploaded_by = (SELECT auth.uid())
        OR private.is_joined_collaborator(p.id)
        OR (
          (SELECT me.peran FROM public.profiles me WHERE me.id = (SELECT auth.uid()))
            IS DISTINCT FROM 'pembimbing'::public.peran_akun
          AND d.organisasi_id IN (SELECT private.user_org_ids())
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles me
            WHERE me.id = (SELECT auth.uid())
              AND me.peran = 'pembimbing'::public.peran_akun
              AND me.aktif = true
          )
          AND private.is_hmj_pembimbing(p.organisasi_id)
        )
        OR (
          p.review_stage IN ('bem', 'bem_from_wakil_rektor', 'bem_lpj')
          AND private.has_bem_review_permission_for_hmj(p.organisasi_id, 'dokumen.review')
        )
        OR (
          p.review_stage IN ('ukm_koordinator', 'ukm_koordinator_lpj')
          AND EXISTS (
            SELECT 1
            FROM public.penugasan_koordinator pc
            WHERE pc.organisasi_id = p.organisasi_id
              AND pc.akun_id = (SELECT auth.uid())
              AND pc.status = 'aktif'
          )
        )
        OR (
          p.review_stage IN (
            'koordinator_hmj','koordinator_ukm',
            'koordinator_hmj_lpj','koordinator_ukm_lpj',
            'koordinator_hmj_revisi','koordinator_ukm_revisi',
            'koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi'
          )
          AND EXISTS (
            SELECT 1
            FROM public.penugasan_koordinator pc
            JOIN public.organisasi child ON child.id = pc.organisasi_id
            JOIN public.keanggotaan parent_member
              ON parent_member.organisasi_id = child.induk_organisasi_id
             AND parent_member.akun_id = pc.akun_id
             AND parent_member.status = 'aktif'
            JOIN public.profiles coordinator
              ON coordinator.id = pc.akun_id AND coordinator.aktif = true
            WHERE pc.organisasi_id = p.organisasi_id
              AND pc.akun_id = (SELECT auth.uid())
              AND pc.status = 'aktif'
              AND (pc.mulai_pada IS NULL OR pc.mulai_pada <= CURRENT_DATE)
              AND (pc.berakhir_pada IS NULL OR pc.berakhir_pada >= CURRENT_DATE)
          )
        )
        OR (
          p.review_stage IN (
            'ukm_presiden_bem','ukm_presiden_bem_lpj',
            'presiden_bem_hmj','presiden_bem_ukm',
            'presiden_bem_hmj_lpj','presiden_bem_ukm_lpj'
          )
          AND EXISTS (
            SELECT 1
            FROM public.organisasi child
            JOIN public.keanggotaan k ON k.organisasi_id = child.induk_organisasi_id
            JOIN public.jabatan_organisasi j ON j.id = k.jabatan_id
            JOIN public.profiles president ON president.id = k.akun_id AND president.aktif = true
            WHERE child.id = p.organisasi_id
              AND child.tipe IN ('HMJ'::public.tipe_org, 'UKM'::public.tipe_org, 'CLUB'::public.tipe_org)
              AND k.akun_id = (SELECT auth.uid())
              AND k.status = 'aktif'
              AND j.kode = 'presiden'
              AND j.aktif = true
          )
        )
        OR (
          private.is_active_dekan()
          AND p.review_stage IN ('dekan_hmj', 'dekan_hmj_lpj')
          AND EXISTS (
            SELECT 1 FROM public.organisasi child
            WHERE child.id = p.organisasi_id AND child.tipe = 'HMJ'::public.tipe_org
          )
        )
        OR (
          p.review_stage IN (
            'hmj_lanjut_kaprodi','kaprodi_hmj','hmj_lanjut_dekan',
            'dekan_hmj','hmj_lanjut_wakil_rektor','wakil_rektor_hmj',
            'hmj_lanjut_kaprodi_lpj','kaprodi_hmj_lpj','hmj_lanjut_dekan_lpj',
            'dekan_hmj_lpj','hmj_lanjut_wakil_rektor_lpj','wakil_rektor_hmj_lpj'
          )
          AND EXISTS (
            SELECT 1
            FROM public.organisasi child
            JOIN public.keanggotaan parent_member
              ON parent_member.organisasi_id = child.induk_organisasi_id
            WHERE child.id = p.organisasi_id
              AND child.tipe = 'HMJ'::public.tipe_org
              AND parent_member.akun_id = (SELECT auth.uid())
              AND parent_member.status = 'aktif'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.organisasi child
          JOIN public.keanggotaan parent_member
            ON parent_member.organisasi_id = child.induk_organisasi_id
          WHERE child.id = p.organisasi_id
            AND child.tipe IN ('UKM'::public.tipe_org, 'CLUB'::public.tipe_org)
            AND parent_member.akun_id = (SELECT auth.uid())
            AND parent_member.status = 'aktif'
            AND (
              (p.status = 'proposal_diajukan' AND p.review_stage = 'wakil_rektor_ukm')
              OR (p.status = 'lpj_diajukan' AND p.review_stage = 'wakil_rektor_ukm_lpj')
              OR (
                p.review_stage IS NULL
                AND p.status IN ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip')
              )
            )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_approval_history(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_approval_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_read_approval_history(uuid) TO authenticated;

DROP POLICY IF EXISTS persetujuan_select_access ON public.persetujuan;
DROP POLICY IF EXISTS persetujuan_select_owner ON public.persetujuan;
DROP POLICY IF EXISTS persetujuan_select_via_readable_document ON public.persetujuan;

CREATE POLICY persetujuan_select_optimized
ON public.persetujuan
FOR SELECT
TO authenticated
USING (private.can_read_approval_history(dokumen_id));
