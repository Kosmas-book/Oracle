"use client";
import { useEffect, useMemo, useState } from "react";
import { allShifts, DAY_NAMES, addDays, fmtShort } from "@/lib/shifts";
import { employeeSummary } from "@/lib/hours";
import { monthWeeks, daysInMonthFlags } from "@/lib/monthPlan";
import { validateGrid } from "@/lib/validate";
import { resolveActualNight } from "@/lib/monthSave";
import {
  IconGenerate, IconSave, IconPrint, IconPrev, IconNext, IconWarn, IconUsers, IconUndo,
} from "@/lib/Icons";

const MONTHS = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];

export default function MonthView({ stationName }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState({});
  const [nightMode, setNightMode] = useState("auto");
  const [manualNight, setManualNight] = useState({});
  const [keepExisting, setKeepExisting] = useState({});
  const [savedWeeks, setSavedWeeks] = useState([]);
  const [targets, setTargets] = useState({});
  const [showTargets, setShowTargets] = useState(false);
  const [confirmSave, setConfirmSave] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [startingNight, setStartingNight] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);

  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  // 1: το context φορτώνεται ΠΡΙΝ το Generate — ο χρήστης μπορεί να ρυθμίσει
  // βραδινούς και στόχους χωρίς να έχει δημιουργήσει προσχέδιο.
  const employees = draft?.employees || ctx?.employees || [];
  const SHIFTS = useMemo(
    () => allShifts(draft?.settings?.shifts ?? ctx?.settings?.shifts),
    [draft, ctx]
  );
  const nightCandidates = ctx?.nightCandidates?.length
    ? ctx.nightCandidates
    : employees.filter(
        (e) => !e.deactivated_at && (e.allowed_shifts || []).includes("Β")
      );
  // 3: οι part-timers έρχονται από το context — τα targets είναι διαθέσιμα
  // ΠΡΙΝ πατηθεί Δημιουργία μήνα.
  const partTimers = (ctx?.partTimers?.length ? ctx.partTimers : employees).filter(
    (e) => e.employment_type === "part" && !e.deactivated_at
  );
  const nameOf = (id) => employees.find((e) => e.id === id)?.name || "—";

  // Ποιες εβδομάδες έχουν ήδη αποθηκευμένο πρόγραμμα (πριν το Generate).
  useEffect(() => {
    setDraft(null);
    setMsg("");
    setCtx(null);
    setHistory([]);
    fetch(`/api/month?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setMsg("Σφάλμα: " + d.error);
        setCtx(d);
        setSavedWeeks(d.savedWeeks || []);
        setStartingNight(d.suggestedStartingNight || "");
        // Προσυμπλήρωση αποθηκευμένων εβδομαδιαίων στόχων.
        setTargets(d.weeklyTargetsByWeek || {});
      });
  }, [year, month]);

  function shiftMonth(n) {
    let m = month + n;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  }

  const basePayload = () => ({
    year, month,
    night_mode: nightMode,
    manual_night: manualNight,
    keep_existing: keepExisting,
    weekly_targets_by_week: targets,
    starting_night: startingNight || null,
  });

  async function generate() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload()),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg("Σφάλμα: " + (d.error || res.status)); return; }
    setDraft(d);
    setHistory([]);
    setOpen({});
    setMsg(
      d.summary.aborted
        ? "Η δημιουργία σταμάτησε — δες την προειδοποίηση παρακάτω."
        : `Δημιουργήθηκε προσχέδιο ${d.summary.weeks} εβδομάδων σε ${d.summary.generationMs}ms. Δεν έχει αποθηκευτεί ακόμα.`
    );
  }

  // 5: αναδημιουργία ΜΟΝΟ αυτής της εβδομάδας. Οι υπόλοιπες στέλνονται
  // αυτούσιες ως base_weeks, ώστε να μη χαθεί καμία χειροκίνητη αλλαγή.
  async function regenWeek(week_start) {
    pushHistory();
    setBusy(true);
    const res = await fetch("/api/month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload(),
        only_week: week_start,
        base_weeks: draft.weeks,
        locked_by_week: lockedFromDraft(),
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) {
      setDraft(d);
      setMsg(`Αναδημιουργήθηκε μόνο η εβδομάδα ${fmtRange(week_start)}.`);
    } else setMsg("Σφάλμα: " + (d.error || res.status));
  }

  // --- 4: χειροκίνητη επεξεργασία μέσα στο draft ---
  function pushHistory() {
    if (!draft) return;
    setHistory((h) => [...h.slice(-29), JSON.parse(JSON.stringify(draft.weeks))]);
  }

  function undo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    setDraft({ ...draft, weeks: last });
    setHistory((h) => h.slice(0, -1));
    setMsg("Αναιρέθηκε η τελευταία αλλαγή");
  }

  // Επαναϋπολογισμός validation ΚΑΙ actual night holder για μια εβδομάδα και
  // τα δύο boundaries της. Ο actualNight προκύπτει ΠΑΝΤΑ από το grid.
  function revalidate(weeksArr, idx) {
    const wt = (ws) => targets[ws] || {};
    const dayReq = Array.from({ length: 7 }, (_, i) =>
      i === 6 ? ctx?.settings?.sunday_req : ctx?.settings?.weekday_req
    );
    const out = [...weeksArr];
    for (const i of [idx - 1, idx, idx + 1]) {
      if (i < 0 || i >= out.length) continue;
      const w = out[i];
      const prevGrid = i > 0 ? out[i - 1].grid : null;
      const prevSunday = {};
      if (prevGrid)
        for (const [id, row] of Object.entries(prevGrid))
          if (Array.isArray(row) && row[6]) prevSunday[id] = row[6];
      const actual = resolveActualNight(w.grid, employees);
      out[i] = {
        ...w,
        // 4: αν άλλαξε το Β της Κυριακής, αλλάζει και ο κάτοχος του μπλοκ.
        actualNight: actual.id ?? null,
        actualNightAmbiguous: actual.ambiguous || actual.count === 0,
        actualNightCount: actual.count,
        check: validateGrid({
          grid: w.grid,
          employees,
          dayReq: dayReq[0] ? dayReq : null,
          shifts: draft?.settings?.shifts ?? ctx?.settings?.shifts,
          maxPerShift: draft?.settings?.max_per_shift ?? ctx?.settings?.max_per_shift ?? 4,
          workDays: draft?.settings?.work_days ?? ctx?.settings?.work_days ?? 6,
          prevSunday,
          weeklyTargets: wt(w.week_start),
          leaveReplacesRest:
            (draft?.settings?.leave_replaces_rest ?? ctx?.settings?.leave_replaces_rest) !== false,
          nightPerson: w.nightPerson,
          nextNight: w.nextNight,
          prevNightPerson: i > 0 ? out[i - 1].nightPerson : null,
        }),
      };
    }
    return out;
  }

  function paint(weekIdx, empId, day) {
    if (!editMode || selected === null) return;
    pushHistory();
    const code = selected === "×" ? "" : selected;
    const weeksArr = draft.weeks.map((w, i) => {
      if (i !== weekIdx) return w;
      const grid = { ...w.grid };
      const row = [...(grid[empId] || ["", "", "", "", "", "", ""])];
      const before = row[day];
      row[day] = code;
      grid[empId] = row;
      // 3: κρατάμε ΜΟΝΟ τα κελιά που άλλαξε ο χρήστης, ώστε το regenerate να
      // μην κλειδώνει και τα αυτόματα Ρ/Ο της ίδιας εβδομάδας.
      const userCells = { ...(w.userCells || {}) };
      if (before !== code) {
        userCells[empId] = { ...(userCells[empId] || {}), [day]: code };
      }
      return { ...w, grid, edited: true, userCells };
    });
    // 3: πρώτα ενημερώνουμε τον actualNight της week N και τον nightPerson
    // της N+1, και ΜΕΤΑ τρέχουμε validation και στις δύο.
    let next = [...weeksArr];
    const an = resolveActualNight(next[weekIdx].grid, employees);
    next[weekIdx] = {
      ...next[weekIdx],
      actualNight: an.id ?? null,
      actualNightAmbiguous: an.ambiguous || an.count === 0,
      actualNightCount: an.count,
    };
    if (next[weekIdx + 1])
      next[weekIdx + 1] = {
        ...next[weekIdx + 1],
        nightPerson: an.id ?? next[weekIdx + 1].nightPerson,
      };
    next = revalidate(next, weekIdx);
    setDraft({ ...draft, weeks: next });
  }

  // 3: locked = ΜΟΝΟ όσα άλλαξε πραγματικά ο χρήστης, όχι κάθε αυτόματο Ρ/Ο.
  function lockedFromDraft() {
    const out = {};
    for (const w of draft?.weeks || []) {
      const wk = {};
      for (const [empId, cells] of Object.entries(w.userCells || {}))
        for (const [d, c] of Object.entries(cells)) {
          if (!c) continue; // καθαρισμένο κελί δεν κλειδώνεται
          wk[empId] = wk[empId] || {};
          wk[empId][Number(d)] = c;
        }
      if (Object.keys(wk).length) out[w.week_start] = wk;
    }
    return out;
  }

  async function saveMonth(override = false) {
    setConfirmSave(null);
    setBusy(true);
    const res = await fetch("/api/month", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        override,
        weeks: draft.weeks.map((w, i) => ({
          week_start: w.week_start,
          // 6: preserve ΜΟΝΟ όταν είναι αποθηκευμένη ΚΑΙ ανέπαφη.
          preserve: w.source === "existing" && !w.edited,
          grid: w.grid,
          night_person: w.nightPerson,
          next_night_person: w.nextNight,
          actual_night_person: w.actualNight,
          prev_night_person: i > 0 ? draft.weeks[i - 1].nightPerson : null,
          // 2: όταν λείπει το metadata ΔΕΝ στέλνεται καθόλου, ώστε ο server
          // να διατηρήσει το υπάρχον αντί να το σβήσει με [].
          ...(Array.isArray(w.day_req) ? { day_req: w.day_req } : {}),
          ...(Array.isArray(w.nightExceptions)
            ? { night_exceptions: w.nightExceptions }
            : {}),
          weekly_targets: targets[w.week_start] || {},
        })),
      }),
    });
    const d = await res.json();
    setBusy(false);
    // 8: ο server επιστρέφει structured validation — ζητάμε ρητή επιβεβαίωση.
    if (res.status === 409) {
      setConfirmSave({
        total: (d.errors || 0) + (d.warnings || 0),
        weeksWith: d.weeksWithIssues || 0,
        issues: d.issues || [],
      });
      return;
    }
    if (!res.ok) {
      // 9: καμία ψεύτικη επιτυχία — λέμε ακριβώς τι σώθηκε και τι όχι.
      setMsg("Σφάλμα: " + (d.error || res.status));
      return;
    }
    const parts = [`Αποθηκεύτηκαν ${d.saved} εβδομάδες ✓`];
    if (d.preserved?.length)
      parts.push(`${d.preserved.length} διατηρήθηκαν χωρίς εγγραφή`);
    if (d.targetsSaved) parts.push(`${d.targetsSaved} στόχοι part-time`);
    if (d.savedWithOverride) parts.push("με καταγεγραμμένες προειδοποιήσεις");
    setMsg(parts.join(" · "));
    // Ανανέωση: οι πλέον αποθηκευμένες εβδομάδες γίνονται "existing".
    setSavedWeeks([...new Set([...savedWeeks, ...(d.savedWeeks || [])])]);
    setDraft({
      ...draft,
      weeks: draft.weeks.map((w) =>
        (d.savedWeeks || []).includes(w.week_start)
          ? { ...w, source: "existing", edited: false }
          : w
      ),
    });
  }

  const fmtRange = (ws) => {
    const m = new Date(ws + "T00:00:00");
    return `${fmtShort(m)} – ${fmtShort(addDays(m, 6))}`;
  };

  return (
    <>
      <div className="card noprint">
        <div className="toolbar">
          <button className="btn secondary" onClick={() => shiftMonth(-1)}>
            <IconPrev /> {MONTHS[(month + 10) % 12]}
          </button>
          <strong style={{ fontSize: 16, minWidth: 170, textAlign: "center" }}>
            {MONTHS[month - 1]} {year}
          </strong>
          <button className="btn secondary" onClick={() => shiftMonth(1)}>
            {MONTHS[month % 12]} <IconNext />
          </button>

          <span className="sep" />

          <label className="f">
            Νυχτερινές
            <select value={nightMode} onChange={(e) => setNightMode(e.target.value)}>
              <option value="auto">Αυτόματο rotation</option>
              <option value="manual">Χειροκίνητη επιλογή ανά εβδομάδα</option>
            </select>
          </label>

          <button className="btn amber" onClick={generate} disabled={busy}>
            <IconGenerate /> Δημιουργία μήνα
          </button>
          {draft && (
            <>
              <button className="btn" onClick={() => saveMonth(false)} disabled={busy}>
                <IconSave /> Αποθήκευση μήνα
              </button>
              <button className="btn secondary" onClick={() => window.print()}>
                <IconPrint /> Εκτύπωση μήνα
              </button>
            </>
          )}
          {msg && (
            <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>{msg}</span>
          )}
        </div>

        {ctx && !ctx.hasPreviousState && nightCandidates.length > 0 && (
          <div className="warn" style={{ marginTop: 12 }}>
            <strong>
              <IconWarn width={14} height={14} /> Δεν υπάρχει αποθηκευμένο νυχτερινό μπλοκ πριν τον μήνα
            </strong>
            <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <label className="f">
                Τρέχων βραδινός στην αρχή του μήνα
                <select
                  value={startingNight}
                  onChange={(e) => setStartingNight(e.target.value)}
                  style={{ minWidth: 170 }}
                >
                  {nightCandidates.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <span style={{ fontSize: 12.5 }}>
                Αυτός καλύπτει το ήδη ενεργό μπλοκ Δευτέρα–Σάββατο της πρώτης εβδομάδας.
              </span>
            </div>
          </div>
        )}

        {nightMode === "manual" && nightCandidates.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="sub" style={{ margin: "0 0 8px" }}>
              Διάλεξε ποιος ξεκινά κάθε νυχτερινό μπλοκ (Κυριακή):
            </p>
            <div className="tgrid">
              {weeks.map((w) => (
                <div className="req-item" key={w}>
                  <span className="req-label">{fmtRange(w)}</span>
                  <select
                    value={manualNight[w] || ""}
                    onChange={(e) => setManualNight({ ...manualNight, [w]: e.target.value })}
                    style={{ width: 130 }}
                  >
                    <option value="">— κανείς —</option>
                    {nightCandidates.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {savedWeeks.length > 0 && (
          <div className="warn" style={{ marginTop: 12 }}>
            <strong><IconWarn width={14} height={14} /> Υπάρχει ήδη αποθηκευμένο πρόγραμμα</strong>
            <div style={{ marginTop: 6 }}>
              {savedWeeks.map((w) => (
                <label key={w} style={{ display: "block", fontSize: 13, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={keepExisting[w] !== false}
                    onChange={(e) => setKeepExisting({ ...keepExisting, [w]: e.target.checked })}
                    style={{ marginRight: 7 }}
                  />
                  {fmtRange(w)} — {keepExisting[w] !== false ? "διατήρηση υπάρχοντος" : "αναδημιουργία"}
                </label>
              ))}
            </div>
          </div>
        )}

        {partTimers.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowTargets(!showTargets)}>
              <IconUsers /> Εβδομαδιαίοι στόχοι part-time
            </button>
            {showTargets && (
              <div className="gridwrap" style={{ marginTop: 10 }}>
                <table className="sched">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingLeft: 10 }}>Εργαζόμενος</th>
                      {weeks.map((w) => <th key={w}>{fmtRange(w)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {partTimers.map((e) => (
                      <tr key={e.id}>
                        <td className="name">{e.name}</td>
                        {weeks.map((w) => (
                          <td key={w} style={{ padding: 3 }}>
                            <input
                              type="number" min={0} max={7} placeholder="—"
                              value={targets[w]?.[e.id] ?? ""}
                              onChange={(ev) =>
                                setTargets({
                                  ...targets,
                                  [w]: { ...(targets[w] || {}), [e.id]: ev.target.value },
                                })
                              }
                              style={{ width: 52, textAlign: "center" }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {draft && (
        <>
          <div className={"checks" + (draft.summary.errors ? " has-error" : draft.summary.warnings ? "" : " ok")}>
            <div className="checks-head">
              <strong>{MONTHS[month - 1]} {year}</strong>
              <span className="chk-badge">{draft.summary.weeks} εβδομάδες</span>
              {draft.summary.errors > 0 && (
                <span className="chk-badge err">{draft.summary.errors} σοβαρά</span>
              )}
              {draft.summary.warnings > 0 && (
                <span className="chk-badge warnb">{draft.summary.warnings} προειδοποιήσεις</span>
              )}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>
              Ακάλυπτες βάρδιες: <strong>{draft.summary.missing}</strong> ·
              Παραβιάσεις 11ώρου: <strong>{draft.summary.restViolations}</strong>
              <br />
              Σειρά νυχτερινών: {draft.summary.rotation.map(nameOf).join(" → ") || "—"}
            </div>
            {draft.summary.aborted && (
              <div className="warn" style={{ marginTop: 10 }}>
                <strong><IconWarn width={14} height={14} /> Διακοπή δημιουργίας</strong>
                <div style={{ marginTop: 4 }}>{draft.summary.aborted.error}</div>
              </div>
            )}
          </div>

          {draft.weeks.map((w, wi) => {
            const issues = (w.check?.errors || 0) + (w.check?.warnings || 0);
            const isOpen = open[w.week_start];
            const flags = daysInMonthFlags(w.week_start, year, month);
            const days = Array.from({ length: 7 }, (_, i) =>
              addDays(new Date(w.week_start + "T00:00:00"), i)
            );
            const visible = employees.filter(
              (e) => !e.deactivated_at || (w.grid[e.id] || []).some((c) => c)
            );
            return (
              <div className="card weekcard" key={w.week_start}>
                <div className="wk-head" onClick={() => setOpen({ ...open, [w.week_start]: !isOpen })}>
                  <strong>{fmtRange(w.week_start)}</strong>
                  <span className="wk-night">
                    Βραδινός Δευ–Σάβ: <strong>{nameOf(w.nightPerson)}</strong>
                  </span>
                  <span className="wk-night">
                    Νέο μπλοκ Κυριακή: <strong>{nameOf(w.actualNight)}</strong>
                  </span>
                  {w.edited && <span className="pill">επεξεργασμένη</span>}
                  {w.actualNightAmbiguous && (
                    <span className="pill err-pill">
                      {w.actualNightCount === 0
                        ? "καμία Β Κυριακής"
                        : `${w.actualNightCount} Β Κυριακής`}
                    </span>
                  )}
                  {w.source === "existing" && <span className="pill muted">αποθηκευμένη</span>}
                  {issues === 0 ? (
                    <span className="pill ok-pill">✓ χωρίς προβλήματα</span>
                  ) : (
                    <span className="pill warnb">{issues} προειδοποιήσεις</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span className="wk-toggle">{isOpen ? "▲" : "▼"}</span>
                </div>

                {isOpen && (
                  <>
                    <div className="toolbar noprint" style={{ margin: "10px 0" }}>
                      <button className="btn secondary" onClick={() => regenWeek(w.week_start)} disabled={busy}>
                        <IconGenerate /> Αναδημιουργία εβδομάδας
                      </button>
                      {!editMode ? (
                        <button className="btn secondary" onClick={() => setEditMode(true)}>
                          ✎ Επεξεργασία με το χέρι
                        </button>
                      ) : (
                        <>
                          <span className="editnow">
                            {selected && selected !== "×"
                              ? <>Τώρα βάζεις: <strong>{selected}</strong></>
                              : selected === "×"
                              ? "Τώρα καθαρίζεις κελιά"
                              : "Διάλεξε βάρδια από την παλέτα"}
                          </span>
                          <button className="btn secondary" onClick={() => { setEditMode(false); setSelected(null); }}>
                            Τέλος επεξεργασίας
                          </button>
                        </>
                      )}
                      <button className="btn secondary" onClick={undo} disabled={!history.length}>
                        <IconUndo /> Αναίρεση{history.length ? ` (${history.length})` : ""}
                      </button>
                    </div>
                    {editMode && (
                      <div className="palette noprint" style={{ marginBottom: 10 }}>
                        {Object.keys(SHIFTS).map((c) => (
                          <button
                            key={c}
                            className={"chip" + (selected === c ? " selected" : "")}
                            style={{ background: SHIFTS[c].bg, color: SHIFTS[c].ink }}
                            onClick={() => setSelected(selected === c ? null : c)}
                            title={SHIFTS[c].label}
                          >
                            {c}
                            <small>{SHIFTS[c].hours || SHIFTS[c].label}</small>
                          </button>
                        ))}
                        <button
                          className={"chip" + (selected === "×" ? " selected" : "")}
                          style={{ background: "#fff", border: "2px dashed var(--line)" }}
                          onClick={() => setSelected(selected === "×" ? null : "×")}
                        >
                          ×<small>καθάρισμα</small>
                        </button>
                      </div>
                    )}
                    {w.check?.groups?.length > 0 && (
                      <div className="checks">
                        {w.check.groups.map((g) => (
                          <div className={"chk-group " + g.level} key={g.key}>
                            <div className="chk-title">{g.title}</div>
                            <ul>{g.items.slice(0, 5).map((it, i) => <li key={i}>{it}</li>)}</ul>
                          </div>
                        ))}
                      </div>
                    )}
                    {w.warnings?.length > 0 && (
                      <div className="warn">
                        <strong><IconWarn width={14} height={14} /> Σημειώσεις δημιουργίας</strong>
                        <ul>{w.warnings.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                  </>
                )}

                {isOpen && (
                  <div className="gridwrap noprint">
                    <table className="sched">
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", paddingLeft: 10 }}>Υπάλληλος</th>
                          {days.map((d, i) => (
                            <th key={i} className={flags[i] ? "" : "spill"}>
                              {DAY_NAMES[i]}
                              <div className="d">{fmtShort(d)}</div>
                            </th>
                          ))}
                          <th className="noprint">Μέρες / Ώρες</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((e) => {
                          const sm = employeeSummary(w.grid[e.id] || [], draft.settings?.shifts);
                          return (
                            <tr key={e.id}>
                              <td className="name">
                                {e.name}
                                {e.employment_type === "part" && <small> (pt)</small>}
                              </td>
                              {days.map((_, d) => {
                                const code = (w.grid[e.id] || [])[d] || "";
                                const s = SHIFTS[code];
                                return (
                                  <td
                                    key={d}
                                    className={flags[d] ? "" : "spill"}
                                    style={s ? { background: s.bg } : undefined}
                                  >
                                    <button
                                      className="cell"
                                      style={s ? { color: s.ink } : undefined}
                                      onClick={() => paint(wi, e.id, d)}
                                      title={s ? `${s.label} ${s.hours}` : ""}
                                    >
                                      {code}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="noprint sumcell">
                                <span className="sum-days">{sm.workDays}</span>
                                <span className="sum-hours">{sm.hours}ω</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* 10: η εκτύπωση περιέχει ΟΛΕΣ τις εβδομάδες, ανεξάρτητα από το αν
          είναι ανοιχτές στην οθόνη. */}
      {draft && (
        <div className="print-only month-print">
          <div className="print-head">
            <h2>ΜΗΝΙΑΙΟ ΠΡΟΓΡΑΜΜΑ ΕΡΓΑΣΙΑΣ</h2>
            <div className="ph-period">
              {MONTHS[month - 1]} {year}
              {stationName ? ` · ${stationName}` : ""}
            </div>
          </div>
          {draft.weeks.map((w) => {
            const flags = daysInMonthFlags(w.week_start, year, month);
            const days = Array.from({ length: 7 }, (_, i) =>
              addDays(new Date(w.week_start + "T00:00:00"), i)
            );
            const visible = employees.filter(
              (e) => !e.deactivated_at || (w.grid[e.id] || []).some((c) => c)
            );
            return (
              <div className="print-week" key={"p" + w.week_start}>
                <div className="pw-title">
                  <strong>{fmtRange(w.week_start)}</strong>
                  <span>
                    Βραδινός Δευ–Σάβ: {nameOf(w.nightPerson)} · Νέο μπλοκ Κυριακή:{" "}
                    {nameOf(w.actualNight)}
                  </span>
                </div>
                <table className="sched">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingLeft: 10 }}>Υπάλληλος</th>
                      {days.map((d, i) => (
                        <th key={i} className={flags[i] ? "" : "spill"}>
                          {DAY_NAMES[i]}
                          <div className="d">{fmtShort(d)}</div>
                        </th>
                      ))}
                      <th>Ώρες</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e) => {
                      const sm = employeeSummary(
                        w.grid[e.id] || [],
                        draft.settings?.shifts
                      );
                      return (
                        <tr key={e.id}>
                          <td className="name">{e.name}</td>
                          {days.map((_, d) => {
                            const code = (w.grid[e.id] || [])[d] || "";
                            const sh = SHIFTS[code];
                            return (
                              <td
                                key={d}
                                className={flags[d] ? "" : "spill"}
                                style={sh ? { background: sh.bg } : undefined}
                              >
                                <span className="cell" style={sh ? { color: sh.ink } : undefined}>
                                  {code}
                                </span>
                              </td>
                            );
                          })}
                          <td style={{ fontSize: 11 }}>{sm.hours}ω</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {confirmSave && (
        <div className="modal-back" onClick={() => setConfirmSave(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Ο μήνας έχει {confirmSave.total} προειδοποιήσεις σε{" "}
              {confirmSave.weeksWith} {confirmSave.weeksWith === 1 ? "εβδομάδα" : "εβδομάδες"}.
            </h3>
            {confirmSave.issues?.length > 0 && (
              <div className="modal-body">
                {confirmSave.issues.map((it) => (
                  <div className="chk-group warn" key={it.week_start}>
                    <div className="chk-title">
                      {fmtRange(it.week_start)} — {it.errors} σοβαρά, {it.warnings} προσοχή
                    </div>
                    <ul>
                      {(it.groups || []).slice(0, 3).map((g) => (
                        <li key={g.key}>
                          {g.title}: {g.items.slice(0, 2).join(" · ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setConfirmSave(null)}>
                Επιστροφή για διόρθωση
              </button>
              <button className="btn" onClick={() => saveMonth(true)}>
                Αποθήκευση παρ’ όλα αυτά
              </button>
            </div>
            <p className="modal-note">
              Οι προειδοποιήσεις καταγράφονται στην αντίστοιχη εβδομάδα.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
