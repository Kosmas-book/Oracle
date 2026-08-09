import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWeek } from "../lib/generator.js";
import { validateGrid } from "../lib/validate.js";
import { mk, team, WEEKDAY, SUNDAY, workedDays } from "./helpers.mjs";

// Ο κύκλος: Β Κυριακή → Β Δευ–Σάβ → Ρ Κυριακή → Ρ Δευτέρα (επόμενη εβδομάδα).
// Καμία απαίτηση για Ρ το Σάββατο ΠΡΙΝ το μπλοκ — μόνο 11ωρο.
const rota = () => [
  mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  mk("n3", "ΤΡΙΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  ...team(11).slice(2),
];

const gen = (o = {}) =>
  generateWeek({
    employees: rota(),
    weekdayReq: WEEKDAY,
    sundayReq: SUNDAY,
    workDays: 6,
    maxPerShift: 4,
    ...o,
  });

test("N1. Cross-week: το μπλοκ είναι Β Δευ–Σάβ + Ρ Κυριακή", () => {
  const { grid } = gen({ nightPersonId: "dim", nextNightPersonId: "tat" });
  for (let d = 0; d < 6; d++) assert.equal(grid["dim"][d], "Β", `ημέρα ${d}`);
  assert.equal(grid["dim"][6], "Ρ", "υποχρεωτικό Ρ Κυριακής");
  assert.equal(grid["tat"][6], "Β", "ο επόμενος ξεκινά Κυριακή");
});

test("N2. Δημήτρης → Τάτος → Δημήτρης ξανά: ΕΠΙΤΡΕΠΕΤΑΙ", () => {
  // Week 1: Δημήτρης βραδινός, Τάτος επόμενος
  const w1 = gen({ nightPersonId: "dim", nextNightPersonId: "tat" });
  assert.equal(w1.grid["dim"][0], "Β");
  // Week 2: Τάτος βραδινός, Δημήτρης ξανά επόμενος — καμία απαγόρευση
  const w2 = gen({
    nightPersonId: "tat",
    nextNightPersonId: "dim",
    prevNightPersonId: "dim",
  });
  assert.equal(w2.grid["tat"][0], "Β", "ο Τάτος τρέχει το μπλοκ");
  assert.equal(w2.grid["dim"][6], "Β", "ο Δημήτρης ξαναξεκινά Κυριακή");
  assert.ok(
    !w2.nightConflicts.some((c) => /πρόσφατα|ξανά|rotation/i.test(c)),
    "δεν πρέπει να υπάρχει περιορισμός επανεπιλογής: " + w2.nightConflicts.join(" | ")
  );
  // Week 3: Δημήτρης πάλι βραδινός
  const w3 = gen({
    nightPersonId: "dim",
    nextNightPersonId: "n3",
    prevNightPersonId: "tat",
  });
  for (let d = 0; d < 6; d++) assert.equal(w3.grid["dim"][d], "Β");
});

test("N3. Normal new night holder: υποχρεωτικό Ρ Σαββάτου + Β Κυριακής", () => {
  const { grid, nightConflicts } = gen({
    nightPersonId: "dim",
    nextNightPersonId: "tat",
  });
  assert.equal(grid["tat"][5], "Ρ", `Σάββατο: ${grid["tat"].join(" ")}`);
  assert.equal(grid["tat"][6], "Β");
  assert.ok(
    !nightConflicts.some((c) => c.includes("Σάββατο")),
    "δεν πρέπει να υπάρχει conflict: " + nightConflicts.join(" | ")
  );
});

test("N3β. Fixed Α το Σάββατο σε normal new night holder → ρητό conflict", () => {
  const emps = rota();
  emps.find((e) => e.id === "tat").fixed_days = { 5: "Α" };
  const { nightConflicts } = gen({
    employees: emps,
    nightPersonId: "dim",
    nextNightPersonId: "tat",
  });
  assert.ok(
    nightConflicts.some(
      (c) => c.includes("Ρ το Σάββατο") && c.includes("σταθερή βάρδια")
    ),
    "λείπει το conflict: " + nightConflicts.join(" | ")
  );
});

test("N3γ. Άλλο Ρ μέσα στην εβδομάδα ΔΕΝ ακυρώνει την απαίτηση Σαββάτου", () => {
  const emps = rota();
  emps.find((e) => e.id === "tat").fixed_days = { 1: "Ρ" }; // Ρ Τρίτης
  const { grid } = gen({
    employees: emps,
    nightPersonId: "dim",
    nextNightPersonId: "tat",
    // ΔΕΝ είναι previous holder → καμία εξαίρεση
    prevNightPersonId: "n3",
  });
  assert.equal(grid["tat"][1], "Ρ", "το Ρ Τρίτης παραμένει");
  assert.equal(
    grid["tat"][5],
    "Ρ",
    `το Σάββατο παραμένει υποχρεωτικό Ρ: ${grid["tat"].join(" ")}`
  );
});

test("N4. Βάρδια Σαββάτου που ΔΕΝ αφήνει 11 ώρες πριν το Β Κυριακής → conflict", () => {
  // Με τα κανονικά ωράρια καμία βάρδια Σαββάτου δεν σπάει το 11ωρο (το Β
  // ξεκινά 22:00). Χρησιμοποιούμε μακρά βάρδια 20:00–14:00 της επομένης.
  const shifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Α": { label: "Απόγευμα", start: 14, end: 22 },
    "ΜΚ": { label: "Μακρά", start: 20, end: 38 }, // λήγει 14:00 Κυριακής
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const emps = [
    mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Α", "ΜΚ", "Β"], fixed_days: { 5: "ΜΚ" } }),
    ...team(9).slice(2).map((e) => ({ ...e, allowed_shifts: ["Π", "Α"] })),
  ];
  const { nightConflicts } = generateWeek({
    employees: emps,
    weekdayReq: { "Π": 2, "Α": 2 },
    sundayReq: { "Π": 2, "Α": 2 },
    nightPersonId: "dim",
    nextNightPersonId: "tat",
    workDays: 6,
    maxPerShift: 5,
    shifts,
  });
  assert.ok(
    nightConflicts.some((c) => c.includes("ώρες") && c.includes("Σάββατο")),
    "δεν εντοπίστηκε παραβίαση 11ώρου πριν το Β: " + nightConflicts.join(" | ")
  );
});

test("N5+N6. Ο προηγούμενος βραδινός παίρνει Ρ Κυριακή (ίδια εβδ.) και Ρ Δευτέρα (επόμενη)", () => {
  const w1 = gen({ nightPersonId: "dim", nextNightPersonId: "tat" });
  assert.equal(w1.grid["dim"][6], "Ρ", "Ρ Κυριακής");
  const w2 = gen({
    nightPersonId: "tat",
    nextNightPersonId: "n3",
    prevNightPersonId: "dim",
  });
  assert.equal(w2.grid["dim"][0], "Ρ", "Ρ Δευτέρας του previous holder");
});

test("N7. Fixed βάρδια πάνω στο υποχρεωτικό Ρ Δευτέρας → ρητό conflict", () => {
  const emps = rota();
  emps.find((e) => e.id === "dim").fixed_days = { 0: "Α" };
  const { nightConflicts } = gen({
    employees: emps,
    nightPersonId: "tat",
    nextNightPersonId: "n3",
    prevNightPersonId: "dim",
  });
  assert.ok(
    nightConflicts.some(
      (c) => c.includes("Ρ τη Δευτέρα") && c.includes("σταθερή")
    ),
    "λείπει το conflict: " + nightConflicts.join(" | ")
  );
});

test("N8. Κυριακάτικος αντικαταστάτης: planned=tat, actual=n3", () => {
  const { grid, nightExceptions } = gen({
    nightPersonId: "dim",
    nextNightPersonId: "tat",
    locked: { tat: { 6: "Ο" } },
  });
  assert.equal(grid["tat"][6], "Ο");
  const ex = nightExceptions.find((x) => x.type === "sunday_start");
  assert.ok(ex, "δεν καταγράφηκε exception έναρξης");
  assert.equal(ex.planned, "tat");
  assert.notEqual(ex.cover, "tat");
  assert.equal(grid[ex.cover][6], "Β", "ο actual έκανε το Β της Κυριακής");
});

test("N9. Αντικατάσταση ΜΕΣΑ στο μπλοκ δεν αλλάζει τον owner", () => {
  const { grid, nightExceptions } = gen({
    nightPersonId: "dim",
    nextNightPersonId: "tat",
    locked: { dim: { 2: "Ο" } },
  });
  const ex = nightExceptions.find((x) => x.day === 2);
  assert.ok(ex, "δεν καταγράφηκε mid-block exception");
  assert.equal(ex.absent, "dim", "ο owner παραμένει ο dim");
  for (const d of [0, 1, 3, 4, 5]) assert.equal(grid["dim"][d], "Β");
  assert.equal(grid["dim"][6], "Ρ");
});

// ============================================================
// Ρεπό Σαββάτου πριν το μπλοκ: ΠΡΟΤΙΜΗΣΗ από το κανονικό ρεπό,
// όχι επιπλέον ρεπό — και όχι απόλυτος κανόνας.
// ============================================================
const feasible = () => [
  mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  ...team(10).slice(2),
];
const run = (o) =>
  generateWeek({
    employees: feasible(),
    weekdayReq: WEEKDAY,
    sundayReq: SUNDAY,
    workDays: 6,
    maxPerShift: 4,
    ...o,
  });

test("N10. Κανονικά ο επόμενος βραδινός παίρνει Ρ το Σάββατο", () => {
  const { grid } = run({ nightPersonId: "dim", nextNightPersonId: "tat" });
  assert.equal(grid["tat"][5], "Ρ", `Σάββατο: ${grid["tat"].join(" ")}`);
  assert.equal(grid["tat"][6], "Β");
  assert.equal(workedDays(grid["tat"]), 6, "παραμένει εξαήμερο");
  assert.equal(
    grid["tat"].filter((c) => c === "Ρ").length,
    1,
    "ΔΕΝ είναι επιπλέον ρεπό"
  );
});

test("N11. Repeat A→B→A: ο επανερχόμενος μπορεί να δουλέψει Σάββατο", () => {
  // Ο Δημήτρης ολοκλήρωσε το μπλοκ του (previous) και ξαναεπιλέγεται (next).
  const { grid, warnings, nightConflicts } = run({
    nightPersonId: "tat",
    nextNightPersonId: "dim",
    prevNightPersonId: "dim",
  });
  assert.equal(grid["dim"][0], "Ρ", "υποχρεωτικό Ρ Δευτέρας");
  assert.equal(grid["dim"][6], "Β", "ξεκινά το νέο μπλοκ");
  assert.ok(
    !nightConflicts.some((c) => c.includes("υποχρεωτικό Ρ το Σάββατο")),
    "δεν πρέπει να απαιτείται Ρ Σαββάτου στο repeat: " + nightConflicts.join(" | ")
  );
  if (grid["dim"][5] !== "Ρ" && grid["dim"][5] !== "Ο")
    assert.ok(
      warnings.some((w) => w.includes("επανεντάσσεται")),
      "λείπει η ενημερωτική σημείωση: " + warnings.join(" | ")
    );
});

test("N12. Repeat exception: το 11ωρο εξακολουθεί να ισχύει", () => {
  const shifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Α": { label: "Απόγευμα", start: 14, end: 22 },
    "ΜΚ": { label: "Μακρά", start: 20, end: 38 }, // λήγει 14:00 Κυριακής
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const emps = [
    mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Α", "ΜΚ", "Β"], fixed_days: { 5: "ΜΚ" } }),
    mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Α", "Β"] }),
    ...team(9).slice(2).map((e) => ({ ...e, allowed_shifts: ["Π", "Α"] })),
  ];
  const { nightConflicts } = generateWeek({
    employees: emps,
    weekdayReq: { "Π": 2, "Α": 2 },
    sundayReq: { "Π": 2, "Α": 2 },
    nightPersonId: "tat",
    nextNightPersonId: "dim",
    prevNightPersonId: "dim",
    workDays: 6,
    maxPerShift: 5,
    shifts,
  });
  assert.ok(
    nightConflicts.some((c) => c.includes("ώρες") && c.includes("Σάββατο")),
    "το 11ωρο πρέπει να ελέγχεται και στο repeat: " + nightConflicts.join(" | ")
  );
});

test("N13. Ακριβώς ΕΝΑΣ Β ανά ημερομηνία", () => {
  const { grid } = run({ nightPersonId: "dim", nextNightPersonId: "tat" });
  for (let d = 0; d < 7; d++) {
    const n = feasible().filter((e) => grid[e.id][d] === "Β").length;
    assert.equal(n, 1, `ημέρα ${d}: ${n} νυχτερινοί`);
  }
});

test("N14. Δύο Β την ίδια μέρα → ρητό conflict", () => {
  const { grid, nightConflicts } = run({
    nightPersonId: "dim",
    nextNightPersonId: "tat",
  });
  // Χειροκίνητη προσθήκη δεύτερου Β: το πιάνει ο validator (βλ. validate.test)
  // αλλά και ο generator αν του δοθεί ήδη κατειλημμένο κελί.
  const emps = feasible();
  emps.find((e) => e.id === "n3") &&
    (emps.find((e) => e.id === "n3").allowed_shifts = ["Β", "Α"]);
  const r = generateWeek({
    employees: emps,
    weekdayReq: WEEKDAY,
    sundayReq: SUNDAY,
    nightPersonId: "dim",
    nextNightPersonId: "tat",
    workDays: 6,
    maxPerShift: 4,
    locked: { e3: { 2: "Β" } }, // δεύτερος Β την Τετάρτη
  });
  assert.ok(
    r.nightConflicts.some((c) => c.includes("Επιτρέπεται μόνο ένας")),
    "δεν εντοπίστηκε διπλός Β: " + r.nightConflicts.join(" | ")
  );
});
