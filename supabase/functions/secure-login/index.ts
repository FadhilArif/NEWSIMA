import { createClient } from "npm:@supabase/supabase-js@2";

const PRIMARY_ORIGIN = "https://fadhilarif.github.io";
const VERCEL_ORIGIN_PATTERN = /^https:\/\/newsima(?:-[a-z0-9-]+)*\.vercel\.app$/i;

function corsHeaders(_req: Request) {
  // secure-login does not use cookies or credentialed browser auth.
  // Wildcard CORS is therefore valid here and avoids preview-domain drift
  // when Vercel generates a new NEWSIMA deployment URL.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}

function json(req: Request, body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...extra },
  });
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
const serviceKey = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    return json(req, { error: "SERVER_NOT_CONFIGURED" }, 500);
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "INVALID_REQUEST" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 1 || password.length > 512) {
    return json(req, { error: "INVALID_CREDENTIALS" }, 401);
  }

  const ip = firstForwardedIp(req.headers.get("x-forwarded-for"))
    || req.headers.get("cf-connecting-ip")
    || "unknown";

  const [ipHash, emailHash] = await Promise.all([
    sha256("ip:" + ip),
    sha256("email:" + email),
  ]);

  const checks = await Promise.all([
    adminClient.rpc("consume_login_attempt", {
      p_key_hash: ipHash,
      p_scope: "ip",
      p_window_seconds: 900,
      p_max_attempts: 5,
    }),
    adminClient.rpc("consume_login_attempt", {
      p_key_hash: emailHash,
      p_scope: "email",
      p_window_seconds: 900,
      p_max_attempts: 5,
    }),
  ]);

  const ipLimit = checks[0].data?.[0];
  const emailLimit = checks[1].data?.[0];

  if (checks[0].error || checks[1].error) {
    return json(req, { error: "RATE_LIMIT_UNAVAILABLE" }, 503);
  }

  if (!ipLimit?.allowed || !emailLimit?.allowed) {
    const retryAfter = Math.max(
      Number(ipLimit?.retry_after || 0),
      Number(emailLimit?.retry_after || 0),
    );
    return json(
      req,
      { error: "RATE_LIMITED", retry_after: retryAfter || 900 },
      429,
      { "Retry-After": String(retryAfter || 900) },
    );
  }

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return json(req, { error: "INVALID_CREDENTIALS" }, 401);
  }

  // Successful authentication resets both counters.
  await Promise.all([
    adminClient.rpc("reset_login_rate_limit", {
      p_key_hash: ipHash,
      p_scope: "ip",
    }),
    adminClient.rpc("reset_login_rate_limit", {
      p_key_hash: emailHash,
      p_scope: "email",
    }),
  ]);

  // Return only the session needed by the browser to establish its normal
  // Supabase session. Never return service keys.
  return json(req, {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
});
