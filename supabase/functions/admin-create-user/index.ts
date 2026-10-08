import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fadhilarif.github.io".replaceAll(" ", ""),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getKey(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default;
    } catch (_) {}
  }
  return Deno.env.get(legacyName) || "";
}

function randomPassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const publishableKey = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const serviceKey = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "UNAUTHORIZED" }, 401);

  const { data: callerData, error: callerError } = await publicClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ error: "UNAUTHORIZED" }, 401);

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("id,peran")
    .eq("id", callerData.user.id)
    .single();

  if (callerProfileError || callerProfile?.peran !== "admin") {
    return json({ error: "FORBIDDEN" }, 403);
  }

  let body: {
    nama?: string;
    email?: string;
    nim?: string | null;
    peran?: string;
    organisasi_id?: string | null;
    jabatan_kode?: string | null;
    unit_id?: string | null;
  };

  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const nama = String(body.nama || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const nimRaw = String(body.nim || "").trim();
  const peran = String(body.peran || "mahasiswa").trim();
  const requiresNim = ["user","mahasiswa"].includes(peran);
  const nim = nimRaw && nimRaw !== "-" ? nimRaw : null;
  const organisasiId = String(body.organisasi_id || "").trim();
  const jabatanKode = String(body.jabatan_kode || "").trim();
  let unitId = String(body.unit_id || "").trim();

  if (!nama || !/^\S+@\S+\.\S+$/.test(email) || (requiresNim && !nim)) {
    return json({ error: "INVALID_INPUT" }, 400);
  }

  if (!["user","admin","pembimbing","staf_keuangan","mahasiswa","wakil_rektor"].includes(peran)) {
    return json({ error: "INVALID_ROLE" }, 400);
  }

  const temporaryPassword = randomPassword();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { nama, nim, peran },
  });

  if (createError || !created.user) {
    return json({ error: "USER_CREATE_FAILED", detail: createError?.message || "" }, 400);
  }

  const userId = created.user.id;

  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      id: userId,
      nama,
      email,
      nim,
      peran,
      wajib_ganti_sandi: true,
    }, { onConflict: "id" });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId);

    if (profileError.code === "23505" && /profiles_nim_key/i.test(profileError.message || "")) {
      return json({
        error: "NIM_ALREADY_USED",
        detail: "NIM tersebut sudah digunakan akun lain. Untuk Pembimbing/non-mahasiswa, kosongkan NIM."
      }, 400);
    }

    return json({ error: "PROFILE_CREATE_FAILED", detail: profileError.message || "" }, 500);
  }

  if (organisasiId || jabatanKode || unitId) {
    if (!organisasiId || !jabatanKode) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: "ORGANIZATION_AND_POSITION_REQUIRED" }, 400);
    }

    const { data: org, error: orgError } = await adminClient
      .from("organisasi")
      .select("id,tipe")
      .eq("id", organisasiId)
      .single();

    if (orgError || !org) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: "ORGANIZATION_NOT_FOUND" }, 400);
    }

    if (peran === "pembimbing") {
      if (org.tipe !== "HMJ" || jabatanKode !== "pembimbing_hmj") {
        await adminClient.auth.admin.deleteUser(userId);
        return json({ error: "PEMBIMBING_MUST_USE_HMJ_POSITION" }, 400);
      }

      const { data: programUnits, error: programUnitsError } = await adminClient
        .from("unit_kerja")
        .select("id,nama,jenis,organisasi_id")
        .eq("organisasi_id", organisasiId)
        .eq("jenis", "program_studi");

      if (programUnitsError) {
        await adminClient.auth.admin.deleteUser(userId);
        return json({ error: "HMJ_PROGRAM_STUDY_LOOKUP_FAILED", detail: programUnitsError.message }, 400);
      }

      if ((programUnits || []).length !== 1) {
        await adminClient.auth.admin.deleteUser(userId);
        return json({
          error: "HMJ_PROGRAM_STUDY_UNIT_NOT_UNIQUE",
          detail: "Setiap HMJ harus memiliki tepat satu unit program studi sebelum akun Pembimbing dibuat."
        }, 400);
      }

      unitId = programUnits[0].id;
    }

    const { data: position, error: positionError } = await adminClient
      .from("jabatan_organisasi")
      .select("id,kode,nama,unit_wajib,cakupan,unit_jenis_wajib,berlaku_tipe")
      .eq("kode", jabatanKode)
      .eq("aktif", true)
      .single();

    if (positionError || !position) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: "POSITION_NOT_FOUND" }, 400);
    }

    if (!Array.isArray(position.berlaku_tipe) || !position.berlaku_tipe.includes(org.tipe)) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: "POSITION_NOT_ALLOWED_FOR_ORGANIZATION_TYPE" }, 400);
    }

    if (position.unit_wajib && !unitId) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({
        error: "REQUIRED_UNIT_FOR_POSITION",
        detail: `Jabatan ${position.nama} membutuhkan unit ${position.unit_jenis_wajib || "yang sesuai"}.`
      }, 400);
    }

    if (unitId) {
      const { data: unit, error: unitError } = await adminClient
        .from("unit_kerja")
        .select("id,organisasi_id,jenis")
        .eq("id", unitId)
        .single();

      if (unitError || !unit || unit.organisasi_id !== organisasiId) {
        await adminClient.auth.admin.deleteUser(userId);
        return json({ error: "UNIT_NOT_IN_ORGANIZATION" }, 400);
      }

      if (position.unit_jenis_wajib && unit.jenis !== position.unit_jenis_wajib) {
        await adminClient.auth.admin.deleteUser(userId);
        return json({
          error: "POSITION_UNIT_TYPE_MISMATCH",
          detail: `Jabatan ${position.nama} membutuhkan unit jenis ${position.unit_jenis_wajib}, bukan ${unit.jenis}.`
        }, 400);
      }
    }

    const { error: profileUnitError } = await adminClient
      .from("profiles")
      .update({ unit_kerja_id: unitId || null })
      .eq("id", userId);

    if (profileUnitError) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({
        error: "PROFILE_UNIT_ASSIGNMENT_FAILED",
        detail: profileUnitError.message || ""
      }, 500);
    }

    const { error: membershipError } = await adminClient
      .from("keanggotaan")
      .insert({
        akun_id: userId,
        organisasi_id: organisasiId,
        unit_id: unitId || null,
        jabatan_id: position.id,
        jabatan: position.nama,
        status: "aktif",
      });

    if (membershipError) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({
        error: "MEMBERSHIP_CREATE_FAILED",
        detail: membershipError.message,
      }, 400);
    }
  }

  return json({
    ok: true,
    id: userId,
    temporary_password: temporaryPassword,
  }, 201);
});
