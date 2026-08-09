import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";
import { generateMonth, monthWeeks, rotationList } from "@/lib/monthPlan";
import { validateGrid } from "@/lib/validate";
import { allShifts } from "@/lib/shifts";
import {
  partitionWeeks, resolveActualNight, buildScheduleRow,
  collectTargetOps, prevSundayFor, prevNightFor,
} from "@/lib/monthSave";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  weekday_req: { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 },
  sunday_req: { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 },
  work_days: 6,
  max_per_shift: 4,
  shifts: {},
  leave_replaces_rest: true,
  night_rotation_order: [],
};

async function loadContext(sb, stationId, weeks) {
  const first = weeks[0];
  const [emp, set, saved, prev, targets] = await Promise.all([
    sb
      .from("employees")
      .select("*")
      .eq("station_id", stationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    sb.from("settings").select("*").eq("station_id", stationId).maybeSingle(),
    sb
      .from("schedules")
      .select("*")
      .eq("station_id", stationId)
      .in("week_start", weeks),
    // Η αμέσως προηγούμενη αποθηκευμένη εβδομάδα πριν τον μήνα: cross-month state.
    sb
      .from("schedules")
      .select("week_start,grid,night_person,next_night_person,actual_night_person")
      .eq("station_id", stationId)
      .lt("week_start", first)
      .order("week_start", { ascending: false })
      .limit(6),
    sb
      .from("weekly_employee_targets")
      .select("week_start,employee_id,exact_days")
      .eq("station_id", stationId)
      .in("week_start", weeks),
  ]);

  // 2: κανένα σιωπηλό fallback σε κενά δεδομένα όταν αποτύχει query.
  for (const [name, res] of [
    ["employees", emp], ["settings", set], ["schedules", saved],
    ["previous", prev], ["targets", targets],
  ]) {
    if (res.error)
      throw new Error(`Αποτυχία φόρτωσης (${name}): ${res.error.message}`);
  }
  if (!emp.data)
    throw new Error("Δεν φορτώθηκε το προσωπικό του καταστήματος.");

  const settings = { ...DEFAULTS, ...(set.data || {}) };
  const savedWeeks = {};
  for (const r of saved.data || []) savedWeeks[r.week_start] = r;

  const past = prev.data || [];
  const last = past[0] || null;
  const d = new Date(first + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  const adjacent = last?.week_start === d.toISOString().slice(0, 10);

  const prevSunday = {};
  if (adjacent && last?.grid)
    for (const [id, row] of Object.entries(last.grid))
      if (Array.isArray(row) && row[6]) prevSunday[id] = row[6];

  // 25: fairness history από τις πραγματικές προηγούμενες εβδομάδες.
  const history = {};
  for (const wk of past) {
    for (const [empId, row] of Object.entries(wk.grid || {})) {
      if (!Array.isArray(row)) continue;
      history[empId] = history[empId] || { codes: {}, sundays: 0 };
      row.forEach((c, i) => {
        if (!c || c === "Ρ" || c === "Ο") return;
        history[empId].codes[c] = (history[empId].codes[c] || 0) + 1;
        if (i === 6) history[empId].sundays++;
      });
    }
  }

  const weeklyTargetsByWeek = {};
  for (const r of targets.data || []) {
    weeklyTargetsByWeek[r.week_start] = weeklyTargetsByWeek[r.week_start] || {};
    weeklyTargetsByWeek[r.week_start][r.employee_id] = r.exact_days;
  }

  return {
    employees: emp.data || [],
    settings,
    hasNightShift: !!allShifts(settings.shifts)["Β"],
    savedWeeks,
    weeklyTargetsByWeek,
    seed: {
      prevSunday,
      // 7/8: συνέχεια rotation — ο ΠΡΑΓΜΑΤΙΚΟΣ κάτοχος του τρέχοντος μπλοκ.
      currentNight: adjacent
        ? last?.actual_night_person || last?.next_night_person || null
        : null,
      previousNight: adjacent ? last?.night_person || null : null,
      history,
    },
  };
}

// ---------------- 1: MONTH CONTEXT (καμία δημιουργία, καμία εγγραφή) -------
export async function GET(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12))
    return NextResponse.json({ error: "Μη έγκυρος μήνας." }, { status: 400 });

  const weeks = monthWeeks(year, month);
  const sb = supabaseAdmin();
  let ctx;
  try {
    ctx = await loadContext(sb, st.id, weeks);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  const order = ctx.settings.night_rotation_order || [];
  const rotation = rotationList(ctx.employees, order);

  return NextResponse.json({
    weeks,
    employees: ctx.employees.map(pub),
    nightCandidates: rotation.map(pub),
    settings: {
      shifts: ctx.settings.shifts,
      weekday_req: ctx.settings.weekday_req,
      sunday_req: ctx.settings.sunday_req,
      work_days: ctx.settings.work_days,
      leave_replaces_rest: ctx.settings.leave_replaces_rest,
      max_per_shift: ctx.settings.max_per_shift,
      night_rotation_order: order,
    },
    partTimers: ctx.employees
      .filter((e) => !e.deactivated_at && e.employment_type === "part")
      .map(pub),
    savedWeeks: Object.keys(ctx.savedWeeks),
    weeklyTargetsByWeek: ctx.weeklyTargetsByWeek,
    // 2: υπάρχει ήδη ενεργό μπλοκ από τον προηγούμενο μήνα;
    currentNight: ctx.seed.currentNight,
    previousNight: ctx.seed.previousNight,
    hasPreviousState: !!ctx.seed.currentNight,
    suggestedStartingNight: ctx.seed.currentNight || rotation[0]?.id || null,
  });
}

function pub(e) {
  return {
    id: e.id,
    name: e.name,
    employment_type: e.employment_type,
    allowed_shifts: e.allowed_shifts,
    fixed_days: e.fixed_days,
    min_days: e.min_days,
    max_days: e.max_days,
    deactivated_at: e.deactivated_at,
  };
}

// ---------------- DRAFT (καμία εγγραφή στη βάση) ----------------
export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const year = Number(body.year);
  const month = Number(body.month);
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12))
    return NextResponse.json({ error: "Μη έγκυρος μήνας." }, { status: 400 });

  const weeks = monthWeeks(year, month);
  const sb = supabaseAdmin();
  let ctx;
  try {
    ctx = await loadContext(sb, st.id, weeks);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // Τα targets του request υπερισχύουν για ΑΥΤΟ το draft.
  const wtByWeek = { ...ctx.weeklyTargetsByWeek };
  if (body.weekly_targets_by_week && typeof body.weekly_targets_by_week === "object")
    for (const [wk, t] of Object.entries(body.weekly_targets_by_week)) {
      wtByWeek[wk] = { ...(wtByWeek[wk] || {}) };
      for (const [id, v] of Object.entries(t || {})) {
        if (v === "" || v == null) delete wtByWeek[wk][id];
        else {
          const n = Math.round(Number(v));
          if (Number.isFinite(n) && n >= 0 && n <= 7) wtByWeek[wk][id] = n;
        }
      }
    }

  const draft = generateMonth({
    year,
    month,
    employees: ctx.employees,
    settings: ctx.settings,
    savedWeeks: ctx.savedWeeks,
    keepExisting: body.keep_existing || {},
    nightMode: body.night_mode === "manual" ? "manual" : "auto",
    manualNight: body.manual_night || {},
    weeklyTargetsByWeek: wtByWeek,
    lockedByWeek: body.locked_by_week || {},
    rotationOrder: ctx.settings.night_rotation_order || [],
    seed: ctx.seed,
    startingNight: body.starting_night || null,
    onlyWeek: body.only_week || null,
    baseWeeks: Array.isArray(body.base_weeks) ? body.base_weeks : null,
  });

  return NextResponse.json({
    ...draft,
    savedWeeks: Object.keys(ctx.savedWeeks),
    employees: ctx.employees.map(pub),
    settings: {
      shifts: ctx.settings.shifts,
      weekday_req: ctx.settings.weekday_req,
      sunday_req: ctx.settings.sunday_req,
      work_days: ctx.settings.work_days,
      leave_replaces_rest: ctx.settings.leave_replaces_rest,
      max_per_shift: ctx.settings.max_per_shift,
    },
  });
}

// ---------------- SAVE MONTH ----------------
export async function PUT(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const list = Array.isArray(body.weeks) ? body.weeks : [];
  if (!list.length)
    return NextResponse.json({ error: "Καμία εβδομάδα προς αποθήκευση." }, { status: 400 });

  const sb = supabaseAdmin();
  // 9: χρονολογική σειρά, ώστε κάθε boundary να χρησιμοποιεί το τελικό
  // grid της αμέσως προηγούμενης.
  const { toWrite, preserved } = partitionWeeks(list);
  const ordered = [...toWrite, ...preserved].sort((a, b) =>
    a.week_start < b.week_start ? -1 : 1
  );
  const weekKeys = ordered.map((w) => w.week_start);

  let ctx;
  try {
    ctx = await loadContext(sb, st.id, weekKeys);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }

  const wd = ctx.settings.weekday_req;
  const sd = ctx.settings.sunday_req;

  // 9: server-side validation ΟΛΩΝ των weeks. Για τις preserved
  // χρησιμοποιείται το DB grid (βλ. παρακάτω), όχι ό,τι έστειλε ο browser.
  // Το batch που χρησιμοποιείται για boundaries: preserved weeks
  // αντιπροσωπεύονται από το DB grid τους.
  const effectiveBatch = ordered.map((w) =>
    w.preserve === true
      ? {
          week_start: w.week_start,
          grid: ctx.savedWeeks[w.week_start]?.grid || {},
          night_person: ctx.savedWeeks[w.week_start]?.night_person ?? null,
        }
      : w
  );

  const checks = {};
  const issues = [];
  for (const w of ordered) {
    const existingRow = ctx.savedWeeks[w.week_start];
    // 4: σε preserve=true αγνοούμε εντελώς το grid του browser — validation
    // πάνω σε αυτό που είναι ΟΝΤΩΣ αποθηκευμένο.
    const grid =
      w.preserve === true
        ? existingRow?.grid || {}
        : w.grid || existingRow?.grid || {};
    const actual = resolveActualNight(grid, ctx.employees);

    // 4/9: 0 ή 2+ Β την Κυριακή → ρητό structured error.
    if (actual.ambiguous || (actual.count === 0 && ctx.hasNightShift))
      issues.push({
        week_start: w.week_start,
        errors: 1,
        warnings: 0,
        groups: [
          {
            key: "ambiguousNight",
            level: "error",
            title: "Νυχτερινή βάρδια Κυριακής",
            items: [
              actual.ambiguous
                ? `Την Κυριακή έχουν Β οι: ${actual.names.join(", ")}. Επιτρέπεται μόνο ένας.`
                : "Καμία νυχτερινή βάρδια (Β) την Κυριακή — δεν μπορεί να προσδιοριστεί ποιος ξεκινά το νέο μπλοκ.",
            ],
          },
        ],
      });

    const check = validateGrid({
      grid,
      employees: ctx.employees,
      dayReq:
        Array.isArray(w.day_req) && w.day_req.length === 7
          ? w.day_req
          : Array.isArray(existingRow?.day_req) && existingRow.day_req.length === 7
          ? existingRow.day_req
          : Array.from({ length: 7 }, (_, i) => (i === 6 ? sd : wd)),
      shifts: ctx.settings.shifts,
      maxPerShift: ctx.settings.max_per_shift || 4,
      workDays: ctx.settings.work_days || 6,
      // 9: πρώτη week → πραγματική προηγούμενη adjacent Κυριακή από το seed.
      prevSunday: prevSundayFor({
        weekStart: w.week_start,
        batch: effectiveBatch,
        savedWeeks: ctx.savedWeeks,
        seedPrevSunday: ctx.seed.prevSunday,
      }),
      // 9: τα CURRENT targets του request υπερισχύουν των stale DB.
      weeklyTargets: {
        ...(ctx.weeklyTargetsByWeek[w.week_start] || {}),
        ...(w.weekly_targets || {}),
      },
      leaveReplacesRest: ctx.settings.leave_replaces_rest !== false,
      nightPerson: w.night_person ?? existingRow?.night_person ?? null,
      nextNight: w.next_night_person ?? existingRow?.next_night_person ?? null,
      prevNightPerson: prevNightFor({
        weekStart: w.week_start,
        batch: effectiveBatch,
        savedWeeks: ctx.savedWeeks,
        seedPreviousNight: ctx.seed.previousNight,
      }),
    });
    checks[w.week_start] = check;
    if (check.errors + check.warnings > 0)
      issues.push({
        week_start: w.week_start,
        errors: check.errors,
        warnings: check.warnings,
        groups: check.groups,
      });
  }

  if (issues.length && !body.override)
    return NextResponse.json(
      {
        needsConfirmation: true,
        weeksWithIssues: new Set(issues.map((i) => i.week_start)).size,
        errors: issues.reduce((s, x) => s + x.errors, 0),
        warnings: issues.reduce((s, x) => s + x.warnings, 0),
        issues,
      },
      { status: 409 }
    );

  // 6: γράφονται ΜΟΝΟ όσες δεν είναι preserve=true.
  const now = new Date().toISOString();
  const rows = toWrite.map((w) =>
    buildScheduleRow({
      week: w,
      existingRow: ctx.savedWeeks[w.week_start],
      stationId: st.id,
      employees: ctx.employees,
      weekdayReq: wd,
      sundayReq: sd,
      check: checks[w.week_start],
      now,
    })
  );

  let savedWeekKeys = [];
  if (rows.length) {
    const { error } = await sb
      .from("schedules")
      .upsert(rows, { onConflict: "station_id,week_start" });
    if (error)
      return NextResponse.json(
        { ok: false, error: error.message, savedWeeks: [], partial: false },
        { status: 500 }
      );
    savedWeekKeys = rows.map((r) => r.week_start);
  }

  // 7: τα targets επεξεργάζονται για ΟΛΕΣ τις weeks — και τις preserved.
  const { upserts, deletes } = collectTargetOps(ordered, st.id);
  const targetErrors = [];
  for (const d of deletes) {
    const { error } = await sb
      .from("weekly_employee_targets")
      .delete()
      .eq("station_id", st.id)
      .eq("week_start", d.week_start)
      .eq("employee_id", d.employee_id);
    if (error) targetErrors.push(`${d.week_start}: ${error.message}`);
  }
  if (upserts.length) {
    const { error } = await sb
      .from("weekly_employee_targets")
      .upsert(upserts, { onConflict: "station_id,week_start,employee_id" });
    if (error)
      targetErrors.push(
        `${[...new Set(upserts.map((u) => u.week_start))].join(", ")}: ${error.message}`
      );
  }

  // 7/9: αν αποτύχει η αποθήκευση στόχων, ΠΟΤΕ ok:true.
  if (targetErrors.length)
    return NextResponse.json(
      {
        ok: false,
        partial: true,
        savedWeeks: savedWeekKeys,
        preserved: preserved.map((w) => w.week_start),
        affectedWeeks: [
          ...new Set([
            ...upserts.map((u) => u.week_start),
            ...deletes.map((d) => d.week_start),
          ]),
        ],
        error:
          "Τα προγράμματα αποθηκεύτηκαν, αλλά οι εβδομαδιαίοι στόχοι part-time ΔΕΝ αποθηκεύτηκαν: " +
          targetErrors.join(" · ") +
          " Ξαναπάτησε Αποθήκευση μήνα.",
      },
      { status: 500 }
    );

  return NextResponse.json({
    ok: true,
    saved: rows.length,
    savedWeeks: savedWeekKeys,
    preserved: preserved.map((w) => w.week_start),
    targetsSaved: upserts.length,
    targetsCleared: deletes.length,
    savedWithOverride: issues.length > 0,
  });
}
