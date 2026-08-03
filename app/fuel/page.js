"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/lib/Nav";
import { isoDate, addDays, fmtShort, DAY_NAMES } from "@/lib/shifts";
import * as XLSX from "xlsx";

const FUELS = [
  { key: "unl100", label: "Αμόλυβδη 100" },
  { key: "unl98", label: "Αμόλυβδη 98" },
  { key: "unl95", label: "Αμόλυβδη 95" },
  { key: "diesel", label: "Diesel" },
  { key: "diesel_avio", label: "Diesel Avio" },
];

// Ημερομηνία από Excel: σειριακός αριθμός ή κείμενο (dd/mm/yyyy, yyyy-mm-dd).
function excelToISO(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Αριθμός με ελληνική μορφή (1.234,56) ή αγγλική (1,234.56 / 1234.56).
function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "");
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export default function FuelPage() {
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [vals, setVals] = useState({});
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Εισαγωγή Excel
  const [sheetRows, setSheetRows] = useState(null); // array of arrays
  const [mapping, setMapping] = useState({});
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

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
      const v = toNum(vals[f.key]);
      if (v != null) liters[f.key] = v;
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
    } else setMsg("Σφάλμα καταχώρησης");
  }

  async function del(d) {
    if (!confirm(`Διαγραφή εγγραφής ${d};`)) return;
    await fetch(`/api/fuel?date=${d}`, { method: "DELETE" });
    load();
  }

  function onFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: "",
        });
        if (!rows.length) {
          setImportMsg("Το φύλλο είναι άδειο.");
          return;
        }
        setSheetRows(rows.slice(0, 500));
        // Αυτόματη μαντεψιά αντιστοίχισης από τις επικεφαλίδες.
        const head = rows[0].map((h) => String(h).toLowerCase());
        const guess = {
          date: -1,
          unl100: -1,
          unl98: -1,
          unl95: -1,
          diesel: -1,
          diesel_avio: -1,
        };
        head.forEach((h, i) => {
          if (guess.date < 0 && /ημερ|date|ημ\/νια/.test(h)) guess.date = i;
          if (guess.unl100 < 0 && /100/.test(h)) guess.unl100 = i;
          if (guess.unl98 < 0 && /98/.test(h)) guess.unl98 = i;
          if (guess.unl95 < 0 && /95/.test(h)) guess.unl95 = i;
          // Πρώτα το Avio — αλλιώς το «diesel avio» θα έπιανε το σκέτο diesel.
          if (guess.diesel_avio < 0 && /avio|αβιο/.test(h)) guess.diesel_avio = i;
          else if (guess.diesel < 0 && /diesel|πετρ|ντιζ|ντηζ/.test(h))
            guess.diesel = i;
        });
        if (guess.date < 0) guess.date = 0;
        setMapping(guess);
        setImportMsg("");
      } catch (err) {
        setImportMsg("Δεν διαβάστηκε το αρχείο: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    ev.target.value = "";
  }

  async function doImport() {
    if (!sheetRows) return;
    setImporting(true);
    setImportMsg("");
    const out = [];
    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const d = excelToISO(row[mapping.date]);
      if (!d) continue;
      const liters = {};
      for (const f of FUELS) {
        const col = mapping[f.key];
        if (col == null || col < 0) continue;
        const n = toNum(row[col]);
        if (n != null) liters[f.key] = n;
      }
      if (Object.keys(liters).length) out.push({ entry_date: d, liters });
    }
    if (!out.length) {
      setImporting(false);
      setImportMsg(
        "Δεν βρέθηκαν έγκυρες γραμμές — έλεγξε την αντιστοίχιση στηλών."
      );
      return;
    }
    const res = await fetch("/api/fuel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: out }),
    });
    const d = await res.json();
    setImporting(false);
    if (res.ok) {
      setImportMsg(`Εισήχθησαν ${d.imported} μέρες ✓`);
      setSheetRows(null);
      load();
    } else setImportMsg("Σφάλμα: " + (d.error || res.status));
  }

  // Πρόβλεψη: μέσος όρος ανά ημέρα εβδομάδας (οι 4 πιο πρόσφατες εμφανίσεις).
  const forecast = useMemo(() => {
    if (entries.length < 14) return null;
    const sorted = [...entries].sort((a, b) =>
      a.entry_date < b.entry_date ? -1 : 1
    );
    const byWeekday = {}; // wd -> fuel -> [τιμές, πιο πρόσφατες πρώτα]
    for (let i = sorted.length - 1; i >= 0; i--) {
      const e = sorted[i];
      const wd = (new Date(e.entry_date + "T00:00:00").getDay() + 6) % 7;
      byWeekday[wd] = byWeekday[wd] || {};
      for (const f of FUELS) {
        const v = e.liters?.[f.key];
        if (v == null) continue;
        byWeekday[wd][f.key] = byWeekday[wd][f.key] || [];
        if (byWeekday[wd][f.key].length < 4) byWeekday[wd][f.key].push(v);
      }
    }
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1));
    const perFuel = {};
    for (const f of FUELS) {
      perFuel[f.key] = days.map((d) => {
        const wd = (d.getDay() + 6) % 7;
        const arr = byWeekday[wd]?.[f.key];
        if (!arr || !arr.length) return null;
        return arr.reduce((s, x) => s + x, 0) / arr.length;
      });
    }
    return { days, perFuel, count: sorted.length, from: sorted[0].entry_date, to: sorted[sorted.length - 1].entry_date };
  }, [entries]);

  const fmt = (n) =>
    n == null ? "—" : Math.round(n).toLocaleString("el-GR");

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Πωλήσεις καυσίμων</h1>
        <p className="sub">
          Καταχώρηση λίτρων ανά μέρα — χειροκίνητα ή με εισαγωγή Excel — και
          πρόβλεψη ανά ημέρα εβδομάδας για την παραγγελία.
        </p>

        {forecast && (
          <div className="card">
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>
              Πρόβλεψη επόμενων 7 ημερών
            </h2>
            <p className="sub" style={{ marginBottom: 10 }}>
              Μέσος όρος των 4 πιο πρόσφατων ίδιων ημερών (π.χ. οι 4 τελευταίες
              Παρασκευές). Δεδομένα: {forecast.count} μέρες ({forecast.from} έως{" "}
              {forecast.to}).
            </p>
            <div className="gridwrap">
              <table className="sched">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingLeft: 10 }}>
                      Καύσιμο
                    </th>
                    {forecast.days.map((d, i) => (
                      <th key={i}>
                        {DAY_NAMES[(d.getDay() + 6) % 7]}
                        <div className="d">{fmtShort(d)}</div>
                      </th>
                    ))}
                    <th>Σύνολο 7ημ (lt)</th>
                  </tr>
                </thead>
                <tbody>
                  {FUELS.map((f) => {
                    const row = forecast.perFuel[f.key];
                    const total = row.reduce((s, x) => s + (x || 0), 0);
                    if (!total) return null;
                    return (
                      <tr key={f.key}>
                        <td className="name">{f.label}</td>
                        {row.map((v, i) => (
                          <td key={i} style={{ padding: "6px 8px" }}>
                            {fmt(v)}
                          </td>
                        ))}
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                          {fmt(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ margin: "10px 0 0" }}>
              Η στήλη «Σύνολο» είναι η βάση για την παραγγελία της εβδομάδας —
              πρόσθεσε το περιθώριο ασφαλείας που κρατάς στις δεξαμενές.
            </p>
          </div>
        )}
        {!forecast && (
          <div className="card">
            <strong>Πρόβλεψη:</strong> χρειάζονται τουλάχιστον 14 μέρες
            δεδομένων ({entries.length} μέχρι τώρα). Ανέβασε ένα Excel μήνα ή
            συνέχισε την καθημερινή καταχώρηση.
          </div>
        )}

        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Εισαγωγή από Excel</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            Δέχεται .xlsx/.xls/.csv με μία γραμμή ανά μέρα. Διάλεξε το αρχείο,
            δείξε ποια στήλη είναι τι, και πάτα Εισαγωγή. Υπάρχουσες ημερομηνίες
            ενημερώνονται με τις νέες τιμές.
          </p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          {sheetRows && (
            <>
              <div className="toolbar" style={{ marginTop: 12, alignItems: "flex-end" }}>
                {[{ key: "date", label: "Ημερομηνία" }, ...FUELS].map((f) => (
                  <label className="f" key={f.key}>
                    {f.label}
                    <select
                      value={mapping[f.key] ?? -1}
                      onChange={(e) =>
                        setMapping({ ...mapping, [f.key]: Number(e.target.value) })
                      }
                    >
                      <option value={-1}>— καμία —</option>
                      {sheetRows[0].map((h, i) => (
                        <option key={i} value={i}>
                          Στήλη {i + 1}: {String(h).slice(0, 22) || "(κενή)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button className="btn amber" onClick={doImport} disabled={importing}>
                  Εισαγωγή {sheetRows.length - 1} γραμμών
                </button>
              </div>
              <div className="gridwrap" style={{ marginTop: 10 }}>
                <table className="sched">
                  <tbody>
                    {sheetRows.slice(0, 4).map((r, i) => (
                      <tr key={i}>
                        {r.slice(0, 8).map((c, j) => (
                          <td key={j} style={{ padding: "5px 8px", fontSize: 12.5, fontWeight: i === 0 ? 700 : 400 }}>
                            {String(c).slice(0, 16)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {importMsg && (
            <p className={importMsg.includes("✓") ? "msg-ok" : "msg-err"} style={{ marginTop: 8 }}>
              {importMsg}
            </p>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Χειροκίνητη καταχώρηση</h2>
          <div className="toolbar" style={{ alignItems: "flex-end" }}>
            <label className="f">
              Ημερομηνία
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            {FUELS.map((f) => (
              <label className="f" key={f.key}>
                {f.label} (λίτρα)
                <input
                  type="text"
                  inputMode="decimal"
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                  style={{ width: 110 }}
                />
              </label>
            ))}
            <label className="f">
              Σημειώσεις
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minWidth: 140 }} />
            </label>
            <button className="btn amber" onClick={save} disabled={busy}>
              Καταχώρηση
            </button>
            {msg && (
              <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>{msg}</span>
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
                <th>Σημ.</th>
                <th className="noprint"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.entry_date}>
                  <td className="name">{e.entry_date}</td>
                  {FUELS.map((f) => (
                    <td key={f.key} style={{ padding: "6px 8px" }}>
                      {e.liters?.[f.key] != null ? fmt(e.liters[f.key]) : "—"}
                    </td>
                  ))}
                  <td style={{ padding: "6px 8px", fontSize: 13 }}>{e.notes || ""}</td>
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
