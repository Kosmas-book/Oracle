import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  // Ιστορικό: λίστα αποθηκευμένων εβδομάδων του καταστήματος.
  if (searchParams.get("list")) {
    const { data, error } = await supabaseAdmin()
      .from("schedules")
      .select("week_start,updated_at")
      .eq("station_id", st.id)
      .order("week_start", { ascending: false })
      .limit(60);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ weeks: data });
  }
  const week = searchParams.get("week");
  if (!week) return NextResponse.json({ error: "missing week" }, { status: 400 });

  const sb = supabaseAdmin();
  const [cur, prev] = await Promise.all([
    sb
      .from("schedules")
      .select("*")
      .eq("station_id", st.id)
      .eq("week_start", week)
      .maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,next_night_person")
      .eq("station_id", st.id)
      .lt("week_start", week)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (cur.error)
    return NextResponse.json({ error: cur.error.message }, { status: 500 });
  return NextResponse.json({ schedule: cur.data, prev: prev.data || null });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });
  const row = {
    station_id: st.id,
    week_start: body.week_start,
    grid: body.grid || {},
    night_person: body.night_person || null,
    next_night_person: body.next_night_person || null,
    day_req: Array.isArray(body.day_req) ? body.day_req : [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from("schedules")
    .upsert(row, { onConflict: "station_id,week_start" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}
