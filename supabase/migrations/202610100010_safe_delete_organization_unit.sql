-- Safe, admin-only deletion for unused ministry/division units.
CREATE OR REPLACE FUNCTION public.admin_delete_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_unit public.unit_kerja%ROWTYPE;
  v_members bigint;
  v_organizations bigint;
  v_profiles bigint;
  v_proker bigint;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unit
  FROM public.unit_kerja
  WHERE id = p_unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNIT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_unit.jenis NOT IN ('kementerian', 'divisi') THEN
    RAISE EXCEPTION 'UNIT_TYPE_NOT_DELETABLE' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_members FROM public.keanggotaan WHERE unit_id = p_unit_id;
  SELECT count(*) INTO v_organizations FROM public.organisasi WHERE kementerian_id = p_unit_id;
  SELECT count(*) INTO v_profiles FROM public.profiles WHERE unit_kerja_id = p_unit_id;
  SELECT count(*) INTO v_proker FROM public.proker WHERE unit_id = p_unit_id;

  IF v_members > 0 OR v_organizations > 0 OR v_profiles > 0 OR v_proker > 0 THEN
    RAISE EXCEPTION 'UNIT_IN_USE: keanggotaan=%, organisasi=% , profil=%, proker=%',
      v_members, v_organizations, v_profiles, v_proker
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.unit_kerja WHERE id = p_unit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_unit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_unit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_unit(uuid) TO authenticated;
