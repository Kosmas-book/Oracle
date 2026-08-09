import { allShifts, DAY_NAMES, restOk } from "./shifts.js";
import { targetDays, maxDaysFor } from "./scheduleRules.js";
import { isRepeatException } from "./nightRules.js";

// ============================================================
// CROSS-DAY REBALANCE / REPAIR ENGINE
// Ντετερμινιστική αναζήτηση αλυσίδων μετακινήσεων ΑΝΑ ΗΜΕΡΕΣ (όχι μόνο μέσα
// στην ίδια μέρα), με λεξικογραφικό scoring και pruning.
// ============================================================

const MAX_ITERATIONS = 60;
const MAX_DEPTH = 3;
const MAX_BRANCH = 8; // υποψήφιες κινήσεις ανά επίπεδο (pruning)

// Τα κελιά του νυχτερινού κύκλου που ΔΕΝ επιτρέπεται να πειραχθούν.
// Cell-level, όχι ολόκληρο employee row.
export function nightProtectedCells({
  nightPersonId,
  nextNightPersonId,
  prevNightPersonId,
  hasNight,
}) {
  const cells = new Set();
  if (!hasNight) return cells;
  const repeat = isRepeatException(nextNightPersonId, prevNightPersonId);

  if (nightPersonId) {
    for (let d = 0; d < 6; d++) cells.add(`${nightPersonId}:${d}`); // Β Δευ–Σάβ
    cells.add(`${nightPersonId}:6`); // Ρ Κυριακής μετά το μπλοκ
  }
  if (prevNightPersonId) cells.add(`${prevNightPersonId}:0`); // Ρ Δευτέρας
  if (nextNightPersonId) {
    cells.add(`${nextNightPersonId}:6`); // Β Κυριακής
    if (!repeat) cells.add(`${nextNightPersonId}:5`); // Ρ Σαββάτου (normal case)
  }
  return cells;
}

export function rebalance(ctx) {
  const {
    grid,
    employees,
    reqOf,
    shifts,
    maxPerShift = 4,
    workDays = 6,
    weeklyTargets = {},
    leaveReplacesRest = true,
    prevSunday = {},
    fixedCells = new Set(),
    nightCells = new Set(),
  } = ctx;

  const SH = allShifts(shifts);
  const active = employees.filter((e) => !e.deactivated_at);
  const byId = Object.fromEntries(active.map((e) => [e.id, e]));
  const isWork = (c) => c && c !== "Ρ" && c !== "Ο";

  const leaveOf = (id) => (grid[id] || []).filter((c) => c === "Ο").length;
  const targetOf = (e) =>
    targetDays({
      employee: e,
      weeklyTarget: weeklyTargets[e.id],
      workDays,
      leaveDays: leaveOf(e.id),
      leaveReplacesRest,
    });
  const workedOf = (id) => (grid[id] || []).filter(isWork).length;

  const iv = (code) => {
    const s = SH[code];
    return s && s.start != null ? [s.start, s.end] : null;
  };
  const prevCode = (id, d) => (d > 0 ? grid[id][d - 1] : prevSunday[id] || "");
  const nextCodeOf = (id, d) => (d < 6 ? grid[id][d + 1] : "");

  function peakOfDay(d) {
    const spans = [];
    for (const e of active) {
      const c = iv(grid[e.id][d]);
      if (c) spans.push([c[0], Math.min(c[1], 24)]);
      const p = iv(d > 0 ? grid[e.id][d - 1] : prevSunday[e.id] || "");
      if (p && p[1] > 24) spans.push([0, p[1] - 24]);
    }
    let peak = 0;
    for (let h = 0; h < 24; h++) {
      let n = 0;
      for (const [a, b] of spans) if (a <= h && h < b) n++;
      if (n > peak) peak = n;
    }
    return peak;
  }

  // PRIORITY 1 — hard constraints σε επίπεδο κελιού.
  function cellEditable(id, d) {
    if (fixedCells.has(`${id}:${d}`)) return false;
    if (nightCells.has(`${id}:${d}`)) return false;
    const cur = grid[id][d];
    if (cur === "Ο") return false;
    if (cur === "Β") return false; // νυχτερινή εκτός κύκλου: δεν την πειράζουμε
    return true;
  }

  function canAssign(id, d, code) {
    const e = byId[id];
    if (!e) return false;
    if (!cellEditable(id, d)) return false;
    if (code === "Β") return false;
    if (!isWork(code)) return true; // Ρ επιτρέπεται πάντα σε επεξεργάσιμο κελί
    if (!(e.allowed_shifts || []).includes(code)) return false;
    if (!restOk(prevCode(id, d), code, SH)) return false;
    const nx = nextCodeOf(id, d);
    if (nx && !restOk(code, nx, SH)) return false;
    return true;
  }

  function apply(moves) {
    const undo = [];
    for (const m of moves) {
      undo.push({ id: m.id, d: m.d, prev: grid[m.id][m.d] });
      grid[m.id][m.d] = m.code;
    }
    return () => {
      for (let i = undo.length - 1; i >= 0; i--)
        grid[undo[i].id][undo[i].d] = undo[i].prev;
    };
  }

  // PRIORITY 1–5 — λεξικογραφικό score (μικρότερο = καλύτερο).
  function score() {
    let hard = 0;
    let missing = 0;
    let targetDev = 0;
    let extra = 0;

    for (let d = 0; d < 7; d++) {
      const req = reqOf(d);
      for (const [code, n] of Object.entries(req)) {
        const need = Number(n) || 0;
        const have = active.filter((e) => grid[e.id][d] === code).length;
        if (have < need) missing += need - have;
        else extra += have - need;
      }
      if (peakOfDay(d) > maxPerShift) hard += 10;
      for (const e of active) {
        const c = grid[e.id][d];
        if (!isWork(c)) continue;
        if (!(e.allowed_shifts || []).includes(c)) hard += 10;
        const p = prevCode(e.id, d);
        if (p && !restOk(p, c, SH)) hard += 10;
      }
    }

    const specials = new Set();
    for (let d = 0; d < 7; d++)
      for (const [code, n] of Object.entries(reqOf(d)))
        if ((Number(n) || 0) < 2) specials.add(code);

    const specialCounts = [];
    for (const e of active) {
      const t = targetOf(e);
      const w = workedOf(e.id);
      // 4A: υπέρβαση ανώτατου ορίου = HARD, ώστε καμία φάση να μην το επιτρέπει.
      if (w > maxDaysFor(t)) hard += 10 * (w - maxDaysFor(t));
      if (t.exact != null) targetDev += Math.abs(w - t.exact);
      else if (w < t.min) targetDev += t.min - w;
      else if (w > t.max) targetDev += w - t.max;
      specialCounts.push((grid[e.id] || []).filter((c) => specials.has(c)).length);
    }
    let fairness = 0;
    if (specialCounts.length) {
      const avg = specialCounts.reduce((s, x) => s + x, 0) / specialCounts.length;
      fairness = specialCounts.reduce((s, x) => s + Math.abs(x - avg), 0);
    }

    return { hard, missing, targetDev, extra, fairness };
  }

  const KEYS = ["hard", "missing", "targetDev", "extra", "fairness"];
  const better = (a, b) => {
    for (const k of KEYS) {
      if (a[k] < b[k]) return true;
      if (a[k] > b[k]) return false;
    }
    return false;
  };

  // ---------- ΠΑΡΑΓΩΓΗ ΥΠΟΨΗΦΙΩΝ ΚΙΝΗΣΕΩΝ (CROSS-DAY) ----------
  // Στοχευμένες κινήσεις: κάλυψη ελλείψεων + κάλυψη ελλειμμάτων ημερών.
  function candidateMoves() {
    const out = [];

    // (α) Κάθε ακάλυπτη απαίτηση: ποιος μπορεί να μπει εκεί;
    for (let d = 0; d < 7; d++) {
      const req = reqOf(d);
      for (const code of Object.keys(req).sort()) {
        const need = Number(req[code]) || 0;
        const have = active.filter((e) => grid[e.id][d] === code).length;
        if (have >= need) continue;
        for (const e of active) {
          if (!canAssign(e.id, d, code)) continue;
          out.push({ id: e.id, d, code, kind: "cover" });
        }
      }
    }

    // (β) Κάθε εργαζόμενος με έλλειμμα ημερών: πού μπορεί να δουλέψει;
    for (const e of active) {
      const t = targetOf(e);
      const goal = t.exact != null ? t.exact : t.min;
      if (workedOf(e.id) >= goal) continue;
      for (let d = 0; d < 7; d++) {
        if (isWork(grid[e.id][d])) continue;
        for (const code of Object.keys(reqOf(d)).sort()) {
          if (!canAssign(e.id, d, code)) continue;
          out.push({ id: e.id, d, code, kind: "deficit" });
        }
      }
    }

    // (γ) Απελευθέρωση: όποιος ξεπερνά τον στόχο του ή καλύπτει περίσσευμα,
    //     μπορεί να δώσει τη θέση του (γίνεται Ρ) — ΣΕ ΟΠΟΙΑΔΗΠΟΤΕ ημέρα.
    for (const e of active) {
      const t = targetOf(e);
      const goal = t.exact != null ? t.exact : t.min;
      for (let d = 0; d < 7; d++) {
        const cur = grid[e.id][d];
        if (!isWork(cur) || !cellEditable(e.id, d)) continue;
        const req = reqOf(d);
        const need = Number(req[cur]) || 0;
        const have = active.filter((x) => grid[x.id][d] === cur).length;
        // Είτε περισσεύει η κάλυψη, είτε ο ίδιος ξεπερνά τον στόχο του.
        if (have > need || workedOf(e.id) > goal)
          out.push({ id: e.id, d, code: "Ρ", kind: "release" });
      }
    }

    return out;
  }

  const sig = (m) => `${m.id}:${m.d}:${m.code}`;

  // DFS με pruning: εφαρμόζει διαδοχικές κινήσεις (σε ΟΠΟΙΑΔΗΠΟΤΕ ημέρα) και
  // κρατά την πρώτη αλυσίδα που βελτιώνει λεξικογραφικά το score.
  function search(baseScore, depth, used, visited) {
    const moves = candidateMoves()
      .filter((m) => !used.has(sig(m)) && grid[m.id][m.d] !== m.code)
      .slice(0, MAX_BRANCH * 6);

    // Ταξινόμηση: πρώτα κινήσεις που κλείνουν ελλείψεις, μετά ελλείμματα.
    const order = { cover: 0, deficit: 1, release: 2 };
    moves.sort((a, b) => {
      const o = order[a.kind] - order[b.kind];
      if (o) return o;
      if (a.d !== b.d) return a.d - b.d;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return a.code < b.code ? -1 : 1;
    });

    let tried = 0;
    for (const m of moves) {
      if (tried >= MAX_BRANCH) break;
      const undo = apply([m]);
      const st = score();
      const key = KEYS.map((k) => st[k]).join("|");

      if (better(st, baseScore)) {
        undo();
        return [m];
      }
      if (depth < MAX_DEPTH && !visited.has(key)) {
        visited.add(key);
        tried++;
        const sub = search(
          baseScore,
          depth + 1,
          new Set([...used, sig(m)]),
          visited
        );
        if (sub) {
          undo();
          return [m, ...sub];
        }
      } else {
        tried++;
      }
      undo();
    }
    return null;
  }

  // ---------------- ΚΥΡΙΟΣ ΒΡΟΧΟΣ ----------------
  const log = [];
  let iterations = 0;
  let improved = true;

  while (improved && iterations < MAX_ITERATIONS) {
    improved = false;
    iterations++;
    const base = score();
    if (base.hard === 0 && base.missing === 0 && base.targetDev === 0) break;

    const chain = search(base, 1, new Set(), new Set());
    if (chain) {
      apply(chain);
      log.push(
        chain
          .map((m) => `${byId[m.id].name} ${DAY_NAMES[m.d]}→${m.code}`)
          .join(" · ")
      );
      improved = true;
    }
  }

  // Ό,τι έμεινε κενό → Ρ για όσους έχουν ακριβή στόχο ή είναι πλήρους.
  for (const e of active) {
    const t = targetOf(e);
    const fill = e.employment_type !== "part" || t.exact != null;
    for (let d = 0; d < 7; d++)
      if (grid[e.id][d] === "" && fill) grid[e.id][d] = "Ρ";
  }

  const final = score();
  const warnings = [];

  // Συνολικό ισοζύγιο: πόσες θέσεις ζητά η εβδομάδα έναντι των διαθέσιμων
  // ανθρωποημερών. Χρησιμεύει για να εξηγηθεί ΣΩΣΤΑ η αιτία των ελλειμμάτων.
  let requiredSlots = 0;
  for (let d = 0; d < 7; d++)
    for (const n of Object.values(reqOf(d))) requiredSlots += Number(n) || 0;
  let availableDays = 0;
  for (const e of active) {
    const t = targetOf(e);
    availableDays += t.exact != null ? t.exact : t.max;
  }
  const surplus = availableDays - requiredSlots;

  if (final.missing > 0)
    warnings.push(
      `Παραμένουν ${final.missing} ακάλυπτες θέσεις — δεν βρέθηκε νόμιμη ανακατανομή που να τις καλύπτει χωρίς παραβίαση κανόνα.`
    );

  const short = [];
  for (const e of active) {
    const t = targetOf(e);
    const goal = t.exact != null ? t.exact : t.min;
    const w = workedOf(e.id);
    if (w < goal) short.push({ name: e.name, w, goal });
  }
  if (short.length) {
    // Αν η κάλυψη είναι πλήρης και περισσεύουν ανθρωποημέρες, η αιτία δεν
    // είναι αδυναμία του αλγορίθμου αλλά το ότι δεν υπάρχουν άλλες θέσεις.
    const structural = final.missing === 0 && surplus > 0;
    for (const x of short)
      warnings.push(
        structural
          ? `${x.name}: ${x.w} μέρες αντί για ${x.goal} — το πρόγραμμα της εβδομάδας έχει ${requiredSlots} θέσεις για ${availableDays} διαθέσιμες ημέρες, οπότε ${surplus} ημέρες δεν χωρούν πουθενά.`
          : `${x.name}: ${x.w} μέρες αντί για ${x.goal} — δεν βρέθηκε νόμιμη αλυσίδα μετακινήσεων που να το διορθώνει.`
      );
  }

  return { grid, score: final, iterations, log, warnings };
}
