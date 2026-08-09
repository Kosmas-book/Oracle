import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthWeeks, daysInMonthFlags, rotationList, nextInRotation,
  eligibleNightEmployees, canTakeNightBlock, pickNextNight, generateMonth,
} from "../lib/monthPlan.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { mk, team, WEEKDAY, SUNDAY, workedDays } from "./helpers.mjs";

const SETTINGS = {
  weekday_req: WEEKDAY,
  sunday_req: SUNDAY,
  work_days: 6,
  max_per_shift: 4,
  shifts: null,
  leave_replaces_rest: true,
};

const nightTeam = () => [
  mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 10 }),
  mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 20 }),
  mk("mar", "ΜΑΡΙΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"], sort_order: 30 }),
  ...team(12).slice(2),
];

// ============ 31. ΗΜΕΡΟΛΟΓΙΑΚΑ ΟΡΙΑ ============

test("MB1. Μήνας που ξεκινά Δευτέρα", () => {
  const w = monthWeeks(2026, 6); // 1/6/2026 = Δευτέρα
  assert.equal(w[0], "2026-06-01");
});

test("MB2. Μήνας που ξεκινά Τρίτη → η εβδομάδα ξεκινά τον προηγούμενο μήνα", () => {
  const w = monthWeeks(2026, 9); // 1/9/2026 = Τρίτη
  assert.equal(w[0], "2026-08-31", "πρέπει να πιάνει τη Δευτέρα 31/8");
  const flags = daysInMonthFlags("2026-08-31", 2026, 9);
  assert.equal(flags[0], false, "η Δευτέρα 31/8 είναι spillover");
  assert.equal(flags[1], true, "η Τρίτη 1/9 ανήκει στον μήνα");
});

test("MB3. Μήνας που ξεκινά Κυριακή", () => {
  const w = monthWeeks(2026, 3); // 1/3/2026 = Κυριακή
  assert.equal(w[0], "2026-02-23");
  assert.equal(daysInMonthFlags("2026-02-23", 2026, 3)[6], true, "η Κυριακή 1/3");
});

test("MB4. Φεβρουάριος 28 ημερών", () => {
  const w = monthWeeks(2026, 2);
  assert.ok(w.length >= 4 && w.length <= 5);
  assert.equal(w[0], "2026-01-26");
});

test("MB5. Δίσεκτος Φεβρουάριος (29/2/2028)", () => {
  const w = monthWeeks(2028, 2);
  const last = w[w.length - 1];
  const flags = daysInMonthFlags(last, 2028, 2);
  assert.ok(flags.some(Boolean), "η τελευταία εβδομάδα πιάνει τον Φεβρουάριο");
  assert.equal(w[0], "2028-01-31");
});

test("MB6+MB7. Μήνες 30 και 31 ημερών", () => {
  assert.ok(monthWeeks(2026, 4).length >= 4); // Απρίλιος 30
  assert.ok(monthWeeks(2026, 7).length >= 4); // Ιούλιος 31
});

test("MB8+MB9. Μήνας που τελειώνει μεσοβδόμαδα / εβδομάδα σε δύο μήνες", () => {
  const w = monthWeeks(2026, 9);
  const lastWeek = w[w.length - 1];
  const flags = daysInMonthFlags(lastWeek, 2026, 9);
  assert.ok(flags.some((f) => !f), "η τελευταία εβδομάδα ξεπερνά τον μήνα");
});

test("MB10. Καμία διπλή week_start", () => {
  for (const [y, m] of [[2026, 1], [2026, 9], [2028, 2], [2026, 12]]) {
    const w = monthWeeks(y, m);
    assert.equal(new Set(w).size, w.length, `διπλότυπο σε ${m}/${y}`);
  }
});

// ============ 32. NIGHT ROTATION ============

test("MN1. Αυτόματο rotation A → B → C → A", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim", previousNight: null },
  });
  const holders = r.weeks.map((w) => w.actualNight);
  // Ο dim τρέχει ήδη· τα επόμενα μπλοκ ακολουθούν τη σειρά.
  assert.deepEqual(holders.slice(0, 4), ["tat", "mar", "dim", "tat"], JSON.stringify(holders));
});

test("MN2. Το rotation συνεχίζει από τον προηγούμενο μήνα", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 10, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "tat", previousNight: "dim" }, // τέλος Σεπτεμβρίου
  });
  assert.equal(
    r.weeks[0].actualNight, "mar",
    "μετά τον Τάτο ακολουθεί ο Μάριος, όχι ο Δημήτρης"
  );
});

test("MN3. Μήνας που ξεκινά μέσα σε ενεργό night block", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim", previousNight: "mar" },
  });
  const w0 = r.weeks[0];
  // Ο Δημήτρης συνεχίζει το ενεργό μπλοκ Δευ–Σάβ και παίρνει Ρ Κυριακή.
  for (let d = 0; d < 6; d++) assert.equal(w0.grid["dim"][d], "Β", `ημέρα ${d}`);
  assert.equal(w0.grid["dim"][6], "Ρ");
});

test("MN4. Normal next holder: Ρ Σάββατο + Β Κυριακή", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim", previousNight: "mar" },
  });
  const w0 = r.weeks[0];
  assert.equal(w0.grid["tat"][5], "Ρ", `Σάββατο: ${w0.grid["tat"].join(" ")}`);
  assert.equal(w0.grid["tat"][6], "Β");
});

test("MN5+MN6. Repeat exception A→B→A και έλεγχος 11ώρου", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat"], // μόνο δύο → αναγκαστικά A→B→A
    seed: { currentNight: "dim", previousNight: "tat" },
  });
  // Στην 1η εβδομάδα ο tat είναι ΚΑΙ previous ΚΑΙ next → repeat exception
  const w0 = r.weeks[0];
  assert.equal(w0.grid["tat"][6], "Β");
  assert.equal(w0.grid["tat"][0], "Ρ", "υποχρεωτικό Ρ Δευτέρας του previous");
  // Το 11ωρο ισχύει σε όλο τον μήνα
  const SH = allShifts(null);
  for (const w of r.weeks)
    for (const e of emps)
      for (let d = 1; d < 7; d++) {
        const a = w.grid[e.id]?.[d - 1];
        const b = w.grid[e.id]?.[d];
        if (a && b) assert.ok(restOk(a, b, SH), `${e.name}: ${a}→${b}`);
      }
});

test("MN7+MN8+MN9. Μη διαθέσιμος βραδινός παραλείπεται, το rotation συνεχίζει σωστά", () => {
  const emps = nightTeam();
  const weeks = monthWeeks(2026, 9);
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim", previousNight: null },
    // Ο Τάτος έχει άδεια την Κυριακή που θα ξεκινούσε το μπλοκ του.
    lockedByWeek: { [weeks[0]]: { tat: { 6: "Ο" } } },
  });
  const w0 = r.weeks[0];
  assert.ok(
    w0.skippedNight.some((s) => s.id === "tat"),
    "ο Τάτος έπρεπε να παραλειφθεί"
  );
  assert.equal(w0.actualNight, "mar", "τον αντικαθιστά ο Μάριος");
  assert.ok(
    w0.warnings.some((x) => x.includes("ΤΑΤΟΣ") && x.includes("παραλείφθηκε")),
    "λείπει explicit warning: " + w0.warnings.join(" | ")
  );
  // 12: το επόμενο μπλοκ συνεχίζει ΜΕΤΑ τον πραγματικό κάτοχο (Μάριος → Δημήτρης)
  assert.equal(r.weeks[1].actualNight, "dim", JSON.stringify(r.weeks.map(w=>w.actualNight)));
});

test("MN10. Χειροκίνητη επιλογή ανά εβδομάδα", () => {
  const emps = nightTeam();
  const weeks = monthWeeks(2026, 9);
  const manual = {};
  weeks.forEach((w, i) => (manual[w] = ["mar", "dim", "tat"][i % 3]));
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    nightMode: "manual", manualNight: manual,
    seed: { currentNight: "dim", previousNight: null },
  });
  assert.equal(r.weeks[0].actualNight, "mar", "τηρήθηκε η χειροκίνητη επιλογή");
  assert.equal(r.weeks[1].actualNight, "dim");
});

test("MN12. Ανενεργοί και όσοι δεν κάνουν Β δεν συμμετέχουν στο rotation", () => {
  const emps = [
    ...nightTeam(),
    mk("off", "ΑΝΕΝΕΡΓΟΣ", { allowed_shifts: ["Β"], deactivated_at: "2026-01-01" }),
    mk("noB", "ΧΩΡΙΣ-Β", { allowed_shifts: ["Π", "Α"] }),
  ];
  const list = rotationList(emps, []);
  assert.ok(!list.some((e) => e.id === "off"), "ανενεργός στο rotation");
  assert.ok(!list.some((e) => e.id === "noB"), "χωρίς Β στο rotation");
  assert.equal(eligibleNightEmployees(emps).length, 3);
});

test("MN-order. Η αποθηκευμένη σειρά υπερισχύει του sort_order", () => {
  const emps = nightTeam();
  const list = rotationList(emps, ["mar", "dim", "tat"]);
  assert.deepEqual(list.map((e) => e.id), ["mar", "dim", "tat"]);
  assert.equal(nextInRotation(list, "mar").id, "dim");
  assert.equal(nextInRotation(list, "tat").id, "mar", "κυκλική συνέχεια");
});

// ============ 33. WEEKLY TARGETS ΑΝΑ ΕΒΔΟΜΑΔΑ ============

test("MT1. Διαφορετικός exact target ανά εβδομάδα, χωρίς monthly average", () => {
  const pt = mk("pt", "PART", { employment_type: "part", min_days: 1, max_days: 6 });
  const emps = [...nightTeam(), pt];
  const weeks = monthWeeks(2026, 9);
  const byWeek = {};
  const wanted = [2, 4, 1, 3, 2];
  weeks.forEach((w, i) => (byWeek[w] = { pt: wanted[i % wanted.length] }));
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    weeklyTargetsByWeek: byWeek,
    seed: { currentNight: "dim" },
  });
  r.weeks.forEach((w, i) => {
    assert.equal(
      workedDays(w.grid["pt"]),
      wanted[i % wanted.length],
      `εβδομάδα ${i + 1}: ${w.grid["pt"].join(" ")}`
    );
  });
});

// ============ 34. CROSS-WEEK 11ΩΡΟ ============

test("MC1. Το cross-week 11ωρο ελέγχεται (Κυριακή N → Δευτέρα N+1)", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim", prevSunday: {} },
  });
  const SH = allShifts(null);
  for (let i = 1; i < r.weeks.length; i++) {
    const prev = r.weeks[i - 1].grid;
    const cur = r.weeks[i].grid;
    for (const e of emps) {
      const sun = prev[e.id]?.[6];
      const mon = cur[e.id]?.[0];
      if (sun && mon)
        assert.ok(restOk(sun, mon, SH), `${e.name}: Κυρ ${sun} → Δευ ${mon}`);
    }
  }
});

test("MC2. Παραβίαση cross-week εντοπίζεται από το validation", () => {
  const emps = nightTeam();
  const weeks = monthWeeks(2026, 9);
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    // Ο e3 έκανε Α3 (λήγει 02:00) την περασμένη Κυριακή, κλειδώνουμε Π τη Δευτέρα
    seed: { currentNight: "dim", prevSunday: { e3: "Α3" } },
    lockedByWeek: { [weeks[0]]: { e3: { 0: "Π" } } },
  });
  const rest = r.weeks[0].check.groups.find((g) => g.key === "rest");
  assert.ok(rest, "δεν εντοπίστηκε cross-week παραβίαση");
  assert.ok(rest.items.some((i) => i.includes("Κυριακή")), rest.items.join(" | "));
});

// ============ 35. DRAFT / EXISTING WEEKS ============

test("MD1. Το generateMonth είναι pure — δεν αγγίζει βάση", () => {
  const emps = nightTeam();
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    seed: { currentNight: "dim" },
  });
  assert.ok(Array.isArray(r.weeks) && r.weeks.length > 0);
  assert.ok(r.summary.generationMs >= 0);
  // Καμία ιδιότητα που να υποδηλώνει persistence
  assert.equal(r.weeks[0].id, undefined);
});

test("MD2. Αποθηκευμένη εβδομάδα διατηρείται και τροφοδοτεί την επόμενη", () => {
  const emps = nightTeam();
  const weeks = monthWeeks(2026, 9);
  const savedGrid = {};
  for (const e of emps) savedGrid[e.id] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ"];
  savedGrid["mar"] = ["Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Ρ", "Β"]; // ο Μάριος ξεκίνησε
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    savedWeeks: {
      [weeks[0]]: {
        week_start: weeks[0], grid: savedGrid,
        night_person: "dim", next_night_person: "mar",
        actual_night_person: "mar", day_req: [],
      },
    },
    keepExisting: { [weeks[0]]: true },
    seed: { currentNight: "dim", previousNight: null },
  });
  assert.equal(r.weeks[0].source, "existing", "η αποθηκευμένη διατηρήθηκε");
  assert.deepEqual(r.weeks[0].grid["mar"], savedGrid["mar"], "δεν αντικαταστάθηκε");
  // Η επόμενη εβδομάδα συνεχίζει με τον ΠΡΑΓΜΑΤΙΚΟ κάτοχο (Μάριος)
  for (let d = 0; d < 6; d++)
    assert.equal(r.weeks[1].grid["mar"][d], "Β", `ημέρα ${d}: ${r.weeks[1].grid["mar"].join(" ")}`);
});

// ============ 36. MONTH REBALANCING ============

test("MR1. FEASIBLE μήνας: 0 hard violations και μηδενικές αποφευκτέες ελλείψεις", () => {
  const emps = [
    mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("mar", "ΜΑΡΙΟΣ", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    ...Array.from({ length: 8 }, (_, i) =>
      mk("f" + i, "ΕΥΕΛ-" + i, { allowed_shifts: ["Π", "Π2", "Π4", "Α", "Α2", "Α3"] })
    ),
  ];
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    seed: { currentNight: "dim" },
  });
  const SH = allShifts(null);
  for (const w of r.weeks) {
    const hardGroups = (w.check.groups || []).filter(
      (g) => g.level === "error" && ["forbidden", "rest", "unknown", "leaveWork"].includes(g.key)
    );
    assert.equal(hardGroups.length, 0, `hard violations: ${JSON.stringify(hardGroups)}`);
  }
  assert.equal(r.summary.restViolations, 0);
});

test("MR2. IMPOSSIBLE μήνας: warnings χωρίς παραβίαση κανόνων", () => {
  const emps = [
    mk("dim", "ΔΗΜΗΤΡΗΣ", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("tat", "ΤΑΤΟΣ", { allowed_shifts: ["Π", "Α", "Β"] }),
    mk("e1", "ΥΠ-1", { allowed_shifts: ["Π"] }),
  ];
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat"],
    seed: { currentNight: "dim" },
  });
  assert.ok(r.summary.missing > 0, "αναμένονται ακάλυπτες θέσεις");
  for (const w of r.weeks)
    for (const e of emps)
      for (const c of w.grid[e.id] || []) {
        if (!c || c === "Ρ" || c === "Ο") continue;
        assert.ok(
          (e.allowed_shifts || []).includes(c),
          `${e.name} πήρε μη επιτρεπόμενη ${c}`
        );
      }
});

test("MR3. Η άδεια Ο δεν δημιουργεί ψευδές warning στο Month mode", () => {
  const pt = mk("pt", "PART", { employment_type: "part", min_days: 3, max_days: 4 });
  const emps = [...nightTeam(), pt];
  const weeks = monthWeeks(2026, 9);
  const locked = {};
  locked[weeks[1]] = { pt: { 0: "Ο", 1: "Ο", 2: "Ο", 3: "Ο", 4: "Ο", 5: "Ο", 6: "Ο" } };
  const r = generateMonth({
    year: 2026, month: 9, employees: emps, settings: SETTINGS,
    rotationOrder: ["dim", "tat", "mar"],
    lockedByWeek: locked,
    seed: { currentNight: "dim" },
  });
  const w = r.weeks[1];
  assert.ok(
    !w.warnings.some((x) => x.includes("PART") && x.includes("ελάχιστο")),
    "ψευδές warning: " + w.warnings.join(" | ")
  );
});

// ============ 11: eligibility ============

test("ME1. canTakeNightBlock εντοπίζει τους πραγματικούς λόγους αδυναμίας", () => {
  const ok = mk("a", "Α", { allowed_shifts: ["Β"] });
  assert.equal(canTakeNightBlock(ok, {}).ok, true);
  assert.equal(canTakeNightBlock(mk("b", "Β", { allowed_shifts: ["Π"] }), {}).ok, false);
  assert.equal(
    canTakeNightBlock(mk("c", "Γ", { allowed_shifts: ["Β"], deactivated_at: "x" }), {}).ok,
    false
  );
  assert.equal(
    canTakeNightBlock(mk("d", "Δ", { allowed_shifts: ["Β"], fixed_days: { 6: "Ο" } }), {}).ok,
    false
  );
  const withLeave = canTakeNightBlock(ok, { locked: { a: { 6: "Ο" } } });
  assert.equal(withLeave.ok, false);
  assert.ok(withLeave.reason.includes("άδεια"));
});

test("ME2. pickNextNight παραλείπει και τεκμηριώνει", () => {
  const list = [
    mk("a", "Α", { allowed_shifts: ["Β"] }),
    mk("b", "Β", { allowed_shifts: ["Β"], fixed_days: { 6: "Ο" } }),
    mk("c", "Γ", { allowed_shifts: ["Β"] }),
  ];
  const r = pickNextNight({ list, afterId: "a", locked: {}, shifts: null });
  assert.equal(r.pick.id, "c");
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].id, "b");
});
