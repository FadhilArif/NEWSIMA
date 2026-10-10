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

async function bemPresidentContext(userId: string, organizationId: string) {
  const { data: child, error: childError } = await db
    .from("organisasi")
    .select("id,nama,tipe,induk_organisasi_id")
    .eq("id", organizationId)
    .single();

  if (childError || !child || !["HMJ", "UKM", "CLUB"].includes(child.tipe) || !child.induk_organisasi_id) {
    return null;
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,aktif")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.aktif) return null;

  const { data: memberships, error: membershipError } = await db
    .from("keanggotaan")
    .select("jabatan_id")
    .eq("akun_id", userId)
    .eq("organisasi_id", child.induk_organisasi_id)
    .eq("status", "aktif");

  if (membershipError || !memberships?.length) return null;
  const positionIds = [...new Set(memberships.map(x => x.jabatan_id).filter(Boolean))];
  if (!positionIds.length) return null;

  const { data: positions, error: positionError } = await db
    .from("jabatan_organisasi")
    .select("id,kode,aktif")
    .in("id", positionIds);

  if (positionError || !(positions || []).some(x => x.kode === "presiden" && x.aktif === true)) return null;
  return { child, bemId: child.induk_organisasi_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const user = await caller(req);
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  let body: { action?: string; organization_id?: string; ukm_id?: string; account_id?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  // Keep accepting ukm_id for compatibility with cached clients; the target may now be HMJ, UKM, or CLUB.
  const organizationId = String(body.organization_id || body.ukm_id || "").trim();
  const context = await bemPresidentContext(user.id, organizationId);
  if (!context) return json({ error: "ONLY_BEM_PRESIDENT_CAN_MANAGE_THIS_ORGANIZATION" }, 403);

  if (body.action === "candidates") {
    const { data: memberships, error: membershipError } = await db
      .from("keanggotaan")
      .select("akun_id")
      .eq("organisasi_id", context.bemId)
      .eq("status", "aktif");

    if (membershipError) {
      return json({ error: "CANDIDATES_LOAD_FAILED", detail: membershipError.message }, 500);
    }

    const ids = [...new Set((memberships || []).map(x => x.akun_id).filter(Boolean))];
    if (!ids.length) return json({ ok: true, candidates: [] });

    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id,nama,nim")
      .eq("aktif", true)
      .in("id", ids)
      .order("nama");

    if (profilesError) {
      return json({ error: "CANDIDATES_LOAD_FAILED", detail: profilesError.message }, 500);
    }

    return json({ ok: true, candidates: profiles || [] });
  }

  if (body.action === "assign") {
    const accountId = String(body.account_id || "").trim();
    if (!accountId) return json({ error: "ACCOUNT_REQUIRED" }, 400);

    const { data: assignment, error: assignmentError } = await db.rpc("assign_bem_coordinator", {
      p_organization_id: organizationId,
      p_account_id: accountId,
      p_actor_id: user.id
    });

    if (assignmentError) {
      const message = assignmentError.message || "";
      if (message.includes("ONLY_BEM_PRESIDENT_CAN_APPOINT_COORDINATOR")) {
        return json({ error: "ONLY_BEM_PRESIDENT_CAN_MANAGE_THIS_ORGANIZATION" }, 403);
      }
      if (message.includes("COORDINATOR_MUST_BE_ACTIVE_BEM_MEMBER")) {
        return json({ error: "COORDINATOR_MUST_BE_ACTIVE_BEM_MEMBER" }, 400);
      }
      if (message.includes("INVALID_CHILD_ORGANIZATION")) {
        return json({ error: "INVALID_CHILD_ORGANIZATION" }, 400);
      }
      if (assignmentError.code === "23505") {
        return json({ error: "ACTIVE_COORDINATOR_ALREADY_EXISTS" }, 409);
      }
      return json({ error: "COORDINATOR_ASSIGNMENT_FAILED", detail: message }, 500);
    }

    return json({ ok: true, assignment });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
});
