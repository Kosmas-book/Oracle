import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";
import { validateGrid } from "@/lib/validate";

export const dynamic = "force-dynamic";

const DEFAULT_REQ = {
  weekday: { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 },
  sunday: { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 },
};

export async function GET(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);

  if (searchParams.get("list")) {
    const { data, error } = await supabaseAdmin()
      .from("schedules")
      .select("week_start,updated_at")
      .eq("station_id", st.id)
      .order("week_start", { ascending: false })
      .limit(60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ weeks: data });
  }

  const week = searchParams.get("week");
  if (!week) return NextResponse.json({ error: "missing week" }, { status: 400 });

  const sb = supabaseAdmin();
  const [cur, prev] = await Promise.all([
    sb.from("schedules").select("*").eq("station_id", st.id).eq("week_start", week).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,night_person,next_night_person,actual_night_person,grid")
      .eq("station_id", st.id)
      .lt("week_start", week)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  return NextResponse.json({ schedule: cur.data, prev: prev.data || null });
}

// Φορτώνει ό,τι χρειάζεται ο validator για τη συγκεκριμένη εβδομάδα.
async function loadContext(sb, stationId, week) {
  const [emp, set, prev, wt] = await Promise.all([
    sb.from("employees").select("*").eq("station_id", stationId),
    sb.from("settings").select("*").eq("station_id", stationId).maybeSingle(),
    sb
      .from("schedules")
      .select("week_start,grid,night_person,next_night_person,actual_night_person")
      .eq("station_id", stationId)
      .lt("week_start", week)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("weekly_employee_targets")
      .select("employee_id,exact_days")
      .eq("station_id", stationId)
      .eq("week_start", week),
  ]);

  const settings = set.data || {
    weekday_req: DEFAULT_REQ.weekday,
    sunday_req: DEFAULT_REQ.sunday,
    work_days: 6,
    max_per_shift: 4,
    shifts: {},
    leave_replaces_rest: true,
  };

  const d = new Date(week + "T00:00:00");
  d.setDate(d.getDate() - 7);
  const adjacent = prev.data?.week_start === d.toISOString().slice(0, 10);
  const prevSunday = {};
  if (adjacent && prev.data?.grid)
    for (const [id, row] of Object.entries(prev.data.grid))
      if (Array.isArray(row) && row[6]) prevSunday[id] = row[6];

  const weeklyTargets = {};
  for (const r of wt.data || []) weeklyTargets[r.employee_id] = r.exact_days;

  return {
    employees: emp.data || [],
    settings,
    prevSunday,
    weeklyTargets,
    prevNightPerson: adjacent ? prev.data?.night_person || null : null,
  };
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.week_start)
    return NextResponse.json({ error: "missing week_start" }, { status: 400 });

  const sb = supabaseAdmin();
  const ctx = await loadContext(sb, st.id, body.week_start);

  // 2B: validation με τα CURRENT targets του request, όχι stale από τη βάση.
  const currentTargets = { ...ctx.weeklyTargets };
  const sanitized = {};
  if (body.weekly_targets && typeof body.weekly_targets === "object") {
    for (const [empId, v] of Object.entries(body.weekly_targets)) {
      if (v === "" || v == null) {
        delete currentTargets[empId];
        sanitized[empId] = "";
        continue;
      }
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= 7) {
        currentTargets[empId] = n;
        sanitized[empId] = n;
      }
    }
  }

  // SERVER-SIDE VALIDATION: το API δεν εμπιστεύεται το grid του browser.
  const dayReq =
    Array.isArray(body.day_req) && body.day_req.length === 7
      ? body.day_req
      : Array.from({ length: 7 }, (_, i) =>
          i === 6 ? ctx.settings.sunday_req : ctx.settings.weekday_req
        );

  const check = validateGrid({
    grid: body.grid || {},
    employees: ctx.employees,
    dayReq,
    shifts: ctx.settings.shifts,
    maxPerShift: ctx.settings.max_per_shift || 4,
    workDays: ctx.settings.work_days || 6,
    prevSunday: ctx.prevSunday,
    weeklyTargets: currentTargets,
    leaveReplacesRest: ctx.settings.leave_replaces_rest !== false,
    nightPerson: body.night_person || null,
    nextNight: body.next_night_person || null,
    prevNightPerson: ctx.prevNightPerson,
  });

  const total = check.errors + check.warnings;
  // Χωρίς ρητό override, τα προβλήματα επιστρέφονται και ΔΕΝ αποθηκεύεται.
  if (total > 0 && !body.override) {
    return NextResponse.json(
      {
        needsConfirmation: true,
        errors: check.errors,
        warnings: check.warnings,
        groups: check.groups,
      },
      { status: 409 }
    );
  }

  const row = {
    station_id: st.id,
    week_start: body.week_start,
    grid: body.grid || {},
    night_person: body.night_person || null,
    next_night_person: body.next_night_person || null,
    // Α: ποιος ΠΡΑΓΜΑΤΙΚΑ ξεκίνησε το νέο νυχτερινό μπλοκ την Κυριακή.
    actual_night_person: actualNightStarter(body, ctx.employees),
    day_req: Array.isArray(body.day_req) ? body.day_req : [],
    night_exceptions: Array.isArray(body.night_exceptions) ? body.night_exceptions : [],
    override_warnings: total > 0 ? check.all.slice(0, 200) : [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("schedules")
    .upsert(row, { onConflict: "station_id,week_start" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2B: αποθηκεύουμε και τα weekly targets της ίδιας εβδομάδας.
  if (Object.keys(sanitized).length) {
    const rows = [];
    const clear = [];
    for (const [empId, v] of Object.entries(sanitized)) {
      if (v === "") clear.push(empId);
      else
        rows.push({
          station_id: st.id,
          week_start: body.week_start,
          employee_id: empId,
          exact_days: v,
        });
    }
    if (clear.length)
      await sb
        .from("weekly_employee_targets")
        .delete()
        .eq("station_id", st.id)
        .eq("week_start", body.week_start)
        .in("employee_id", clear);
    if (rows.length)
      await sb
        .from("weekly_employee_targets")
        .upsert(rows, { onConflict: "station_id,week_start,employee_id" });
  }
  return NextResponse.json({
    schedule: data,
    savedWithOverride: total > 0,
    errors: check.errors,
    warnings: check.warnings,
  });
}

// Ο πραγματικός κάτοχος του νέου κύκλου = όποιος έχει Β την Κυριακή.
// Αν ο planned δεν το έκανε τελικά, συνεχίζει ο πραγματικός.
function actualNightStarter(body, employees) {
  const grid = body.grid || {};
  for (const e of employees) if ((grid[e.id] || [])[6] === "Β") return e.id;
  return body.next_night_person || null;
}
