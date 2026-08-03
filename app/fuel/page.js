"use client";
import { useEffect, useState } from "react";
import Nav from "@/lib/Nav";
import { isoDate } from "@/lib/shifts";

const FUELS = [
  { key: "unl95", label: "Αμόλυβδη 95" },
  { key: "unl100", label: "Αμόλυβδη 100" },
  { key: "diesel", label: "Diesel κίνησης" },
  { key: "lpg", label: "Υγραέριο" },
];

export default function FuelPage() {
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [vals, setVals] = useState({});
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/fuel")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []));
  }
  useEffect(load, []);

  async function save() {
    setBusy(true);
    setMsg("");
    const liters = {};
    for (const f of FUELS) {
      const v = parseFloat(String(vals[f.key]).replace(",", "."));
      if (!isNaN(v)) liters[f.key] = v;
    }
    const res = await fetch("/api/fuel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_date: date, liters, notes }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Καταχωρήθηκε ✓");
      setVals({});
      setNotes("");
      load();
    } else {
      setMsg("Σφάλμα καταχώρησης");
    }
  }

  async function del(d) {
    if (!confirm(`Διαγραφή εγγραφής ${d};`)) return;
    await fetch(`/api/fuel?date=${d}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Πωλήσεις καυσίμων</h1>
        <p className="sub">
          Καθημερινή καταχώρηση λίτρων από το Δελτίο Ισοζυγίου. Όταν μαζευτούν
          3–4 εβδομάδες δεδομένα, θα προστεθεί εδώ η πρόβλεψη παραγγελίας ανά
          ημέρα εβδομάδας.
        </p>

        <div className="card">
          <div className="toolbar" style={{ alignItems: "flex-end" }}>
            <label className="f">
              Ημερομηνία
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {FUELS.map((f) => (
              <label className="f" key={f.key}>
                {f.label} (λίτρα)
                <input
                  type="text"
                  inputMode="decimal"
                  value={vals[f.key] ?? ""}
                  onChange={(e) =>
                    setVals({ ...vals, [f.key]: e.target.value })
                  }
                  style={{ width: 110 }}
                />
              </label>
            ))}
            <label className="f">
              Σημειώσεις
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ minWidth: 160 }}
              />
            </label>
            <button className="btn amber" onClick={save} disabled={busy}>
              Καταχώρηση
            </button>
            {msg && (
              <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>
                {msg}
              </span>
            )}
          </div>
        </div>

        <div className="card gridwrap">
          <table className="sched">
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingLeft: 10 }}>Ημ/νία</th>
                {FUELS.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>Σημειώσεις</th>
                <th className="noprint"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.entry_date}>
                  <td className="name">{e.entry_date}</td>
                  {FUELS.map((f) => (
                    <td key={f.key} style={{ padding: "6px 8px" }}>
                      {e.liters?.[f.key] ?? "—"}
                    </td>
                  ))}
                  <td style={{ padding: "6px 8px", fontSize: 13 }}>
                    {e.notes || ""}
                  </td>
                  <td className="noprint" style={{ padding: 4 }}>
                    <button
                      className="btn danger"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => del(e.entry_date)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, textAlign: "center" }}>
                    Καμία καταχώρηση ακόμα.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
