import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateWeek } from "@/lib/generator";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json();
  const { week_start, night_person, next_night_person, locked } = body;
  if (!week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });
  if (!night_person || !next_night_person)
    return NextResponse.json(
      { error: "Όρισε βραδινό Δευ–Σάβ και επόμενο βραδινό πριν τη δημιουργία." },
      { status: 400 }
    );

  const sb = supabaseAdmin();
  const [emp, set, prev] = await Promise.all([
    sb.from("employees").select("*"),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,grid")
      .lt("week_start", week_start)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (emp.error) return NextResponse.json({ error: emp.error.message }, { status: 500 });

  const settings = set.data || {
    weekday_req: { "Π4": 1, "Α3": 1, "Π": 3, "Α": 3 },
    sunday_req: { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 },
  };

  // Η Κυριακή της αμέσως προηγούμενης εβδομάδας — μόνο αν είναι όντως η συνεχόμενη.
  const prevSunday = {};
  if (prev.data?.grid) {
    const d = new Date(week_start + "T00:00:00");
    d.setDate(d.getDate() - 7);
    const expected = d.toISOString().slice(0, 10);
    if (prev.data.week_start === expected) {
      for (const [empId, row] of Object.entries(prev.data.grid)) {
        if (Array.isArray(row) && row[6]) prevSunday[empId] = row[6];
      }
    }
  }

  const { grid, warnings } = generateWeek({
    employees: emp.data,
    weekdayReq: settings.weekday_req,
    sundayReq: settings.sunday_req,
    workDays: [5, 6].includes(Number(settings.work_days))
      ? Number(settings.work_days)
      : 6,
    maxPerShift: Number(settings.max_per_shift) || 5,
    nightPersonId: night_person || null,
    nextNightPersonId: next_night_person || null,
    prevNightPersonId: prev.data?.night_person || null,
    locked: locked || {},
    prevSunday,
  });

  return NextResponse.json({ grid, warnings });
}
