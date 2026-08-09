import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPin, validPin } from "@/lib/authSecurity";
import { setSessionCookie } from "@/lib/stationAuth";
import { isRateLimited, rateLimitKey, recordFailure } from "@/lib/rateLimit";

// Αυτοεξυπηρέτηση: νέο κατάστημα από τη σελίδα εισόδου, χωρίς Supabase.
export async function POST(req) {
  const { name, pin, code, email } = await req.json().catch(() => ({}));
  const cleanName = String(name || "").trim().slice(0, 40);
  const cleanPin = String(pin || "").trim();
  const cleanMail = String(email || "").trim().toLowerCase().slice(0, 80);

  // Ασφαλές default: χωρίς SIGNUP_CODE δεν επιτρέπονται δημόσιες εγγραφές.
  if (!process.env.SIGNUP_CODE) {
    return NextResponse.json(
      { error: "Η δημιουργία νέου καταστήματος δεν είναι ενεργοποιημένη." },
      { status: 503 }
    );
  }
  const sb = supabaseAdmin();
  const key = rateLimitKey(req, "signup", cleanName);
  try {
    if (await isRateLimited(sb, key)) {
      return NextResponse.json(
        { error: "Πολλές προσπάθειες. Δοκίμασε ξανά αργότερα." },
        { status: 429 }
      );
    }
  } catch (error) {
    console.error("Signup rate-limit error", error);
    return NextResponse.json({ error: "Η εγγραφή δεν είναι προσωρινά διαθέσιμη." }, { status: 503 });
  }
  if (code !== process.env.SIGNUP_CODE) {
    await recordFailure(sb, key, { limit: 5, windowMinutes: 60 }).catch(() => {});
    return NextResponse.json(
      { error: "Λάθος κωδικός πρόσκλησης." },
      { status: 403 }
    );
  }
  if (cleanName.length < 3)
    return NextResponse.json(
      { error: "Βάλε όνομα καταστήματος (π.χ. ΚΑΛΥΨΩ 102)." },
      { status: 400 }
    );
  if (!validPin(cleanPin))
    return NextResponse.json(
      { error: "Το PIN πρέπει να έχει 6–12 ψηφία." },
      { status: 400 }
    );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMail))
    return NextResponse.json(
      { error: "Βάλε email — χρειάζεται για ανάκτηση PIN." },
      { status: 400 }
    );

  const dupName = await sb
    .from("stations")
    .select("id")
    .ilike("name", cleanName)
    .maybeSingle();
  if (dupName.data)
    return NextResponse.json(
      { error: "Υπάρχει ήδη κατάστημα με αυτό το όνομα." },
      { status: 409 }
    );
  const pinHash = await hashPin(cleanPin);
  const { data, error } = await sb
    .from("stations")
    .insert({ name: cleanName, pin: null, pin_hash: pinHash, email: cleanMail })
    .select("id,name,session_version")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true, name: data.name });
  setSessionCookie(res, data);
  return res;
}
