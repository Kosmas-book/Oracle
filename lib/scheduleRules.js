// ΜΟΝΑΔΙΚΗ πηγή αλήθειας για τον εβδομαδιαίο στόχο ημερών.
// Χρησιμοποιείται από generator, validator, UI summary και tests, ώστε τα ίδια
// δεδομένα να δίνουν πάντα τον ίδιο στόχο.
//
// Σημασιολογία:
//   workDays = 6  → 6 εργάσιμες + 1 ρεπό
//   leaveReplacesRest = true  → η άδεια Ο μπαίνει ΣΤΗ ΘΕΣΗ του ρεπό
//                               (6 εργάσιμες + 1 Ο + 0 Ρ)
//   leaveReplacesRest = false → δικαιούται και τα δύο
//                               (5 εργάσιμες + 1 Ο + 1 Ρ)
export function targetDays({
  employee,
  weeklyTarget,          // ακριβής στόχος εβδομάδας ή null/""
  workDays = 6,
  leaveDays = 0,
  leaveReplacesRest = true,
}) {
  // 1. Ακριβής εβδομαδιαίος στόχος — υπερισχύει των πάντων.
  if (weeklyTarget != null && weeklyTarget !== "") {
    const n = Math.max(0, Math.min(7, Number(weeklyTarget)));
    return { exact: n, min: n, max: n, source: "weekly" };
  }
  // 2. Part-time χωρίς εβδομαδιαίο στόχο: εύρος, όχι ακριβής αριθμός.
  //    9G: οι ημέρες άδειας μειώνουν τις διαθέσιμες ημέρες — αν είναι σε Ο
  //    όλη την εβδομάδα, ο στόχος είναι 0 και δεν βγαίνει ψευδές warning.
  if (employee?.employment_type === "part") {
    const available = Math.max(0, 7 - leaveDays);
    const min = Math.min(Number(employee.min_days) || 3, available);
    const rawMax = Number(employee.max_days) || Number(employee.min_days) || 3;
    const max = Math.min(Math.max(rawMax, min), available);
    return { exact: null, min, max, source: "profile" };
  }
  // 3. Πλήρους απασχόλησης.
  const n = leaveReplacesRest
    ? Math.min(workDays, 7 - leaveDays)
    : Math.max(0, workDays - leaveDays);
  return { exact: n, min: n, max: n, source: "contract" };
}

// Πόσα ρεπό δικαιούται μέσα στην εβδομάδα (μετά τις άδειες).
export function restDaysFor({ target, leaveDays = 0 }) {
  const t = target.exact != null ? target.exact : target.min;
  return Math.max(0, 7 - leaveDays - t);
}

// Το ανώτατο όριο ημερών εργασίας — ΠΟΤΕ δεν ξεπερνιέται σε καμία φάση.
export function maxDaysFor(target) {
  return target.exact != null ? target.exact : target.max;
}
