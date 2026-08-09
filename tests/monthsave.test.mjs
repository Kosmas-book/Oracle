import { test } from "node:test";
import assert from "node:assert/strict";
// ΤΙΣ ΙΔΙΕΣ functions καλεί το PUT /api/month — κανένα test-only αντίγραφο.
import {
  partitionWeeks, resolveActualNight, pickMeta, resolveDayReq,
  buildScheduleRow, collectTargetOps, prevSundayFor, prevNightFor,
} from "../lib/monthSave.js";
import { resolveExcluded, mergeLiters, validateEntry } from "../lib/fuelCalc.js";
import { mk } from "./helpers.mjs";

const EMPS = [mk("a", "Α"), mk("b", "Β"), mk("c", "Γ")];
const WD = { "Π": 3, "Α": 3 };
const SD = { "Π": 2, "Α": 2 };
const R = (n) => Array.from({ length: 7 }, () => n);

// ---------------- 6: preserve / write partitioning ----------------

test("S1. Edited existing week ΓΡΑΦΕΤΑΙ (δεν παραλείπεται)", () => {
  const { toWrite, preserved } = partitionWeeks([
    { week_start: "2026-09-07", source: "existing", edited: true, preserve: false },
  ]);
  assert.equal(toWrite.length, 1, "η επεξεργασμένη έπρεπε να γραφτεί");
  assert.equal(preserved.length, 0);
});

test("S2. Preserve=true παραλείπεται· preserve=false γράφεται", () => {
  const { toWrite, preserved } = partitionWeeks([
    { week_start: "2026-09-07", preserve: true },
    { week_start: "2026-09-14", preserve: false },
    { week_start: "2026-09-21" },
  ]);
  assert.deepEqual(preserved.map((w) => w.week_start), ["2026-09-07"]);
  assert.deepEqual(toWrite.map((w) => w.week_start), ["2026-09-14", "2026-09-21"]);
});

test("S3. Το source μόνο του ΔΕΝ αρκεί για παράλειψη", () => {
  const { toWrite } = partitionWeeks([
    { week_start: "2026-09-07", source: "existing", edited: true },
  ]);
  assert.equal(toWrite.length, 1, "source=existing χωρίς preserve → γράφεται");
});

test("S4. Διπλότυπα week_start αγνοούνται, σειρά χρονολογική", () => {
  const { toWrite } = partitionWeeks([
    { week_start: "2026-09-21" },
    { week_start: "2026-09-07" },
    { week_start: "2026-09-07" },
    { week_start: "λάθος" },
  ]);
  assert.deepEqual(toWrite.map((w) => w.week_start), ["2026-09-07", "2026-09-21"]);
});

// ---------------- 4/24: actual night από το grid ----------------

test("S5. resolveActualNight: ακριβώς ένας Β Κυριακής", () => {
  const grid = { a: R("Ρ"), b: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Β"], c: R("Π") };
  const r = resolveActualNight(grid, EMPS);
  assert.equal(r.id, "b");
  assert.equal(r.ambiguous, false);
  assert.equal(r.count, 1);
});

test("S6. Δύο Β Κυριακής → ambiguous, καμία αυθαίρετη επιλογή", () => {
  const grid = {
    a: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Β"],
    b: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Β"],
  };
  const r = resolveActualNight(grid, EMPS);
  assert.equal(r.id, null);
  assert.equal(r.ambiguous, true);
  assert.deepEqual(r.names.sort(), ["Α", "Β"]);
});

test("S7. Καμία Β Κυριακής → count 0", () => {
  const r = resolveActualNight({ a: R("Π") }, EMPS);
  assert.equal(r.count, 0);
  assert.equal(r.id, null);
  assert.equal(r.ambiguous, false);
});

test("S8. buildScheduleRow αγνοεί το actual_night_person του browser", () => {
  const grid = { b: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Β"] };
  const row = buildScheduleRow({
    week: { week_start: "2026-09-07", grid, actual_night_person: "ΨΕΥΤΙΚΟ" },
    existingRow: undefined,
    stationId: "s1",
    employees: EMPS,
    weekdayReq: WD, sundayReq: SD,
  });
  assert.equal(row.actual_night_person, "b", "χρησιμοποιήθηκε η τιμή του browser");
});

// ---------------- 8: metadata preservation ----------------

test("S9. pickMeta: omitted → existing, explicit [] → καθάρισμα", () => {
  assert.deepEqual(pickMeta(undefined, ["x"], []), ["x"]);
  assert.deepEqual(pickMeta([], ["x"], []), []);
  assert.equal(pickMeta(undefined, undefined, null), null);
  assert.equal(pickMeta(null, "x", "f"), null, "explicit null σέβεται τη βούληση");
});

test("S10. buildScheduleRow διατηρεί night_exceptions & day_req όταν λείπουν", () => {
  const existingRow = {
    grid: { a: R("Π") },
    night_person: "a",
    next_night_person: "b",
    day_req: Array.from({ length: 7 }, () => ({ "Π": 9 })),
    night_exceptions: [{ day: 3, cover: "c" }],
    override_warnings: ["παλιό"],
  };
  const row = buildScheduleRow({
    week: { week_start: "2026-09-07", grid: { a: R("Π") } },
    existingRow, stationId: "s1", employees: EMPS,
    weekdayReq: WD, sundayReq: SD,
    check: { errors: 0, warnings: 0, all: [] },
  });
  assert.deepEqual(row.night_exceptions, existingRow.night_exceptions);
  assert.deepEqual(row.day_req, existingRow.day_req);
  assert.deepEqual(row.override_warnings, ["παλιό"], "δεν σβήνεται χωρίς λόγο");
  assert.equal(row.night_person, "a");
});

test("S11. Explicit άδεια τιμή καθαρίζει το metadata", () => {
  const row = buildScheduleRow({
    week: { week_start: "2026-09-07", grid: {}, night_exceptions: [] },
    existingRow: { night_exceptions: [{ day: 1 }] },
    stationId: "s1", employees: EMPS, weekdayReq: WD, sundayReq: SD,
  });
  assert.deepEqual(row.night_exceptions, []);
});

test("S12. resolveDayReq fallback αλυσίδα", () => {
  const custom = Array.from({ length: 7 }, () => ({ "Π": 5 }));
  assert.deepEqual(resolveDayReq(custom, null, WD, SD), custom);
  assert.deepEqual(resolveDayReq(undefined, custom, WD, SD), custom);
  const def = resolveDayReq(undefined, undefined, WD, SD);
  assert.deepEqual(def[0], WD);
  assert.deepEqual(def[6], SD);
});

// ---------------- 7: weekly targets σε ΟΛΕΣ τις weeks ----------------

test("S13. Targets συλλέγονται και από preserved weeks", () => {
  const { upserts } = collectTargetOps(
    [
      { week_start: "2026-09-07", preserve: true, weekly_targets: { p: 3 } },
      { week_start: "2026-09-14", weekly_targets: { p: 4 } },
    ],
    "s1"
  );
  assert.equal(upserts.length, 2);
  assert.ok(upserts.some((u) => u.week_start === "2026-09-07" && u.exact_days === 3));
});

test("S14. Κενή τιμή → delete, όχι upsert", () => {
  const { upserts, deletes } = collectTargetOps(
    [{ week_start: "2026-09-07", weekly_targets: { p: "", q: 2 } }],
    "s1"
  );
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].employee_id, "p");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].employee_id, "q");
});

test("S15. weekly_targets omitted → καμία πράξη", () => {
  const { upserts, deletes } = collectTargetOps([{ week_start: "2026-09-07" }], "s1");
  assert.equal(upserts.length, 0);
  assert.equal(deletes.length, 0);
});

test("S16. Μη έγκυρες τιμές απορρίπτονται", () => {
  const { upserts } = collectTargetOps(
    [{ week_start: "2026-09-07", weekly_targets: { a: 9, b: -1, c: "x", d: 3 } }],
    "s1"
  );
  assert.deepEqual(upserts.map((u) => u.employee_id), ["d"]);
});

// ---------------- 9: boundaries στο batch ----------------

test("S17. prevSundayFor: προτεραιότητα στο batch, μετά DB, μετά seed", () => {
  const batch = [
    { week_start: "2026-09-07", grid: { a: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Α3"] } },
    { week_start: "2026-09-14", grid: {} },
  ];
  const fromBatch = prevSundayFor({
    weekStart: "2026-09-14", batch, savedWeeks: {}, seedPrevSunday: { a: "Π" },
  });
  assert.equal(fromBatch.a, "Α3", "αγνοήθηκε το batch");

  const fromDb = prevSundayFor({
    weekStart: "2026-09-14", batch: [],
    savedWeeks: { "2026-09-07": { grid: { a: ["Ρ","Ρ","Ρ","Ρ","Ρ","Ρ","Α"] } } },
    seedPrevSunday: { a: "Π" },
  });
  assert.equal(fromDb.a, "Α");

  const fromSeed = prevSundayFor({
    weekStart: "2026-09-07", batch: [], savedWeeks: {}, seedPrevSunday: { a: "Β" },
  });
  assert.equal(fromSeed.a, "Β", "η πρώτη week πρέπει να πάρει το seed");
});

test("S18. prevNightFor αλυσίδα batch → DB → seed", () => {
  assert.equal(
    prevNightFor({
      weekStart: "2026-09-14",
      batch: [{ week_start: "2026-09-07", night_person: "a" }],
      savedWeeks: {}, seedPreviousNight: "z",
    }),
    "a"
  );
  assert.equal(
    prevNightFor({
      weekStart: "2026-09-14", batch: [],
      savedWeeks: { "2026-09-07": { night_person: "b" } }, seedPreviousNight: "z",
    }),
    "b"
  );
  assert.equal(
    prevNightFor({ weekStart: "2026-09-07", batch: [], savedWeeks: {}, seedPreviousNight: "z" }),
    "z"
  );
});

// ---------------- 11: fuel helpers (πραγματικές functions του API) ----------------

test("S19. resolveExcluded — η ίδια function του /api/fuel", () => {
  assert.equal(resolveExcluded({ liters: {} }, { excluded: true }), true);
  assert.equal(resolveExcluded({ excluded: false }, { excluded: true }), false);
  assert.equal(resolveExcluded({ liters: {} }, undefined), false);
  assert.equal(resolveExcluded({ excluded: true }, undefined), true);
});

test("S20. mergeLiters — η ίδια function του /api/fuel", () => {
  const v = validateEntry({ entry_date: "2026-08-01", liters: { unl95: 5200, diesel: "" } });
  const merged = mergeLiters({ unl95: 5000, unl100: 1000, diesel: 7000 }, v.liters);
  assert.deepEqual(merged, { unl95: 5200, unl100: 1000, diesel: 7000 });
});

test("S21. Ρητό 0 μηδενίζει μέσω mergeLiters", () => {
  const v = validateEntry({ entry_date: "2026-08-01", liters: { diesel: 0 } });
  assert.equal(mergeLiters({ diesel: 7000 }, v.liters).diesel, 0);
});
