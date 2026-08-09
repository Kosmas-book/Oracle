import { hashOpaqueToken } from "./authSecurity";

function clientIp(req) {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function rateLimitKey(req, action, subject = "") {
  return hashOpaqueToken(`${action}|${clientIp(req)}|${String(subject).toLowerCase()}`);
}

export async function isRateLimited(sb, key) {
  const { data, error } = await sb
    .from("auth_rate_limits")
    .select("locked_until")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return !!data?.locked_until && new Date(data.locked_until).getTime() > Date.now();
}

export async function recordFailure(sb, key, { limit = 5, windowMinutes = 15 } = {}) {
  const now = Date.now();
  const { data, error } = await sb
    .from("auth_rate_limits")
    .select("attempts,window_started")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;

  const windowMs = windowMinutes * 60 * 1000;
  const inWindow = data && new Date(data.window_started).getTime() > now - windowMs;
  const attempts = inWindow ? Number(data.attempts || 0) + 1 : 1;
  const row = {
    key,
    attempts,
    window_started: new Date(inWindow ? data.window_started : now).toISOString(),
    locked_until: attempts >= limit ? new Date(now + windowMs).toISOString() : null,
    updated_at: new Date(now).toISOString(),
  };
  const { error: writeError } = await sb.from("auth_rate_limits").upsert(row);
  if (writeError) throw writeError;
  return attempts >= limit;
}

export async function clearRateLimit(sb, key) {
  const { error } = await sb.from("auth_rate_limits").delete().eq("key", key);
  if (error) throw error;
}
