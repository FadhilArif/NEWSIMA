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
    nim?: string;
    peran?: string;
    organisasi?: string;
    jabatan?: string;
  };

  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const nama = String(body.nama || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const nim = String(body.nim || "").trim();
  const peran = String(body.peran || "mahasiswa").trim();
  const organisasi = String(body.organisasi || "").trim();
  const jabatan = String(body.jabatan || "Anggota").trim();

  if (!nama || !/^\S+@\S+\.\S+$/.test(email) || !nim) {
    return json({ error: "INVALID_INPUT" }, 400);
  }

  if (!["admin","pembimbing","staf_keuangan","mahasiswa","wakil_rektor"].includes(peran)) {
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
    return json({ error: "PROFILE_CREATE_FAILED" }, 500);
  }

  if (organisasi) {
    const { data: org } = await adminClient
      .from("organisasi")
      .select("id")
      .eq("nama", organisasi)
      .single();

    if (org) {
      const { error: membershipError } = await adminClient
        .from("keanggotaan")
        .insert({
          akun_id: userId,
          organisasi_id: org.id,
          jabatan: jabatan || "Anggota",
          status: "aktif",
        });

      if (membershipError) {
        return json({
          ok: true,
          warning: "ACCOUNT_CREATED_MEMBERSHIP_FAILED",
          id: userId,
          temporary_password: temporaryPassword,
        }, 207);
      }
    }
  }

  return json({
    ok: true,
    id: userId,
    temporary_password: temporaryPassword,
  }, 201);
});
