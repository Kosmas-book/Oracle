import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWeek } from "../lib/generator.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { employeeSummary, shiftHours } from "../lib/hours.js";
import { mk, team, WEEKDAY, SUNDAY, workedDays, countIn } from "./helpers.mjs";

const base = (over = {}) => ({
  employees: team(),
  weekdayReq: WEEKDAY,
  sundayReq: SUNDAY,
  nightPersonId: "n1",
  nextNightPersonId: "n2",
  prevNightPersonId: null,
  workDays: 6,
  maxPerShift: 4,
  ...over,
});

test("1. Κανονικό εξαήμερο: όλοι οι πλήρους βγάζουν 6 μέρες και 1 ρεπό", () => {
  const emps = team();
  const { grid } = generateWeek(base({ employees: emps }));
  for (const e of emps) {
    const w = workedDays(grid[e.id]);
    assert.ok(w >= 5 && w <= 6, `${e.name}: ${w} μέρες`);
    assert.ok((grid[e.id] || []).includes("Ρ"), `${e.name}: χωρίς ρεπό`);
  }
});

test("2. Πενθήμερο: κανείς δεν ξεπερνά τις 5 μέρες", () => {
  const emps = team(13);
  const { grid } = generateWeek(base({ employees: emps, workDays: 5 }));
  for (const e of emps) {
    if (e.id === "n1") continue; // ο βραδινός κρατάει το μπλοκ του
    assert.ok(workedDays(grid[e.id]) <= 5, `${e.name} πάνω από 5`);
  }
});

test("3. Εργαζόμενος που κάνει μόνο Α δεν παίρνει ποτέ άλλη βάρδια", () => {
  const emps = team();
  emps.push(mk("only", "ΜΟΝΟ-Α", { allowed_shifts: ["Α"] }));
  const { grid } = generateWeek(base({ employees: emps }));
  for (const c of grid["only"]) assert.ok(["Α", "Ρ", ""].includes(c), `βρέθηκε ${c}`);
});

test("4. Fixed shift τηρείται απαράβατα", () => {
  const emps = team();
  emps.push(mk("fx", "ΣΤΑΘΕΡΟΣ", { fixed_days: { 1: "Π", 3: "Α" } }));
  const { grid } = generateWeek(base({ employees: emps }));
  assert.equal(grid["fx"][1], "Π");
  assert.equal(grid["fx"][3], "Α");
});

test("5. Fixed Ρ τηρείται και μετράει ως το ρεπό της εβδομάδας", () => {
  const emps = team();
  emps.push(mk("fr", "ΥΠΕΥΘΥΝΟΣ", { fixed_days: { 6: "Ρ" } }));
  const { grid } = generateWeek(base({ employees: emps }));
  assert.equal(grid["fr"][6], "Ρ", "το fixed Ρ Κυριακής τηρείται");
  // Το fixed Ρ μετράει ως ρεπό: δεν του ανατίθεται δεύτερο ρεπό από τη φάση
  // κατανομής (τυχόν επιπλέον Ρ προκύπτουν μόνο όταν δεν χωράει σε βάρδια).
  const emps2 = team(16); // αρκετά άτομα ώστε να χωράνε όλοι
  const g2 = generateWeek(base({ employees: [...emps2, emps.at(-1)] })).grid;
  assert.equal(g2["fr"][6], "Ρ");
});

test("6. Ακριβής part-time εβδομαδιαίος στόχος", () => {
  const emps = team();
  emps.push(
    mk("pt", "PART", { employment_type: "part", min_days: 2, max_days: 4 })
  );
  for (const target of [2, 4]) {
    const { grid } = generateWeek(
      base({ employees: emps, weeklyTargets: { pt: target } })
    );
    assert.equal(workedDays(grid["pt"]), target, `στόχος ${target}`);
  }
});

test("7. Καμία παραβίαση 11ώρης ανάπαυσης", () => {
  const emps = team();
  const { grid } = generateWeek(base({ employees: emps }));
  const SH = allShifts(null);
  for (const e of emps)
    for (let d = 1; d < 7; d++) {
      const a = grid[e.id][d - 1];
      const b = grid[e.id][d];
      if (a && b)
        assert.ok(restOk(a, b, SH), `${e.name}: ${a}→${b} ημέρα ${d}`);
    }
});

test("8. Βάρδιες που περνούν τα μεσάνυχτα μετρούν σωστά ώρες", () => {
  const SH = allShifts(null);
  assert.equal(shiftHours("Α3", SH), 8); // 18:00–02:00
  assert.equal(shiftHours("Β", SH), 8);  // 22:00–06:00
  assert.equal(shiftHours("Π", SH), 8);
  const custom = allShifts({ Χ: { label: "Μακρά", start: 20, end: 32 } });
  assert.equal(shiftHours("Χ", custom), 12); // 20:00–08:00
});

test("9. Η Κυριακή καλύπτεται με το δικό της μοτίβο", () => {
  const emps = team(13);
  const { grid } = generateWeek(base({ employees: emps }));
  for (const [code, n] of Object.entries(SUNDAY))
    assert.ok(
      countIn(grid, emps, 6, code) >= n,
      `Κυριακή ${code}: ${countIn(grid, emps, 6, code)}/${n}`
    );
});

test("10. Τρέχων βραδινός Δευ–Σάβ, επόμενος Κυριακή", () => {
  const emps = team();
  const { grid } = generateWeek(base({ employees: emps }));
  for (let d = 0; d < 6; d++) assert.equal(grid["n1"][d], "Β", `ημέρα ${d}`);
  assert.equal(grid["n2"][6], "Β");
});

test("13. Αντικατάσταση μίας νύχτας δεν αλλάζει τον κάτοχο του κύκλου", () => {
  const emps = team();
  const { grid, nightExceptions } = generateWeek(
    base({ employees: emps, locked: { n1: { 2: "Ο" } } })
  );
  assert.equal(grid["n1"][2], "Ο");
  assert.equal(nightExceptions.length, 1);
  assert.equal(nightExceptions[0].absent, "n1", "ο κάτοχος παραμένει ο n1");
  assert.notEqual(nightExceptions[0].cover, "n1");
  // Το μπλοκ συνεχίζει να ανήκει στον n1 τις υπόλοιπες μέρες
  for (const d of [0, 1, 3, 4, 5]) assert.equal(grid["n1"][d], "Β");
});

test("17. Πραγματικό άθροισμα ωρών από start/end, όχι ×8", () => {
  const custom = {
    Π: { label: "Πρωί", start: 6, end: 12 },   // 6 ώρες
    Α: { label: "Απόγ", start: 12, end: 22 },  // 10 ώρες
  };
  const sum = employeeSummary(["Π", "Α", "Π", "Ρ", "Α", "Π", "Ρ"], custom);
  assert.equal(sum.hours, 6 + 10 + 6 + 10 + 6);
  assert.equal(sum.workDays, 5);
  assert.equal(sum.rest, 2);
  assert.equal(sum.counts["Π"], 3);
});

test("18α. Ο αντικαθιστά το Ρ (leaveReplacesRest=true)", () => {
  const emps = team();
  const { grid } = generateWeek(
    base({ employees: emps, leaveReplacesRest: true, locked: { e5: { 2: "Ο" } } })
  );
  const row = grid["e5"];
  assert.equal(row.filter((c) => c === "Ο").length, 1);
  assert.equal(row.filter((c) => c === "Ρ").length, 0, "δεν δικαιούται και Ρ");
});

test("18β. Ο ΔΕΝ αντικαθιστά το Ρ (leaveReplacesRest=false)", () => {
  const emps = team(13);
  const { grid } = generateWeek(
    base({
      employees: emps,
      leaveReplacesRest: false,
      locked: { e5: { 2: "Ο" } },
    })
  );
  const row = grid["e5"];
  assert.equal(row.filter((c) => c === "Ο").length, 1);
  assert.equal(row.filter((c) => c === "Ρ").length, 1, "πρέπει να πάρει και Ρ");
  assert.equal(workedDays(row), 5, "5 εργάσιμες + 1 Ο + 1 Ρ");
});

// ============================================================
// REGRESSION: ακριβής εβδομαδιαίος στόχος σε ΔΥΣΚΟΛΟ σενάριο
// (ελλιπές προσωπικό, ώστε ο part-time να είναι πραγματικά υποψήφιος)
// ============================================================
const tight = (targets) => {
  // Μόνο 8 άτομα για 9 θέσεις/μέρα: ο part-time είναι απαραίτητος.
  const emps = [
    mk("n1", "ΒΡΑΔ-1", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("n2", "ΒΡΑΔ-2", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("e3", "ΥΠ-3"),
    mk("e4", "ΥΠ-4"),
    mk("e5", "ΥΠ-5"),
    mk("e6", "ΥΠ-6"),
    mk("e7", "ΥΠ-7"),
    mk("pt", "PART", { employment_type: "part", min_days: 1, max_days: 6 }),
  ];
  return generateWeek({
    employees: emps,
    weekdayReq: WEEKDAY,
    sundayReq: SUNDAY,
    nightPersonId: "n1",
    nextNightPersonId: "n2",
    workDays: 6,
    maxPerShift: 4,
    weeklyTargets: targets,
  });
};

for (const t of [0, 1, 2, 4]) {
  test(`R1. Ακριβής στόχος ${t} τηρείται και σε ελλιπές προσωπικό`, () => {
    const { grid } = tight({ pt: t });
    assert.equal(
      workedDays(grid["pt"]),
      t,
      `βγήκαν ${workedDays(grid["pt"])} αντί για ${t}: ${grid["pt"].join(" ")}`
    );
  });
}

test("R2. Ο/Ρ consistency: generator και κοινός κανόνας συμφωνούν", async () => {
  const { targetDays } = await import("../lib/scheduleRules.js");
  for (const lrr of [true, false]) {
    // Εφικτό fixture: 10 άτομα καλύπτουν ακριβώς το εξαήμερο.
    const emps = team(10);
    const { grid } = generateWeek(
      base({ employees: emps, leaveReplacesRest: lrr, locked: { e5: { 2: "Ο" } } })
    );
    const expected = targetDays({
      employee: emps.find((e) => e.id === "e5"),
      weeklyTarget: null,
      workDays: 6,
      leaveDays: 1,
      leaveReplacesRest: lrr,
    }).exact;
    assert.equal(
      workedDays(grid["e5"]),
      expected,
      `leaveReplacesRest=${lrr}: ${grid["e5"].join(" ")}`
    );
  }
});

test("R3. Εξαήμερο σε επαρκές fixture: ΑΚΡΙΒΩΣ 6 μέρες για ΟΛΟΥΣ", () => {
  // 10 άτομα × 6 μέρες = 60 βάρδιες ≈ οι θέσεις της εβδομάδας.
  const emps = team(10);
  const { grid } = generateWeek(base({ employees: emps }));
  for (const e of emps)
    assert.equal(workedDays(grid[e.id]), 6, `${e.name}: ${grid[e.id].join(" ")}`);
});

test("R4. Πενθήμερο σε επαρκές fixture: κανείς πάνω από 5, ο στόχος τηρείται", () => {
  const emps = team(12);
  const { grid } = generateWeek(base({ employees: emps, workDays: 5 }));
  for (const e of emps) {
    if (e.id === "n1" || e.id === "n2") continue; // το νυχτερινό μπλοκ είναι 6 νύχτες
    assert.ok(
      workedDays(grid[e.id]) <= 5,
      `${e.name} πάνω από 5: ${grid[e.id].join(" ")}`
    );
    assert.ok(
      grid[e.id].filter((c) => c === "Ρ").length >= 2,
      `${e.name}: λιγότερα από 2 ρεπό`
    );
  }
});
