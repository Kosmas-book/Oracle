import { allShifts } from "./shifts.js";

// Πραγματικές ώρες μιας βάρδιας από τα ωράρια του καταστήματος.
// Οι βάρδιες που περνούν τα μεσάνυχτα έχουν end > 24 (π.χ. Β 22→30 = 8 ώρες).
export function shiftHours(code, SH) {
  const s = SH[code];
  if (!s || s.start == null || s.end == null) return 0;
  return Math.max(0, s.end - s.start);
}

// Άθροισμα ωρών μιας γραμμής (7 κελιά) — τα Ρ/Ο μετρούν 0.
export function rowHours(row, SH) {
  return (row || []).reduce((sum, c) => sum + shiftHours(c, SH), 0);
}

// Πλήρης σύνοψη εργαζομένου για μια εβδομάδα.
export function employeeSummary(row, shifts) {
  const SH = allShifts(shifts);
  const r = row || [];
  const counts = {};
  let hours = 0;
  let workDays = 0;
  for (const c of r) {
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
    if (c !== "Ρ" && c !== "Ο") {
      workDays++;
      hours += shiftHours(c, SH);
    }
  }
  return {
    hours: Math.round(hours * 100) / 100,
    workDays,
    rest: counts["Ρ"] || 0,
    leave: counts["Ο"] || 0,
    counts,
  };
}

// Στόχος ημερών για μια εβδομάδα: πρώτα ο εβδομαδιαίος, μετά το προφίλ.
export function targetDaysFor(emp, weeklyTargets, workDays, leaveDays, leaveReplacesRest) {
  const wt = weeklyTargets?.[emp.id];
  if (wt != null && wt !== "") return Number(wt);
  if (emp.employment_type === "part") return null; // εύρος, όχι ακριβής στόχος
  // Πλήρους: workDays, μειωμένος κατά τις άδειες μόνο αν το Ο αντικαθιστά το Ρ.
  return leaveReplacesRest
    ? Math.max(0, workDays - leaveDays)
    : Math.max(0, Math.min(workDays, 7 - leaveDays - (7 - workDays)));
}
