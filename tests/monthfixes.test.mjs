import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateMonth, monthWeeks, pickNextNight, nightHolderOfSavedWeek,
} from "../lib/monthPlan.js";
import { mk, team, WEEKDAY, SUNDAY } from "./helpers.mjs";

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
const weeks = monthWeeks(2026, 9);

test("F1. Πρώτο Generate: candidate με Ο μέσα στο block γίνεται skip πριν την Κυριακή", () => {
  const r = generateMonth({
    year: 2026, month: 9, employees: nightTeam(), settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: {}, startingNight: "dim",
    // Ο Τάτος θα ξεκινούσε Κυριακή weeks[0]· έχει Ο την Τετάρτη του block.
    lockedByWeek: { [weeks[1]]: { tat: { 2: "Ο" } } },
  });
  const w0 = r.weeks[0];
  assert.ok(
    w0.skippedNight.some((s) => s.id === "tat"),
    "ο Τάτος έπρεπε να παραλειφθεί: " + JSON.stringify(w0.skippedNight)
  );
  assert.notEqual(w0.grid["tat"][6], "Β", "δεν πρέπει να πάρει το Β Κυριακής");
  assert.equal(w0.actualNight, "mar");
});

test("F2. Preserved επόμενη εβδομάδα: το Β Κυριακής δίνεται στον saved holder", () => {
  const emps = nightTeam();
  // Στην weeks[1] (preserved) το μπλοκ Δευ–Σάβ το κρατά ο ΜΑΡΙΟΣ.
  const savedGrid = {};
  for (const e of emps) savedGrid[e.id] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ"];
  savedGrid["mar"] = ["Β", "Β", "Β", "Β", "Β", "Β", "Ρ"];
  assert.equal(nightHolderOfSavedWeek(savedGrid, emps), "mar");

  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim" },
    savedWeeks: {
      [weeks[1]]: {
        week_start: weeks[1], grid: savedGrid,
        night_person: "mar", next_night_person: "tat",
        actual_night_person: "tat", day_req: [], night_exceptions: [],
      },
    },
    keepExisting: { [weeks[1]]: true },
  });
  assert.equal(
    r.weeks[0].actualNight, "mar",
    `το Β Κυριακής πρέπει να πάει στον saved holder, όχι στον επόμενο του rotation: ${r.weeks[0].actualNight}`
  );
  assert.equal(r.weeks[0].grid["mar"][6], "Β");
});

test("F3. Existing draft φέρνει day_req / night_exceptions / override_warnings", () => {
  const emps = nightTeam();
  const savedGrid = {};
  for (const e of emps) savedGrid[e.id] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ"];
  savedGrid["mar"] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Β"];
  const customDayReq = Array.from({ length: 7 }, () => ({ "Π": 9 }));
  const exceptions = [{ day: 3, type: "cover", absent: "dim", cover: "tat" }];
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim" },
    savedWeeks: {
      [weeks[0]]: {
        week_start: weeks[0], grid: savedGrid,
        night_person: "dim", next_night_person: "mar",
        actual_night_person: "mar",
        day_req: customDayReq,
        night_exceptions: exceptions,
        override_warnings: ["παλιό warning"],
      },
    },
    keepExisting: { [weeks[0]]: true },
  });
  const w0 = r.weeks[0];
  assert.deepEqual(w0.day_req, customDayReq, "χάθηκε το day_req");
  assert.deepEqual(w0.nightExceptions, exceptions, "χάθηκαν τα night_exceptions");
  assert.deepEqual(w0.overrideWarnings, ["παλιό warning"]);
});

test("F4. requiredHolder υπερισχύει του rotation, χωρίς σιωπηλό skip", () => {
  const list = [
    mk("a", "Α", { allowed_shifts: ["Β"] }),
    mk("b", "Β-ΑΤΟΜΟ", { allowed_shifts: ["Β"] }),
    mk("c", "Γ", { allowed_shifts: ["Β"] }),
  ];
  // Κανονικά μετά τον "a" ακολουθεί ο "b"· ο preserved holder είναι ο "c".
  const normal = pickNextNight({ list, afterId: "a", locked: {}, shifts: null });
  assert.equal(normal.pick.id, "b");
  const forced = pickNextNight({
    list, afterId: "a", locked: {}, shifts: null, requiredHolder: "c",
  });
  assert.equal(forced.pick.id, "c");
  assert.equal(forced.forcedByPreserved, true);
  assert.equal(forced.skipped.length, 0, "δεν είναι skip, είναι επιβολή");
});
