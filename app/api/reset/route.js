import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

// Βήμα 1: αίτημα ανάκτησης — στέλνει email με σύνδεσμο.
export async function POST(req) {
  const { email } = await req.json();
  const mail = String(email || "").trim().toLowerCase();
  // Απαντάμε πάντα το ίδιο, για να μη μαθαίνει κανείς ποια email υπάρχουν.
  const generic = NextResponse.json({
    ok: true,
    message:
      "Αν το email αντιστοιχεί σε κατάστημα, θα λάβεις σύνδεσμο ανάκτησης μέσα σε λίγα λεπτά.",
  });
  if (!mail || !mail.includes("@")) return generic;

  const sb = supabaseAdmin();
  const { data: st } = await sb
    .from("stations")
    .select("id,name,email")
    .ilike("email", mail)
    .maybeSingle();
  if (!st) return generic;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 ώρα
  await sb
    .from("stations")
    .update({ reset_token: token, reset_expires: expires })
    .eq("id", st.id);

  const host = req.headers.get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  const link = `${proto}://${host}/reset?token=${token}`;

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY λείπει — σύνδεσμος ανάκτησης:", link);
    return generic;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "Βάρδιες <onboarding@resend.dev>",
        to: [st.email],
        subject: "Ανάκτηση PIN — Βάρδιες Πρατηρίου",
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1b2530">
<h2 style="color:#10394a">Ανάκτηση PIN</h2>
<p>Ζητήθηκε νέο PIN για το κατάστημα <strong>${st.name}</strong>.</p>
<p><a href="${link}" style="background:#10394a;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ορισμός νέου PIN</a></p>
<p style="color:#6d7683;font-size:13px">Ο σύνδεσμος ισχύει για 1 ώρα. Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email — το PIN σου παραμένει ίδιο.</p>
</div>`,
      }),
    });
    if (!r.ok) console.error("Resend error:", await r.text());
  } catch (e) {
    console.error("Resend exception:", e);
  }
  return generic;
}

// Βήμα 2: ορισμός νέου PIN με το token.
export async function PUT(req) {
  const { token, pin } = await req.json();
  const t = String(token || "");
  const p = String(pin || "").trim();
  if (!t || p.length < 4)
    return NextResponse.json(
      { error: "Το PIN θέλει τουλάχιστον 4 ψηφία." },
      { status: 400 }
    );

  const sb = supabaseAdmin();
  const { data: st } = await sb
    .from("stations")
    .select("id,name,reset_expires")
    .eq("reset_token", t)
    .maybeSingle();
  if (!st || !st.reset_expires || new Date(st.reset_expires) < new Date())
    return NextResponse.json(
      { error: "Ο σύνδεσμος έληξε ή δεν είναι έγκυρος. Ζήτησε νέον." },
      { status: 400 }
    );

  const dup = await sb.from("stations").select("id").eq("pin", p).maybeSingle();
  if (dup.data && dup.data.id !== st.id)
    return NextResponse.json(
      { error: "Το PIN χρησιμοποιείται από άλλο κατάστημα — διάλεξε άλλο." },
      { status: 409 }
    );

  const { error } = await sb
    .from("stations")
    .update({ pin: p, reset_token: null, reset_expires: null })
    .eq("id", st.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true, name: st.name });
  res.cookies.set("vardia_pin", p, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  return res;
}
