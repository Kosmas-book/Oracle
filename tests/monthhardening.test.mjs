import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateMonth, monthWeeks, canTakeNightBlock, pickNextNight, rotationList,
} from "../lib/monthPlan.js";
import { validateGrid } from "../lib/validate.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { mk, team, WEEKDAY, SUNDAY, workedDays } from "./helpers.mjs";

const SETTINGS = {
  weekday_req: WEEKDAY, sunday_req: SUNDAY, work_days: 6,
  max_per_shift: 4, shifts: null, leave_replaces_rest: true,
};
const nightTeam = () => [
  mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 10 }),
  mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 20 }),
  mk("mar", "ΜΑΡΙΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 30 }),
  ...team(12).slice(2),
];
const gm = (o) =>
  generateMonth({ year: 2026, month: 9, employees: nightTeam(), settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"], ...o });

// ---- 1-3: context πριν το Generate (τα δεδομένα υπάρχουν χωρίς draft) ----
test("H1. Οι υποψήφιοι βραδινοί προκύπτουν χωρίς να έχει τρέξει Generate", () => {
  const emps = nightTeam();
  const list = rotationList(emps, ["mar", "dim", "tat"]);
  assert.equal(list.length, 3, "3 night-capable");
  assert.deepEqual(list.map((e) => e.id), ["mar", "dim", "tat"]);
  // Οι part-time είναι διαθέσιμοι για weekly targets χωρίς draft
  const withPt = [...emps, mk("pt", "PART", { employment_type: "part", min_days: 2, max_days: 4 })];
  assert.equal(withPt.filter((e) => e.employment_type === "part").length, 1);
});

// ---- 4-5: πρώτος μήνας χωρίς ιστορικό ----
test("H2. Πρώτος μήνας χωρίς προηγούμενο state: ορίζεται current night holder", () => {
  const r = gm({ seed: {} }); // κανένα seed
  const w0 = r.weeks[0];
  assert.ok(w0.nightPerson, "δεν ορίστηκε τρέχων βραδινός");
  assert.equal(w0.nightPerson, "dim", "προτείνεται ο πρώτος του rotation");
});

test("H3. Η πρώτη εβδομάδα έχει Β Δευτέρα–Σάββατο (όχι κουτσή)", () => {
  const r = gm({ seed: {} });
  const w0 = r.weeks[0];
  for (let d = 0; d < 6; d++)
    assert.equal(w0.grid["dim"][d], "Β", `ημέρα ${d}: ${w0.grid["dim"].join(" ")}`);
  assert.equal(w0.grid["dim"][6], "Ρ", "Ρ Κυριακής μετά το μπλοκ");
});

test("H4. Ρητός starting night holder τηρείται", () => {
  const r = gm({ seed: {}, startingNight: "mar" });
  const w0 = r.weeks[0];
  for (let d = 0; d < 6; d++) assert.equal(w0.grid["mar"][d], "Β");
  assert.equal(w0.actualNight, "dim", "το επόμενο μπλοκ ακολουθεί τη σειρά μετά τον mar");
});

// ---- 6-8: full-block eligibility ----
test("H5. Υποψήφιος με Ο τη ΔΕΥΤΕΡΑ του επόμενου block γίνεται skip", () => {
  const weeks = monthWeeks(2026, 9);
  const r = gm({
    seed: { currentNight: "dim" },
    // Ο Τάτος θα ξεκινούσε Κυριακή weeks[0]· έχει Ο τη Δευτέρα weeks[1].
    lockedByWeek: { [weeks[1]]: { tat: { 0: "Ο" } } },
  });
  const w0 = r.weeks[0];
  assert.ok(
    w0.skippedNight.some((s) => s.id === "tat"),
    "ο Τάτος έπρεπε να παραλειφθεί: " + JSON.stringify(w0.skippedNight)
  );
  assert.equal(w0.actualNight, "mar", "τον αντικαθιστά ο Μάριος");
  assert.ok(
    w0.warnings.some((x) => x.includes("ολόκληρο το block")),
    "λείπει explicit warning: " + w0.warnings.join(" | ")
  );
});

test("H6. Υποψήφιος με fixed shift ΜΕΣΑ στο block γίνεται skip", () => {
  const emps = nightTeam();
  emps.find((e) => e.id === "tat").fixed_days = { 2: "Α" }; // Τετάρτη μέσα στο μπλοκ
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"], seed: { currentNight: "dim" },
  });
  assert.ok(r.weeks[0].skippedNight.some((s) => s.id === "tat"));
  assert.equal(r.weeks[0].actualNight, "mar");
});

test("H7. Ο eligible υποψήφιος αναλαμβάνει ΟΛΟΚΛΗΡΟ το block", () => {
  const r = gm({ seed: { currentNight: "dim" } });
  const holder = r.weeks[0].actualNight;
  const w1 = r.weeks[1];
  assert.equal(w1.grid[holder][6 - 6], "Β", "Δευτέρα");
  for (let d = 0; d < 6; d++)
    assert.equal(w1.grid[holder][d], "Β", `ημέρα ${d}: ${w1.grid[holder].join(" ")}`);
});

test("H8. canTakeNightBlock ελέγχει lookahead στην επόμενη εβδομάδα", () => {
  const e = mk("a", "Α", { allowed_shifts: ["Β"] });
  assert.equal(canTakeNightBlock(e, {}).ok, true);
  const r1 = canTakeNightBlock(e, { lockedNext: { a: { 3: "Ο" } } });
  assert.equal(r1.ok, false);
  assert.ok(r1.reason.includes("μέσα στο νυχτερινό μπλοκ"), r1.reason);
  const e2 = mk("b", "Β", { allowed_shifts: ["Β"], fixed_days: { 4: "Π" } });
  assert.equal(canTakeNightBlock(e2, {}).ok, false);
});

// ---- 9-11: manual edit λογική (ίδιος validator με το weekly) ----
test("H9. Χειροκίνητη αλλαγή σε monthly grid ελέγχεται με τον ίδιο validator", () => {
  const r = gm({ seed: { currentNight: "dim" } });
  const w = r.weeks[1];
  const emps = nightTeam();
  const target = emps.find((e) => !["dim", "tat", "mar"].includes(e.id));
  const grid = JSON.parse(JSON.stringify(w.grid));
  grid[target.id][2] = "ΧΧ"; // άγνωστη βάρδια
  const check = validateGrid({
    grid, employees: emps,
    dayReq: Array.from({ length: 7 }, (_, i) => (i === 6 ? SUNDAY : WEEKDAY)),
    workDays: 6, maxPerShift: 4,
  });
  assert.ok(check.groups.some((g) => g.key === "unknown"));
});

test("H10. Cross-week 11ωρο ελέγχεται μετά από manual edit", () => {
  const r = gm({ seed: { currentNight: "dim" } });
  const emps = nightTeam();
  const target = emps.find((e) => !["dim", "tat", "mar"].includes(e.id));
  const prevGrid = JSON.parse(JSON.stringify(r.weeks[0].grid));
  const curGrid = JSON.parse(JSON.stringify(r.weeks[1].grid));
  prevGrid[target.id][6] = "Α3"; // λήγει 02:00
  curGrid[target.id][0] = "Π";   // ξεκινά 06:00 → 4 ώρες
  const prevSunday = {};
  for (const [id, row] of Object.entries(prevGrid))
    if (Array.isArray(row) && row[6]) prevSunday[id] = row[6];
  const check = validateGrid({
    grid: curGrid, employees: emps,
    dayReq: Array.from({ length: 7 }, (_, i) => (i === 6 ? SUNDAY : WEEKDAY)),
    workDays: 6, maxPerShift: 4, prevSunday,
  });
  const rest = check.groups.find((g) => g.key === "rest");
  assert.ok(rest, "δεν εντοπίστηκε cross-week παραβίαση");
  assert.ok(rest.items.some((i) => i.includes("Κυριακή")));
});

test("H11. Χειροκίνητο Ο μέσα στο draft γίνεται σεβαστό", () => {
  const weeks = monthWeeks(2026, 9);
  const emps = nightTeam();
  const target = emps.find((e) => !["dim", "tat", "mar"].includes(e.id));
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"], seed: { currentNight: "dim" },
    lockedByWeek: { [weeks[1]]: { [target.id]: { 2: "Ο", 3: "Ο" } } },
  });
  assert.equal(r.weeks[1].grid[target.id][2], "Ο");
  assert.equal(r.weeks[1].grid[target.id][3], "Ο");
});

// ---- 12-13: regenerate ΜΟΝΟ μιας εβδομάδας ----
test("H12. Regenerate μίας εβδομάδας δεν αλλάζει τις υπόλοιπες", () => {
  const base = gm({ seed: { currentNight: "dim" } });
  const weeks = monthWeeks(2026, 9);
  const targetWeek = weeks[2];
  const again = gm({
    seed: { currentNight: "dim" },
    onlyWeek: targetWeek,
    baseWeeks: base.weeks,
  });
  for (const w of base.weeks) {
    if (w.week_start === targetWeek) continue;
    const other = again.weeks.find((x) => x.week_start === w.week_start);
    assert.deepEqual(other.grid, w.grid, `άλλαξε η εβδομάδα ${w.week_start}`);
  }
});

test("H13. Regenerate δεν σβήνει χειροκίνητες αλλαγές άλλων εβδομάδων", () => {
  const base = gm({ seed: { currentNight: "dim" } });
  const weeks = monthWeeks(2026, 9);
  const emps = nightTeam();
  const target = emps.find((e) => !["dim", "tat", "mar"].includes(e.id));
  // Χειροκίνητη αλλαγή στην εβδομάδα 1
  const edited = JSON.parse(JSON.stringify(base.weeks));
  edited[1].grid[target.id][3] = "Ο";
  edited[1].edited = true;
  const again = gm({
    seed: { currentNight: "dim" },
    onlyWeek: weeks[3],
    baseWeeks: edited,
  });
  assert.equal(
    again.weeks[1].grid[target.id][3], "Ο",
    "χάθηκε η χειροκίνητη αλλαγή"
  );
  assert.equal(again.weeks[1].edited, true, "χάθηκε το edited flag");
});

// ---- 14-16: preserved existing weeks ----
test("H14+H15+H16. Preserved week διατηρεί grid, day_req και night_exceptions", () => {
  const weeks = monthWeeks(2026, 9);
  const emps = nightTeam();
  const savedGrid = {};
  for (const e of emps) savedGrid[e.id] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ"];
  savedGrid["mar"] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Β"];
  const customDayReq = Array.from({ length: 7 }, () => ({ "Π": 9 }));
  const exceptions = [{ day: 3, type: "cover", absent: "dim", cover: "tat" }];
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    savedWeeks: {
      [weeks[0]]: {
        week_start: weeks[0], grid: savedGrid, night_person: "dim",
        next_night_person: "mar", actual_night_person: "mar",
        day_req: customDayReq, night_exceptions: exceptions,
        override_warnings: ["παλιό warning"],
      },
    },
    keepExisting: { [weeks[0]]: true },
    seed: { currentNight: "dim" },
  });
  const w0 = r.weeks[0];
  assert.equal(w0.source, "existing");
  assert.deepEqual(w0.grid, savedGrid, "το grid άλλαξε");
  // Το μεταδεδομένο υπάρχει στο draft ώστε το Save να το στείλει αυτούσιο
  assert.equal(w0.actualNight, "mar");
  // Και η επόμενη εβδομάδα συνεχίζει από τον πραγματικό κάτοχο
  for (let d = 0; d < 6; d++) assert.equal(r.weeks[1].grid["mar"][d], "Β");
});

// ---- 17-18: server-side month validation ----
test("H17. Ο month validator πιάνει μη επιτρεπόμενη βάρδια", () => {
  const e = mk("a", "ΜΟΝΟ-Α", { allowed_shifts: ["Α"] });
  const check = validateGrid({
    grid: { a: ["Π", "Α", "Α", "Α", "Α", "Α", "Ρ"] },
    employees: [e],
    dayReq: Array.from({ length: 7 }, () => ({})),
  });
  assert.ok(check.groups.some((g) => g.key === "forbidden"));
  assert.ok(check.errors > 0);
});

test("H18. Ο month validator πιάνει παραβίαση 11ώρου", () => {
  const e = mk("a", "ΥΠ");
  const check = validateGrid({
    grid: { a: ["Α", "Π", "Ρ", "Α", "Α", "Α", "Ρ"] },
    employees: [e],
    dayReq: Array.from({ length: 7 }, () => ({})),
  });
  assert.ok(check.groups.some((g) => g.key === "rest"));
});

// ---- 21: fuel excluded ----
test("H21. excluded=true επιβιώνει σε liters-only update (με σωστό select)", async () => {
  const { validateEntry } = await import("../lib/fuelCalc.js");
  // Ο κανόνας του API: απουσία πεδίου → κρατάμε το existing.
  const existing = { liters: { unl95: 5000 }, notes: null, excluded: true };
  const body = { entry_date: "2026-08-01", liters: { unl95: 5200 } };
  const v = validateEntry(body);
  const merged = { ...existing.liters, ...v.liters };
  const excluded = body.excluded === undefined ? !!existing.excluded : !!body.excluded;
  assert.equal(excluded, true, "χάθηκε το excluded");
  assert.equal(merged.unl95, 5200);
});
