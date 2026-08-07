import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("fuel_presets")
    .select("*")
    .eq("station_id", st.id)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data || [] });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, name, weights } = await req.json();
  const clean = {};
  for (const [k, v] of Object.entries(weights || {})) {
    const i = Number(k);
    const w = Number(v);
    if (i >= 0 && i <= 7 && w > 0 && w <= 1) clean[i] = w;
  }
  const nm = String(name || "").trim().slice(0, 40);
  if (!nm) return NextResponse.json({ error: "Λείπει το όνομα." }, { status: 400 });
  const row = { station_id: st.id, name: nm, weights: clean };
  if (id) row.id = id;
  const { data, error } = await supabaseAdmin()
    .from("fuel_presets")
    .upsert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preset: data });
}

export async function DELETE(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("fuel_presets")
    .delete()
    .eq("id", id)
    .eq("station_id", st.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
