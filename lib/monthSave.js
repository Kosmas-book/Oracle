// ============================================================
// Pure λογική του Save Month. ΤΙΣ ΙΔΙΕΣ functions καλεί το
// PUT /api/month — δεν υπάρχει test-only αντίγραφο.
// ============================================================

// 6: Ο ΜΟΝΟΣ κανόνας παράλειψης εγγραφής είναι το ρητό preserve === true.
// Μια existing week που επεξεργάστηκε ο χρήστης ΠΡΕΠΕΙ να γραφτεί.
export function partitionWeeks(list) {
  const toWrite = [];
  const preserved = [];
  const seen = new Set();
  for (const w of list || []) {
    if (!w?.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(w.week_start)) continue;
    if (seen.has(w.week_start)) continue;
    seen.add(w.week_start);
    if (w.preserve === true) preserved.push(w);
    else toWrite.push(w);
  }
  const byDate = (a, b) => (a.week_start < b.week_start ? -1 : 1);
  return { toWrite: toWrite.sort(byDate), preserved: preserved.sort(byDate) };
}

// 4/9/24: ο πραγματικός κάτοχος του νέου μπλοκ υπολογίζεται ΠΑΝΤΑ από το
// grid της Κυριακής — ποτέ από τιμή που στέλνει ο browser.
export function resolveActualNight(grid, employees) {
  const holders = (employees || []).filter(
    (e) => ((grid || {})[e.id] || [])[6] === "Β"
  );
  if (holders.length === 1)
    return { id: holders[0].id, ambiguous: false, count: 1 };
  if (holders.length > 1)
    return {
      id: null,
      ambiguous: true,
      count: holders.length,
      names: holders.map((e) => e.name),
    };
  return { id: null, ambiguous: false, count: 0 };
}

// 8: field omitted → διατήρηση existing. Explicit [] → σκόπιμο καθάρισμα.
export function pickMeta(incoming, existing, fallback) {
  if (incoming === undefined) return existing === undefined ? fallback : existing;
  return incoming;
}

export function resolveDayReq(incoming, existing, weekdayReq, sundayReq) {
  if (Array.isArray(incoming) && incoming.length === 7) return incoming;
  if (Array.isArray(existing) && existing.length === 7) return existing;
  return Array.from({ length: 7 }, (_, i) => (i === 6 ? sundayReq : weekdayReq));
}

// Η γραμμή που γράφεται στη βάση για μια generated/edited week.
export function buildScheduleRow({
  week,
  existingRow,
  stationId,
  employees,
  weekdayReq,
  sundayReq,
  check,
  now = new Date().toISOString(),
}) {
  const grid = week.grid || existingRow?.grid || {};
  const actual = resolveActualNight(grid, employees);
  const hasIssues = !!check && check.errors + check.warnings > 0;
  return {
    station_id: stationId,
    week_start: week.week_start,
    grid,
    night_person: pickMeta(week.night_person, existingRow?.night_person, null),
    next_night_person: pickMeta(
      week.next_night_person,
      existingRow?.next_night_person,
      null
    ),
    // 24: server-side recomputation, όχι εμπιστοσύνη στο browser.
    actual_night_person: actual.id ?? null,
    day_req: resolveDayReq(week.day_req, existingRow?.day_req, weekdayReq, sundayReq),
    night_exceptions: pickMeta(
      week.night_exceptions,
      existingRow?.night_exceptions,
      []
    ),
    override_warnings: hasIssues
      ? (check.all || []).slice(0, 200)
      : pickMeta(undefined, existingRow?.override_warnings, []),
    updated_at: now,
  };
}

// 7: τα weekly targets είναι ΞΕΧΩΡΙΣΤΗ απόφαση από την εγγραφή του schedule.
// Επεξεργάζονται για ΟΛΕΣ τις weeks του request, και τις preserved.
export function collectTargetOps(list, stationId) {
  const upserts = [];
  const deletes = [];
  for (const w of list || []) {
    if (!w?.week_start) continue;
    if (w.weekly_targets === undefined) continue; // δεν στάλθηκε → μην αγγίξεις
    for (const [empId, v] of Object.entries(w.weekly_targets || {})) {
      if (v === "" || v === null) {
        deletes.push({ week_start: w.week_start, employee_id: empId });
        continue;
      }
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= 7)
        upserts.push({
          station_id: stationId,
          week_start: w.week_start,
          employee_id: empId,
          exact_days: n,
        });
    }
  }
  return { upserts, deletes };
}

// Το prevSunday μιας week: πρώτα από το ίδιο batch, αλλιώς από τη βάση,
// αλλιώς από το seed (πρώτη week του μήνα).
export function prevSundayFor({ weekStart, batch, savedWeeks, seedPrevSunday }) {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  const key = d.toISOString().slice(0, 10);
  const fromBatch = (batch || []).find((x) => x.week_start === key);
  const grid = fromBatch?.grid || savedWeeks?.[key]?.grid;
  if (!grid) return { ...(seedPrevSunday || {}) };
  const out = {};
  for (const [id, row] of Object.entries(grid))
    if (Array.isArray(row) && row[6]) out[id] = row[6];
  return out;
}

// Ο previous night holder μιας week: ο night_person της προηγούμενης.
export function prevNightFor({ weekStart, batch, savedWeeks, seedPreviousNight }) {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  const key = d.toISOString().slice(0, 10);
  const fromBatch = (batch || []).find((x) => x.week_start === key);
  if (fromBatch) return fromBatch.night_person ?? null;
  if (savedWeeks?.[key]) return savedWeeks[key].night_person ?? null;
  return seedPreviousNight ?? null;
}
