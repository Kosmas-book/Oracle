import { SHIFTS, DAY_NAMES, restOk, MIN_REST_HOURS } from "./shifts.js";

// Κανόνες:
// - Εβδομάδα Δευ–Κυρ. Πλήρους απασχόλησης: ΑΥΣΤΗΡΑ work_days μέρες (6 ή 5) — ούτε
//   παραπάνω ούτε παρακάτω. Όσοι περισσεύουν από τις ελάχιστες απαιτήσεις μπαίνουν
//   ως επιπλέον κάλυψη (μέχρι max_per_shift άτομα ανά βάρδια), όχι σε δεύτερο ρεπό.
// - Part-time: από min_days έως max_days.
// - Βραδινός (Β): Β Δευ–Σάβ, Ρ Κυριακή. Επόμενος βραδινός: Ρ Σάββατο, Β Κυριακή.
//   Προηγούμενος βραδινός: Ρ Δευτέρα.
// - 11 ώρες ελάχιστη ανάπαυση μεταξύ διαδοχικών βαρδιών.
// - Κελιά με Ο (άδεια) διατηρούνται.

export function generateWeek({
  employees,
  weekdayReq,
  sundayReq,
  nightPersonId,
  nextNightPersonId,
  prevNightPersonId,
  workDays = 6,
  maxPerShift = 5,
  locked = {},
  prevSunday = {},
}) {
  const warnings = [];
  const active = employees.filter((e) => e.active);
  const byId = Object.fromEntries(active.map((e) => [e.id, e]));
  const grid = {};
  const workdays = {};
  active.forEach((e) => {
    grid[e.id] = ["", "", "", "", "", "", ""];
    workdays[e.id] = 0;
  });

  const isPart = (e) => e.employment_type === "part";
  const isWork = (c) => c && c !== "Ρ" && c !== "Ο";
  const countCode = (d, code) =>
    active.filter((e) => grid[e.id][d] === code).length;
  const totalStaff = (d) =>
    active.filter((e) => isWork(grid[e.id][d])).length;
  const prevOf = (e, d) => (d > 0 ? grid[e.id][d - 1] : prevSunday[e.id] || "");
  const nextOf = (e, d) => (d < 6 ? grid[e.id][d + 1] : "");

  // Μέγιστος αριθμός ατόμων που βρίσκονται ΤΑΥΤΟΧΡΟΝΑ στο πρατήριο τη μέρα d,
  // λαμβάνοντας υπόψη και βάρδιες της προηγούμενης μέρας που ξημερώνουν (Α3, Β).
  const iv = (code) => {
    const s = SHIFTS[code];
    return s && s.start != null ? [s.start, s.end] : null;
  };
  const peakOfDay = (d) => {
    const spans = [];
    for (const e of active) {
      const c = iv(grid[e.id][d]);
      if (c) spans.push([c[0], Math.min(c[1], 24)]);
      const p = iv(d > 0 ? grid[e.id][d - 1] : prevSunday[e.id] || "");
      if (p && p[1] > 24) spans.push([0, p[1] - 24]);
    }
    let peak = 0;
    for (const [t] of spans) {
      let n = 0;
      for (const [a, b] of spans) if (a <= t && t < b) n++;
      if (n > peak) peak = n;
    }
    return peak;
  };
  // Χωράει η βάρδια code στον e τη μέρα d χωρίς να ξεπεραστεί το όριο;
  const fitsCap = (e, d, code) => {
    grid[e.id][d] = code;
    const ok =
      peakOfDay(d) <= maxPerShift &&
      (d < 6 ? peakOfDay(d + 1) <= maxPerShift : true);
    grid[e.id][d] = "";
    return ok;
  };

  // 0. Κλειδωμένα κελιά (π.χ. άδειες Ο).
  for (const [empId, days] of Object.entries(locked)) {
    if (!grid[empId]) continue;
    for (const [d, code] of Object.entries(days)) {
      grid[empId][Number(d)] = code;
      if (isWork(code)) workdays[empId]++;
    }
  }

  // 1. Βραδινοί.
  if (nightPersonId && byId[nightPersonId]) {
    for (let d = 0; d < 6; d++) {
      if (!grid[nightPersonId][d]) {
        grid[nightPersonId][d] = "Β";
        workdays[nightPersonId]++;
      }
    }
    if (!grid[nightPersonId][6]) grid[nightPersonId][6] = "Ρ";
  } else {
    warnings.push("Δεν ορίστηκε βραδινός για Δευ–Σάβ — τα Β έμειναν κενά.");
  }

  if (
    nextNightPersonId &&
    byId[nextNightPersonId] &&
    nextNightPersonId !== nightPersonId
  ) {
    if (!grid[nextNightPersonId][5]) grid[nextNightPersonId][5] = "Ρ";
    if (!grid[nextNightPersonId][6]) {
      grid[nextNightPersonId][6] = "Β";
      workdays[nextNightPersonId]++;
    }
  } else if (!nextNightPersonId) {
    warnings.push("Δεν ορίστηκε επόμενος βραδινός — η Κυριακή δεν έχει Β.");
  }

  if (
    prevNightPersonId &&
    byId[prevNightPersonId] &&
    prevNightPersonId !== nightPersonId &&
    prevNightPersonId !== nextNightPersonId
  ) {
    if (!grid[prevNightPersonId][0]) grid[prevNightPersonId][0] = "Ρ";
  }

  // 1β. ΚΑΤΑΝΟΜΗ ΡΕΠΟ ΠΡΙΝ ΤΙΣ ΒΑΡΔΙΕΣ: κάθε πλήρους παίρνει το ρεπό του σε
  //     μέρα που ΑΝΤΕΧΕΙ να λείπει, ώστε καμία μέρα να μη μείνει χωρίς αρκετά
  //     διαθέσιμα άτομα για τις ελάχιστες απαιτήσεις.
  const restCap = [];
  for (let d = 0; d < 7; d++) {
    const req = d === 6 ? sundayReq : weekdayReq;
    const needed =
      Object.values(req).reduce((s2, x) => s2 + (Number(x) || 0), 0) + 1; // +Β
    restCap[d] = Math.max(0, active.length - needed);
  }
  for (const e of active)
    for (let d = 0; d < 7; d++)
      if (grid[e.id][d] === "Ρ") restCap[d] = Math.max(0, restCap[d] - 1);
  for (const e of active) {
    if (isPart(e)) continue;
    // Στο 6ήμερο χρειάζεται 1 ρεπό, στο 5ήμερο 2 — μείον όσα έχει ήδη
    // (βραδινοί) και τις άδειες.
    const already = grid[e.id].filter((c) => c === "Ρ").length;
    const vac = grid[e.id].filter((c) => c === "Ο").length;
    let restNeeded = Math.max(0, 7 - workDays - vac - already);
    while (restNeeded > 0) {
      let best = -1;
      let bestCap = -1;
      for (let d = 0; d < 7; d++) {
        if (grid[e.id][d] !== "") continue;
        if (restCap[d] > bestCap) {
          bestCap = restCap[d];
          best = d;
        }
      }
      if (best < 0) break;
      grid[e.id][best] = "Ρ";
      if (bestCap > 0) restCap[best]--;
      restNeeded--;
    }
  }

  // 2. Κάλυψη των ελάχιστων απαιτήσεων ανά μέρα.
  //    Με τα ρεπό ήδη μοιρασμένα, οι μέρες γεμίζουν με τη σειρά.
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    const req = d === 6 ? sundayReq : weekdayReq;
    // ΠΡΩΤΑ η ραχοκοκαλιά (Π και Α) — αυτά δεν θυσιάζονται ποτέ για χάρη
    // ενδιάμεσων. Μετά οι ενδιάμεσοι (Π2/Π4/Α2/Α3), με σειρά σπανιότητας.
    const reqEntries = Object.entries(req).sort((x, y) => {
      const bx = x[0] === "Π" || x[0] === "Α" ? 0 : 1;
      const by = y[0] === "Π" || y[0] === "Α" ? 0 : 1;
      if (bx !== by) return bx - by;
      const cx = active.filter((e) => (e.allowed_shifts || []).includes(x[0])).length;
      const cy = active.filter((e) => (e.allowed_shifts || []).includes(y[0])).length;
      return cx - cy;
    });
    for (const [code, count] of reqEntries) {
      let needed = (Number(count) || 0) - countCode(d, code);
      while (needed > 0) {
        const cands = active
          .filter((e) => {
            if (grid[e.id][d] !== "") return false;
            if (!(e.allowed_shifts || []).includes(code)) return false;
            const cap = isPart(e)
              ? e.max_days || e.min_days || 3
              : workDays;
            if (workdays[e.id] >= cap) return false;
            if (!restOk(prevOf(e, d), code)) return false;
            const nx = nextOf(e, d);
            if (nx && !restOk(code, nx)) return false;
            return true;
          })
          .sort((a, b) => {
            const p = (isPart(a) ? 1 : 0) - (isPart(b) ? 1 : 0);
            if (p) return p;
            const w = workdays[a.id] - workdays[b.id];
            if (w) return w;
            // Πρώτα οι λιγότερο ευέλικτοι (κρατάμε τους ευέλικτους διαθέσιμους),
            const f =
              (a.allowed_shifts?.length || 99) -
              (b.allowed_shifts?.length || 99);
            if (f) return f;
            // και μετά προτίμηση εναλλαγής (όχι ίδια βάρδια με χθες).
            const sa = prevOf(a, d) === code ? 1 : 0;
            const sb = prevOf(b, d) === code ? 1 : 0;
            return sa - sb;
          });
        const pick = cands[0];
        if (!pick) break; // θα προσπαθήσει η φάση επισκευής παρακάτω
        grid[pick.id][d] = code;
        workdays[pick.id]++;
        needed--;
      }
    }
  }

  // 2β. ΕΠΙΣΚΕΥΗ ΚΕΝΩΝ: αν λείπει βάρδια ενώ υπάρχει ελεύθερο άτομο που
  //     μπλοκάρεται μόνο από το 11ωρο, γίνεται ΑΝΤΑΛΛΑΓΗ: κάποιος που ήδη
  //     δουλεύει εκείνη τη μέρα και μπορεί τη ζητούμενη βάρδια τη παίρνει,
  //     και ο ελεύθερος παίρνει τη δική του.
  const canTake = (e, d, code) => {
    if (grid[e.id][d] !== "") return false;
    if (!(e.allowed_shifts || []).includes(code)) return false;
    const cap = isPart(e) ? e.max_days || e.min_days || 3 : workDays;
    if (workdays[e.id] >= cap) return false;
    if (!restOk(prevOf(e, d), code)) return false;
    const nx = nextOf(e, d);
    if (nx && !restOk(code, nx)) return false;
    return true;
  };
  for (let d = 0; d < 7; d++) {
    const req = d === 6 ? sundayReq : weekdayReq;
    for (const [code, count] of Object.entries(req)) {
      let deficit = (Number(count) || 0) - countCode(d, code);
      let guard = 0;
      while (deficit > 0 && guard < 10) {
        guard++;
        // 1η προσπάθεια: απευθείας ανάθεση σε ελεύθερο άτομο.
        const direct = active.find((e) => canTake(e, d, code));
        if (direct) {
          grid[direct.id][d] = code;
          workdays[direct.id]++;
          deficit--;
          continue;
        }
        // 2η προσπάθεια: ανταλλαγή. Υ ήδη δουλεύει άλλη βάρδια και μπορεί τη
        // ζητούμενη· Ζ είναι ελεύθερος και μπορεί τη βάρδια του Υ.
        let fixed = false;
        for (const y of active) {
          const b = grid[y.id][d];
          if (!b || b === "Ρ" || b === "Ο" || b === "Β" || b === code) continue;
          if (!(y.allowed_shifts || []).includes(code)) continue;
          if (!restOk(prevOf(y, d), code)) continue;
          const nxY = nextOf(y, d);
          if (nxY && !restOk(code, nxY)) continue;
          const z = active.find((e) => e.id !== y.id && canTake(e, d, b));
          if (!z) continue;
          grid[y.id][d] = code;
          grid[z.id][d] = b;
          workdays[z.id]++;
          deficit--;
          fixed = true;
          break;
        }
        if (!fixed) break;
      }
      if (deficit > 0) {
        warnings.push(
          `${DAY_NAMES[d]}: λείπει ${deficit}×${code} — δεν υπάρχει διαθέσιμο άτομο ούτε με ανταλλαγή.`
        );
      }
    }
  }

  // 3. Αυστηρό εξαήμερο/πενθήμερο: όποιος έχει λιγότερες μέρες από τον στόχο του
  //    μπαίνει ως ΕΠΙΠΛΕΟΝ κάλυψη (μέχρι maxPerShift ανά βάρδια), με προτίμηση
  //    στις καθημερινές — η Κυριακή συμπληρώνεται μόνο αν δεν χωράει αλλού.
  for (const e of active) {
    if (e.id === nightPersonId) continue; // ο κύκλος του είναι ήδη πλήρης
    const vac = grid[e.id].filter((c) => c === "Ο").length;
    const forced = grid[e.id].filter((c) => c === "Ρ").length;
    const possible = 7 - vac - forced;
    const target = Math.min(
      isPart(e) ? e.min_days || 3 : workDays,
      possible
    );
    let guard = 0;
    while (workdays[e.id] < target && guard < 40) {
      guard++;
      const emptyDays = [];
      for (let d = 0; d < 7; d++) if (grid[e.id][d] === "") emptyDays.push(d);
      emptyDays.sort((a, b) => {
        const sa = a === 6 ? 1 : 0;
        const sb = b === 6 ? 1 : 0;
        if (sa !== sb) return sa - sb; // Κυριακή τελευταία
        return totalStaff(a) - totalStaff(b); // αλλιώς όπου υπάρχει λιγότερο προσωπικό
      });
      let placed = false;
      for (const d of emptyDays) {
        const req = d === 6 ? sundayReq : weekdayReq;
        const codes = Object.keys(req)
          // Επιπλέον άτομα ΜΟΝΟ σε γενικές βάρδιες (απαίτηση ≥ 2, δηλ. Π/Α).
          // Οι μονοθέσιοι ρόλοι (Π4, Α3, Π2, Α2) δεν διπλασιάζονται ποτέ.
          .filter((c) => (Number(req[c]) || 0) >= 2)
          .filter((c) => (e.allowed_shifts || []).includes(c))
          .filter((c) => restOk(prevOf(e, d), c))
          .filter((c) => {
            const nx = nextOf(e, d);
            return !nx || restOk(c, nx);
          })
          .filter((c) => fitsCap(e, d, c))
          .sort((a, b) => {
            // Ισορροπία πρωί/απόγευμα: πρώτα η βάρδια με το ΜΙΚΡΟΤΕΡΟ πλεόνασμα
            // πάνω από την απαίτησή της, ώστε τα έξτρα άτομα να μοιράζονται.
            const surA = countCode(d, a) - (Number(req[a]) || 0);
            const surB = countCode(d, b) - (Number(req[b]) || 0);
            if (surA !== surB) return surA - surB;
            const sa = prevOf(e, d) === a ? 1 : 0;
            const sb = prevOf(e, d) === b ? 1 : 0;
            return sa - sb;
          });
        if (codes.length) {
          grid[e.id][d] = codes[0];
          workdays[e.id]++;
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
    if (!isPart(e) && e.id !== nightPersonId && workdays[e.id] < target) {
      warnings.push(
        `${e.name}: βγήκαν μόνο ${workdays[e.id]} μέρες αντί για ${target} — δεν χωρούσε πουθενά (όρια βαρδιών ή 11ωρο). Θέλει χειροκίνητη τοποθέτηση.`
      );
    }
  }

  // 3β. Part-time κάτω από το ελάχιστο: με το όριο ταυτόχρονων ατόμων δεν
  //     "χωράει" ως έξτρα, οπότε ΑΝΤΙΚΑΘΙΣΤΑ πλήρη — παίρνει τη βάρδιά του
  //     και ο πλήρης παίρνει Ρ (όπως γίνεται και στο χειρόγραφο πρόγραμμα).
  for (const pt of active.filter(isPart)) {
    let guard = 0;
    while (workdays[pt.id] < (pt.min_days || 3) && guard < 20) {
      guard++;
      let done = false;
      const donors = active
        .filter(
          (e) =>
            !isPart(e) && e.id !== nightPersonId && e.id !== nextNightPersonId
        )
        .sort((a, b) => workdays[b.id] - workdays[a.id]);
      for (let d = 0; d < 7 && !done; d++) {
        if (grid[pt.id][d] !== "") continue;
        for (const ft of donors) {
          const code = grid[ft.id][d];
          if (!code || code === "Ρ" || code === "Ο" || code === "Β") continue;
          if (!(pt.allowed_shifts || []).includes(code)) continue;
          if (!restOk(prevOf(pt, d), code)) continue;
          const nx = nextOf(pt, d);
          if (nx && !restOk(code, nx)) continue;
          grid[pt.id][d] = code;
          workdays[pt.id]++;
          grid[ft.id][d] = "Ρ";
          workdays[ft.id]--;
          warnings.push(
            `${pt.name} (part-time) πήρε το ${code} του/της ${ft.name} την ${DAY_NAMES[d]} για να πιάσει το ελάχιστό του.`
          );
          done = true;
          break;
        }
      }
      if (!done) break;
    }
    if (workdays[pt.id] < (pt.min_days || 3)) {
      warnings.push(
        `${pt.name} (part-time): ${workdays[pt.id]} μέρες αντί για ελάχιστο ${pt.min_days || 3}.`
      );
    }
  }

  // 4. Ό,τι έμεινε κενό: πλήρους → Ρ, part-time → κενό.
  for (const e of active) {
    for (let d = 0; d < 7; d++) {
      if (grid[e.id][d] === "" && !isPart(e)) grid[e.id][d] = "Ρ";
    }
  }

  // 5α. Τελικός έλεγχος ορίου ταυτόχρονων ατόμων.
  for (let d = 0; d < 7; d++) {
    const p = peakOfDay(d);
    if (p > maxPerShift) {
      warnings.push(
        `${DAY_NAMES[d]}: ${p} άτομα ταυτόχρονα στη βάρδια — πάνω από το όριο (${maxPerShift}).`
      );
    }
  }

  // 5β. Έλεγχος ακάλυπτων ωρών — το πρατήριο είναι 24ωρο, δεν επιτρέπεται
  //     να μένει κανείς π.χ. 06:00–08:00 επειδή δεν μπήκε Π να αλλάξει τον Β.
  for (let d = 0; d < 7; d++) {
    const spans = [];
    for (const e of active) {
      const c = iv(grid[e.id][d]);
      if (c) spans.push([c[0], Math.min(c[1], 24)]);
      const p = iv(d > 0 ? grid[e.id][d - 1] : prevSunday[e.id] || "");
      if (p && p[1] > 24) spans.push([0, p[1] - 24]);
    }
    // Τη Δευτέρα χωρίς αποθηκευμένη προηγούμενη εβδομάδα, αγνόησε τα 00–06.
    const fromHour = d === 0 && !Object.keys(prevSunday).length ? 6 : 0;
    let gapStart = null;
    for (let h = fromHour; h <= 24; h++) {
      const covered =
        h < 24 && spans.some(([a, b]) => a <= h && h < b);
      if (!covered && h < 24 && gapStart === null) gapStart = h;
      if ((covered || h === 24) && gapStart !== null) {
        warnings.push(
          `${DAY_NAMES[d]}: ΚΑΝΕΙΣ στο πρατήριο ${String(gapStart).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:00.`
        );
        gapStart = null;
      }
    }
  }

  // 5. Τελικός έλεγχος 11ωρης ανάπαυσης (πιάνει και κλειδωμένα κελιά).
  for (const e of active) {
    for (let d = 0; d < 7; d++) {
      const prev = prevOf(e, d);
      const cur = grid[e.id][d];
      if (prev && cur && !restOk(prev, cur)) {
        warnings.push(
          `${e.name}: ${prev}→${cur} (${DAY_NAMES[d]}) — κάτω από ${MIN_REST_HOURS} ώρες ανάπαυση.`
        );
      }
    }
  }

  return { grid, warnings };
}
