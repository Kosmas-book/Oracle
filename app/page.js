"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/lib/Nav";
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

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active),
    [employees]
  );
  const nightCandidates = useMemo(
    () => activeEmployees.filter((e) => e.night_rotation),
    [activeEmployees]
  );

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees || []));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setStationShifts(d.settings?.shifts || null);
        setBaseReqs({
          weekday: d.settings?.weekday_req || {},
          sunday: d.settings?.sunday_req || {},
        });
      });
    loadWeeks();
  }, []);

  function loadWeeks() {
    fetch("/api/schedule?list=1")
      .then((r) => r.json())
      .then((d) => setSavedWeeks(d.weeks || []));
  }

  useEffect(() => {
    setMsg("");
    setWarnings([]);
    fetch(`/api/schedule?week=${week}`)
      .then((r) => r.json())
      .then((d) => {
        setPrevInfo(d.prev || null);
        if (d.schedule) {
          setGrid(d.schedule.grid || {});
          setNightPerson(d.schedule.night_person || "");
          setNextNight(d.schedule.next_night_person || "");
          setDayReq(
            Array.isArray(d.schedule.day_req) && d.schedule.day_req.length === 7
              ? d.schedule.day_req
              : null
          );
          setDirty(false);
        } else {
          setDayReq(null);
          setGrid({});
          // Προτεινόμενη συνέχεια από την προηγούμενη εβδομάδα:
          // ο "επόμενος βραδινός" της προηγούμενης γίνεται ο τρέχων.
          setNightPerson(d.prev?.next_night_person || "");
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
    if (selected === null) return;
    setGrid((g) => {
      const row = [...(g[empId] || ["", "", "", "", "", "", ""])];
      row[d] = selected === "×" ? "" : selected;
      return { ...g, [empId]: row };
    });
    setDirty(true);
  }

  async function generate() {
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
    setDirty(true);
  }

  async function save() {
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
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Αποθηκεύτηκε ✓");
      setDirty(false);
      loadWeeks();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg("Σφάλμα αποθήκευσης: " + (d.error || res.status));
    }
  }

  function hoursOf(empId) {
    const row = grid[empId] || [];
    return row.filter((c) => c && c !== "Ρ" && c !== "Ο").length * 8;
  }

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
              ← Προηγούμενη
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
              Επόμενη →
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

            <label className="f">
              Βραδινός Δευ–Σάβ
              <select
                value={nightPerson}
                onChange={(e) => {
                  setNightPerson(e.target.value);
                  setDirty(true);
                }}
              >
                <option value="">— κανείς —</option>
                {nightCandidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="f">
              Επόμενος βραδινός (μπαίνει Κυριακή)
              <select
                value={nextNight}
                onChange={(e) => {
                  setNextNight(e.target.value);
                  setDirty(true);
                }}
              >
                <option value="">— κανείς —</option>
                {nightCandidates
                  .filter((e) => e.id !== nightPerson)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>

            <button
              className="btn amber"
              onClick={generate}
              disabled={busy || !nightPerson || !nextNight}
              title={
                !nightPerson || !nextNight
                  ? "Όρισε πρώτα βραδινό και επόμενο βραδινό"
                  : ""
              }
            >
              ⚙ Δημιουργία προγράμματος
            </button>
            {prevInfo && (
              <span style={{ fontSize: 12.5, color: "var(--muted)", flexBasis: "100%" }}>
                {(() => {
                  const m = new Date(week + "T00:00:00");
                  m.setDate(m.getDate() - 7);
                  const adj = prevInfo.week_start === isoDate(m);
                  const nameOf = (id) =>
                    employees.find((x) => x.id === id)?.name || "—";
                  return adj
                    ? `Από την περασμένη εβδομάδα: βραδινός ήταν ο/η ${nameOf(prevInfo.night_person)} (παίρνει Ρ τη Δευτέρα) · μπήκε Κυριακή ο/η ${nameOf(prevInfo.next_night_person)}.`
                    : `⚠ Η αμέσως προηγούμενη εβδομάδα δεν είναι αποθηκευμένη — τα ρεπό μετά τα βραδινά δεν θα μπουν αυτόματα.`;
                })()}
              </span>
            )}
            {(!nightPerson || !nextNight) && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Για τη δημιουργία χρειάζονται βραδινός <em>και</em> επόμενος
                βραδινός.
              </span>
            )}
            <button className="btn" onClick={save} disabled={busy || !dirty}>
              Αποθήκευση
            </button>
            <button className="btn secondary" onClick={() => window.print()}>
              🖨 Εκτύπωση
            </button>
            <button
              className="btn secondary"
              onClick={() => setShowReq(!showReq)}
            >
              👥 Άτομα ανά μέρα {dayReq ? "(αλλαγμένα)" : ""}
            </button>
            {msg && (
              <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>
                {msg}
              </span>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="palette">
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                Διόρθωση με το χέρι — διάλεξε βάρδια και πάτα στα κελιά:
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

          {warnings.length > 0 && (
            <div className="warn">
              <strong>Προσοχή — θέλει χειροκίνητο έλεγχο:</strong>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
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
                <th className="noprint">Ώρες</th>
              </tr>
            </thead>
            <tbody>
              {activeEmployees.map((e) => (
                <tr key={e.id}>
                  <td className="name">
                    {e.name}{" "}
                    {e.employment_type === "part" && <small>(pt)</small>}
                  </td>
                  {days.map((_, d) => {
                    const code = (grid[e.id] || [])[d] || "";
                    const s = SHIFTS[code];
                    return (
                      <td
                        key={d}
                        style={s ? { background: s.bg } : undefined}
                      >
                        <button
                          className="cell"
                          style={s ? { color: s.ink } : undefined}
                          onClick={() => paint(e.id, d)}
                          title={s ? `${s.label} ${s.hours}` : ""}
                        >
                          {code}
                        </button>
                      </td>
                    );
                  })}
                  <td className="noprint" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {hoursOf(e.id)}
                  </td>
                </tr>
              ))}
              {activeEmployees.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 16, textAlign: "center" }}>
                    Δεν υπάρχουν ενεργοί υπάλληλοι — πρόσθεσέ τους στο
                    «Προσωπικό».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            <p>Δεν υπάρχουν ενεργοί υπάλληλοι.</p>
          )}
        </div>
      </div>
    </>
  );
}
