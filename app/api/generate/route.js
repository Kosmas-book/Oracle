import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";
import { generateWeek } from "@/lib/generator";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { week_start, night_person, next_night_person, locked } = body;
  const dayReq = (() => {
    if (!Array.isArray(body.day_req) || body.day_req.length !== 7) return null;
    return body.day_req.map((r) => {
      const out = {};
      if (r && typeof r === "object")
        for (const [c, v] of Object.entries(r)) {
          const n = Number(v);
          if (n > 0) out[String(c).slice(0, 3)] = Math.min(8, n);
        }
      return out;
    });
  })();
  if (!week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });
  if (!night_person || !next_night_person)
    return NextResponse.json(
      { error: "Όρισε βραδινό Δευ–Σάβ και επόμενο βραδινό πριν τη δημιουργία." },
      { status: 400 }
    );

  const sb = supabaseAdmin();
  const [emp, set, prev] = await Promise.all([
    sb.from("employees").select("*").eq("station_id", st.id),
    sb.from("settings").select("*").eq("station_id", st.id).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,grid")
      .eq("station_id", st.id)
      .lt("week_start", week_start)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (emp.error)
    return NextResponse.json({ error: emp.error.message }, { status: 500 });

  const settings = set.data || {
    weekday_req: { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 },
    sunday_req: { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 },
    work_days: 6,
    max_per_shift: 4,
  };

  // Η "προηγούμενη εβδομάδα" μετράει ΜΟΝΟ αν είναι η αμέσως προηγούμενη
  // αποθηκευμένη — αλλιώς τα ρεπό μετά τα βραδινά δεν έχουν νόημα.
  const dprev = new Date(week_start + "T00:00:00");
  dprev.setDate(dprev.getDate() - 7);
  const expected = dprev.toISOString().slice(0, 10);
  const adjacent = prev.data?.week_start === expected;

  const prevSunday = {};
  if (adjacent && prev.data?.grid) {
    for (const [empId, row] of Object.entries(prev.data.grid)) {
      if (Array.isArray(row) && row[6]) prevSunday[empId] = row[6];
    }
  }

  const { grid, warnings } = generateWeek({
    employees: emp.data,
    weekdayReq: settings.weekday_req,
    sundayReq: settings.sunday_req,
    workDays: [5, 6].includes(Number(settings.work_days))
      ? Number(settings.work_days)
      : 6,
    maxPerShift: Number(settings.max_per_shift) || 4,
    shifts: settings.shifts || null,
    nightPersonId: night_person || null,
    nextNightPersonId: next_night_person || null,
    prevNightPersonId: adjacent ? prev.data?.night_person || null : null,
    locked: locked || {},
    prevSunday,
    dayReq,
  });

  if (!adjacent) {
    warnings.unshift(
      "Δεν βρέθηκε ΑΠΟΘΗΚΕΥΜΕΝΗ η αμέσως προηγούμενη εβδομάδα — το ρεπό Δευτέρας του βραδινού που τελείωσε και το 11ωρο από την περασμένη Κυριακή ΔΕΝ εφαρμόστηκαν αυτόματα. Αποθήκευε κάθε εβδομάδα πριν βγάλεις την επόμενη."
    );
  }

  return NextResponse.json({ grid, warnings });
}
