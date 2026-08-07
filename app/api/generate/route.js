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


  const sb = supabaseAdmin();
  const [emp, set, prev, wt] = await Promise.all([
    sb
      .from("employees")
      .select("*")
      .eq("station_id", st.id)
      .is("deactivated_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    sb.from("settings").select("*").eq("station_id", st.id).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,next_night_person,actual_night_person,grid")
      .eq("station_id", st.id)
      .lt("week_start", week_start)
      .order("week_start", { ascending: false })
      .limit(6),
    sb
      .from("weekly_employee_targets")
      .select("employee_id,exact_days")
      .eq("station_id", st.id)
      .eq("week_start", week_start),
  ]);
  if (emp.error)
    return NextResponse.json({ error: emp.error.message }, { status: 500 });

  // Ιστορικό τελευταίων εβδομάδων: πόσες φορές έκανε ο καθένας κάθε βάρδια και
  // πόσες Κυριακές δούλεψε — για να μοιράζονται δίκαια οι δύσκολες βάρδιες.
  const past = Array.isArray(prev.data) ? prev.data : [];
  const prevWeek = past[0] || null;
  const history = {};
  for (const wk of past) {
    for (const [empId, row] of Object.entries(wk.grid || {})) {
      if (!Array.isArray(row)) continue;
      history[empId] = history[empId] || { codes: {}, sundays: 0 };
      row.forEach((c, d) => {
        if (!c || c === "Ρ" || c === "Ο") return;
        history[empId].codes[c] = (history[empId].codes[c] || 0) + 1;
        if (d === 6) history[empId].sundays++;
      });
    }
  }

  const shiftsCfg = set.data?.shifts;
  const hasNightShift =
    !shiftsCfg || !Object.keys(shiftsCfg).length ? true : !!shiftsCfg["Β"];
  if (hasNightShift && (!night_person || !next_night_person))
    return NextResponse.json(
      { error: "Όρισε βραδινό Δευ–Σάβ και επόμενο βραδινό πριν τη δημιουργία." },
      { status: 400 }
    );

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
  const adjacent = prevWeek?.week_start === expected;

  const prevSunday = {};
  if (adjacent && prevWeek?.grid) {
    for (const [empId, row] of Object.entries(prevWeek.grid)) {
      if (Array.isArray(row) && row[6]) prevSunday[empId] = row[6];
    }
  }

  // 2A: τα τρέχοντα targets του UI είναι source of truth για ΑΥΤΟ το Generate.
  // Fallback στη βάση για όποιον δεν περιλαμβάνεται στο request.
  const weeklyTargets = {};
  for (const r of wt.data || []) weeklyTargets[r.employee_id] = r.exact_days;
  const reqTargets = body.weekly_targets;
  if (reqTargets && typeof reqTargets === "object") {
    for (const [empId, v] of Object.entries(reqTargets)) {
      if (v === "" || v == null) {
        delete weeklyTargets[empId];
        continue;
      }
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= 7) weeklyTargets[empId] = n;
    }
  }

  const { grid, warnings, nightExceptions, nightConflicts } = generateWeek({
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
    // 1D: ο PREVIOUS holder είναι αυτός που ΟΛΟΚΛΗΡΩΣΕ το προηγούμενο μπλοκ
    // (δηλαδή ο night_person της περασμένης εβδομάδας) — παίρνει Ρ Δευτέρας.
    prevNightPersonId: adjacent ? prevWeek?.night_person || null : null,
    history,
    locked: locked || {},
    prevSunday,
    dayReq,
    leaveReplacesRest: settings.leave_replaces_rest !== false,
    weeklyTargets,
  });

  if (!adjacent) {
    warnings.unshift(
      "Δεν βρέθηκε ΑΠΟΘΗΚΕΥΜΕΝΗ η αμέσως προηγούμενη εβδομάδα — το ρεπό Δευτέρας του βραδινού που τελείωσε και το 11ωρο από την περασμένη Κυριακή ΔΕΝ εφαρμόστηκαν αυτόματα. Αποθήκευε κάθε εβδομάδα πριν βγάλεις την επόμενη."
    );
  }

  return NextResponse.json({ grid, warnings, nightExceptions, nightConflicts });
}
