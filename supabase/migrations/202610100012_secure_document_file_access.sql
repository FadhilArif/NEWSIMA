-- Keep document reads aligned with the same reviewer/owner checks as approval history.
-- Tighten upload and metadata-write paths so review permission never implies upload permission.

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
      AND private.can_read_approval_history(d.id)
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_document_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_document_path(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_proker_document(
  p_proker_id uuid,
  p_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.proker p
    WHERE p.id = p_proker_id
      AND EXISTS (
        SELECT 1
        FROM public.profiles me
        WHERE me.id = (SELECT auth.uid())
          AND me.aktif = true
      )
      AND (
        private.is_admin()
        OR (
          NOT private.is_wakil_rektor()
          AND p.organisasi_id IN (SELECT private.user_org_ids())
          AND (
            private.has_org_permission(p.organisasi_id, 'proker.create')
            OR private.has_org_permission(p.organisasi_id, 'proker.edit')
          )
          AND (
            (
              lower(coalesce(p_kind, '')) = 'proposal'
              AND p.status IN ('direncanakan', 'revisi')
            )
            OR (
              lower(coalesce(p_kind, '')) IN ('laporan_akhir', 'lpj')
              AND p.status = 'selesai'
              AND p.review_stage IS NULL
            )
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_manage_proker_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_proker_document(uuid, text) TO authenticated;

-- A signed URL can only be issued when the current identity is allowed to read
-- the associated document row. The SECURITY DEFINER helper avoids relying on
-- a nested RLS subquery inside Storage's policy.
DROP POLICY IF EXISTS documents_select_via_authorized_document ON storage.objects;
CREATE POLICY documents_select_via_authorized_document
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND private.can_read_document_path(name)
);

-- Upload requires a writable proker permission in the same organization,
-- matching the object path, and a stage where that document type is editable.
-- Parent-organization reviewers (including BEM President for an HMJ) do not qualify.
DROP POLICY IF EXISTS documents_insert_member ON storage.objects;
CREATE POLICY documents_insert_member
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.proker p
    WHERE p.id::text = split_part(name, '/', 2)
      AND p.organisasi_id::text = split_part(name, '/', 1)
      AND split_part(name, '/', 3) IN ('proposal', 'laporan_akhir', 'lpj')
      AND private.can_manage_proker_document(p.id, split_part(name, '/', 3))
  )
);

-- Metadata changes obey the same owner/stage rules as the binary upload.
DROP POLICY IF EXISTS dokumen_insert_authorized ON public.dokumen;
CREATE POLICY dokumen_insert_authorized
ON public.dokumen
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proker p
    WHERE p.id = dokumen.proker_id
      AND p.organisasi_id = dokumen.organisasi_id
      AND split_part(dokumen.file_path, '/', 1) = p.organisasi_id::text
      AND split_part(dokumen.file_path, '/', 2) = p.id::text
      AND (
        split_part(dokumen.file_path, '/', 3) = dokumen.jenis::text
        OR (
          dokumen.jenis::text = 'lpj'
          AND split_part(dokumen.file_path, '/', 3) = 'laporan_akhir'
        )
      )
      AND private.can_manage_proker_document(p.id, dokumen.jenis::text)
  )
);

DROP POLICY IF EXISTS dokumen_update_authorized ON public.dokumen;
CREATE POLICY dokumen_update_authorized
ON public.dokumen
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.proker p
    WHERE p.id = dokumen.proker_id
      AND p.organisasi_id = dokumen.organisasi_id
      AND split_part(dokumen.file_path, '/', 1) = p.organisasi_id::text
      AND split_part(dokumen.file_path, '/', 2) = p.id::text
      AND (
        split_part(dokumen.file_path, '/', 3) = dokumen.jenis::text
        OR (
          dokumen.jenis::text = 'lpj'
          AND split_part(dokumen.file_path, '/', 3) = 'laporan_akhir'
        )
      )
      AND private.can_manage_proker_document(p.id, dokumen.jenis::text)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.proker p
    WHERE p.id = dokumen.proker_id
      AND p.organisasi_id = dokumen.organisasi_id
      AND split_part(dokumen.file_path, '/', 1) = p.organisasi_id::text
      AND split_part(dokumen.file_path, '/', 2) = p.id::text
      AND (
        split_part(dokumen.file_path, '/', 3) = dokumen.jenis::text
        OR (
          dokumen.jenis::text = 'lpj'
          AND split_part(dokumen.file_path, '/', 3) = 'laporan_akhir'
        )
      )
      AND private.can_manage_proker_document(p.id, dokumen.jenis::text)
  )
);
