"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/lib/Nav";
import Logo from "@/lib/Logo";
import { validateGrid } from "@/lib/validate";
import { employeeSummary } from "@/lib/hours";
import { targetDays } from "@/lib/scheduleRules";
import {
  IconMoon,
  IconGenerate,
  IconSave,
  IconPrint,
  IconUndo,
  IconRestore,
  IconCopy,
  IconUsers,
  IconPrev,
  IconNext,
  IconWarn,
} from "@/lib/Icons";
import {
  allShifts,
  DAY_NAMES,
  mondayOf,
  isoDate,
  addDays,
  fmtShort,
} from "@/lib/shifts";

export default function SchedulePage() {
  const [week, setWeek] = useState(() => isoDate(mondayOf(new Date())));
  const [employees, setEmployees] = useState([]);
  const [grid, setGrid] = useState({});
  const [nightPerson, setNightPerson] = useState("");
  const [nextNight, setNextNight] = useState("");
  const [selected, setSelected] = useState(null); // κωδικός παλέτας
  const [warnings, setWarnings] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mobileDay, setMobileDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [stationShifts, setStationShifts] = useState(null);
  const [baseReqs, setBaseReqs] = useState(null); // {weekday, sunday} από Ρυθμίσεις
  const [dayReq, setDayReq] = useState(null); // override 7 ημερών για ΤΗΝ εβδομάδα
  const [showReq, setShowReq] = useState(false);
  const [savedWeeks, setSavedWeeks] = useState([]);
  const [prevInfo, setPrevInfo] = useState(null);
  const [stationName, setStationName] = useState("");
  const [history, setHistory] = useState([]); // στοίβα αναίρεσης
  const SHIFTS = useMemo(() => allShifts(stationShifts), [stationShifts]);
  const PAINTABLE = useMemo(() => Object.keys(SHIFTS), [SHIFTS]);

  const defaultDayReq = useMemo(() => {
    if (!baseReqs) return null;
    return Array.from({ length: 7 }, (_, d) => ({
      ...(d === 6 ? baseReqs.sunday : baseReqs.weekday),
    }));
  }, [baseReqs]);
  const effectiveDayReq = dayReq || defaultDayReq;

  const days = useMemo(() => {
    const m = new Date(week + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => addDays(m, i));
  }, [week]);

  const isActive = (e) => !e.deactivated_at;
  // Εμφανίζονται: οι ενεργοί + όσοι ανενεργοί υπάρχουν ΗΔΗ στο πλέγμα
  // (ώστε το ιστορικό να μη χάνει ανθρώπους).
  const activeEmployees = useMemo(() => {
    const inGrid = (e) =>
      Array.isArray(grid[e.id]) && grid[e.id].some((c) => c);
    return employees.filter((e) => isActive(e) || inGrid(e));
  }, [employees, grid]);
  const schedulableEmployees = useMemo(
    () => employees.filter(isActive),
    [employees]
  );
  const hasNightShift = useMemo(() => !!SHIFTS["Β"], [SHIFTS]);
  const nightCandidates = useMemo(
    () => schedulableEmployees.filter((e) => (e.allowed_shifts || []).includes("Β")),
    [schedulableEmployees]
  );
  const nameOf = (id) => employees.find((x) => x.id === id)?.name || "";

  // Ζωντανός έλεγχος: τρέχει σε ΚΑΘΕ αλλαγή, όχι μόνο στη δημιουργία.
  const [settingsCfg, setSettingsCfg] = useState(null);
  const [weeklyTargets, setWeeklyTargets] = useState({});
  const [nightExceptions, setNightExceptions] = useState([]);
  const [prevSunday, setPrevSunday] = useState({});
  const [saveIssues, setSaveIssues] = useState(null); // modal επιβεβαίωσης
  const [editMode, setEditMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const check = useMemo(() => {
    if (!settingsCfg || !employees.length || !effectiveDayReq) return null;
    return validateGrid({
      grid,
      employees: activeEmployees,
      dayReq: effectiveDayReq,
      shifts: stationShifts,
      maxPerShift: settingsCfg.max_per_shift || 4,
      workDays: settingsCfg.work_days || 6,
      prevSunday,
      weeklyTargets,
      leaveReplacesRest: settingsCfg.leave_replaces_rest !== false,
      nightPerson,
      nextNight,
      prevNightPerson: prevInfo?.night_person || null,
    });
  }, [
    grid, activeEmployees, effectiveDayReq, stationShifts, settingsCfg,
    prevSunday, weeklyTargets, nightPerson, nextNight, prevInfo,
  ]);

  useEffect(() => {
    // Γ: φέρνουμε ΚΑΙ τους ανενεργούς, ώστε τα ιστορικά προγράμματα να
    // εμφανίζουν σωστά ονόματα και βάρδιες. Το Generate χρησιμοποιεί μόνο ενεργούς.
    fetch("/api/employees?all=1")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees || []));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setStationShifts(d.settings?.shifts || null);
        setSettingsCfg(d.settings || {});
        setBaseReqs({
          weekday: d.settings?.weekday_req || {},
          sunday: d.settings?.sunday_req || {},
        });
      });
    loadWeeks();
    fetch("/api/station")
      .then((r) => r.json())
      .then((d) => d.name && setStationName(d.name));
  }, []);

  function loadWeeks() {
    fetch("/api/schedule?list=1")
      .then((r) => r.json())
      .then((d) => setSavedWeeks(d.weeks || []));
  }

  useEffect(() => {
    setMsg("");
    setWarnings([]);
    fetch(`/api/weekly-targets?week=${week}`)
      .then((r) => r.json())
      .then((d) => setWeeklyTargets(d.targets || {}));
    fetch(`/api/schedule?week=${week}`)
      .then((r) => r.json())
      .then((d) => {
        setPrevInfo(d.prev || null);
        setHistory([]);
        const m0 = new Date(week + "T00:00:00");
        m0.setDate(m0.getDate() - 7);
        const ps = {};
        if (d.prev?.grid && d.prev.week_start === isoDate(m0))
          for (const [id, row] of Object.entries(d.prev.grid))
            if (Array.isArray(row) && row[6]) ps[id] = row[6];
        setPrevSunday(ps);
        if (d.schedule) {
          setGrid(d.schedule.grid || {});
          setNightPerson(d.schedule.night_person || "");
          setNextNight(d.schedule.next_night_person || "");
          setDayReq(
            Array.isArray(d.schedule.day_req) && d.schedule.day_req.length === 7
              ? d.schedule.day_req
              : null
          );
          setNightExceptions(
            Array.isArray(d.schedule.night_exceptions)
              ? d.schedule.night_exceptions
              : []
          );
          setDirty(false);
        } else {
          setDayReq(null);
          setNightExceptions([]);
          setGrid({});
          // Προτεινόμενη συνέχεια από την προηγούμενη εβδομάδα:
          // ο "επόμενος βραδινός" της προηγούμενης γίνεται ο τρέχων.
          // 1D: current holder = όποιος ΠΡΑΓΜΑΤΙΚΑ ξεκίνησε το μπλοκ την Κυριακή.
          setNightPerson(
            d.prev?.actual_night_person || d.prev?.next_night_person || ""
          );
          setNextNight("");
          setDirty(false);
        }
      });
  }, [week]);

  function shiftWeek(n) {
    const m = new Date(week + "T00:00:00");
    setWeek(isoDate(addDays(m, n * 7)));
  }

  function paint(empId, d) {
    if (!editMode || selected === null) return;
    pushHistory();
    setGrid((g) => {
      const row = [...(g[empId] || ["", "", "", "", "", "", ""])];
      row[d] = selected === "×" ? "" : selected;
      return { ...g, [empId]: row };
    });
    setDirty(true);
  }

  // Κρατάει φωτογραφία της τρέχουσας κατάστασης πριν από κάθε αλλαγή.
  function pushHistory() {
    setHistory((h) => {
      const snap = {
        grid: JSON.parse(JSON.stringify(grid)),
        nightPerson,
        nextNight,
        dayReq: dayReq ? JSON.parse(JSON.stringify(dayReq)) : null,
        nightExceptions: JSON.parse(JSON.stringify(nightExceptions)),
      };
      const next = [...h, snap];
      return next.length > 40 ? next.slice(next.length - 40) : next;
    });
  }

  function undo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    setGrid(last.grid);
    setNightPerson(last.nightPerson);
    setNextNight(last.nextNight);
    setDayReq(last.dayReq);
    setNightExceptions(last.nightExceptions || []);
    setHistory((h) => h.slice(0, -1));
    setDirty(true);
    setWarnings([]);
    setMsg("Αναιρέθηκε — πάτα Αποθήκευση για να γραφτεί");
  }

  async function reloadSaved() {
    if (
      dirty &&
      !confirm("Θα χαθούν οι αλλαγές που δεν έχεις αποθηκεύσει. Συνέχεια;")
    )
      return;
    const r = await fetch(`/api/schedule?week=${week}`);
    const d = await r.json();
    if (d.schedule) {
      setGrid(d.schedule.grid || {});
      setNightPerson(d.schedule.night_person || "");
      setNextNight(d.schedule.next_night_person || "");
      setDayReq(
        Array.isArray(d.schedule.day_req) && d.schedule.day_req.length === 7
          ? d.schedule.day_req
          : null
      );
      setNightExceptions(
        Array.isArray(d.schedule.night_exceptions)
          ? d.schedule.night_exceptions
          : []
      );
      setHistory([]);
      setDirty(false);
      setWarnings([]);
      setMsg("Επαναφέρθηκε η τελευταία αποθηκευμένη έκδοση");
    } else {
      setMsg("Δεν υπάρχει αποθηκευμένη έκδοση για αυτή την εβδομάδα");
    }
  }

  function copyPrevious() {
    if (!prevInfo?.grid) return;
    if (
      dirty &&
      !confirm(
        "Έχεις αλλαγές που δεν έχουν αποθηκευτεί. Η αντιγραφή θα τις αντικαταστήσει — συνέχεια;"
      )
    )
      return;
    pushHistory();
    const m = new Date(week + "T00:00:00");
    m.setDate(m.getDate() - 7);
    const adj = prevInfo.week_start === isoDate(m);

    const g = {};
    for (const e of activeEmployees) {
      const row = prevInfo.grid[e.id];
      g[e.id] = Array.isArray(row) ? [...row] : ["", "", "", "", "", "", ""];
    }

    const notes = [];
    if (adj) {
      // Ο κύκλος βραδινού προχωράει: ο περσινός «επόμενος» αναλαμβάνει.
      const newNight =
        prevInfo.actual_night_person || prevInfo.next_night_person || "";
      const oldNight = prevInfo.night_person || "";
      const nameOf = (id) => employees.find((x) => x.id === id)?.name || "—";

      if (newNight && g[newNight]) {
        g[newNight] = ["Β", "Β", "Β", "Β", "Β", "Β", "Ρ"];
        notes.push(`${nameOf(newNight)} → βραδινός Δευ–Σάβ`);
      }
      if (oldNight && g[oldNight]) {
        // Τελείωσε τα βραδινά: Ρ Δευτέρα, οι υπόλοιπες μέρες θέλουν βάρδιες.
        g[oldNight] = ["Ρ", "", "", "", "", "", ""];
        notes.push(`${nameOf(oldNight)} → Ρ Δευτέρα, οι υπόλοιπες μέρες κενές`);
      }
      setNightPerson(newNight);
      setNextNight("");
      notes.push("όρισε τον επόμενο βραδινό");
    } else {
      notes.push("η προηγούμενη εβδομάδα δεν είναι η αμέσως προηγούμενη — έλεγξε τα Β");
    }

    setGrid(g);
    setWarnings([]);
    // 4: η νέα εβδομάδα ξεκινά ΧΩΡΙΣ τα παλιά night exceptions.
    setNightExceptions([]);
    setDirty(true);
    setMsg("Αντιγράφηκε: " + notes.join(" · "));
  }

  async function generate() {
    if (
      dirty &&
      !confirm(
        "Έχεις αλλαγές που δεν έχουν αποθηκευτεί. Η δημιουργία θα ξαναγράψει το πρόγραμμα — συνέχεια; (μπορείς να το αναιρέσεις μετά)"
      )
    )
      return;
    pushHistory();
    setBusy(true);
    setMsg("");
    // Κλειδωμένα κελιά: ό,τι έχει μαρκαριστεί ως Άδεια (Ο) κρατιέται.
    const locked = {};
    for (const [empId, row] of Object.entries(grid)) {
      (row || []).forEach((c, d) => {
        if (c === "Ο") {
          locked[empId] = locked[empId] || {};
          locked[empId][d] = "Ο";
        }
      });
    }
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_start: week,
        night_person: nightPerson || null,
        next_night_person: nextNight || null,
        locked,
        day_req: effectiveDayReq,
        weekly_targets: weeklyTargets,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg("Σφάλμα: " + (d.error || res.status));
      return;
    }
    setGrid(d.grid);
    setWarnings(d.warnings || []);
    setNightExceptions(d.nightExceptions || []);
    setDirty(true);
  }

  async function save(override = false) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_start: week,
        grid,
        night_person: nightPerson || null,
        next_night_person: nextNight || null,
        day_req: effectiveDayReq || [],
        night_exceptions: nightExceptions,
        weekly_targets: weeklyTargets,
        override,
      }),
    });

    // Ο server βρήκε προβλήματα: ζητάμε ρητή επιβεβαίωση.
    if (res.status === 409) {
      const d = await res.json();
      setBusy(false);
      setSaveIssues(d);
      return;
    }
    setSaveIssues(null);
    setBusy(false);
    if (res.ok) {
      const rd = await res.clone().json().catch(() => ({}));
      setMsg(
        rd.savedWithOverride
          ? `Αποθηκεύτηκε με ${rd.errors + rd.warnings} προειδοποιήσεις (καταγράφηκαν)`
          : "Αποθηκεύτηκε ✓"
      );
      setDirty(false);
      loadWeeks();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg("Σφάλμα αποθήκευσης: " + (d.error || res.status));
    }
  }

  // Δ: πραγματικές ώρες από τα ωράρια του καταστήματος (όχι βάρδιες × 8).
  const summaryOf = (empId) => employeeSummary(grid[empId] || [], stationShifts);

  // 3: ΙΔΙΑ κοινή λογική με generator και validator — καμία ξεχωριστή πράξη.
  const targetOf = (e) =>
    targetDays({
      employee: e,
      weeklyTarget: weeklyTargets[e.id],
      workDays: settingsCfg?.work_days || 6,
      leaveDays: (grid[e.id] || []).filter((c) => c === "Ο").length,
      leaveReplacesRest: settingsCfg?.leave_replaces_rest !== false,
    }).exact;

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Πρόγραμμα εργασίας</h1>
        <p className="sub">
          Εβδομάδα {fmtShort(days[0])} – {fmtShort(days[6])} ·{" "}
          {days[0].getFullYear()}
        </p>

        <div className="card noprint">
          <div className="toolbar">
            <button className="btn secondary" onClick={() => shiftWeek(-1)}>
              <IconPrev /> Προηγούμενη
            </button>
            <input
              type="date"
              value={week}
              onChange={(e) =>
                e.target.value &&
                setWeek(isoDate(mondayOf(new Date(e.target.value + "T00:00:00"))))
              }
            />
            <button className="btn secondary" onClick={() => shiftWeek(1)}>
              Επόμενη <IconNext />
            </button>

            <label className="f">
              Ιστορικό ({savedWeeks.length})
              <select
                value={savedWeeks.some((w) => w.week_start === week) ? week : ""}
                onChange={(e) => e.target.value && setWeek(e.target.value)}
              >
                <option value="">— αποθηκευμένες εβδομάδες —</option>
                {savedWeeks.map((w) => {
                  const m = new Date(w.week_start + "T00:00:00");
                  return (
                    <option key={w.week_start} value={w.week_start}>
                      {fmtShort(m)} – {fmtShort(addDays(m, 6))} ·{" "}
                      {m.getFullYear()}
                    </option>
                  );
                })}
              </select>
            </label>

            <span className="sep" />

            <button
              className="btn amber"
              onClick={generate}
              disabled={busy || (hasNightShift && (!nightPerson || !nextNight))}
              title={
                hasNightShift && (!nightPerson || !nextNight)
                  ? "Όρισε πρώτα βραδινό και επόμενο βραδινό"
                  : ""
              }
            >
              <IconGenerate /> Δημιουργία
            </button>
            <button className="btn" onClick={() => save(false)} disabled={busy || !dirty}>
              <IconSave /> Αποθήκευση
              {dirty && <span className="dot-dirty" />}
            </button>
            <button className="btn secondary" onClick={() => window.print()}>
              <IconPrint /> Εκτύπωση
            </button>

            <span className="morewrap">
              <button
                className="btn secondary"
                onClick={() => setMoreOpen(!moreOpen)}
                title="Περισσότερες ενέργειες"
              >
                ⋯
              </button>
              {moreOpen && (
                <div className="moremenu" onMouseLeave={() => setMoreOpen(false)}>
                  <button
                    onClick={() => { setMoreOpen(false); copyPrevious(); }}
                    disabled={!prevInfo?.grid}
                  >
                    <IconCopy /> Αντιγραφή προηγούμενης
                  </button>
                  <button
                    onClick={() => { setMoreOpen(false); undo(); }}
                    disabled={!history.length}
                  >
                    <IconUndo /> Αναίρεση{history.length ? ` (${history.length})` : ""}
                  </button>
                  <button onClick={() => { setMoreOpen(false); reloadSaved(); }}>
                    <IconRestore /> Επαναφορά αποθηκευμένου
                  </button>
                  <hr />
                  <button onClick={() => { setMoreOpen(false); setShowTargets(!showTargets); }}>
                    <IconUsers /> Μέρες ανά άτομο
                  </button>
                  <button onClick={() => { setMoreOpen(false); setShowReq(!showReq); }}>
                    <IconUsers /> Άτομα ανά μέρα
                  </button>
                </div>
              )}
            </span>

            {msg && (
              <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>
                {msg}
              </span>
            )}
          </div>

          {hasNightShift && (
            <div className="nightcard">
              <div className="nc-head">
                <IconMoon width={15} height={15} />
                <strong>Κύκλος νυχτερινής</strong>
                {prevInfo &&
                  (() => {
                    const m = new Date(week + "T00:00:00");
                    m.setDate(m.getDate() - 7);
                    return prevInfo.week_start === isoDate(m) ? (
                      <span className="nc-prev">
                        προηγούμενη: {nameOf(prevInfo.night_person) || "—"}
                      </span>
                    ) : (
                      <span className="nc-prev warn-text">
                        η προηγούμενη εβδομάδα δεν είναι αποθηκευμένη
                      </span>
                    );
                  })()}
              </div>

              <div className="nc-flow">
                <div className={"nc-slot" + (nightPerson ? " filled" : "")}>
                  <span className="nc-label">Δευ – Σάβ</span>
                  <select
                    value={nightPerson}
                    onChange={(e) => {
                      setNightPerson(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="">— διάλεξε —</option>
                    {nightCandidates.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <span className="nc-note">6 νύχτες, ρεπό Κυριακή</span>
                </div>

                <IconNext width={18} height={18} />

                <div className={"nc-slot" + (nextNight ? " filled" : "")}>
                  <span className="nc-label">Κυριακή κι έπειτα</span>
                  <select
                    value={nextNight}
                    onChange={(e) => {
                      setNextNight(e.target.value);
                      setDirty(true);
                    }}
                  >
                    <option value="">— διάλεξε —</option>
                    {nightCandidates
                      .filter((e) => e.id !== nightPerson)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                  <span className="nc-note">ρεπό Σάββατο, μπαίνει Κυριακή</span>
                </div>
              </div>

              {!nightCandidates.length && (
                <div className="nc-empty">
                  Κανένας υπάλληλος δεν έχει τη νυχτερινή (Β) στις βάρδιές του.
                  Πήγαινε στο «Προσωπικό» και τσέκαρε το <strong>Β</strong> σε
                  όσους κάνουν νύχτες.
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {!editMode ? (
              <button
                className="btn secondary"
                onClick={() => setEditMode(true)}
              >
                ✎ Επεξεργασία με το χέρι
              </button>
            ) : (
              <div className="editbar">
                <span className="editnow">
                  {selected && selected !== "×"
                    ? <>Τώρα βάζεις: <strong>{selected}</strong>{SHIFTS[selected]?.hours ? ` (${SHIFTS[selected].hours})` : ""}</>
                    : selected === "×"
                    ? "Τώρα καθαρίζεις κελιά"
                    : "Διάλεξε βάρδια από την παλέτα"}
                </span>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setEditMode(false);
                    setSelected(null);
                  }}
                >
                  Τέλος επεξεργασίας
                </button>
              </div>
            )}
            <div className="palette" style={{ display: editMode ? "flex" : "none", marginTop: 10 }}>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                Διάλεξε βάρδια και πάτα στα κελιά:
              </span>
              {PAINTABLE.map((c) => (
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
          </div>

          {showTargets && (
            <div style={{ marginTop: 14 }}>
              <p className="sub" style={{ margin: "0 0 8px" }}>
                Ακριβής αριθμός ημερών για τους <strong>part-time</strong>,
                μόνο για αυτή την εβδομάδα. Κενό = ισχύει το εύρος του προφίλ.
                Η σύμβαση δεν αλλάζει.
              </p>
              <div className="tgrid">
                {schedulableEmployees
                  .filter((e) => e.employment_type === "part")
                  .map((e) => (
                  <div className="req-item" key={e.id}>
                    <span className="req-label">
                      {e.name}
                      {e.employment_type === "part" && (
                        <span className="req-hours">
                          {e.min_days}–{e.max_days}
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={7}
                      placeholder="—"
                      value={weeklyTargets[e.id] ?? ""}
                      onChange={(ev) => {
                        setWeeklyTargets({
                          ...weeklyTargets,
                          [e.id]: ev.target.value,
                        });
                        setDirty(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {showReq && effectiveDayReq && (
            <div style={{ marginTop: 14 }}>
              <p className="sub" style={{ margin: "0 0 8px" }}>
                Άτομα ανά βάρδια <strong>μόνο για αυτή την εβδομάδα</strong> —
                π.χ. μέρα με κίνηση ή χειμωνιάτικο μοτίβο. Οι Ρυθμίσεις δεν
                αλλάζουν. Ισχύει στο επόμενο «Δημιουργία προγράμματος».
              </p>
              <div className="gridwrap">
                <table className="sched">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", paddingLeft: 10 }}>
                        Βάρδια
                      </th>
                      {days.map((d, i) => (
                        <th key={i}>
                          {DAY_NAMES[i]}
                          <div className="d">{fmtShort(d)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(SHIFTS)
                      .filter((c) => c !== "Β" && c !== "Ρ" && c !== "Ο")
                      .map((c) => (
                        <tr key={c}>
                          <td
                            className="name"
                            style={{ background: SHIFTS[c].bg, color: SHIFTS[c].ink }}
                          >
                            {c} <small>{SHIFTS[c].hours}</small>
                          </td>
                          {effectiveDayReq.map((r, d) => (
                            <td key={d} style={{ padding: 3 }}>
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={r[c] ?? 0}
                                onChange={(e) => {
                                  const next = effectiveDayReq.map((x) => ({ ...x }));
                                  const v = Number(e.target.value) || 0;
                                  if (v > 0) next[d][c] = v;
                                  else delete next[d][c];
                                  setDayReq(next);
                                  setDirty(true);
                                }}
                                style={{ width: 52, padding: "6px 4px", textAlign: "center" }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {dayReq && (
                <button
                  className="btn secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setDayReq(null);
                    setDirty(true);
                  }}
                >
                  Επαναφορά στις Ρυθμίσεις
                </button>
              )}
            </div>
          )}

          {(check?.groups?.length > 0 || warnings.length > 0) && (
            <div className={"checks" + (check?.errors ? " has-error" : "")}>
              <div className="checks-head">
                <IconWarn width={15} height={15} />
                <strong>Έλεγχος προγράμματος</strong>
                {check?.errors > 0 && (
                  <span className="chk-badge err">{check.errors} σοβαρά</span>
                )}
                {check?.warnings > 0 && (
                  <span className="chk-badge warnb">{check.warnings} προσοχή</span>
                )}
              </div>

              {check?.groups.map((g) => (
                <div className={"chk-group " + g.level} key={g.key}>
                  <div className="chk-title">{g.title}</div>
                  <ul>
                    {g.items.slice(0, 8).map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                    {g.items.length > 8 && (
                      <li className="chk-more">…και {g.items.length - 8} ακόμη</li>
                    )}
                  </ul>
                </div>
              ))}

              {warnings.length > 0 && (
                <div className="chk-group note">
                  <div className="chk-title">Σημειώσεις από την τελευταία δημιουργία</div>
                  <ul>
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {check && !check.groups.length && warnings.length === 0 && (
            <div className="checks ok">
              <div className="checks-head">
                <strong>✓ Το πρόγραμμα δεν έχει προβλήματα</strong>
              </div>
            </div>
          )}
        </div>

        {saveIssues && (
          <div className="modal-back" onClick={() => setSaveIssues(null)}>
            <div className="modal" onClick={(ev) => ev.stopPropagation()}>
              <h3>
                Το πρόγραμμα περιέχει{" "}
                {saveIssues.errors + saveIssues.warnings} προειδοποιήσεις.
              </h3>
              <div className="modal-body">
                {saveIssues.groups?.map((g) => (
                  <div className={"chk-group " + g.level} key={g.key}>
                    <div className="chk-title">{g.title}</div>
                    <ul>
                      {g.items.slice(0, 6).map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                      {g.items.length > 6 && (
                        <li className="chk-more">…και {g.items.length - 6} ακόμη</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button className="btn secondary" onClick={() => setSaveIssues(null)}>
                  Επιστροφή για διόρθωση
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSaveIssues(null);
                    save(true);
                  }}
                >
                  Αποθήκευση παρ’ όλα αυτά
                </button>
              </div>
              <p className="modal-note">
                Με «Αποθήκευση παρ’ όλα αυτά» οι προειδοποιήσεις καταγράφονται
                μαζί με το πρόγραμμα.
              </p>
            </div>
          </div>
        )}

        <div className="print-only print-head">
          <div className="ph-brand">
            <Logo size={26} />
            <span className="ph-station">{stationName || "ΠΡΑΤΗΡΙΟ"}</span>
          </div>
          <h2>ΕΒΔΟΜΑΔΙΑΙΟ ΠΡΟΓΡΑΜΜΑ ΕΡΓΑΣΙΑΣ</h2>
          <div className="ph-period">
            {fmtShort(days[0])} – {fmtShort(days[6])} · {days[0].getFullYear()}
          </div>
        </div>

        <div className="card gridwrap desktop-sched">
          <table className="sched">
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingLeft: 10 }}>
                  Υπάλληλος
                </th>
                {days.map((d, i) => (
                  <th key={i}>
                    {DAY_NAMES[i]}
                    <div className="d">{fmtShort(d)}</div>
                  </th>
                ))}
                <th className="noprint">Μέρες / Ώρες</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map((e) => (
                <tr key={e.id}>
                  <td className="name">
                    {e.name}{" "}
                    {e.employment_type === "part" && <small>(pt)</small>}
                    {e.deactivated_at && (
                      <small className="inactive-tag">ανενεργός</small>
                    )}
                  </td>
                  {days.map((_, d) => {
                    const code = (grid[e.id] || [])[d] || "";
                    const s = SHIFTS[code];
                    const issues = check?.cells?.[`${e.id}:${d}`] || [];
                    const lvl = issues.some((i) => i.level === "error")
                      ? "error"
                      : issues.some((i) => i.level === "forbidden")
                      ? "forbidden"
                      : issues.some((i) => i.level === "fixed")
                      ? "fixed"
                      : issues.some((i) => i.level === "night")
                      ? "night"
                      : issues.some((i) => i.level === "info")
                      ? "info"
                      : "";
                    const tip = issues.length
                      ? issues.map((i) => i.reason).join(" · ")
                      : s
                      ? `${s.label} ${s.hours}`
                      : "";
                    return (
                      <td
                        key={d}
                        className={lvl ? "cell-" + lvl : undefined}
                        style={s ? { background: s.bg } : undefined}
                      >
                        <button
                          className="cell"
                          style={s ? { color: s.ink } : undefined}
                          onClick={() => paint(e.id, d)}
                          title={tip}
                        >
                          {code}
                          {lvl === "fixed" && <span className="cmark">🔒</span>}
                          {lvl === "night" && <span className="cmark">☾</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className="noprint sumcell">
                    {(() => {
                      const sm = summaryOf(e.id);
                      const tg = targetOf(e);
                      const bad = tg != null && sm.workDays !== tg;
                      return (
                        <>
                          <span className={"sum-days" + (bad ? " bad" : "")}>
                            {sm.workDays}
                            {tg != null ? `/${tg}` : ""}
                          </span>
                          <span className="sum-hours">{sm.hours}ω</span>
                        </>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {activeEmployees.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty">
                      <IconUsers width={38} height={38} strokeWidth={1.4} />
                      <strong>Δεν υπάρχουν ενεργοί υπάλληλοι</strong>
                      <p>
                        Πήγαινε στο «Προσωπικό» και πρόσθεσε την ομάδα σου. Μόλις
                        υπάρχει προσωπικό, το πρόγραμμα βγαίνει αυτόματα.
                      </p>
                      <a className="btn" href="/employees">
                        Άνοιγμα Προσωπικού
                      </a>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="print-only print-foot">
          <div className="pf-legend">
            {Object.keys(SHIFTS)
              .filter((c) => SHIFTS[c].hours)
              .map((c) => (
                <span className="pf-item" key={c}>
                  <span
                    className="pf-chip"
                    style={{ background: SHIFTS[c].bg, color: SHIFTS[c].ink }}
                  >
                    {c}
                  </span>
                  {SHIFTS[c].hours}
                </span>
              ))}
            <span className="pf-item">
              <span className="pf-chip" style={{ background: SHIFTS["Ρ"].bg, color: SHIFTS["Ρ"].ink }}>
                Ρ
              </span>
              Ρεπό
            </span>
            <span className="pf-item">
              <span className="pf-chip" style={{ background: SHIFTS["Ο"].bg, color: SHIFTS["Ο"].ink }}>
                Ο
              </span>
              Άδεια
            </span>
          </div>
          <div className="pf-sign">
            <div>
              <div className="pf-line" />
              Υπεύθυνος καταστήματος
            </div>
            <div className="pf-date">
              Εκδόθηκε:{" "}
              {new Date().toLocaleDateString("el-GR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </div>
          </div>
        </div>

        <div className="card mobile-sched">
          <div className="day-tabs">
            {days.map((d, i) => (
              <button
                key={i}
                className={"day-tab" + (mobileDay === i ? " on" : "")}
                onClick={() => setMobileDay(i)}
              >
                {DAY_NAMES[i]}
                <span>{fmtShort(d)}</span>
              </button>
            ))}
          </div>
          {activeEmployees.map((e) => {
            const code = (grid[e.id] || [])[mobileDay] || "";
            const s = SHIFTS[code];
            return (
              <button
                key={e.id}
                className="mrow"
                onClick={() => paint(e.id, mobileDay)}
              >
                <span className="mname">
                  {e.name}
                  {e.employment_type === "part" && (
                    <small> (pt)</small>
                  )}
                </span>
                <span
                  className="mshift"
                  style={
                    s
                      ? { background: s.bg, color: s.ink }
                      : { border: "1px dashed var(--line)", color: "var(--muted)" }
                  }
                >
                  {code || "—"}
                  {s && s.hours ? <small>{s.hours}</small> : null}
                </span>
              </button>
            );
          })}
          {activeEmployees.length === 0 && (
            <div className="empty">
              <IconUsers width={38} height={38} strokeWidth={1.4} />
              <strong>Δεν υπάρχουν ενεργοί υπάλληλοι</strong>
              <p>Πρόσθεσε προσωπικό για να βγει πρόγραμμα.</p>
              <a className="btn" href="/employees">
                Άνοιγμα Προσωπικού
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
