import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const week = searchParams.get("week"); // Monday, YYYY-MM-DD
  if (!week) return NextResponse.json({ error: "missing week" }, { status: 400 });

  const sb = supabaseAdmin();
  const [cur, prev] = await Promise.all([
    sb.from("schedules").select("*").eq("week_start", week).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,next_night_person")
      .lt("week_start", week)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  return NextResponse.json({ schedule: cur.data, prev: prev.data || null });
}

export async function POST(req) {
  const body = await req.json();
  if (!body.week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });
  const row = {
    week_start: body.week_start,
    grid: body.grid || {},
    night_person: body.night_person || null,
    next_night_person: body.next_night_person || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from("schedules")
    .upsert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}
