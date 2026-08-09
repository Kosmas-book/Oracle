import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWeek } from "../lib/generator.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { mk, workedDays, countIn } from "./helpers.mjs";

const REQ = { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 };
const SUN = { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 };

// Fixture σαν το πραγματικό αποτυχημένο πρόγραμμα:
// ένας full-time που κάνει κυρίως Α3, και ευέλικτοι που κάνουν Α3 + Π/Π4.
const hardFixture = () => [
  mk("n1", "ΒΡΑΔ-1", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  mk("n2", "ΒΡΑΔ-2", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  mk("a3", "ΜΟΝΟ-Α3", { allowed_shifts: ["Α3", "Α"] }), // στενός
  mk("f1", "ΕΥΕΛ-1", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
  mk("f2", "ΕΥΕΛ-2", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
  mk("f3", "ΕΥΕΛ-3", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
  mk("p1", "ΠΡΩΙΝΟΣ-1", { allowed_shifts: ["Π", "Π2", "Π4"] }),
  mk("p2", "ΠΡΩΙΝΟΣ-2", { allowed_shifts: ["Π", "Π2", "Π4"] }),
  mk("p3", "ΠΡΩΙΝΟΣ-3", { allowed_shifts: ["Π", "Π2", "Π4"] }),
  mk("x1", "ΑΠΟΓ-1", { allowed_shifts: ["Α", "Α2", "Α3"] }),
];

const run = (emps, over = {}) =>
  generateWeek({
    employees: emps,
    weekdayReq: REQ,
    sundayReq: SUN,
    nightPersonId: "n1",
    nextNightPersonId: "n2",
    workDays: 6,
    maxPerShift: 4,
    ...over,
  });

test("RB1. FEASIBLE: ΟΛΟΙ οι full-time βγάζουν ΑΚΡΙΒΩΣ 6 μέρες", () => {
  const emps = hardFixture();
  const { grid } = run(emps);
  for (const e of emps) {
    const w = workedDays(grid[e.id]);
    assert.equal(
      w,
      6,
      `${e.name}: ${w}/6 — το rebalance δεν βρήκε λύση: ${grid[e.id].join(" ")}`
    );
  }
});

test("RB2. Ο στενός εργαζόμενος (μόνο Α3/Α) φτάνει ΑΚΡΙΒΩΣ τον στόχο", () => {
  const emps = hardFixture();
  const { grid } = run(emps);
  assert.equal(
    workedDays(grid["a3"]),
    6,
    `ΜΟΝΟ-Α3: ${grid["a3"].join(" ")}`
  );
});

test("RB3. Κανείς δεν ξεπερνά τον στόχο του μετά το rebalance", () => {
  const emps = hardFixture();
  const { grid } = run(emps);
  for (const e of emps) {
    if (e.id === "n1") continue; // νυχτερινό μπλοκ = 6 Β
    assert.ok(
      workedDays(grid[e.id]) <= 6,
      `${e.name} ξεπέρασε: ${grid[e.id].join(" ")}`
    );
  }
});

test("RB4. Το rebalance δεν δημιουργεί παραβίαση 11ώρου", () => {
  const emps = hardFixture();
  const { grid } = run(emps);
  const SH = allShifts(null);
  for (const e of emps)
    for (let d = 1; d < 7; d++) {
      const a = grid[e.id][d - 1];
      const b = grid[e.id][d];
      if (a && b)
        assert.ok(restOk(a, b, SH), `${e.name}: ${a}→${b} ημέρα ${d}`);
    }
});

test("RB5. Το rebalance δεν σπάει τα allowed_shifts", () => {
  const emps = hardFixture();
  const { grid } = run(emps);
  for (const e of emps)
    for (const c of grid[e.id]) {
      if (!c || c === "Ρ" || c === "Ο" || c === "Β") continue;
      assert.ok(
        (e.allowed_shifts || []).includes(c),
        `${e.name} πήρε μη επιτρεπόμενη ${c}`
      );
    }
});

test("RB6. Το rebalance δεν πειράζει fixed αναθέσεις ούτε άδειες", () => {
  const emps = hardFixture();
  emps.find((e) => e.id === "f1").fixed_days = { 2: "Π" };
  const { grid } = run(emps, { locked: { f2: { 3: "Ο" } } });
  assert.equal(grid["f1"][2], "Π", "χάλασε fixed ανάθεση");
  assert.equal(grid["f2"][3], "Ο", "χάλασε άδεια");
});

test("RB7. Όταν ΔΕΝ υπάρχει λύση, επιστρέφεται warning χωρίς παραβίαση", () => {
  // Μόνο 4 άτομα για 9 θέσεις/μέρα — μαθηματικά αδύνατο.
  const emps = [
    mk("n1", "ΒΡΑΔ", { allowed_shifts: ["Β", "Π", "Α"] }),
    mk("n2", "ΒΡΑΔ2", { allowed_shifts: ["Β", "Π", "Α"] }),
    mk("e1", "ΥΠ-1", { allowed_shifts: ["Π"] }),
    mk("e2", "ΥΠ-2", { allowed_shifts: ["Α"] }),
  ];
  const { grid, warnings } = run(emps);
  assert.ok(
    warnings.some((w) => w.includes("ακάλυπτες θέσεις")),
    "λείπει το warning: " + warnings.join(" | ")
  );
  // Κανένας hard constraint δεν παραβιάστηκε
  for (const e of emps)
    for (const c of grid[e.id]) {
      if (!c || c === "Ρ" || c === "Ο") continue;
      assert.ok(
        (e.allowed_shifts || []).includes(c),
        `${e.name} πήρε ${c} χωρίς άδεια`
      );
    }
});

test("RB8. Part-time σε άδεια όλη την εβδομάδα δεν βγάζει ψευδές warning", () => {
  const emps = [
    ...hardFixture(),
    mk("pt", "PART", { employment_type: "part", min_days: 3, max_days: 4 }),
  ];
  const { warnings } = run(emps, {
    locked: { pt: { 0: "Ο", 1: "Ο", 2: "Ο", 3: "Ο", 4: "Ο", 5: "Ο", 6: "Ο" } },
  });
  assert.ok(
    !warnings.some((w) => w.includes("PART") && w.includes("ελάχιστο")),
    "ψευδές warning για part-time σε άδεια: " + warnings.join(" | ")
  );
});

test("RB9. Το warning διακρίνει δομικό πλεόνασμα από αποτυχία αλγορίθμου", () => {
  // 12 άτομα × 6 = 72 ημέρες για 62 θέσεις → 10 δεν χωρούν πουθενά.
  const emps = [...hardFixture(), mk("f4", "ΕΥΕΛ-4"), mk("f5", "ΕΥΕΛ-5")];
  const { warnings } = run(emps);
  const short = warnings.filter((w) => w.includes("μέρες αντί για"));
  if (short.length)
    assert.ok(
      short.every((w) => w.includes("δεν χωρούν πουθενά")),
      "λάθος αιτιολογία: " + short.join(" | ")
    );
});
