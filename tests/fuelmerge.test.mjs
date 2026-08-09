import { test } from "node:test";
import assert from "node:assert/strict";
// ΤΙΣ ΙΔΙΕΣ functions καλεί το /api/fuel — κανένα test-only αντίγραφο.
import {
  validateEntry, mergeLiters, resolveExcluded, dedupeEntries,
} from "../lib/fuelCalc.js";

test("M1. Μερική ενημέρωση διατηρεί τα υπόλοιπα καύσιμα", () => {
  const existing = { unl95: 5000, unl100: 1000, diesel: 7000 };
  const v = validateEntry({ entry_date: "2026-08-01", liters: { unl95: 5200 } });
  assert.equal(v.ok, true);
  const merged = mergeLiters(existing, v.liters);
  assert.deepEqual(merged, { unl95: 5200, unl100: 1000, diesel: 7000 });
});

test("M2. Ρητό μηδέν μηδενίζει το καύσιμο", () => {
  const existing = { unl95: 5000, diesel: 7000 };
  const v = validateEntry({ entry_date: "2026-08-01", liters: { diesel: 0 } });
  const merged = mergeLiters(existing, v.liters);
  assert.equal(merged.diesel, 0, "το ρητό 0 πρέπει να περάσει");
  assert.equal(merged.unl95, 5000);
});

test("M3. Κενή τιμή ΔΕΝ σβήνει υπάρχον καύσιμο", () => {
  const existing = { unl95: 5000, diesel: 7000 };
  const v = validateEntry({
    entry_date: "2026-08-01",
    liters: { unl95: 5100, diesel: "" },
  });
  const merged = mergeLiters(existing, v.liters);
  assert.equal(merged.diesel, 7000, "το κενό δεν είναι μηδενισμός");
});

test("M4. Import με υποσύνολο στηλών διατηρεί τα υπόλοιπα", () => {
  const existing = { unl95: 5000, unl98: 800, unl100: 1000, diesel: 7000 };
  const imported = validateEntry({
    entry_date: "2026-08-01",
    liters: { unl95: 4800, diesel: 6900 },
  });
  const merged = mergeLiters(existing, imported.liters);
  assert.deepEqual(merged, {
    unl95: 4800,
    unl98: 800,
    unl100: 1000,
    diesel: 6900,
  });
});

test("M5. Νέα ημερομηνία δημιουργείται κανονικά", () => {
  const v = validateEntry({ entry_date: "2026-09-01", liters: { unl95: 100 } });
  const merged = mergeLiters(undefined, v.liters);
  assert.deepEqual(merged, { unl95: 100 });
});

// ---- 7: διατήρηση του excluded σε partial update ----

test("M6. excluded=true διατηρείται όταν ενημερώνονται μόνο τα liters", () => {
  assert.equal(resolveExcluded({ liters: { unl95: 1 } }, { excluded: true }), true);
});

test("M7. Ρητό excluded=false το απενεργοποιεί", () => {
  assert.equal(resolveExcluded({ excluded: false }, { excluded: true }), false);
});

test("M8. excluded=false παραμένει false σε partial update", () => {
  assert.equal(resolveExcluded({ liters: { unl95: 1 } }, { excluded: false }), false);
});

test("M9. Νέα εγγραφή χωρίς πεδίο → false", () => {
  assert.equal(resolveExcluded({ liters: { unl95: 1 } }, undefined), false);
});

// ---- 8: deduplication διπλών ημερομηνιών στο ίδιο αρχείο ----

test("M10. Διπλή ημερομηνία με ΔΙΑΦΟΡΕΤΙΚΑ καύσιμα γίνεται merge", () => {
  const out = dedupeEntries([
    { entry_date: "2026-08-07", liters: { unl95: 4000 } },
    { entry_date: "2026-08-07", liters: { diesel: 7000 } },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].liters, { unl95: 4000, diesel: 7000 });
});

test("M11. Διπλή ημερομηνία με ΙΔΙΟ καύσιμο: last valid row wins", () => {
  const out = dedupeEntries([
    { entry_date: "2026-08-07", liters: { unl95: 4000 } },
    { entry_date: "2026-08-07", liters: { unl95: 4500 } },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].liters.unl95, 4500, "δεν αθροίζονται");
});

test("M12. Dedup + υπάρχουσα εγγραφή στη βάση: όλα διατηρούνται", () => {
  const dbExisting = { unl100: 1200, diesel: 6800 };
  const deduped = dedupeEntries([
    { entry_date: "2026-08-07", liters: { unl95: 4000 } },
    { entry_date: "2026-08-07", liters: { unl98: 900 } },
  ])[0];
  const final = { ...dbExisting, ...deduped.liters };
  assert.deepEqual(final, {
    unl100: 1200,
    diesel: 6800,
    unl95: 4000,
    unl98: 900,
  });
});

test("M13. Ρητό μηδέν επιβιώνει του dedup", () => {
  const out = dedupeEntries([
    { entry_date: "2026-08-07", liters: { diesel: 7000 } },
    { entry_date: "2026-08-07", liters: { diesel: 0 } },
  ]);
  assert.equal(out[0].liters.diesel, 0);
});
