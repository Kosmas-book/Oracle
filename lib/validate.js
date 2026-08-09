import { allShifts, DAY_NAMES, restOk, MIN_REST_HOURS } from "./shifts.js";
import { targetDays, maxDaysFor } from "./scheduleRules.js";
import { requiresSaturdayRest, isRepeatException } from "./nightRules.js";

// Πλήρης έλεγχος προγράμματος. Τρέχει ΚΑΙ στον browser (ζωντανά σε κάθε
// χειροκίνητη αλλαγή) ΚΑΙ στον server (πριν την αποθήκευση).
// Επιστρέφει και θέματα ανά κελί, ώστε το UI να τα επισημαίνει οπτικά.
export function validateGrid({
  grid = {},
  employees = [],
  dayReq = null,
  shifts = null,
  maxPerShift = 4,
  workDays = 6,
  prevSunday = {},
  weeklyTargets = {},
  leaveReplacesRest = true,
  nightPerson = null,
  nextNight = null,
  prevNightPerson = null,
}) {
  const SH = allShifts(shifts);
  const hasNight = !!SH["Β"];
  // Πηγή αλήθειας για το soft delete: deactivated_at.
  const active = employees.filter((e) => !e.deactivated_at);
  const at = (id, d) => (grid[id] || [])[d] || "";
  const isWork = (c) => c && c !== "Ρ" && c !== "Ο";
  const known = new Set([...Object.keys(SH), "Ρ", "Ο"]);

  const cells = {}; // "empId:day" -> [{level, reason}]
  const mark = (id, d, level, reason) => {
    const k = `${id}:${d}`;
    (cells[k] = cells[k] || []).push({ level, reason });
  };

  const G = {
    unknown: [], forbidden: [], fixed: [], night: [], leaveWork: [],
    short: [], over: [], rest: [], crowd: [], gaps: [], days: [],
    nightCount: [],
  };

  for (const e of active) {
    const row = grid[e.id] || [];
    const allowed = new Set(e.allowed_shifts || []);
    const fixed = e.fixed_days || {};
    const leaveDays = row.filter((c) => c === "Ο").length;

    for (let d = 0; d < 7; d++) {
      const c = at(e.id, d);
      if (!c) continue;

      // 5. Άγνωστος ή ανενεργός κωδικός βάρδιας
      if (!known.has(c)) {
        G.unknown.push(`${e.name} · ${DAY_NAMES[d]}: άγνωστη βάρδια «${c}»`);
        mark(e.id, d, "error", `Η βάρδια «${c}» δεν υπάρχει στις ρυθμίσεις`);
        continue;
      }
      // 2. Βάρδια εκτός των επιτρεπόμενων του εργαζομένου
      if (isWork(c) && !allowed.has(c)) {
        G.forbidden.push(`${e.name} · ${DAY_NAMES[d]}: δεν κάνει ${c}`);
        mark(e.id, d, "forbidden", `Ο/η ${e.name} δεν κάνει τη βάρδια ${c}`);
      }
      // 3+4. Αλλαγή σταθερής ανάθεσης (fixed shift ή fixed Ρ)
      if (fixed[d] != null && fixed[d] !== c) {
        const kind = fixed[d] === "Ρ" ? "σταθερό ρεπό" : `σταθερή βάρδια ${fixed[d]}`;
        G.fixed.push(`${e.name} · ${DAY_NAMES[d]}: ${kind} → ${c}`);
        mark(e.id, d, "fixed", `Παρακάμπτει ${kind}`);
      } else if (fixed[d] != null) {
        mark(e.id, d, "info", "Σταθερή ανάθεση");
      }
      // 10. Εργασία πάνω σε δηλωμένη άδεια
      if (isWork(c) && fixed[d] === "Ο") {
        G.leaveWork.push(`${e.name} · ${DAY_NAMES[d]}: εργασία ενώ έχει άδεια`);
        mark(e.id, d, "error", "Έχει δηλωμένη άδεια αυτή τη μέρα");
      }
      // 1+9. 11ωρη ανάπαυση (η Δευτέρα ελέγχεται με την περασμένη Κυριακή)
      const prev = d > 0 ? at(e.id, d - 1) : prevSunday[e.id] || "";
      if (prev && !restOk(prev, c, SH)) {
        const where = d === 0 ? "από την περασμένη Κυριακή" : `μετά από ${prev}`;
        G.rest.push(
          `${e.name} · ${DAY_NAMES[d]}: ${prev}→${c} ${where}, κάτω από ${MIN_REST_HOURS}ω`
        );
        mark(e.id, d, "error", `${prev}→${c}: κάτω από ${MIN_REST_HOURS} ώρες ανάπαυση`);
      }
      // 4. Κελί που ανήκει στον κύκλο της νυχτερινής
      if (hasNight && e.id === nightPerson && d < 6 && c !== "Β") {
        G.night.push(`${e.name} · ${DAY_NAMES[d]}: σπασμένο νυχτερινό μπλοκ (${c})`);
        mark(e.id, d, "night", "Ανήκει στο νυχτερινό μπλοκ Δευ–Σάβ");
      }
      if (hasNight && e.id === nightPerson && d === 6 && c !== "Ρ") {
        G.night.push(`${e.name}: υποχρεωτικό Ρ την Κυριακή μετά το νυχτερινό μπλοκ`);
        mark(e.id, 6, "night", "Υποχρεωτικό ρεπό μετά το νυχτερινό μπλοκ");
      }
      // 3: Ρ Σαββάτου ΥΠΟΧΡΕΩΤΙΚΟ για normal new night holder. Εξαίρεση μόνο
      // στο repeat pattern (next === previous). Κοινή helper με τον generator.
      if (
        hasNight &&
        e.id === nextNight &&
        d === 5 &&
        c !== "Ρ" &&
        c !== "Ο" &&
        requiresSaturdayRest(nextNight, prevNightPerson)
      ) {
        G.night.push(
          `${e.name}: ο επόμενος βραδινός πρέπει να έχει Ρ το Σάββατο πριν από την έναρξη του night block (τώρα ${c}).`
        );
        mark(e.id, 5, "night", "Υποχρεωτικό ρεπό πριν από το νυχτερινό μπλοκ");
      }
      if (hasNight && e.id === prevNightPerson && d === 0 && c !== "Ρ") {
        G.night.push(
          `${e.name}: υποχρεωτικό Ρ τη Δευτέρα μετά την ολοκλήρωση του night block (τώρα ${c})`
        );
        mark(e.id, 0, "night", "Υποχρεωτικό ρεπό μετά το ολοκληρωμένο νυχτερινό μπλοκ");
      }
      if (hasNight && e.id === nextNight && d === 6 && c !== "Β") {
        G.night.push(`${e.name}: η Κυριακή πρέπει να είναι Β — εκεί ξεκινά ο κύκλος`);
        mark(e.id, 6, "night", "Έναρξη νυχτερινού κύκλου");
      }
      if (hasNight && c === "Β" && (e.id === nightPerson || e.id === nextNight))
        mark(e.id, d, "info", "Νυχτερινός κύκλος");
    }

    // 6. Αριθμός ημερών σε σχέση με τον κοινό κανόνα στόχου
    const t = targetDays({
      employee: e,
      weeklyTarget: weeklyTargets[e.id],
      workDays,
      leaveDays,
      leaveReplacesRest,
    });
    const w = row.filter(isWork).length;
    if (t.exact != null && w !== t.exact)
      G.days.push(
        `${e.name}: ${w} μέρες αντί για ${t.exact}` +
          (t.source === "weekly" ? " (στόχος εβδομάδας)" : "")
      );
    else if (t.exact == null && (w < t.min || w > t.max))
      G.days.push(`${e.name} (part-time): ${w} μέρες, εύρος ${t.min}–${t.max}`);
    if (w > maxDaysFor(t))
      G.days.push(`${e.name}: ξεπερνά το ανώτατο όριο ημερών (${maxDaysFor(t)})`);
  }

  // 2. Ακριβώς ΕΝΑΣ Β ανά ημερομηνία.
  if (hasNight) {
    for (let d = 0; d < 7; d++) {
      const holders = active.filter((e) => at(e.id, d) === "Β");
      if (holders.length > 1) {
        G.nightCount.push(
          `${DAY_NAMES[d]}: ${holders.length} εργαζόμενοι με Β (${holders
            .map((e) => e.name)
            .join(", ")}). Επιτρέπεται μόνο ένας.`
        );
        for (const h of holders)
          mark(h.id, d, "error", "Διπλή νυχτερινή την ίδια ημέρα");
      } else if (holders.length === 0) {
        G.nightCount.push(`${DAY_NAMES[d]}: καμία νυχτερινή βάρδια (Β).`);
      }
    }
  }

  // 7+8. Στελέχωση, ταυτόχρονη παρουσία, ακάλυπτες ώρες
  for (let d = 0; d < 7; d++) {
    const req = (dayReq && dayReq[d]) || {};
    for (const [code, n] of Object.entries(req)) {
      const need = Number(n) || 0;
      if (!need) continue;
      const have = active.filter((e) => at(e.id, d) === code).length;
      if (have < need) G.short.push(`${DAY_NAMES[d]}: ${have}/${need} στη βάρδια ${code}`);
      else if (have > need)
        G.over.push(`${DAY_NAMES[d]}: ${have} αντί για ${need} στη βάρδια ${code}`);
    }

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
      G.crowd.push(`${DAY_NAMES[d]}: ${peak} άτομα ταυτόχρονα (όριο ${maxPerShift})`);

    if (hasNight) {
      const from = d === 0 && !Object.keys(prevSunday).length ? 6 : 0;
      let g = null;
      for (let h = from; h <= 24; h++) {
        const covered = h < 24 && spans.some(([a, b]) => a <= h && h < b);
        if (!covered && h < 24 && g === null) g = h;
        if ((covered || h === 24) && g !== null) {
          gapsPush(G, d, g, h);
          g = null;
        }
      }
    }
  }

  const defs = [
    { key: "unknown", level: "error", title: "Άγνωστες βάρδιες", items: G.unknown },
    { key: "forbidden", level: "error", title: "Μη επιτρεπόμενη βάρδια", items: G.forbidden },
    { key: "leaveWork", level: "error", title: "Εργασία σε ημέρα άδειας", items: G.leaveWork },
    { key: "rest", level: "error", title: `Παραβίαση ${MIN_REST_HOURS}ώρης ανάπαυσης`, items: G.rest },
    { key: "short", level: "error", title: "Λείπουν άτομα από βάρδιες", items: G.short },
    { key: "gaps", level: "error", title: "Ακάλυπτες ώρες", items: G.gaps },
    { key: "nightCount", level: "error", title: "Νυχτερινή βάρδια ανά ημέρα", items: G.nightCount },
    { key: "night", level: "warn", title: "Αλλαγές στον νυχτερινό κύκλο", items: G.night },
    { key: "fixed", level: "warn", title: "Παράκαμψη σταθερών αναθέσεων", items: G.fixed },
    { key: "crowd", level: "warn", title: "Πάνω από το όριο ταυτόχρονων", items: G.crowd },
    { key: "over", level: "warn", title: "Περισσότερα άτομα από το ζητούμενο", items: G.over },
    { key: "days", level: "warn", title: "Μέρες εργασίας εκτός στόχου", items: G.days },
  ].filter((g) => g.items.length);

  return {
    groups: defs,
    cells,
    errors: defs.filter((g) => g.level === "error").reduce((s, g) => s + g.items.length, 0),
    warnings: defs.filter((g) => g.level === "warn").reduce((s, g) => s + g.items.length, 0),
    all: defs.flatMap((g) => g.items.map((i) => `[${g.level}] ${g.title}: ${i}`)),
  };
}

function gapsPush(G, d, a, b) {
  G.gaps.push(
    `${DAY_NAMES[d]}: κανείς ${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00`
  );
}
