#!/usr/bin/env node
// ============================================================
// Turno — Monthly scheduling simulations
// Τρέξε με:  npm run simulate
// Χρησιμοποιεί ΤΟΝ ΙΔΙΟ engine με την εφαρμογή (lib/monthPlan.js).
// ============================================================
import { generateMonth, monthWeeks } from "../lib/monthPlan.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { resolveActualNight } from "../lib/monthSave.js";

const mk = (id, name, o = {}) => ({
  id, name, active: true, employment_type: "full", min_days: 3, max_days: 6,
  allowed_shifts: ["Π", "Π2", "Π4", "Α", "Α2", "Α3"],
  fixed_days: {}, sort_order: 100, ...o,
});

const WEEKDAY = { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 };
const SUNDAY = { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 };
const SETTINGS = {
  weekday_req: WEEKDAY, sunday_req: SUNDAY, work_days: 6,
  max_per_shift: 4, shifts: null, leave_replaces_rest: true,
};

// 11 full-time (3 night-capable, 1 στενός, 1 με fixed) + 2 part-time
const fixture = () => [
  mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 10 }),
  mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 20 }),
  mk("mar", "ΜΑΡΙΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 30 }),
  mk("onlyA", "ΜΟΝΟ-Α", { allowed_shifts: ["Α"] }),
  mk("fx", "ΣΤΑΘΕΡΟΣ", { fixed_days: { 6: "Ρ" } }),
  mk("f1", "ΕΥΕΛ-1"), mk("f2", "ΕΥΕΛ-2"), mk("f3", "ΕΥΕΛ-3"), mk("f4", "ΕΥΕΛ-4"),
  mk("p1", "ΠΡΩΙΝΟΣ-1", { allowed_shifts: ["Π", "Π2", "Π4"] }),
  mk("p2", "ΠΡΩΙΝΟΣ-2", { allowed_shifts: ["Π", "Π2", "Π4"] }),
  mk("pt1", "PART-1", { employment_type: "part", min_days: 2, max_days: 4 }),
  mk("pt2", "PART-2", { employment_type: "part", min_days: 2, max_days: 3 }),
];

const YEAR = 2026, MONTH = 9;
const weeks = monthWeeks(YEAR, MONTH);
const SH = allShifts(null);

function run(title, opts) {
  const emps = opts.employees || fixture();
  const t0 = Date.now();
  const r = generateMonth({
    year: YEAR, month: MONTH, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"], ...opts,
  });
  const ms = Date.now() - t0;
  const nameOf = (id) => emps.find((e) => e.id === id)?.name || "—";
  const g = (w, k) => w.check?.groups?.find((x) => x.key === k)?.items.length || 0;

  console.log(`\n${"=".repeat(76)}\n${title}\n${"=".repeat(76)}`);
  console.log(
    `Full-time ${emps.filter((e) => e.employment_type !== "part").length} · ` +
    `Part-time ${emps.filter((e) => e.employment_type === "part").length} · ` +
    `Night-capable 3 · ${r.weeks.length} εβδομάδες · ${ms}ms\n`
  );
  console.log("ΕΒΔΟΜΑΔΑ      ΒΡΑΔ.Δευ-Σαβ  ΝΕΟ ΜΠΛΟΚ     Β/Κυρ  ΚΕΝΑ  ΕΛΛΕΙΜ  11ωρο");

  let M = 0, D = 0, RS = 0, ambiguous = 0;
  for (const w of r.weeks) {
    const miss = g(w, "short") + g(w, "gaps");
    const dev = g(w, "days");
    const rest = g(w, "rest");
    const an = resolveActualNight(w.grid, emps);
    if (an.ambiguous || an.count === 0) ambiguous++;
    M += miss; D += dev; RS += rest;
    console.log(
      `${w.week_start}    ${nameOf(w.nightPerson).padEnd(13)} ` +
      `${nameOf(w.actualNight).padEnd(13)} ${String(an.count).padStart(4)}  ` +
      `${String(miss).padStart(4)}  ${String(dev).padStart(6)}  ${String(rest).padStart(5)}`
    );
  }

  let cross = 0;
  for (let i = 1; i < r.weeks.length; i++)
    for (const e of emps) {
      const s = r.weeks[i - 1].grid[e.id]?.[6];
      const m = r.weeks[i].grid[e.id]?.[0];
      if (s && m && !restOk(s, m, SH)) cross++;
    }

  console.log(
    `\nΣΥΝΟΛΑ: ακάλυπτες ${M} · ελλείμματα ημερών ${D} · ` +
    `11ωρο ${RS} · cross-week ${cross} · ασαφής Β Κυριακής ${ambiguous}`
  );

  const skips = r.weeks.flatMap((w) =>
    (w.skippedNight || []).map((s) => ({ w: w.week_start, ...s }))
  );
  if (skips.length) {
    console.log("\nΠΑΡΑΛΕΙΨΕΙΣ ROTATION:");
    for (const s of skips) console.log(`  · ${s.w}: ${s.name} — ${s.reason}`);
  }
  return { M, RS, cross, ambiguous };
}

const results = [];

results.push(run("SIM 1 — ΜΕ PREVIOUS MONTH STATE (άδεια, fixed, weekly targets)", {
  seed: { currentNight: "dim", previousNight: "mar" },
  lockedByWeek: { [weeks[2]]: { f1: { 1: "Ο", 2: "Ο", 3: "Ο" } } },
  weeklyTargetsByWeek: {
    [weeks[0]]: { pt1: 2 }, [weeks[1]]: { pt1: 4 },
    [weeks[2]]: { pt1: 1 }, [weeks[3]]: { pt1: 3 },
  },
}));

results.push(run("SIM 2 — ΠΡΩΤΟΣ ΜΗΝΑΣ, ΧΩΡΙΣ ΚΑΝΕΝΑ PREVIOUS STATE", { seed: {} }));

results.push(run("SIM 3 — NEXT CANDIDATE ΜΗ ΔΙΑΘΕΣΙΜΟΣ ΜΕΣΑ ΣΤΟ BLOCK (Δευτέρα)", {
  seed: { currentNight: "dim", previousNight: "mar" },
  lockedByWeek: { [weeks[1]]: { tat: { 0: "Ο" } } },
}));

const bad = results.filter((r) => r.M > 0 || r.RS > 0 || r.cross > 0 || r.ambiguous > 0);
console.log(`\n${"=".repeat(76)}`);
if (bad.length) {
  console.log(`✗ ${bad.length}/${results.length} simulations με προβλήματα`);
  process.exit(1);
}
console.log(`✓ ${results.length}/${results.length} simulations καθαρά`);
