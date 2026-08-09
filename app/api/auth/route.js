import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPin, validPin, verifyLegacyPin, verifyPin } from "@/lib/authSecurity";
import { clearSessionCookies, setSessionCookie } from "@/lib/stationAuth";
import { clearRateLimit, isRateLimited, rateLimitKey, recordFailure } from "@/lib/rateLimit";

// Είσοδος με όνομα καταστήματος + PIN.
export async function POST(req) {
  const { name, pin } = await req.json().catch(() => ({}));
  const n = String(name || "").trim();
  const p = String(pin || "").trim();
  if (!n || !validPin(p, { allowLegacy: true }))
    return NextResponse.json({ error: "Συμπλήρωσε όνομα και PIN." }, { status: 400 });

  const sb = supabaseAdmin();
  const key = rateLimitKey(req, "login", n);
  try {
    if (await isRateLimited(sb, key)) {
      return NextResponse.json(
        { error: "Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά." },
        { status: 429 }
      );
    }
  } catch (error) {
    console.error("Login rate-limit error", error);
    return NextResponse.json({ error: "Η είσοδος δεν είναι προσωρινά διαθέσιμη." }, { status: 503 });
  }

  const { data, error } = await sb
    .from("stations")
    .select("id,name,pin,pin_hash,session_version")
    .ilike("name", n)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Σφάλμα σύνδεσης." }, { status: 500 });
  const valid = data
    ? data.pin_hash
      ? await verifyPin(p, data.pin_hash)
      : verifyLegacyPin(p, data.pin)
    : false;
  if (!valid) {
    try {
      await recordFailure(sb, key);
    } catch (rateError) {
      console.error("Login rate-limit write error", rateError);
    }
    return NextResponse.json(
      { error: "Λάθος όνομα καταστήματος ή PIN." },
      { status: 401 }
    );
  }

  // Πρώτη είσοδος μετά το security migration: μετατροπή του παλιού PIN σε hash.
  if (!data.pin_hash) {
    const pinHash = await hashPin(p);
    const { error: migrateError } = await sb
      .from("stations")
      .update({ pin_hash: pinHash, pin: null })
      .eq("id", data.id);
    if (migrateError)
      return NextResponse.json({ error: "Δεν ολοκληρώθηκε η ασφαλής είσοδος." }, { status: 500 });
  }
  await clearRateLimit(sb, key).catch(() => {});

  const res = NextResponse.json({ ok: true, name: data.name });
  setSessionCookie(res, data);
  return res;
}

// Αποσύνδεση.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
