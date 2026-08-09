import { test } from "node:test";
import assert from "node:assert/strict";
import { rebalance } from "../lib/rebalance.js";
import { allShifts, restOk } from "../lib/shifts.js";
import { mk } from "./helpers.mjs";

// Απευθείας δοκιμή της μηχανής rebalance σε ελεγχόμενα αρχικά states,
// ώστε να αποδειχθεί ότι βρίσκει CROSS-DAY λύσεις.
const REQ = { "Π": 1, "Π4": 1, "Α": 1, "Α3": 1 };
// Κυριακή κλειστή: 6 μέρες × 4 θέσεις = 24 slots = 4 άτομα × 6 μέρες.
// Το fixture είναι μαθηματικά ΕΦΙΚΤΟ.
const reqOf = (d) => (d === 6 ? {} : REQ);
const worked = (row) => row.filter((c) => c && c !== "Ρ" && c !== "Ο").length;

const runRB = (grid, employees, over = {}) =>
  rebalance({
    grid,
    employees,
    reqOf,
    shifts: null,
    maxPerShift: 6,
    workDays: 6,
    weeklyTargets: {},
    leaveReplacesRest: true,
    prevSunday: {},
    fixedCells: new Set(),
    nightCells: new Set(),
    ...over,
  });

test("X1. Direct fill: κενό κελί καλύπτει ακάλυπτη βάρδια", () => {
  const employees = [
    mk("a", "Α", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
    mk("b", "Β", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
    mk("c", "Γ", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
    mk("d", "Δ", { allowed_shifts: ["Π", "Π4", "Α", "Α3"] }),
  ];
  const grid = {
    a: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
    b: ["Π4", "Π4", "Π4", "Π4", "Π4", "Π4", "Ρ"],
    c: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
    d: ["Ρ", "Α3", "Α3", "Α3", "Α3", "Α3", "Ρ"], // λείπει Α3 Δευτέρας
  };
  const r = runRB(grid, employees);
  assert.equal(r.score.missing, 0, `έμειναν κενά: ${JSON.stringify(r.score)}`);
  // Όλοι μπορούν όλες τις βάρδιες, οπότε ο engine μπορεί να διαλέξει
  // οποιαδήποτε έγκυρη ανάθεση — ελέγχουμε το αποτέλεσμα, όχι τη διαδρομή.
  const a3Mon = employees.filter((e) => grid[e.id][0] === "Α3").length;
  assert.equal(a3Mon, 1, "το Α3 Δευτέρας καλύφθηκε από ακριβώς έναν");
  for (const e of employees)
    assert.equal(worked(grid[e.id]), 6, `${e.name}: ${grid[e.id].join(" ")}`);
});

test("X2. CROSS-DAY: εργαζόμενος 4/6 φτάνει 6/6 και κλείνουν τα κενά", () => {
  // Ο «δ» έχει 4 μέρες και 3 Ρ. Λείπουν Α3 Δευτέρας και Α3 Τρίτης.
  const employees = [
    mk("a", "Α", { allowed_shifts: ["Π"] }),
    mk("b", "Β", { allowed_shifts: ["Π4"] }),
    mk("c", "Γ", { allowed_shifts: ["Α"] }),
    mk("d", "Δ", { allowed_shifts: ["Α3", "Α"] }),
  ];
  const grid = {
    a: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
    b: ["Π4", "Π4", "Π4", "Π4", "Π4", "Π4", "Ρ"],
    c: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
    d: ["Ρ", "Ρ", "Α3", "Α3", "Α3", "Α3", "Ρ"], // 4/6
  };
  assert.equal(worked(grid.d), 4, "αρχικό state");
  const r = runRB(grid, employees);
  assert.equal(worked(grid.d), 6, `δεν έφτασε 6/6: ${grid.d.join(" ")}`);
  assert.equal(grid.d[0], "Α3");
  assert.equal(grid.d[1], "Α3");
});

test("X3. CROSS-DAY chain: μετακίνηση βάρδιας ΜΕΤΑΞΥ ημερών για να καλυφθεί κενό", () => {
  // Λείπει Π4 Τρίτης. Ο «β» το καλύπτει, αλλά τότε αδειάζει Α3 Σαββάτου,
  // που πρέπει να το πάρει ο «δ» (που έχει έλλειμμα) — αλυσίδα δύο βημάτων.
  const employees = [
    mk("a", "Α", { allowed_shifts: ["Π"] }),
    mk("b", "Β", { allowed_shifts: ["Π4", "Α3"] }),
    mk("c", "Γ", { allowed_shifts: ["Α"] }),
    mk("d", "Δ", { allowed_shifts: ["Α3"] }),
  ];
  const grid = {
    a: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
    b: ["Π4", "Ρ", "Π4", "Π4", "Π4", "Α3", "Ρ"], // Ρ Τρίτης, Α3 Σαββάτου → 5/6
    c: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
    d: ["Α3", "Α3", "Α3", "Α3", "Α3", "Ρ", "Ρ"], // Ρ Σαββάτου → 5/6
  };
  // Λείπουν: Π4 Τρίτης ΚΑΙ Π4 Σαββάτου.
  // Νόμιμη αλυσίδα 3 βημάτων ΜΕΤΑΞΥ ημερών:
  //   β: Τρίτη Ρ→Π4 · β: Σάββατο Α3→Π4 · δ: Σάββατο Ρ→Α3
  const r = runRB(grid, employees);
  assert.equal(r.score.missing, 0, `έμειναν κενά: ${JSON.stringify(r.score)}`);
  assert.equal(grid.b[1], "Π4", "καλύφθηκε το Π4 Τρίτης");
  assert.equal(grid.b[5], "Π4", "ο Β μετακινήθηκε σε Π4 το Σάββατο");
  assert.equal(grid.d[5], "Α3", "ο Δ πήρε το Α3 Σαββάτου (cross-day)");
  assert.equal(worked(grid.b), 6, `Β: ${grid.b.join(" ")}`);
  assert.equal(worked(grid.d), 6, `Δ: ${grid.d.join(" ")}`);
});

test("X4. Το rebalance δεν σπάει το 11ωρο", () => {
  const employees = [
    mk("a", "Α", { allowed_shifts: ["Π", "Α3"] }),
    mk("b", "Β", { allowed_shifts: ["Π4", "Α"] }),
    mk("c", "Γ", { allowed_shifts: ["Α", "Π"] }),
    mk("d", "Δ", { allowed_shifts: ["Α3", "Π4"] }),
  ];
  const grid = {
    a: ["Π", "Ρ", "Π", "Π", "Π", "Π", "Ρ"],
    b: ["Π4", "Π4", "Ρ", "Π4", "Π4", "Π4", "Ρ"],
    c: ["Α", "Α", "Α", "Ρ", "Α", "Α", "Ρ"],
    d: ["Α3", "Α3", "Α3", "Α3", "Ρ", "Ρ", "Ρ"],
  };
  runRB(grid, employees);
  const SH = allShifts(null);
  for (const e of employees)
    for (let d = 1; d < 7; d++) {
      const p = grid[e.id][d - 1];
      const c = grid[e.id][d];
      if (p && c) assert.ok(restOk(p, c, SH), `${e.name}: ${p}→${c} ημέρα ${d}`);
    }
});

test("X5. Cell-level night protection: μόνο τα mandatory κελιά κλειδώνουν", () => {
  const employees = [
    mk("n", "ΒΡΑΔ", { allowed_shifts: ["Β", "Π", "Α"] }),
    mk("a", "Α", { allowed_shifts: ["Π", "Α"] }),
  ];
  const grid = {
    n: ["Ρ", "Π", "Ρ", "Π", "Π", "Π", "Β"], // next holder: Σάβ Ρ + Κυρ Β mandatory
    a: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
  };
  const nightCells = new Set(["n:5", "n:6"]);
  runRB(grid, employees, {
    nightCells,
    reqOf: () => ({ "Π": 1, "Α": 1 }),
  });
  assert.equal(grid.n[6], "Β", "το Β Κυριακής προστατεύτηκε");
  assert.equal(grid.n[5], "Π", "το Σάββατο ήταν Π και δεν είναι στα mandatory");
  // Η Δευτέρα (μη προστατευμένη) μπορεί να άλλαξε — αυτό είναι το ζητούμενο.
});

test("X6. IMPOSSIBLE: warning χωρίς παραβίαση hard constraint", () => {
  const employees = [
    mk("a", "Α", { allowed_shifts: ["Π"] }),
    mk("b", "Β", { allowed_shifts: ["Α"] }),
  ];
  const grid = {
    a: ["Π", "Π", "Π", "Π", "Π", "Π", "Ρ"],
    b: ["Α", "Α", "Α", "Α", "Α", "Α", "Ρ"],
  };
  const r = runRB(grid, employees); // απαιτούνται και Π4 και Α3 — αδύνατο
  assert.ok(r.score.missing > 0);
  assert.ok(
    r.warnings.some((w) => w.includes("ακάλυπτες θέσεις")),
    "λείπει warning: " + r.warnings.join(" | ")
  );
  assert.equal(r.score.hard, 0, "δεν επιτρέπεται παραβίαση hard constraint");
  for (const e of employees)
    for (const c of grid[e.id])
      if (c && c !== "Ρ" && c !== "Ο")
        assert.ok((e.allowed_shifts || []).includes(c), `${e.name} πήρε ${c}`);
});
