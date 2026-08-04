"use client";
import { useEffect, useState } from "react";
import Nav from "@/lib/Nav";
import { allShifts, DEFAULT_SHIFTS } from "@/lib/shifts";

function ReqEditor({ title, note, req, onChange, SHIFTS }) {
  const codes = Object.keys(SHIFTS).filter(
    (c) => c !== "Β" && c !== "Ρ" && c !== "Ο"
  );
  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{title}</h2>
      <p className="sub" style={{ marginBottom: 12 }}>{note}</p>
      <div className="reqgrid">
        {codes.map((c) => (
          <label className="f" key={c}>
            <span>
              <strong
                style={{
                  background: SHIFTS[c].bg,
                  color: SHIFTS[c].ink,
                  borderRadius: 6,
                  padding: "2px 7px",
                  marginRight: 6,
                }}
              >
                {c}
              </strong>
              {SHIFTS[c].hours}
            </span>
            <input
              type="number"
              min={0}
              max={6}
              value={req[c] ?? 0}
              onChange={(e) =>
                onChange({ ...req, [c]: Number(e.target.value) || 0 })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function NewShiftRow({ onAdd }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("14:00");
  return (
    <div className="rowline" style={{ background: "#fbfaf6", borderRadius: 10, padding: 10 }}>
      <label className="f">
        Νέος κωδικός
        <input type="text" maxLength={3} value={code} onChange={(e) => setCode(e.target.value.trim())} style={{ width: 70 }} />
      </label>
      <label className="f">
        Όνομα
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: 150 }} />
      </label>
      <label className="f">
        Έναρξη
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="f">
        Λήξη
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <button
        className="btn secondary"
        onClick={() => {
          const [sh, sm] = start.split(":").map(Number);
          const [eh, em] = end.split(":").map(Number);
          let st = sh + sm / 60;
          let en = eh + em / 60;
          if (en <= st) en += 24;
          onAdd(code, label || code, st, en);
          setCode("");
          setLabel("");
        }}
      >
        + Προσθήκη βάρδιας
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [weekday, setWeekday] = useState({});
  const [sunday, setSunday] = useState({});
  const [workDays, setWorkDays] = useState(6);
  const [maxPerShift, setMaxPerShift] = useState(4);
  const [shiftDefs, setShiftDefs] = useState(null); // {code:{label,start,end}}
  const SHIFTS = allShifts(shiftDefs);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setWeekday(d.settings?.weekday_req || {});
        setSunday(d.settings?.sunday_req || {});
        setWorkDays(d.settings?.work_days || 6);
        setMaxPerShift(d.settings?.max_per_shift || 4);
        const sh = d.settings?.shifts;
        setShiftDefs(sh && Object.keys(sh).length ? sh : { ...DEFAULT_SHIFTS });
      });
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekday_req: weekday,
        sunday_req: sunday,
        work_days: workDays,
        max_per_shift: maxPerShift,
        shifts: shiftDefs,
      }),
    });
    setBusy(false);
    setMsg(res.ok ? "Αποθηκεύτηκε ✓" : "Σφάλμα αποθήκευσης");
  }

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Ρυθμίσεις κάλυψης</h1>
        <p className="sub">
          Πόσα άτομα χρειάζονται σε κάθε βάρδια. Ο βραδινός (Β) δεν ορίζεται
          εδώ — μπαίνει από την εναλλαγή βραδινού στη σελίδα του προγράμματος.
        </p>

        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Γενικοί κανόνες</h2>
          <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 10 }}>
            <label className="f">
              Εργάσιμες μέρες / εβδομάδα (πλήρους)
              <select
                value={workDays}
                onChange={(e) => setWorkDays(Number(e.target.value))}
              >
                <option value={6}>Εξαήμερο (6 + 1 ρεπό)</option>
                <option value={5}>Πενθήμερο (5 + 2 ρεπό)</option>
              </select>
            </label>
            <label className="f">
              Μέγιστα άτομα ταυτόχρονα στη βάρδια
              <input
                type="number"
                min={1}
                max={8}
                value={maxPerShift}
                onChange={(e) => setMaxPerShift(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <p className="sub" style={{ margin: "10px 0 0" }}>
            Οι πλήρους απασχόλησης βγαίνουν αυστηρά τόσες μέρες: όποιος
            περισσεύει από τις ελάχιστες απαιτήσεις μπαίνει ως επιπλέον άτομο
            σε βάρδια (μέχρι το μέγιστο), όχι σε δεύτερο ρεπό.
          </p>
        </div>

        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Βάρδιες &amp; ωράρια</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            Οι βάρδιες του δικού σου καταστήματος — κωδικός, όνομα, ώρες. Το Β
            (νυχτερινή) δεν αφαιρείται. Για βάρδια που ξημερώνει, βάλε λήξη
            μικρότερη από την έναρξη (π.χ. 22:00–06:00).
          </p>
          {shiftDefs &&
            Object.entries(shiftDefs).map(([code, def]) => (
              <div className="rowline" key={code} style={{ padding: "8px 0" }}>
                <strong
                  style={{
                    background: SHIFTS[code]?.bg,
                    color: SHIFTS[code]?.ink,
                    borderRadius: 7,
                    padding: "5px 10px",
                    minWidth: 42,
                    textAlign: "center",
                  }}
                >
                  {code}
                </strong>
                <label className="f">
                  Όνομα
                  <input
                    type="text"
                    value={def.label || ""}
                    onChange={(e) =>
                      setShiftDefs({
                        ...shiftDefs,
                        [code]: { ...def, label: e.target.value },
                      })
                    }
                    style={{ width: 150 }}
                  />
                </label>
                <label className="f">
                  Έναρξη
                  <input
                    type="time"
                    value={`${String(Math.floor(def.start % 24)).padStart(2, "0")}:${String(Math.round(((def.start % 1) || 0) * 60)).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      setShiftDefs({
                        ...shiftDefs,
                        [code]: { ...def, start: h + m / 60 },
                      });
                    }}
                  />
                </label>
                <label className="f">
                  Λήξη
                  <input
                    type="time"
                    value={`${String(Math.floor(def.end % 24)).padStart(2, "0")}:${String(Math.round(((def.end % 1) || 0) * 60)).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      let en = h + m / 60;
                      if (en <= def.start) en += 24;
                      setShiftDefs({
                        ...shiftDefs,
                        [code]: { ...def, end: en },
                      });
                    }}
                  />
                </label>
                {code !== "Β" && (
                  <button
                    className="btn danger"
                    style={{ padding: "6px 12px" }}
                    onClick={() => {
                      const next = { ...shiftDefs };
                      delete next[code];
                      setShiftDefs(next);
                    }}
                  >
                    Αφαίρεση
                  </button>
                )}
              </div>
            ))}
          <NewShiftRow
            onAdd={(code, label, start, end) => {
              if (!code || shiftDefs[code] || code === "Ρ" || code === "Ο") return;
              setShiftDefs({ ...shiftDefs, [code]: { label, start, end } });
            }}
          />
          <p className="sub" style={{ margin: "8px 0 0" }}>
            Μετά από αλλαγές εδώ, πάτα «Αποθήκευση ρυθμίσεων» κάτω και έλεγξε τα
            άτομα ανά βάρδια στους πίνακες που ακολουθούν.
          </p>
        </div>

        <ReqEditor
          title="Δευτέρα – Σάββατο"
          note="Το βασικό μοτίβο: 3×Π + 1×Π4 το πρωί, 3×Α το απόγευμα, 1×Α3 που αλλάζει τον Π4 στις 18:00 και μένει με τον βραδινό ως τις 02:00."
          req={weekday}
          onChange={setWeekday}
          SHIFTS={SHIFTS}
        />
        <ReqEditor
          title="Κυριακή"
          note="Την Κυριακή το Π2 (08:00–16:00) αντικαθιστά το Π4 και το Α2 (16:00–00:00) το Α3. Ο βραδινός μένει μόνος 00:00–06:00."
          req={sunday}
          onChange={setSunday}
          SHIFTS={SHIFTS}
        />

        <div className="toolbar">
          <button className="btn" onClick={save} disabled={busy}>
            Αποθήκευση ρυθμίσεων
          </button>
          {msg && (
            <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
