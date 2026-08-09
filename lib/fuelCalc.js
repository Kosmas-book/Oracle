// Υπολογισμοί καυσίμων — καθαρές συναρτήσεις, ελέγξιμες με tests.

export const FUEL_KEYS = ["unl100", "unl98", "unl95", "diesel", "diesel_avio"];
export const FUEL_LABELS = {
  unl100: "Αμόλυβδη 100",
  unl98: "Αμόλυβδη 98",
  unl95: "Αμόλυβδη 95",
  diesel: "Diesel",
  diesel_avio: "Diesel Avio",
};

// Επικύρωση μιας ημερήσιας εγγραφής.
export function validateEntry({ entry_date, liters }) {
  const errors = [];
  const clean = {};
  // Αυστηρός έλεγχος YYYY-MM-DD: το JS κάνει normalize το 2026-02-30 σε 02-03,
  // οπότε συγκρίνουμε τα parsed μέρη με το input.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(entry_date || ""));
  if (!m) {
    errors.push("Μη έγκυρη ημερομηνία (μορφή YYYY-MM-DD).");
  } else {
    const [, ys, ms, ds] = m;
    const y = Number(ys);
    const mo = Number(ms);
    const da = Number(ds);
    const d = new Date(Date.UTC(y, mo - 1, da));
    if (
      isNaN(d.getTime()) ||
      d.getUTCFullYear() !== y ||
      d.getUTCMonth() + 1 !== mo ||
      d.getUTCDate() !== da
    ) {
      errors.push(`Ανύπαρκτη ημερομηνία: ${entry_date}.`);
    } else if (y < 2000 || y > 2100) {
      errors.push("Ημερομηνία εκτός εύρους.");
    }
  }
  for (const [k, v] of Object.entries(liters || {})) {
    if (!FUEL_KEYS.includes(k)) {
      errors.push(`Άγνωστο καύσιμο «${k}».`);
      continue;
    }
    const n = Number(v);
    if (v === "" || v == null) continue;
    if (!isFinite(n)) {
      errors.push(`${FUEL_LABELS[k]}: μη αριθμητική τιμή.`);
      continue;
    }
    if (n < 0) {
      errors.push(`${FUEL_LABELS[k]}: αρνητικά λίτρα (${n}).`);
      continue;
    }
    clean[k] = n;
  }
  return { ok: errors.length === 0, errors, liters: clean };
}

// Ακραία τιμή: πάνω από 3× ή κάτω από 1/3 του διαμέσου του ιστορικού.
export function outliers(liters, history) {
  const out = [];
  // Οι εξαιρεμένες ημέρες δεν επηρεάζουν τον εντοπισμό ακραίων τιμών.
  const usable = (history || []).filter((e) => !e.excluded);
  for (const k of FUEL_KEYS) {
    const v = liters?.[k];
    if (v == null) continue;
    const past = usable
      .map((e) => e.liters?.[k])
      .filter((x) => typeof x === "number" && x > 0)
      .sort((a, b) => a - b);
    if (past.length < 5) continue;
    const med = past[Math.floor(past.length / 2)];
    if (v > med * 3 || (v > 0 && v < med / 3))
      out.push(
        `${FUEL_LABELS[k]}: ${Math.round(v)} λτ, ασυνήθιστο σε σχέση με τη διάμεσο ${Math.round(med)} λτ.`
      );
  }
  return out;
}

export function confidenceOf(n) {
  if (n >= 4) return { level: "high", label: "Υψηλή", days: n };
  if (n === 3) return { level: "medium", label: "Μέτρια", days: n };
  if (n >= 1) return { level: "low", label: "Χαμηλή", days: n };
  return { level: "none", label: "Χωρίς δεδομένα", days: 0 };
}

// Πρόβλεψη ανά καύσιμο και ημέρα, με πλήθος ημερών που χρησιμοποιήθηκαν.
// Ημερολογιακή σύγκριση (YYYY-MM-DD), όχι datetime — αλλιώς η σημερινή
// καταχώριση θα χρησιμοποιούνταν ως ιστορικό για την πρόβλεψη της ίδιας μέρας.
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function forecast(entries, days) {
  const usable = (entries || []).filter((e) => !e.excluded);
  const sorted = [...usable].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
  const perFuel = {};
  for (const k of FUEL_KEYS) {
    perFuel[k] = days.map((d) => {
      const wd = (d.getDay() + 6) % 7;
      const targetKey = dateKey(d);
      const vals = [];
      for (const e of sorted) {
        if (vals.length >= 4) break;
        // ΑΥΣΤΗΡΑ προγενέστερη ημερολογιακή ημέρα.
        if (!(e.entry_date < targetKey)) continue;
        const ed = new Date(e.entry_date + "T00:00:00");
        if ((ed.getDay() + 6) % 7 !== wd) continue;
        const v = e.liters?.[k];
        if (typeof v === "number") vals.push(v);
      }
      if (!vals.length) return { value: null, n: 0 };
      return {
        value: vals.reduce((s, x) => s + x, 0) / vals.length,
        n: vals.length,
      };
    });
  }
  return perFuel;
}

// Ιστορική ακρίβεια ΞΕΧΩΡΙΣΤΑ ανά καύσιμο.
export function accuracyPerFuel(entries, lookback = 14) {
  const usable = (entries || []).filter((e) => !e.excluded);
  const asc = [...usable].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  const res = {};
  for (const k of FUEL_KEYS) {
    let absSum = 0;
    let signedSum = 0;
    let n = 0;
    for (let i = asc.length - 1; i >= 0 && n < lookback; i--) {
      const cur = asc[i];
      const actual = cur.liters?.[k];
      if (typeof actual !== "number" || actual <= 0) continue;
      const wd = (new Date(cur.entry_date + "T00:00:00").getDay() + 6) % 7;
      const prev = [];
      for (let j = i - 1; j >= 0 && prev.length < 4; j--) {
        const e = asc[j];
        if ((new Date(e.entry_date + "T00:00:00").getDay() + 6) % 7 !== wd) continue;
        const v = e.liters?.[k];
        if (typeof v === "number" && v > 0) prev.push(v);
      }
      if (prev.length < 3) continue;
      const pred = prev.reduce((s, x) => s + x, 0) / prev.length;
      const dev = ((actual - pred) / pred) * 100;
      absSum += Math.abs(dev);
      signedSum += dev;
      n++;
    }
    res[k] = n
      ? {
          mape: absSum / n,
          bias: signedSum / n,
          days: n,
          tendency: signedSum / n > 1 ? "under" : signedSum / n < -1 ? "over" : "balanced",
        }
      : null;
  }
  return res;
}

// Απαιτούμενα λίτρα για κάλυψη = άθροισμα προβλέψεων × ποσοστό ανά ημέρα.
// ΔΕΝ αφαιρεί απόθεμα, παραλαβές ή safety stock.
export function requiredLiters(perFuel, weights) {
  const out = {};
  for (const k of FUEL_KEYS) {
    const t = (perFuel[k] || []).reduce(
      (s, cell, i) => s + (cell?.value || 0) * (Number(weights?.[i]) || 0),
      0
    );
    if (t > 0) out[k] = t;
  }
  return out;
}


// 11: ΟΙ ΙΔΙΕΣ functions καλούνται από το /api/fuel — κανένα test-only αντίγραφο.
// Απουσία του πεδίου excluded ΔΕΝ σημαίνει false.
export function resolveExcluded(body, existing) {
  return body?.excluded === undefined ? !!existing?.excluded : !!body.excluded;
}

// Merge-before-upsert: τα καύσιμα που δεν στάλθηκαν διατηρούνται.
export function mergeLiters(existing, incoming) {
  return { ...(existing || {}), ...(incoming || {}) };
}

// Deduplication διπλών ημερομηνιών μέσα στο ίδιο αρχείο import.
// Ίδιο fuel key → last valid row wins. ΤΗΝ ΙΔΙΑ καλεί το PUT /api/fuel.
export function dedupeEntries(rows) {
  const byDate = new Map();
  for (const v of rows || []) {
    const ex = byDate.get(v.entry_date);
    if (ex) {
      ex.liters = mergeLiters(ex.liters, v.liters);
      ex.notes = v.notes ?? ex.notes;
    } else {
      byDate.set(v.entry_date, { ...v, liters: { ...(v.liters || {}) } });
    }
  }
  return [...byDate.values()];
}
