import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

// Ε: ακριβής εβδομαδιαίος στόχος ημερών ανά εργαζόμενο.
// Ισχύει ΜΟΝΟ για τη συγκεκριμένη εβδομάδα — δεν αγγίζει το προφίλ/σύμβαση.
export async function GET(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const week = searchParams.get("week");
  if (!week) return NextResponse.json({ error: "missing week" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("weekly_employee_targets")
    .select("employee_id,exact_days")
    .eq("station_id", st.id)
    .eq("week_start", week);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const targets = {};
  for (const r of data || []) targets[r.employee_id] = r.exact_days;
  return NextResponse.json({ targets });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { week_start, targets } = await req.json();
  if (!week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });

  const sb = supabaseAdmin();
  const rows = [];
  const clear = [];
  for (const [empId, v] of Object.entries(targets || {})) {
    if (v === "" || v == null) {
      clear.push(empId);
      continue;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 7) continue;
    rows.push({
      station_id: st.id,
      week_start,
      employee_id: empId,
      exact_days: n,
    });
  }
  if (clear.length)
    await sb
      .from("weekly_employee_targets")
      .delete()
      .eq("station_id", st.id)
      .eq("week_start", week_start)
      .in("employee_id", clear);
  if (rows.length) {
    const { error } = await sb
      .from("weekly_employee_targets")
      .upsert(rows, { onConflict: "station_id,week_start,employee_id" });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.length, cleared: clear.length });
}
