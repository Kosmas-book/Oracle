import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Είσοδος με όνομα καταστήματος + PIN.
export async function POST(req) {
  const { name, pin } = await req.json();
  const n = String(name || "").trim();
  const p = String(pin || "").trim();
  if (!n || !p)
    return NextResponse.json({ error: "Συμπλήρωσε όνομα και PIN." }, { status: 400 });

  const { data } = await supabaseAdmin()
    .from("stations")
    .select("id,name,pin")
    .ilike("name", n)
    .maybeSingle();

  if (!data || data.pin !== p)
    return NextResponse.json(
      { error: "Λάθος όνομα καταστήματος ή PIN." },
      { status: 401 }
    );

  const res = NextResponse.json({ ok: true, name: data.name });
  res.cookies.set("vardia_pin", p, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  return res;
}

// Αποσύνδεση.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vardia_pin", "", { path: "/", maxAge: 0 });
  return res;
}
