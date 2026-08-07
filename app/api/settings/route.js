import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  weekday_req: { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 },
  sunday_req: { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 },
  work_days: 6,
  max_per_shift: 4,
  shifts: {},
  leave_replaces_rest: true,
};

export async function GET() {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("settings")
    .select("*")
    .eq("station_id", st.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data || { ...DEFAULTS } });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const row = {
    station_id: st.id,
    weekday_req: body.weekday_req || DEFAULTS.weekday_req,
    sunday_req: body.sunday_req || DEFAULTS.sunday_req,
    work_days: [5, 6].includes(Number(body.work_days)) ? Number(body.work_days) : 6,
    max_per_shift: Math.min(8, Math.max(1, Number(body.max_per_shift) || 4)),
    leave_replaces_rest: body.leave_replaces_rest !== false,
    shifts: (() => {
      const src = body.shifts && typeof body.shifts === "object" ? body.shifts : {};
      const out = {};
      for (const [code, def] of Object.entries(src)) {
        const c = String(code).trim().slice(0, 3);
        if (!c || c === "Ρ" || c === "Ο" || !def) continue;
        let st = Number(def.start);
        let en = Number(def.end);
        if (isNaN(st) || isNaN(en)) continue;
        if (en <= st) en += 24; // βάρδια που ξημερώνει
        out[c] = { label: String(def.label || c).slice(0, 30), start: st, end: en };
      }
      return out;
    })(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from("settings")
    .upsert(row, { onConflict: "station_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
