-- Global HMJ directory for active Dekan accounts, plus read-only visibility for assigned
-- BEM coordinators after an HMJ proposal/LPJ has left the coordinator stage.
CREATE OR REPLACE FUNCTION public.get_dekan_hmj_directory()
RETURNS TABLE (
  hmj_id uuid,
  hmj_nama text,
  akun_id uuid,
  nama_anggota text,
  nim text,
  jabatan text,
  unit_kerja text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT
    o.id,
    o.nama,
    member.akun_id,
    member.nama_anggota,
    member.nim,
    member.jabatan,
    member.unit_kerja
  FROM public.organisasi o
  LEFT JOIN LATERAL (
    SELECT
      k.akun_id,
      p.nama AS nama_anggota,
      p.nim,
      COALESCE(j.nama, k.jabatan, 'Anggota') AS jabatan,
      u.nama AS unit_kerja
    FROM public.keanggotaan k
    JOIN public.profiles p
      ON p.id = k.akun_id
     AND p.aktif = true
    LEFT JOIN public.jabatan_organisasi j
      ON j.id = k.jabatan_id
    LEFT JOIN public.unit_kerja u
      ON u.id = COALESCE(k.unit_id, p.unit_kerja_id)
    WHERE k.organisasi_id = o.id
      AND k.status = 'aktif'
    ORDER BY p.nama
  ) AS member ON true
  WHERE o.tipe = 'HMJ'::public.tipe_org
    AND private.is_active_dekan()
  ORDER BY o.nama, member.nama_anggota NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.get_dekan_hmj_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dekan_hmj_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dekan_hmj_directory() TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_assigned_coordinator_followup(p_proker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.proker p
    JOIN public.organisasi child
      ON child.id = p.organisasi_id
     AND child.tipe = 'HMJ'::public.tipe_org
    JOIN public.organisasi parent
      ON parent.id = child.induk_organisasi_id
     AND parent.tipe = 'BEM'::public.tipe_org
    JOIN public.penugasan_koordinator pc
      ON pc.organisasi_id = child.id
     AND pc.akun_id = (SELECT auth.uid())
     AND pc.status = 'aktif'
     AND (pc.mulai_pada IS NULL OR pc.mulai_pada <= CURRENT_DATE)
     AND (pc.berakhir_pada IS NULL OR pc.berakhir_pada >= CURRENT_DATE)
    JOIN public.keanggotaan parent_member
      ON parent_member.organisasi_id = parent.id
     AND parent_member.akun_id = (SELECT auth.uid())
     AND parent_member.status = 'aktif'
    JOIN public.profiles actor
      ON actor.id = (SELECT auth.uid())
     AND actor.aktif = true
    WHERE p.id = p_proker_id
      AND (
        (
          p.status = 'proposal_diajukan'
          AND p.review_stage IN (
            'presiden_bem_hmj',
            'hmj_lanjut_kaprodi','kaprodi_hmj',
            'hmj_lanjut_dekan','dekan_hmj',
            'hmj_lanjut_wakil_rektor','wakil_rektor_hmj'
          )
        )
        OR (
          p.status = 'lpj_diajukan'
          AND p.review_stage IN (
            'presiden_bem_hmj_lpj',
            'hmj_lanjut_kaprodi_lpj','kaprodi_hmj_lpj',
            'hmj_lanjut_dekan_lpj','dekan_hmj_lpj',
            'hmj_lanjut_wakil_rektor_lpj','wakil_rektor_hmj_lpj'
          )
        )
        OR (
          p.review_stage IS NULL
          AND p.status IN ('disetujui','berjalan','selesai','lpj_disetujui','tidak_terlaksana','arsip')
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_read_assigned_coordinator_followup_document(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dokumen d
    WHERE d.id = p_document_id
      AND private.can_read_assigned_coordinator_followup(d.proker_id)
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_assigned_coordinator_followup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_assigned_coordinator_followup(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_read_assigned_coordinator_followup(uuid) TO authenticated;

REVOKE ALL ON FUNCTION private.can_read_assigned_coordinator_followup_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_assigned_coordinator_followup_document(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_read_assigned_coordinator_followup_document(uuid) TO authenticated;

DROP POLICY IF EXISTS proker_select_assigned_coordinator_followup ON public.proker;
CREATE POLICY proker_select_assigned_coordinator_followup
ON public.proker
FOR SELECT TO authenticated
USING (private.can_read_assigned_coordinator_followup(id));

DROP POLICY IF EXISTS dokumen_select_assigned_coordinator_followup ON public.dokumen;
CREATE POLICY dokumen_select_assigned_coordinator_followup
ON public.dokumen
FOR SELECT TO authenticated
USING (private.can_read_assigned_coordinator_followup(proker_id));

DROP POLICY IF EXISTS persetujuan_select_assigned_coordinator_followup ON public.persetujuan;
CREATE POLICY persetujuan_select_assigned_coordinator_followup
ON public.persetujuan
FOR SELECT TO authenticated
USING (private.can_read_assigned_coordinator_followup_document(dokumen_id));
