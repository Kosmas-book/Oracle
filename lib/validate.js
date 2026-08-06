import { allShifts, DAY_NAMES, restOk, MIN_REST_HOURS } from "./shifts.js";

// Ελέγχει ένα πλέγμα προγράμματος και επιστρέφει τα προβλήματα.
// Τρέχει ζωντανά στον browser σε κάθε χειροκίνητη αλλαγή.
export function validateGrid({
  grid,
  employees,
  dayReq,        // πίνακας 7 θέσεων με απαιτήσεις ανά μέρα
  shifts,        // ορισμοί βαρδιών καταστήματος
  maxPerShift = 4,
  workDays = 6,
  prevSunday = {},
}) {
  const SH = allShifts(shifts);
  const hasNight = !!SH["Β"];
  const active = (employees || []).filter((e) => e.active);
  const at = (id, d) => (grid[id] || [])[d] || "";
  const isWork = (c) => c && c !== "Ρ" && c !== "Ο";

  const short = [];   // λείπουν άτομα
  const over = [];    // περισσεύουν
  const rest = [];    // παραβίαση 11ώρου
  const crowd = [];   // πάνω από το όριο ταυτόχρονων
  const gaps = [];    // ακάλυπτες ώρες
  const days = [];    // λάθος αριθμός ημερών εργασίας

  for (let d = 0; d < 7; d++) {
    const req = (dayReq && dayReq[d]) || {};
    for (const [code, n] of Object.entries(req)) {
      const need = Number(n) || 0;
      if (!need) continue;
      const have = active.filter((e) => at(e.id, d) === code).length;
      if (have < need)
        short.push(`${DAY_NAMES[d]}: ${have}/${need} στη βάρδια ${code}`);
      else if (have > need)
        over.push(`${DAY_NAMES[d]}: ${have} αντί για ${need} στη βάρδια ${code}`);
    }

    // Ταυτόχρονη παρουσία + κενά, με βάση τα πραγματικά ωράρια
    const spans = [];
    for (const e of active) {
      const c = SH[at(e.id, d)];
      if (c && c.start != null) spans.push([c.start, Math.min(c.end, 24)]);
      const p = SH[d > 0 ? at(e.id, d - 1) : prevSunday[e.id] || ""];
      if (p && p.end > 24) spans.push([0, p.end - 24]);
    }
    let peak = 0;
    for (let h = 0; h < 24; h++) {
      const n = spans.filter(([a, b]) => a <= h && h < b).length;
      if (n > peak) peak = n;
    }
    if (peak > maxPerShift)
      crowd.push(`${DAY_NAMES[d]}: ${peak} άτομα ταυτόχρονα (όριο ${maxPerShift})`);

    if (hasNight) {
      const from = d === 0 && !Object.keys(prevSunday).length ? 6 : 0;
      let g = null;
      for (let h = from; h <= 24; h++) {
        const covered = h < 24 && spans.some(([a, b]) => a <= h && h < b);
        if (!covered && h < 24 && g === null) g = h;
        if ((covered || h === 24) && g !== null) {
          gaps.push(
            `${DAY_NAMES[d]}: κανείς ${String(g).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:00`
          );
          g = null;
        }
      }
    }
  }

  for (const e of active) {
    for (let d = 0; d < 7; d++) {
      const prev = d > 0 ? at(e.id, d - 1) : prevSunday[e.id] || "";
      const cur = at(e.id, d);
      if (prev && cur && !restOk(prev, cur, SH))
        rest.push(
          `${e.name}: ${prev}→${cur} (${DAY_NAMES[d]}), κάτω από ${MIN_REST_HOURS} ώρες`
        );
    }
    const w = (grid[e.id] || []).filter(isWork).length;
    const vac = (grid[e.id] || []).filter((c) => c === "Ο").length;
    const target = Math.max(0, workDays - vac);
    if (e.employment_type !== "part" && w !== target)
      days.push(`${e.name}: ${w} μέρες αντί για ${target}`);
    if (e.employment_type === "part") {
      if (w < (e.min_days || 3))
        days.push(`${e.name} (part-time): ${w} μέρες, ελάχιστο ${e.min_days || 3}`);
      if (w > (e.max_days || 6))
        days.push(`${e.name} (part-time): ${w} μέρες, μέγιστο ${e.max_days || 6}`);
    }
  }

  const groups = [
    { key: "short", level: "error", title: "Λείπουν άτομα από βάρδιες", items: short },
    { key: "gaps", level: "error", title: "Ακάλυπτες ώρες", items: gaps },
    { key: "rest", level: "error", title: "Παραβίαση 11ώρης ανάπαυσης", items: rest },
    { key: "crowd", level: "warn", title: "Πάνω από το όριο ταυτόχρονων", items: crowd },
    { key: "over", level: "warn", title: "Περισσότερα άτομα από το ζητούμενο", items: over },
    { key: "days", level: "warn", title: "Μέρες εργασίας εκτός στόχου", items: days },
  ].filter((g) => g.items.length);

  return {
    groups,
    errors: groups.filter((g) => g.level === "error").reduce((s, g) => s + g.items.length, 0),
    warnings: groups.filter((g) => g.level === "warn").reduce((s, g) => s + g.items.length, 0),
  };
}
