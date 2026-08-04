import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req) {
  const { pin } = await req.json();
  if (!pin) return NextResponse.json({ error: "missing pin" }, { status: 400 });
  const { data } = await supabaseAdmin()
    .from("stations")
    .select("id,name")
    .eq("pin", String(pin))
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "wrong pin" }, { status: 401 });
  const res = NextResponse.json({ ok: true, name: data.name });
  res.cookies.set("vardia_pin", String(pin), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  return res;
}
