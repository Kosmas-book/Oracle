import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";
import { validateEntry, resolveExcluded, mergeLiters, dedupeEntries } from "@/lib/fuelCalc";

export const dynamic = "force-dynamic";

export async function GET() {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("fuel_entries")
    .select("*")
    .eq("station_id", st.id)
    .order("entry_date", { ascending: false })
    .limit(120);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.entry_date)
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  const v = validateEntry({ entry_date: body.entry_date, liters: body.liters });
  if (!v.ok)
    return NextResponse.json({ error: v.errors.join(" ") }, { status: 400 });

  // MERGE-BEFORE-UPSERT: τα καύσιμα που ΔΕΝ περιλαμβάνονται στο νέο payload
  // διατηρούνται. Μηδενισμός γίνεται μόνο με ρητή τιμή 0.
  const { data: existing } = await supabaseAdmin()
    .from("fuel_entries")
    .select("liters,notes,excluded")
    .eq("station_id", st.id)
    .eq("entry_date", body.entry_date)
    .maybeSingle();

  const row = {
    station_id: st.id,
    entry_date: body.entry_date,
    liters: mergeLiters(existing?.liters, v.liters),
    notes: body.notes ?? existing?.notes ?? null,
    excluded: resolveExcluded(body, existing),
  };
  const { data, error } = await supabaseAdmin()
    .from("fuel_entries")
    .upsert(row, { onConflict: "station_id,entry_date" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function PUT(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
  const rejected = [];
  const valid = [];
  for (const e of entries) {
    const v = validateEntry({ entry_date: e.entry_date, liters: e.liters });
    if (!v.ok) {
      rejected.push({
        date: e.entry_date || null,
        row: e.__row ?? null,
        reason: v.errors.join(" "),
      });
      continue;
    }
    valid.push({ entry_date: e.entry_date, liters: v.liters, notes: e.notes });
  }

  // 8: DEDUPLICATION μέσα στο ίδιο αρχείο (κοινή function με τα tests).
  const merged = dedupeEntries(valid);

  // MERGE-BEFORE-UPSERT και στο import: κρατάμε τα καύσιμα που δεν στάλθηκαν.
  const dates = merged.map((v) => v.entry_date);
  const existingMap = {};
  if (dates.length) {
    const { data: prev } = await supabaseAdmin()
      .from("fuel_entries")
      .select("entry_date,liters,notes")
      .eq("station_id", st.id)
      .in("entry_date", dates);
    for (const r of prev || []) existingMap[r.entry_date] = r;
  }
  for (const v of merged) {
    const ex = existingMap[v.entry_date];
    rows.push({
      station_id: st.id,
      entry_date: v.entry_date,
      liters: mergeLiters(ex?.liters, v.liters),
      notes: v.notes ?? ex?.notes ?? null,
    });
  }
  if (!rows.length)
    return NextResponse.json({ error: "Καμία έγκυρη εγγραφή." }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("fuel_entries")
    .upsert(rows, { onConflict: "station_id,entry_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: rows.length, rejected });
}

// Εξαίρεση ημέρας από την πρόβλεψη ΧΩΡΙΣ διαγραφή των δεδομένων της.
export async function PATCH(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { entry_date, excluded } = await req.json();
  if (!entry_date)
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("fuel_entries")
    .update({ excluded: !!excluded })
    .eq("station_id", st.id)
    .eq("entry_date", entry_date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "missing date" }, { status: 400 });
  const { error } = await supabaseAdmin()
    .from("fuel_entries")
    .delete()
    .eq("station_id", st.id)
    .eq("entry_date", date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
