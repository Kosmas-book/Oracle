import { test } from "node:test";
import assert from "node:assert/strict";
import { allShifts } from "../lib/shifts.js";
import { generateWeek } from "../lib/generator.js";
import { mk, team } from "./helpers.mjs";

// Η ίδια helper που χρησιμοποιεί το /api/employees για τα έγκυρα codes.
const validCodesFor = (stationShifts) => new Set(Object.keys(allShifts(stationShifts)));

test("CS1. Custom ενεργό shift είναι έγκυρο ως fixed/allowed", () => {
  const stationShifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Π3": { label: "Ενδιάμεση 3", start: 9, end: 17 },
    "Α": { label: "Απόγευμα", start: 14, end: 22 },
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const valid = validCodesFor(stationShifts);
  assert.ok(valid.has("Π3"), "το custom Π3 πρέπει να γίνεται δεκτό");
  assert.ok(valid.has("Ρ") && valid.has("Ο"), "Ρ και Ο πάντα έγκυρα");
});

test("CS2. Άγνωστο shift ΔΕΝ είναι έγκυρο (απορρίπτεται explicit)", () => {
  const stationShifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const valid = validCodesFor(stationShifts);
  assert.ok(!valid.has("Π3"), "το Π3 δεν υπάρχει στις ρυθμίσεις");
  assert.ok(!valid.has("ΧΧ"));
});

test("CS3. Custom shift χρησιμοποιείται κανονικά στο Generate", () => {
  const stationShifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Π3": { label: "Ενδιάμεση", start: 9, end: 17 },
    "Α": { label: "Απόγευμα", start: 14, end: 22 },
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const emps = [
    mk("n1", "ΒΡΑΔ", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("n2", "ΒΡΑΔ2", { allowed_shifts: ["Π", "Α", "Β"] }),
    ...team(9)
      .slice(2)
      .map((e) => ({ ...e, allowed_shifts: ["Π", "Π3", "Α"] })),
  ];
  const { grid } = generateWeek({
    employees: emps,
    weekdayReq: { "Π": 2, "Π3": 1, "Α": 2 },
    sundayReq: { "Π": 2, "Α": 2 },
    nightPersonId: "n1",
    nextNightPersonId: "n2",
    workDays: 6,
    maxPerShift: 6,
    shifts: stationShifts,
  });
  const used = new Set();
  for (const e of emps) for (const c of grid[e.id]) if (c) used.add(c);
  assert.ok(used.has("Π3"), "το custom shift δεν χρησιμοποιήθηκε");
});

test("CS4. Αφαιρεμένο custom shift: warning και δεν χρησιμοποιείται", () => {
  // Ο εργαζόμενος έχει «Π3» στο προφίλ, αλλά δεν υπάρχει πια στις ρυθμίσεις.
  const stationShifts = {
    "Π": { label: "Πρωί", start: 6, end: 14 },
    "Α": { label: "Απόγευμα", start: 14, end: 22 },
    "Β": { label: "Βράδυ", start: 22, end: 30 },
  };
  const emps = [
    mk("n1", "ΒΡΑΔ", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("n2", "ΒΡΑΔ2", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("g", "ΦΑΝΤΑΣΜΑ", { allowed_shifts: ["Π", "Π3", "Α"] }),
    ...team(9).slice(2).map((e) => ({ ...e, allowed_shifts: ["Π", "Α"] })),
  ];
  const { grid, warnings } = generateWeek({
    employees: emps,
    weekdayReq: { "Π": 2, "Α": 2 },
    sundayReq: { "Π": 2, "Α": 2 },
    nightPersonId: "n1",
    nextNightPersonId: "n2",
    workDays: 6,
    maxPerShift: 6,
    shifts: stationShifts,
  });
  assert.ok(
    warnings.some((w) => w.includes("ΦΑΝΤΑΣΜΑ") && w.includes("Π3")),
    "λείπει το warning για ghost shift: " + warnings.join(" | ")
  );
  assert.ok(
    !grid["g"].includes("Π3"),
    `το ghost shift χρησιμοποιήθηκε: ${grid["g"].join(" ")}`
  );
});
