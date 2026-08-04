import { NextResponse } from "next/server";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ name: st.name });
}
