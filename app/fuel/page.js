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
  const [wb, setWb] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [colCounts, setColCounts] = useState([]);
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

  // Βρίσκει τη γραμμή κεφαλίδων: αυτή με τα περισσότερα ονόματα καυσίμων.
  function detectHeaderRow(rows) {
    let best = 0;
    let bestScore = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const joined = rows[i].map((x) => String(x).toLowerCase());
      let score = 0;
      for (const h of joined) {
        if (/95|98|100|diesel|avio|υγρα|cng|unleaded|ultimate/.test(h)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  // Πόσες αριθμητικές τιμές έχει κάθε στήλη στις γραμμές δεδομένων.
  function columnCounts(rows, hr) {
    const counts = [];
    for (let i = hr + 1; i < rows.length; i++) {
      (rows[i] || []).forEach((v, c) => {
        const n = toNum(v);
        if (n != null && n > 0) counts[c] = (counts[c] || 0) + 1;
      });
    }
    return counts;
  }

  // Αντιστοίχιση από κεφαλίδες ΚΑΙ από το πού υπάρχουν πραγματικά νούμερα —
  // σε αυτά τα φύλλα η ίδια βενζίνη μπορεί να αλλάζει στήλη ανά μήνα.
  function guessMapping(head, counts) {
    const pats = {
      unl100: /100|ultimate|racing|speed/,
      unl98: /98|lrp|power|super/,
      unl95: /95|unleaded|ekonomy|economy/,
      diesel_avio: /avio|αβιο/,
      diesel: /diesel|πετρ|ντιζ|ντηζ/,
    };
    const g = { date: 0, unl100: -1, unl98: -1, unl95: -1, diesel: -1, diesel_avio: -1 };
    const taken = new Set();
    const has = (c) => (counts[c] || 0) > 0;

    for (const key of ["diesel_avio", "diesel", "unl100", "unl98", "unl95"]) {
      const cands = [];
      head.forEach((raw, i) => {
        const h = String(raw).toLowerCase().replace(/\s+/g, " ");
        if (!h) return;
        if (/αυτοματ|πωλητ/.test(h)) return; // αυτόματοι πωλητές = υποσύνολα
        if (/θερμ|heating|σύνολο|συνολο|κινήσεις/.test(h)) return;
        if (key === "diesel" && /avio|αβιο/.test(h)) return;
        if (key === "unl95" && /98|100/.test(h)) return;
        if (key === "unl98" && /95|100/.test(h)) return;
        if (key === "unl100" && /95|98/.test(h)) return;
        if (pats[key].test(h)) cands.push(i);
      });
      // Μόνο στήλες με ταιριαστή κεφαλίδα — οι κενές διπλανές είναι σύνολα.
      // Κερδίζει αυτή με τις περισσότερες μη-μηδενικές τιμές.
      let pick = null;
      let bestN = 0;
      for (const c of cands) {
        if (c < 0 || taken.has(c)) continue;
        const n = counts[c] || 0;
        if (n > bestN) {
          bestN = n;
          pick = c;
        }
      }
      if (pick != null && bestN > 0) {
        g[key] = pick;
        taken.add(pick);
      }
    }
    return g;
  }

  function loadSheet(book, name, hrow) {
    const ws = book.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) {
      setSheetRows(null);
      setImportMsg("Το φύλλο είναι άδειο.");
      return;
    }
    const hr = hrow == null ? detectHeaderRow(rows) : hrow;
    const limited = rows.slice(0, 500);
    const counts = columnCounts(limited, hr);
    setHeaderRow(hr);
    setSheetRows(limited);
    setColCounts(counts);
    setMapping(guessMapping(rows[hr] || [], counts));
    setImportMsg("");
  }

  function onFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const book = XLSX.read(e.target.result, { type: "array", cellDates: false });
        setWb(book);
        // Προεπιλογή: το φύλλο του τρέχοντος μήνα αν υπάρχει, αλλιώς το πρώτο.
        const months = ["ιανουάριος","φεβρουάριος","μάρτιος","απρίλιος","μάιος","ιούνιος","ιούλιος","αύγουστος","σεπτέμβριος","οκτώβριος","νοέμβριος","δεκέμβριος"];
        const cur = months[new Date().getMonth()];
        const pick =
          book.SheetNames.find((n) => n.toLowerCase() === cur) || book.SheetNames[0];
        setSheetName(pick);
        loadSheet(book, pick, null);
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
    for (let i = headerRow + 1; i < sheetRows.length; i++) {
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
      setImportMsg(
        `Εισήχθησαν ${d.imported} μέρες από το φύλλο «${sheetName}» ✓`
      );
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
            Δέχεται .xls/.xlsx/.csv με μία γραμμή ανά μέρα. Αν το αρχείο έχει
            ένα φύλλο ανά μήνα, διάλεξε ποιον μήνα θες — κάνε μία εισαγωγή για
            κάθε μήνα. Γραμμές χωρίς ημερομηνία (Σύνολα, Μέση Τιμή) και κενές
            μέρες αγνοούνται. Υπάρχουσες ημερομηνίες ενημερώνονται.
          </p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          {wb && (
            <div className="toolbar" style={{ marginTop: 12, alignItems: "flex-end" }}>
              <label className="f">
                Φύλλο (μήνας)
                <select
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value);
                    loadSheet(wb, e.target.value, null);
                  }}
                >
                  {wb.SheetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="f">
                Γραμμή κεφαλίδων
                <select
                  value={headerRow}
                  onChange={(e) => loadSheet(wb, sheetName, Number(e.target.value))}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={i}>
                      Γραμμή {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
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
                      {(sheetRows[headerRow] || []).map((h, i) => (
                        <option key={i} value={i}>
                          Στ.{i + 1}: {String(h).replace(/\s+/g, " ").slice(0, 20) || "—"}
                          {colCounts[i] ? ` (${colCounts[i]} τιμές)` : " (κενή)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button className="btn amber" onClick={doImport} disabled={importing}>
                  Εισαγωγή από «{sheetName}»
                </button>
              </div>
              <div className="gridwrap" style={{ marginTop: 10 }}>
                <table className="sched">
                  <tbody>
                    {sheetRows
                      .slice(headerRow, headerRow + 4)
                      .map((r, i) => (
                        <tr key={i}>
                          {r.slice(0, 12).map((c, j) => (
                            <td
                              key={j}
                              style={{
                                padding: "5px 8px",
                                fontSize: 12.5,
                                fontWeight: i === 0 ? 700 : 400,
                              }}
                            >
                              {i > 0 && j === 0
                                ? excelToISO(c) || String(c).slice(0, 14)
                                : String(c).replace(/\n/g, " ").slice(0, 18)}
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
