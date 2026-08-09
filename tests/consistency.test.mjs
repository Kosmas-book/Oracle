import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWeek } from "../lib/generator.js";
import { validateGrid } from "../lib/validate.js";
import { targetDays } from "../lib/scheduleRules.js";
import { mk, team, WEEKDAY, SUNDAY, workedDays } from "./helpers.mjs";

// Το UI χρησιμοποιεί ΤΗΝ ΙΔΙΑ function — αναπαράγουμε ακριβώς την κλήση του
// app/page.js targetOf().
const uiTarget = (e, grid, cfg, weeklyTargets = {}) =>
  targetDays({
    employee: e,
    weeklyTarget: weeklyTargets[e.id],
    workDays: cfg.work_days || 6,
    leaveDays: (grid[e.id] || []).filter((c) => c === "Ο").length,
    leaveReplacesRest: cfg.leave_replaces_rest !== false,
  }).exact;

test("C1. Generator, validator και UI συμφωνούν στον στόχο (Ο/Ρ)", () => {
  for (const lrr of [true, false]) {
    const emps = team(10);
    const { grid } = generateWeek({
      employees: emps,
      weekdayReq: WEEKDAY,
      sundayReq: SUNDAY,
      nightPersonId: "n1",
      nextNightPersonId: "n2",
      workDays: 6,
      maxPerShift: 4,
      leaveReplacesRest: lrr,
      locked: { e5: { 2: "Ο" } },
    });
    const cfg = { work_days: 6, leave_replaces_rest: lrr };
    const e5 = emps.find((e) => e.id === "e5");

    const uiT = uiTarget(e5, grid, cfg);
    const genDays = workedDays(grid["e5"]);
    const v = validateGrid({
      grid,
      employees: emps,
      dayReq: Array.from({ length: 7 }, (_, i) => (i === 6 ? SUNDAY : WEEKDAY)),
      workDays: 6,
      leaveReplacesRest: lrr,
      nightPerson: "n1",
      nextNight: "n2",
    });
    const falseWarning = (v.groups.find((g) => g.key === "days")?.items || []).find(
      (x) => x.startsWith(e5.name + ":")
    );

    assert.equal(genDays, uiT, `lrr=${lrr}: generator ${genDays} ≠ UI ${uiT}`);
    assert.equal(
      falseWarning,
      undefined,
      `lrr=${lrr}: ψευδές warning «${falseWarning}» ενώ generator και UI συμφωνούν`
    );
  }
});

test("C2. Weekly target εφαρμόζεται ΑΜΕΣΩΣ, χωρίς προηγούμενο Save", () => {
  // Προσομοίωση: τα targets έρχονται από το request, όχι από τη βάση.
  const emps = [
    mk("n1", "ΒΡΑΔ-1", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("n2", "ΒΡΑΔ-2", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("e3", "ΥΠ-3"), mk("e4", "ΥΠ-4"), mk("e5", "ΥΠ-5"),
    mk("e6", "ΥΠ-6"), mk("e7", "ΥΠ-7"),
    mk("pt", "PART", { employment_type: "part", min_days: 2, max_days: 4 }),
  ];
  const run = (targets) =>
    generateWeek({
      employees: emps,
      weekdayReq: WEEKDAY,
      sundayReq: SUNDAY,
      nightPersonId: "n1",
      nextNightPersonId: "n2",
      workDays: 6,
      maxPerShift: 4,
      weeklyTargets: targets,
    });

  // Χωρίς target: ελεύθερος μέσα στο εύρος 2–4
  const free = workedDays(run({}).grid["pt"]);
  assert.ok(free >= 2 && free <= 4, `εκτός εύρους: ${free}`);
  // Με target στο ίδιο κάλεσμα: ακριβώς η τιμή
  for (const t of [0, 1, 2, 4]) {
    assert.equal(workedDays(run({ pt: t }).grid["pt"]), t, `target ${t}`);
  }
});

test("C3. Πιεσμένη στελέχωση: ο part-time ΔΕΝ ξεπερνά τον exact target", () => {
  // 6 άτομα για 9 θέσεις/μέρα — ο scheduler «θέλει» τον part-time παντού.
  const emps = [
    mk("n1", "ΒΡΑΔ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("n2", "ΒΡΑΔ2", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("e3", "ΥΠ-3"), mk("e4", "ΥΠ-4"), mk("e5", "ΥΠ-5"),
    mk("pt", "PART", { employment_type: "part", min_days: 1, max_days: 6 }),
  ];
  const { grid, warnings } = generateWeek({
    employees: emps,
    weekdayReq: WEEKDAY,
    sundayReq: SUNDAY,
    nightPersonId: "n1",
    nextNightPersonId: "n2",
    workDays: 6,
    maxPerShift: 4,
    weeklyTargets: { pt: 2 },
  });
  assert.equal(
    workedDays(grid["pt"]),
    2,
    `ο part-time ξεπέρασε τον στόχο: ${grid["pt"].join(" ")}`
  );
  assert.ok(
    warnings.some((w) => w.includes("ακάλυπτες θέσεις") || w.includes("λείπει")),
    "αναμένεται αναφορά κενών κάλυψης: " + warnings.join(" | ")
  );
});

test("C4. Soft delete: deactivated_at είναι η μοναδική πηγή αλήθειας", () => {
  const legacy = mk("old", "ΠΑΛΙΟΣ", { active: false }); // legacy row
  const soft = mk("gone", "ΑΠΕΝΕΡΓΟΣ", { deactivated_at: "2026-01-01T00:00:00Z" });
  const live = mk("ok", "ΕΝΕΡΓΟΣ");
  const v = validateGrid({
    grid: {
      old: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
      gone: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
      ok: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
    },
    employees: [legacy, soft, live],
    dayReq: Array.from({ length: 7 }, () => ({})),
  });
  // Ο legacy (active=false αλλά deactivated_at=null) θεωρείται ΕΝΕΡΓΟΣ.
  assert.ok(!v.all.some((x) => x.includes("ΑΠΕΝΕΡΓΟΣ")), "ελέγχθηκε soft-deleted");
});
