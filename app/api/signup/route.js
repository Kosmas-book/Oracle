import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Αυτοεξυπηρέτηση: νέο κατάστημα από τη σελίδα εισόδου, χωρίς Supabase.
export async function POST(req) {
  const { name, pin, code, email } = await req.json();
  const cleanName = String(name || "").trim().slice(0, 40);
  const cleanPin = String(pin || "").trim();
  const cleanMail = String(email || "").trim().toLowerCase().slice(0, 80);

  // Προαιρετικός κωδικός πρόσκλησης (env SIGNUP_CODE) για να μη γράφεται
  // όποιος βρει τυχαία το λινκ.
  if (process.env.SIGNUP_CODE && code !== process.env.SIGNUP_CODE) {
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
  if (cleanPin.length < 4)
    return NextResponse.json(
      { error: "Το PIN θέλει τουλάχιστον 4 ψηφία." },
      { status: 400 }
    );
  if (!cleanMail.includes("@"))
    return NextResponse.json(
      { error: "Βάλε email — χρειάζεται για ανάκτηση PIN." },
      { status: 400 }
    );

  const sb = supabaseAdmin();
  const existing = await sb
    .from("stations")
    .select("id")
    .eq("pin", cleanPin)
    .maybeSingle();
  if (existing.data)
    return NextResponse.json(
      { error: "Το PIN χρησιμοποιείται ήδη — διάλεξε άλλο." },
      { status: 409 }
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
  const { data, error } = await sb
    .from("stations")
    .insert({ name: cleanName, pin: cleanPin, email: cleanMail })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true, name: data.name });
  res.cookies.set("vardia_pin", cleanPin, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  return res;
}
