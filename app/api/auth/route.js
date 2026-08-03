import { NextResponse } from "next/server";

export async function POST(req) {
  const { pin } = await req.json();
  if (!process.env.APP_PIN || pin !== process.env.APP_PIN) {
    return NextResponse.json({ error: "wrong pin" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vardia_pin", pin, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 180, // 6 μήνες
    path: "/",
  });
  return res;
}
