-- Preserve a Dekan's read-only visibility of HMJ prokers after a recorded
-- successful review/forwarding decision. Active review remains editable only
-- through the existing dekan_hmj/dekan_hmj_lpj stages.

CREATE OR REPLACE FUNCTION private.can_read_dekan_followup(p_proker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.proker p
    JOIN public.organisasi o ON o.id = p.organisasi_id
    WHERE p.id = p_proker_id
      AND o.tipe = 'HMJ'::public.tipe_org
      AND private.is_active_dekan()
      AND EXISTS (
        SELECT 1
        FROM public.dokumen d
        JOIN public.persetujuan a ON a.dokumen_id = d.id
        WHERE d.proker_id = p.id
          AND a.sebagai = 'dekan'
          AND a.keputusan IN ('teruskan', 'setuju', 'approve')
          AND (
            (d.jenis::text = 'proposal' AND a.tahap IN ('dekan', 'dekan_hmj'))
            OR
            (d.jenis::text IN ('laporan_akhir', 'lpj') AND a.tahap IN ('dekan_lpj', 'dekan_hmj_lpj'))
          )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_dekan_followup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_dekan_followup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_dekan_followup_document(p_document_id uuid)
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
      AND private.can_read_dekan_followup(d.proker_id)
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_dekan_followup_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_dekan_followup_document(uuid) TO authenticated;

DROP POLICY IF EXISTS proker_select_global_dekan_followup ON public.proker;
CREATE POLICY proker_select_global_dekan_followup
ON public.proker
FOR SELECT
TO authenticated
USING (private.can_read_dekan_followup(id));

DROP POLICY IF EXISTS dokumen_select_global_dekan_followup ON public.dokumen;
CREATE POLICY dokumen_select_global_dekan_followup
ON public.dokumen
FOR SELECT
TO authenticated
USING (private.can_read_dekan_followup(proker_id));

DROP POLICY IF EXISTS persetujuan_select_global_dekan_followup ON public.persetujuan;
CREATE POLICY persetujuan_select_global_dekan_followup
ON public.persetujuan
FOR SELECT
TO authenticated
USING (private.can_read_dekan_followup_document(dokumen_id));

-- Storage signed URLs check the same read scope, including approved follow-up.
CREATE OR REPLACE FUNCTION private.can_read_document_path(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dokumen d
    WHERE d.file_path = p_path
      AND (
        private.can_read_approval_history(d.id)
        OR private.can_read_dekan_followup(d.proker_id)
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_document_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_document_path(text) TO authenticated;
