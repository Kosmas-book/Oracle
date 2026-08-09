import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const PIN_PREFIX = "scrypt-v1";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function validPin(pin, { allowLegacy = false } = {}) {
  const value = String(pin || "");
  const minimum = allowLegacy ? 4 : 6;
  return new RegExp(`^\\d{${minimum},12}$`).test(value);
}

export async function hashPin(pin) {
  if (!validPin(pin, { allowLegacy: true })) throw new Error("invalid_pin");
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(pin), salt, 32);
  return `${PIN_PREFIX}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPin(pin, storedHash) {
  try {
    const [prefix, saltText, hashText] = String(storedHash || "").split("$");
    if (prefix !== PIN_PREFIX || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, "base64url");
    const actual = Buffer.from(
      await scrypt(String(pin), Buffer.from(saltText, "base64url"), expected.length)
    );
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function verifyLegacyPin(pin, storedPin) {
  return safeEqual(String(pin || ""), String(storedPin || ""));
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

export function createSessionToken(stationId, sessionVersion, options = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const secret = options.secret ?? sessionSecret();
  const payload = encode(
    JSON.stringify({
      sid: stationId,
      ver: Number(sessionVersion) || 1,
      exp: now + SESSION_TTL_SECONDS,
    })
  );
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, options = {}) {
  try {
    const [payload, signature, extra] = String(token || "").split(".");
    if (!payload || !signature || extra) return null;
    const secret = options.secret ?? sessionSecret();
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    const data = JSON.parse(decode(payload));
    const now = options.now ?? Math.floor(Date.now() / 1000);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(data.sid || "")
      ) ||
      !Number.isInteger(data.ver) ||
      !Number.isInteger(data.exp) ||
      data.exp <= now
    ) {
      return null;
    }
    return { stationId: data.sid, sessionVersion: data.ver, expiresAt: data.exp };
  } catch {
    return null;
  }
}

export function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function randomResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

export const SESSION_COOKIE = "__Host-turno_session";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
