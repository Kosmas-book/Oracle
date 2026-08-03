"use client";
import { useEffect, useState } from "react";
import Nav from "@/lib/Nav";
import { SHIFTS, REQUIRABLE } from "@/lib/shifts";

function ReqEditor({ title, note, req, onChange }) {
  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{title}</h2>
      <p className="sub" style={{ marginBottom: 12 }}>{note}</p>
      <div className="reqgrid">
        {REQUIRABLE.map((c) => (
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

export default function SettingsPage() {
  const [weekday, setWeekday] = useState({});
  const [sunday, setSunday] = useState({});
  const [workDays, setWorkDays] = useState(6);
  const [maxPerShift, setMaxPerShift] = useState(5);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setWeekday(d.settings?.weekday_req || {});
        setSunday(d.settings?.sunday_req || {});
        setWorkDays(d.settings?.work_days || 6);
        setMaxPerShift(d.settings?.max_per_shift || 5);
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

        <ReqEditor
          title="Δευτέρα – Σάββατο"
          note="Το βασικό μοτίβο: 3×Π + 1×Π4 το πρωί, 3×Α το απόγευμα, 1×Α3 που αλλάζει τον Π4 στις 18:00 και μένει με τον βραδινό ως τις 02:00."
          req={weekday}
          onChange={setWeekday}
        />
        <ReqEditor
          title="Κυριακή"
          note="Την Κυριακή το Π2 (08:00–16:00) αντικαθιστά το Π4 και το Α2 (16:00–00:00) το Α3. Ο βραδινός μένει μόνος 00:00–06:00."
          req={sunday}
          onChange={setSunday}
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
