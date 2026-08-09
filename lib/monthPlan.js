import { generateWeek } from "./generator.js";
import { validateGrid } from "./validate.js";
import { allShifts, mondayOf, isoDate, addDays } from "./shifts.js";

// ============================================================
// MONTHLY ORCHESTRATION LAYER
// ΔΕΝ περιέχει scheduling αλγόριθμο. Καλεί επαναληπτικά τον υπάρχοντα
// weekly engine (generateWeek → rebalance εσωτερικά → validateGrid) και
// μεταφέρει σωστά το cross-week state από εβδομάδα σε εβδομάδα.
// ============================================================

// Όλες οι ΠΛΗΡΕΙΣ (Δευτέρα-based) εβδομάδες που τέμνουν τον μήνα.
// Μήνας που ξεκινά Τρίτη → η πρώτη εβδομάδα ξεκινά την προηγούμενη Δευτέρα.
export function monthWeeks(year, month /* 1-12 */) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const out = [];
  let cur = mondayOfUTC(first);
  const lastMonday = mondayOfUTC(last);
  while (cur <= lastMonday) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 7 * 86400000);
  }
  return out;
}

function mondayOfUTC(d) {
  const x = new Date(d.getTime());
  const wd = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - wd);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Ποιες ημέρες της εβδομάδας ανήκουν όντως στον μήνα (για αχνή εμφάνιση).
export function daysInMonthFlags(weekStart, year, month) {
  const base = new Date(weekStart + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
  });
}

// Εργαζόμενοι που ΕΠΙΤΡΕΠΕΤΑΙ να κάνουν νυχτερινή.
export function eligibleNightEmployees(employees) {
  return employees.filter(
    (e) => !e.deactivated_at && (e.allowed_shifts || []).includes("Β")
  );
}

// Σειρά rotation: αποθηκευμένη σειρά ανά station, αλλιώς sort_order/όνομα.
export function rotationList(employees, savedOrder) {
  const eligible = eligibleNightEmployees(employees);
  const byId = Object.fromEntries(eligible.map((e) => [e.id, e]));
  const out = [];
  for (const id of savedOrder || []) if (byId[id]) out.push(byId[id]);
  const rest = eligible
    .filter((e) => !out.some((x) => x.id === e.id))
    .sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.name.localeCompare(b.name, "el")
    );
  return [...out, ...rest];
}

// Ο επόμενος του rotation ΜΕΤΑ από τον πραγματικό τελευταίο κάτοχο.
export function nextInRotation(list, afterId) {
  if (!list.length) return null;
  const i = list.findIndex((e) => e.id === afterId);
  if (i < 0) return list[0];
  return list[(i + 1) % list.length];
}

// 3: Μπορεί ο υποψήφιος να αναλάβει ΟΛΟΚΛΗΡΟ το μπλοκ;
// Το μπλοκ είναι: Κυριακή (τρέχουσα εβδομάδα) + Δευτέρα–Σάββατο (ΕΠΟΜΕΝΗ).
// Ελέγχεται lookahead και στις δύο εβδομάδες — όχι μόνο η Κυριακή.
export function canTakeNightBlock(
  emp,
  { locked = {}, lockedNext = {}, shifts = null } = {}
) {
  if (!emp) return { ok: false, reason: "δεν υπάρχει υποψήφιος" };
  if (emp.deactivated_at) return { ok: false, reason: "ανενεργός" };
  if (!(emp.allowed_shifts || []).includes("Β"))
    return { ok: false, reason: "δεν κάνει νυχτερινή" };

  const SH = allShifts(shifts);
  if (!SH["Β"]) return { ok: false, reason: "το κατάστημα δεν έχει νυχτερινή" };

  const fixed = emp.fixed_days || {};
  const at = (obj, d) => obj?.[String(d)] ?? obj?.[d];
  const why = (code, label) =>
    code === "Ο" ? `άδεια ${label}` : `σταθερή βάρδια ${code} ${label}`;

  // Έναρξη: Κυριακή της τρέχουσας εβδομάδας.
  const fSun = at(fixed, 6);
  if (fSun && fSun !== "Β") return { ok: false, reason: why(fSun, "την Κυριακή") };
  const lSun = at(locked[emp.id], 6);
  if (lSun && lSun !== "Β") return { ok: false, reason: why(lSun, "την Κυριακή") };

  // Συνέχεια: Δευτέρα–Σάββατο της ΕΠΟΜΕΝΗΣ εβδομάδας.
  const names = ["τη Δευτέρα", "την Τρίτη", "την Τετάρτη", "την Πέμπτη", "την Παρασκευή", "το Σάββατο"];
  for (let d = 0; d < 6; d++) {
    const f = at(fixed, d);
    if (f && f !== "Β")
      return { ok: false, reason: `${why(f, names[d])} μέσα στο νυχτερινό μπλοκ` };
    const l = at(lockedNext[emp.id], d);
    if (l && l !== "Β")
      return { ok: false, reason: `${why(l, names[d])} μέσα στο νυχτερινό μπλοκ` };
  }
  return { ok: true };
}

// Επιλογή κατόχου για το επόμενο μπλοκ, με skip όσων δεν μπορούν.
export function pickNextNight({
  list, afterId, locked, lockedNext, shifts, requiredHolder = null,
}) {
  const skipped = [];
  if (!list.length) return { pick: null, skipped };
  // 1: αν η επόμενη εβδομάδα είναι preserved, το Β της Κυριακής ΠΡΕΠΕΙ να
  // δοθεί σε αυτόν που κρατά ήδη το μπλοκ Δευ–Σάβ εκεί.
  if (requiredHolder) {
    const forced = list.find((e) => e.id === requiredHolder);
    if (forced) return { pick: forced, skipped, forcedByPreserved: true };
  }
  let candidate = nextInRotation(list, afterId);
  for (let i = 0; i < list.length; i++) {
    const check = canTakeNightBlock(candidate, { locked, lockedNext, shifts });
    if (check.ok) return { pick: candidate, skipped };
    skipped.push({ id: candidate.id, name: candidate.name, reason: check.reason });
    candidate = nextInRotation(list, candidate.id);
  }
  return { pick: null, skipped };
}

// Ποιος κρατάει το μπλοκ Δευτέρα–Σάββατο σε μια αποθηκευμένη εβδομάδα.
export function nightHolderOfSavedWeek(grid, employees) {
  for (const e of employees || []) {
    const row = (grid || {})[e.id];
    if (!Array.isArray(row)) continue;
    let n = 0;
    for (let d = 0; d < 6; d++) if (row[d] === "Β") n++;
    if (n >= 4) return e.id; // ανέχεται 1-2 έκτακτες αντικαταστάσεις
  }
  return null;
}

// Ο ΠΡΑΓΜΑΤΙΚΟΣ κάτοχος του νέου μπλοκ = όποιος έχει Β την Κυριακή.
export function actualNightFrom(grid, employees) {
  const holders = employees.filter((e) => (grid[e.id] || [])[6] === "Β");
  if (holders.length === 1) return { id: holders[0].id, ambiguous: false };
  if (holders.length > 1)
    return { id: null, ambiguous: true, names: holders.map((e) => e.name) };
  return { id: null, ambiguous: false };
}

// ============================================================
// ΚΥΡΙΑ ΣΥΝΑΡΤΗΣΗ — παράγει DRAFT μήνα. Καμία εγγραφή σε βάση.
// ============================================================
export function generateMonth({
  year,
  month,
  employees,
  settings,
  savedWeeks = {},        // { week_start: schedule row } ήδη αποθηκευμένες
  keepExisting = {},      // { week_start: true } → διατήρηση, όχι αναδημιουργία
  nightMode = "auto",     // "auto" | "manual"
  manualNight = {},       // { week_start: employeeId }
  weeklyTargetsByWeek = {}, // { week_start: { empId: n } }
  lockedByWeek = {},      // { week_start: { empId: { day: code } } }
  rotationOrder = [],
  seed = {},              // { prevSunday, currentNight, previousNight, history }
  startingNight = null,   // 2: ρητός τρέχων βραδινός όταν δεν υπάρχει ιστορικό
  onlyWeek = null,        // 5: αναδημιουργία ΜΟΝΟ αυτής της εβδομάδας
  baseWeeks = null,       // 5: το υπάρχον draft (κρατάει manual edits)
}) {
  const t0 = Date.now();
  const weeks = monthWeeks(year, month);
  const weekdayReq = settings.weekday_req || {};
  const sundayReq = settings.sunday_req || {};
  const shifts = settings.shifts || null;
  const workDays = settings.work_days || 6;
  const maxPerShift = settings.max_per_shift || 4;
  const leaveReplacesRest = settings.leave_replaces_rest !== false;
  const hasNight = !!allShifts(shifts)["Β"];
  const list = rotationList(employees, rotationOrder);

  // Προσωρινό history — μόνο στη μνήμη, ΔΕΝ γράφεται στη βάση.
  const history = JSON.parse(JSON.stringify(seed.history || {}));
  const addToHistory = (grid) => {
    for (const [empId, row] of Object.entries(grid)) {
      if (!Array.isArray(row)) continue;
      history[empId] = history[empId] || { codes: {}, sundays: 0 };
      row.forEach((c, d) => {
        if (!c || c === "Ρ" || c === "Ο") return;
        history[empId].codes[c] = (history[empId].codes[c] || 0) + 1;
        if (d === 6) history[empId].sundays++;
      });
    }
  };

  let prevSunday = { ...(seed.prevSunday || {}) };
  // 2: χωρίς αποθηκευμένο ιστορικό, ο τρέχων βραδινός ορίζεται ρητά (ή
  // προτείνεται ο πρώτος του rotation) ώστε η πρώτη εβδομάδα να ΜΗΝ βγει κουτσή.
  let currentNight =
    seed.currentNight || startingNight || (hasNight ? list[0]?.id || null : null);
  let previousNight = seed.previousNight || null; // ολοκλήρωσε το προηγούμενο μπλοκ
  const out = [];
  let aborted = null;

  const baseByWeek = {};
  for (const w of baseWeeks || []) baseByWeek[w.week_start] = w;

  for (const week_start of weeks) {
    // 5: αν ζητήθηκε αναδημιουργία μίας μόνο εβδομάδας, οι υπόλοιπες
    // επαναχρησιμοποιούνται ΑΥΤΟΥΣΙΕΣ από το υπάρχον draft (μαζί με τυχόν
    // χειροκίνητες αλλαγές), και μόνο το state τους μεταφέρεται παρακάτω.
    if (onlyWeek && week_start !== onlyWeek && baseByWeek[week_start]) {
      const b = baseByWeek[week_start];
      addToHistory(b.grid || {});
      out.push(b);
      previousNight = b.nightPerson ?? previousNight;
      currentNight = b.actualNight ?? currentNight;
      prevSunday = sundayOf(b.grid || {});
      continue;
    }

    const existing = savedWeeks[week_start];
    const keep = existing && keepExisting[week_start] !== false;

    if (keep && existing) {
      // 14: διατηρούμε το αποθηκευμένο και μεταφέρουμε το ΠΡΑΓΜΑΤΙΚΟ state.
      const grid = existing.grid || {};
      addToHistory(grid);
      const actual = actualNightFrom(grid, employees);
      out.push({
        week_start,
        grid,
        source: "existing",
        // 2: το metadata της αποθηκευμένης εβδομάδας φορτώνεται στο draft,
        // ώστε ένα edit να μην το σβήσει κατά την αποθήκευση.
        day_req: Array.isArray(existing.day_req) ? existing.day_req : undefined,
        nightExceptions: Array.isArray(existing.night_exceptions)
          ? existing.night_exceptions
          : undefined,
        overrideWarnings: Array.isArray(existing.override_warnings)
          ? existing.override_warnings
          : undefined,
        nightPerson: currentNight,
        nextNight: existing.next_night_person || null,
        actualNight: existing.actual_night_person || actual.id,
        warnings: [],
        check: validateGrid({
          grid,
          employees,
          dayReq: weekDayReq(existing.day_req, weekdayReq, sundayReq),
          shifts,
          maxPerShift,
          workDays,
          prevSunday,
          weeklyTargets: weeklyTargetsByWeek[week_start] || {},
          leaveReplacesRest,
          nightPerson: currentNight,
          nextNight: existing.next_night_person || null,
          prevNightPerson: previousNight,
        }),
        skippedNight: [],
      });
      previousNight = currentNight;
      currentNight = existing.actual_night_person || actual.id || null;
      prevSunday = sundayOf(grid);
      continue;
    }

    // Επιλογή επόμενου κατόχου νυχτερινής.
    const locked = lockedByWeek[week_start] || {};
    let nextNight = null;
    let skippedNight = [];
    if (hasNight) {
      if (nightMode === "manual") {
        const id = manualNight[week_start] || null;
        nextNight = employees.find((e) => e.id === id) || null;
      } else {
        const nextWeekStart = weeks[weeks.indexOf(week_start) + 1];
        // 1: το lookahead συνδυάζει locked/Ο του χρήστη ΚΑΙ το ήδη
        // αποθηκευμένο grid της επόμενης εβδομάδας, όταν αυτή διατηρείται.
        const nextSaved = nextWeekStart ? savedWeeks[nextWeekStart] : null;
        const nextPreserved =
          nextSaved && keepExisting[nextWeekStart] !== false ? nextSaved : null;
        const lockedNext = { ...(nextWeekStart ? lockedByWeek[nextWeekStart] || {} : {}) };
        if (nextPreserved?.grid)
          for (const [empId, row] of Object.entries(nextPreserved.grid)) {
            if (!Array.isArray(row)) continue;
            const cells = { ...(lockedNext[empId] || {}) };
            row.forEach((c, d) => {
              if (d < 6 && c && cells[d] === undefined) cells[d] = c;
            });
            if (Object.keys(cells).length) lockedNext[empId] = cells;
          }
        const r = pickNextNight({
          list,
          afterId: currentNight,
          locked,
          lockedNext,
          shifts,
          // Αν η επόμενη είναι preserved, ο κάτοχος Δευ–Σάβ είναι ήδη γνωστός.
          requiredHolder: nextPreserved
            ? nightHolderOfSavedWeek(nextPreserved.grid, employees)
            : null,
        });
        nextNight = r.pick;
        skippedNight = r.skipped;
      }
    }

    const res = generateWeek({
      employees,
      weekdayReq,
      sundayReq,
      nightPersonId: currentNight,
      nextNightPersonId: nextNight?.id || null,
      prevNightPersonId: previousNight,
      workDays,
      maxPerShift,
      locked,
      prevSunday,
      shifts,
      dayReq: null,
      history,
      leaveReplacesRest,
      weeklyTargets: weeklyTargetsByWeek[week_start] || {},
    });

    const check = validateGrid({
      grid: res.grid,
      employees,
      dayReq: Array.from({ length: 7 }, (_, i) => (i === 6 ? sundayReq : weekdayReq)),
      shifts,
      maxPerShift,
      workDays,
      prevSunday,
      weeklyTargets: weeklyTargetsByWeek[week_start] || {},
      leaveReplacesRest,
      nightPerson: currentNight,
      nextNight: nextNight?.id || null,
      prevNightPerson: previousNight,
    });

    const warnings = [...res.warnings];
    for (const s of skippedNight)
      warnings.unshift(
        `Ο/η ${s.name} παραλείφθηκε από το night rotation επειδή δεν μπορεί να αναλάβει ολόκληρο το block που ξεκινά ${fmtDate(week_start, 6)} — ${s.reason}. Επιλέχθηκε ο/η ${nextNight?.name || "—"}.`
      );

    const actual = actualNightFrom(res.grid, employees);
    if (hasNight && actual.ambiguous) {
      // 39: χωρίς αξιόπιστο cross-week state δεν προχωράμε στα επόμενα.
      aborted = {
        week_start,
        error: `Ασαφής κάτοχος νυχτερινού κύκλου (${actual.names.join(", ")}). Η δημιουργία των επόμενων εβδομάδων σταμάτησε.`,
      };
      out.push({
        week_start,
        grid: res.grid,
        source: "generated",
        nightPerson: currentNight,
        nextNight: nextNight?.id || null,
        actualNight: null,
        warnings,
        check,
        skippedNight,
        nightExceptions: res.nightExceptions || [],
      });
      break;
    }

    addToHistory(res.grid);
    out.push({
      week_start,
      grid: res.grid,
      source: "generated",
      nightPerson: currentNight,
      nextNight: nextNight?.id || null,
      actualNight: actual.id || nextNight?.id || null,
      warnings,
      check,
      skippedNight,
      nightExceptions: res.nightExceptions || [],
    });

    previousNight = currentNight;
    currentNight = actual.id || nextNight?.id || null;
    prevSunday = sundayOf(res.grid);
  }

  // 22: συγκεντρωτικό summary + 23: cross-week 11ωρο (ήδη μέσω prevSunday).
  const summary = {
    year,
    month,
    weeks: out.length,
    errors: out.reduce((s, w) => s + (w.check?.errors || 0), 0),
    warnings: out.reduce((s, w) => s + (w.check?.warnings || 0), 0),
    missing: countGroup(out, "short") + countGroup(out, "gaps"),
    restViolations: countGroup(out, "rest"),
    rotation: out.map((w) => w.actualNight).filter(Boolean),
    generationMs: Date.now() - t0,
    aborted,
  };

  return { weeks: out, summary, history };
}

function countGroup(weeks, key) {
  return weeks.reduce(
    (s, w) =>
      s + (w.check?.groups?.find((g) => g.key === key)?.items.length || 0),
    0
  );
}

function sundayOf(grid) {
  const out = {};
  for (const [id, row] of Object.entries(grid || {}))
    if (Array.isArray(row) && row[6]) out[id] = row[6];
  return out;
}

function weekDayReq(dayReq, weekdayReq, sundayReq) {
  if (Array.isArray(dayReq) && dayReq.length === 7) return dayReq;
  return Array.from({ length: 7 }, (_, i) => (i === 6 ? sundayReq : weekdayReq));
}

function fmtDate(weekStart, offset) {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
