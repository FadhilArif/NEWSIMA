import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@^2/cors";

function corsJsonHeaders() {
  return {
    ...supabaseCorsHeaders,
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsJsonHeaders(), ...extra },
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

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const publishableKey = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: supabaseCorsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "UNAUTHORIZED" }, 401);

  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data.user) return json({ error: "UNAUTHORIZED" }, 401);

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ wajib_ganti_sandi: false })
    .eq("id", data.user.id);

  if (updateError) return json({ error: "PROFILE_UPDATE_FAILED" }, 500);

  return json({ ok: true });
});
