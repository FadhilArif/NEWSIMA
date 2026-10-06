import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://fadhilarif.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function key(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default;
    } catch (_) {}
  }
  return Deno.env.get(legacyName) || "";
}

const url = Deno.env.get("SUPABASE_URL") || "";
const publishable = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const authClient = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function caller(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function presidentContext(userId: string, ukmId: string) {
  const { data: ukm, error: ukmError } = await db
    .from("organisasi")
    .select("id,nama,tipe,induk_organisasi_id")
    .eq("id", ukmId)
    .single();

  if (ukmError || !ukm || ukm.tipe !== "UKM" || !ukm.induk_organisasi_id) return null;

  const { data: membership, error } = await db
    .from("keanggotaan")
    .select("id,jabatan_id")
    .eq("akun_id", userId)
    .eq("organisasi_id", ukm.induk_organisasi_id)
    .eq("status", "aktif")
    .limit(20);

  if (error || !membership?.length) return null;

  const ids = membership.map(x => x.jabatan_id).filter(Boolean);
  const { data: positions } = await db
    .from("jabatan_organisasi")
    .select("id,kode")
    .in("id", ids);

  const isPresident = (positions || []).some(x => x.kode === "presiden");
  return isPresident ? { ukm, bemId: ukm.induk_organisasi_id } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const user = await caller(req);
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  let body: { action?: string; ukm_id?: string; account_id?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const ukmId = String(body.ukm_id || "").trim();
  const context = await presidentContext(user.id, ukmId);
  if (!context) return json({ error: "ONLY_BEM_PRESIDENT_CAN_MANAGE_THIS_UKM" }, 403);

  if (body.action === "candidates") {
    const { data, error } = await db
      .from("keanggotaan")
      .select("akun_id")
      .eq("organisasi_id", context.bemId)
      .eq("status", "aktif");

    if (error) return json({ error: "CANDIDATES_LOAD_FAILED" }, 500);

    const ids = [...new Set((data || []).map(x => x.akun_id).filter(Boolean))];
    const profiles = ids.length
      ? (await db.from("profiles").select("id,nama,nim").in("id", ids)).data || []
      : [];

    return json({ ok: true, candidates: profiles });
  }

  if (body.action === "assign") {
    const accountId = String(body.account_id || "").trim();
    if (!accountId) return json({ error: "ACCOUNT_REQUIRED" }, 400);

    const { data: candidate } = await db
      .from("keanggotaan")
      .select("id")
      .eq("akun_id", accountId)
      .eq("organisasi_id", context.bemId)
      .eq("status", "aktif")
      .limit(1);

    if (!candidate?.length) return json({ error: "COORDINATOR_MUST_BE_ACTIVE_BEM_MEMBER" }, 400);

    await db
      .from("penugasan_koordinator")
      .update({ status: "dicabut", berakhir_pada: new Date().toISOString().slice(0, 10) })
      .eq("organisasi_id", ukmId)
      .eq("status", "aktif");

    const { data, error } = await db
      .from("penugasan_koordinator")
      .insert({
        organisasi_id: ukmId,
        akun_id: accountId,
        status: "aktif",
        ditunjuk_oleh: user.id,
        ditunjuk_pada: new Date().toISOString(),
        mulai_pada: new Date().toISOString().slice(0, 10)
      })
      .select("id,organisasi_id,akun_id,status,ditunjuk_oleh,ditunjuk_pada,mulai_pada")
      .single();

    if (error) {
      if (error.code === "23505") return json({ error: "ACTIVE_COORDINATOR_ALREADY_EXISTS" }, 409);
      return json({ error: "COORDINATOR_ASSIGNMENT_FAILED", detail: error.message }, 500);
    }

    return json({ ok: true, assignment: data });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});
