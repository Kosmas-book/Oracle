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

// Μαζική εισαγωγή από Excel
export async function PUT(req) {
  const body = await req.json();
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length)
    return NextResponse.json({ error: "Καμία εγγραφή." }, { status: 400 });
  if (entries.length > 500)
    return NextResponse.json(
      { error: "Μέγιστο 500 μέρες ανά εισαγωγή." },
      { status: 400 }
    );
  const rows = [];
  for (const e of entries) {
    if (!e.entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(e.entry_date)) continue;
    rows.push({
      entry_date: e.entry_date,
      liters: e.liters || {},
      notes: e.notes || null,
    });
  }
  if (!rows.length)
    return NextResponse.json({ error: "Καμία έγκυρη εγγραφή." }, { status: 400 });
  const { error } = await supabaseAdmin().from("fuel_entries").upsert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: rows.length });
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
