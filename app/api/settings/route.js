import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  weekday_req: { "Π4": 1, "Α3": 1, "Π": 3, "Α": 3 },
  sunday_req: { "Π2": 1, "Π4": 1, "Α": 3, "Α2": 1 },
  work_days: 6,
  max_per_shift: 5,
};

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data || { id: 1, ...DEFAULTS } });
}

export async function POST(req) {
  const body = await req.json();
  const row = {
    id: 1,
    weekday_req: body.weekday_req || DEFAULTS.weekday_req,
    sunday_req: body.sunday_req || DEFAULTS.sunday_req,
    work_days: [5, 6].includes(Number(body.work_days)) ? Number(body.work_days) : 6,
    max_per_shift: Math.min(8, Math.max(1, Number(body.max_per_shift) || 5)),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from("settings")
    .upsert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
