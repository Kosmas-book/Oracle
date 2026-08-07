import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGrid } from "../lib/validate.js";
import { targetDays } from "../lib/scheduleRules.js";
import { mk } from "./helpers.mjs";

const REQ = Array.from({ length: 7 }, () => ({ "Π": 1, "Α": 1 }));

test("V1. Μη επιτρεπόμενη βάρδια δίνει error στο σωστό κελί", () => {
  const e = mk("a", "ΜΟΝΟ-Α", { allowed_shifts: ["Α"] });
  const r = validateGrid({
    grid: { a: ["Π", "Α", "Α", "Α", "Α", "Α", "Ρ"] },
    employees: [e],
    dayReq: REQ,
  });
  assert.ok(r.groups.some((g) => g.key === "forbidden"), "λείπει η ομάδα forbidden");
  assert.ok(r.cells["a:0"]?.some((i) => i.level === "forbidden"), "δεν σημάνθηκε το κελί");
  assert.ok(r.groups.find((g) => g.key === "forbidden").items[0].includes("Π"));
});

test("V2. Χειροκίνητη παραβίαση 11ώρου εντοπίζεται", () => {
  const e = mk("a", "ΥΠ");
  const r = validateGrid({
    grid: { a: ["Α", "Π", "Ρ", "Α", "Α", "Α", "Ρ"] }, // Α(→22:00) → Π(06:00)
    employees: [e],
    dayReq: REQ,
  });
  assert.ok(r.groups.some((g) => g.key === "rest"));
  assert.ok(r.cells["a:1"]?.some((i) => i.level === "error"));
});

test("V3. prevSunday → Δευτέρα ελέγχεται για 11ωρο", () => {
  const e = mk("a", "ΥΠ");
  const r = validateGrid({
    grid: { a: ["Π", "Α", "Α", "Α", "Α", "Α", "Ρ"] },
    employees: [e],
    dayReq: REQ,
    prevSunday: { a: "Α3" }, // λήγει 02:00 → Π στις 06:00 = 4 ώρες
  });
  assert.ok(
    r.groups.find((g) => g.key === "rest")?.items.some((i) => i.includes("Κυριακή")),
    JSON.stringify(r.groups)
  );
});

test("V4. Άγνωστος κωδικός βάρδιας", () => {
  const r = validateGrid({
    grid: { a: ["ΧΧ", "Α", "Α", "Α", "Α", "Α", "Ρ"] },
    employees: [mk("a", "ΥΠ")],
    dayReq: REQ,
  });
  assert.ok(r.groups.some((g) => g.key === "unknown"));
});

test("V5. Παράκαμψη fixed shift και fixed Ρ", () => {
  const e = mk("a", "ΥΠ", { fixed_days: { 0: "Π", 6: "Ρ" } });
  const r = validateGrid({
    grid: { a: ["Α", "Α", "Α", "Α", "Α", "Ρ", "Α"] },
    employees: [e],
    dayReq: REQ,
  });
  const g = r.groups.find((x) => x.key === "fixed");
  assert.ok(g, "δεν εντοπίστηκε παράκαμψη");
  assert.equal(g.items.length, 2);
  assert.ok(r.cells["a:6"]?.some((i) => i.level === "fixed"));
});

test("V6. Εργασία πάνω σε δηλωμένη άδεια", () => {
  const e = mk("a", "ΥΠ", { fixed_days: { 2: "Ο" } });
  const r = validateGrid({
    grid: { a: ["Α", "Α", "Π", "Α", "Α", "Α", "Ρ"] },
    employees: [e],
    dayReq: REQ,
  });
  assert.ok(r.groups.some((g) => g.key === "leaveWork"));
});

test("V7. Αλλαγή κελιού νυχτερινού κύκλου επισημαίνεται", () => {
  const n = mk("n", "ΒΡΑΔ", { allowed_shifts: ["Β", "Α"] });
  const r = validateGrid({
    grid: { n: ["Β", "Β", "Α", "Β", "Β", "Β", "Ρ"] },
    employees: [n],
    dayReq: REQ,
    nightPerson: "n",
  });
  assert.ok(r.groups.some((g) => g.key === "night"));
  assert.ok(r.cells["n:2"]?.some((i) => i.level === "night"));
});

test("V8. Weekly exact target part-time ελέγχεται", () => {
  const p = mk("p", "PART", { employment_type: "part", min_days: 1, max_days: 5 });
  const r = validateGrid({
    grid: { p: ["Α", "Α", "Α", "", "", "", ""] },
    employees: [p],
    dayReq: REQ,
    weeklyTargets: { p: 2 },
  });
  assert.ok(
    r.groups.find((g) => g.key === "days")?.items[0].includes("στόχος εβδομάδας"),
    JSON.stringify(r.groups)
  );
});

test("V9. leave_replaces_rest: ίδιος στόχος σε validator και κοινό κανόνα", () => {
  const e = mk("a", "ΥΠ");
  for (const lrr of [true, false]) {
    const grid = { a: ["Π", "Π", "Ο", "Π", "Π", "Π", "Ρ"] }; // 5 εργάσιμες
    const r = validateGrid({
      grid,
      employees: [e],
      dayReq: REQ,
      leaveReplacesRest: lrr,
      workDays: 6,
    });
    const expected = targetDays({
      employee: e,
      weeklyTarget: null,
      workDays: 6,
      leaveDays: 1,
      leaveReplacesRest: lrr,
    }).exact;
    const daysGroup = r.groups.find((g) => g.key === "days");
    if (expected === 5) assert.equal(daysGroup, undefined, "ψευδές warning με lrr=false");
    else assert.ok(daysGroup, "δεν εντοπίστηκε απόκλιση με lrr=true");
  }
});

test("V10. Ανενεργός εργαζόμενος δεν ελέγχεται αλλά παραμένει στο grid", () => {
  const a = mk("a", "ΕΝΕΡΓΟΣ");
  const b = mk("b", "ΑΝΕΝΕΡΓΟΣ", { deactivated_at: "2026-01-01T00:00:00Z" });
  const r = validateGrid({
    grid: {
      a: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
      b: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
    },
    employees: [a, b],
    dayReq: REQ,
  });
  assert.ok(!r.all.some((x) => x.includes("ΑΝΕΝΕΡΓΟΣ")), "ελέγχθηκε ανενεργός");
  // το grid του παραμένει ανέπαφο για την ιστορική εμφάνιση
  assert.equal(r.cells["b:0"], undefined);
});
