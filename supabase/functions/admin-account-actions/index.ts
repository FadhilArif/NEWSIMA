import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra },
  });
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

const url = Deno.env.get("SUPABASE_URL") || "";
const publishable = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secret = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const authClient = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getCaller(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function ensureAdmin(userId: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id,peran,aktif")
    .eq("id", userId)
    .single();

  return !error && data?.peran === "admin" && data?.aktif === true;
}

async function countAdmins() {
  const { count, error } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("peran", "admin")
    .eq("aktif", true);
  return error ? null : (count ?? 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "UNAUTHORIZED" }, 401);
  if (!(await ensureAdmin(caller.id))) return json({ error: "FORBIDDEN" }, 403);

  let body: { action?: string; target_user_id?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const action = String(body.action || "");
  const targetId = String(body.target_user_id || "").trim();

  if (!targetId) return json({ error: "TARGET_REQUIRED" }, 400);
  if (targetId === caller.id) return json({ error: "SELF_ACTION_NOT_ALLOWED" }, 400);

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("id,nama,email,peran,aktif")
    .eq("id", targetId)
    .single();

  if (targetError || !target) return json({ error: "ACCOUNT_NOT_FOUND" }, 404);

  if ((action === "delete" || action === "deactivate") && target.peran === "admin") {
    const adminCount = await countAdmins();
    if (adminCount === null) return json({ error: "ADMIN_COUNT_FAILED" }, 500);
    if (adminCount <= 1) return json({ error: "CANNOT_REMOVE_LAST_ADMIN" }, 409);
  }

  if (action === "reset_password") {
    const temporaryPassword = randomPassword();

    const { error: authError } = await adminClient.auth.admin.updateUserById(targetId, {
      password: temporaryPassword,
      ban_duration: "none",
    });

    if (authError) return json({ error: "PASSWORD_RESET_FAILED", detail: authError.message }, 500);

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ aktif: true, wajib_ganti_sandi: true })
      .eq("id", targetId);

    if (profileError) return json({ error: "PROFILE_UPDATE_FAILED" }, 500);

    try {
      await adminClient.auth.admin.signOut(targetId, "global");
    } catch (_) {}

    return json({
      ok: true,
      action: "reset_password",
      target_user_id: targetId,
      temporary_password: temporaryPassword,
      message: "Password sementara baru dibuat. Password lama tidak dapat dibaca kembali.",
    });
  }

  if (action === "deactivate") {
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ aktif: false })
      .eq("id", targetId);

    if (profileError) return json({ error: "DEACTIVATE_FAILED" }, 500);

    const { error: authError } = await adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: "876000h",
    });

    if (authError) {
      await adminClient.from("profiles").update({ aktif: true }).eq("id", targetId);
      return json({ error: "AUTH_DISABLE_FAILED", detail: authError.message }, 500);
    }

    try {
      await adminClient.auth.admin.signOut(targetId, "global");
    } catch (_) {}

    return json({ ok: true, action: "deactivate", target_user_id: targetId });
  }

  if (action === "activate") {
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ aktif: true })
      .eq("id", targetId);

    if (profileError) return json({ error: "ACTIVATE_FAILED" }, 500);

    const { error: authError } = await adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: "none",
    });

    if (authError) {
      await adminClient.from("profiles").update({ aktif: false }).eq("id", targetId);
      return json({ error: "AUTH_ENABLE_FAILED", detail: authError.message }, 500);
    }

    return json({ ok: true, action: "activate", target_user_id: targetId });
  }

  if (action === "delete") {
    // Preserve business/audit history while removing identity and access.
    // Nullable actor references are cleared; non-null account memberships and
    // notifications are removed because they cannot survive the auth identity.
    await Promise.all([
      adminClient.from("anggota_non_akun").update({ dibuat_oleh: null }).eq("dibuat_oleh", targetId),
      adminClient.from("dokumen_versi").update({ diunggah_oleh: null }).eq("diunggah_oleh", targetId),
      adminClient.from("foto_kegiatan").update({ diunggah_oleh: null }).eq("diunggah_oleh", targetId),
      adminClient.from("organisasi_relasi").update({ dibuat_oleh: null }).eq("dibuat_oleh", targetId),
      adminClient.from("pencairan_dana").update({ dicatat_oleh: null }).eq("dicatat_oleh", targetId),
      adminClient.from("persetujuan").update({ oleh: null }).eq("oleh", targetId),
      adminClient.from("plafon_anggaran").update({ diinput_oleh: null }).eq("diinput_oleh", targetId),
      adminClient.from("proker").update({ dibuat_oleh: null }).eq("dibuat_oleh", targetId),
      adminClient.from("proker_kolaborator").update({ dikonfirmasi_oleh: null }).eq("dikonfirmasi_oleh", targetId),
      adminClient.from("realisasi").update({ diverifikasi_oleh: null }).eq("diverifikasi_oleh", targetId),
      adminClient.from("penugasan_koordinator").update({ ditunjuk_oleh: null }).eq("ditunjuk_oleh", targetId),
    ]);

    const cleanup = await Promise.all([
      adminClient.from("keanggotaan").delete().eq("akun_id", targetId),
      adminClient.from("notifikasi").delete().eq("akun_id", targetId),
      adminClient.from("pembimbing_organisasi").delete().eq("akun_id", targetId),
      adminClient.from("penugasan_koordinator").delete().eq("akun_id", targetId),
    ]);

    const cleanupError = cleanup.find(x => x.error);
    if (cleanupError?.error) {
      return json({ error: "ACCOUNT_REFERENCE_CLEANUP_FAILED", detail: cleanupError.error.message }, 500);
    }

    const { error: authError } = await adminClient.auth.admin.deleteUser(targetId, false);
    if (authError) return json({ error: "ACCOUNT_DELETE_FAILED", detail: authError.message }, 500);

    return json({ ok: true, action: "delete", target_user_id: targetId });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});
