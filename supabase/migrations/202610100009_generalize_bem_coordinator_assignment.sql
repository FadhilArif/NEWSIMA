-- Atomic, server-validated coordinator assignment for HMJ, UKM, and UKM Minat Bakat under BEM.
CREATE OR REPLACE FUNCTION public.assign_bem_coordinator(
  p_organization_id uuid,
  p_account_id uuid,
  p_actor_id uuid
)
RETURNS public.penugasan_koordinator
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_child public.organisasi%ROWTYPE;
  v_assignment public.penugasan_koordinator%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_account_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_COORDINATOR_ASSIGNMENT';
  END IF;

  SELECT * INTO v_child
  FROM public.organisasi
  WHERE id = p_organization_id;

  IF NOT FOUND OR v_child.tipe NOT IN ('HMJ'::public.tipe_org, 'UKM'::public.tipe_org, 'CLUB'::public.tipe_org)
     OR v_child.induk_organisasi_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CHILD_ORGANIZATION';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organisasi parent
    JOIN public.keanggotaan membership ON membership.organisasi_id = parent.id
    JOIN public.jabatan_organisasi position ON position.id = membership.jabatan_id
    JOIN public.profiles profile ON profile.id = membership.akun_id AND profile.aktif = true
    WHERE parent.id = v_child.induk_organisasi_id
      AND parent.tipe = 'BEM'::public.tipe_org
      AND membership.akun_id = p_actor_id
      AND membership.status = 'aktif'
      AND position.kode = 'presiden'
      AND position.aktif = true
  ) THEN
    RAISE EXCEPTION 'ONLY_BEM_PRESIDENT_CAN_APPOINT_COORDINATOR';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.keanggotaan membership
    JOIN public.profiles profile ON profile.id = membership.akun_id AND profile.aktif = true
    WHERE membership.organisasi_id = v_child.induk_organisasi_id
      AND membership.akun_id = p_account_id
      AND membership.status = 'aktif'
  ) THEN
    RAISE EXCEPTION 'COORDINATOR_MUST_BE_ACTIVE_BEM_MEMBER';
  END IF;

  UPDATE public.penugasan_koordinator
  SET status = 'dicabut',
      berakhir_pada = COALESCE(berakhir_pada, CURRENT_DATE)
  WHERE organisasi_id = p_organization_id
    AND status = 'aktif';

  INSERT INTO public.penugasan_koordinator (
    organisasi_id, akun_id, status, ditunjuk_oleh, ditunjuk_pada, mulai_pada
  )
  VALUES (
    p_organization_id, p_account_id, 'aktif', p_actor_id, now(), CURRENT_DATE
  )
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_bem_coordinator(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_bem_coordinator(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assign_bem_coordinator(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_bem_coordinator(uuid, uuid, uuid) TO service_role;
