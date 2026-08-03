import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("fuel_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function POST(req) {
  const body = await req.json();
  if (!body.entry_date)
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  const row = {
    entry_date: body.entry_date,
    liters: body.liters || {},
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin()
    .from("fuel_entries")
    .upsert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "missing date" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("fuel_entries")
    .delete()
    .eq("entry_date", date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
