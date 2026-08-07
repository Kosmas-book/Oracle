"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/lib/Nav";
import { isoDate, addDays, fmtShort, DAY_NAMES } from "@/lib/shifts";
import { IconEmpty, IconUpload, IconSave, IconPlus, IconWarn } from "@/lib/Icons";
import * as XLSX from "xlsx";
import {
  FUEL_KEYS,
  FUEL_LABELS,
  forecast as calcForecast,
  accuracyPerFuel,
  confidenceOf,
  requiredLiters,
  outliers,
} from "@/lib/fuelCalc";

const FUELS = FUEL_KEYS.map((key) => ({ key, label: FUEL_LABELS[key] }));
const TABS = [
  { id: "forecast", label: "Πρόβλεψη" },
  { id: "order", label: "Απαιτούμενα λίτρα" },
  { id: "import", label: "Εισαγωγή αρχείου" },
  { id: "history", label: "Ιστορικό" },
];

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

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "");
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const CONF_STYLE = {
  high: { bg: "#e8f3ec", ink: "#2f7d5c" },
  medium: { bg: "#fdf3e3", ink: "#8a6a1c" },
  low: { bg: "#fdeeea", ink: "#b3402e" },
  none: { bg: "#efece4", ink: "#6d7683" },
};

export default function FuelPage() {
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [vals, setVals] = useState({});
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("forecast");

  const [wb, setWb] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [colCounts, setColCounts] = useState([]);
  const [sheetRows, setSheetRows] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  const [weights, setWeights] = useState({});
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState("");

  function load() {
    fetch("/api/fuel")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []));
  }
  function loadPresets() {
    fetch("/api/fuel-presets")
      .then((r) => r.json())
      .then((d) => setPresets(d.presets || []));
  }
  useEffect(() => {
    load();
    loadPresets();
  }, []);

  const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("el-GR"));

  const forecast = useMemo(() => {
    const usable = entries.filter((e) => !e.excluded);
    if (usable.length < 14) return null;
    const days = Array.from({ length: 8 }, (_, i) => addDays(new Date(), i));
    const perFuel = calcForecast(entries, days);
    const asc = [...usable].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
    return {
      days,
      perFuel,
      count: asc.length,
      from: asc[0].entry_date,
      to: asc[asc.length - 1].entry_date,
    };
  }, [entries]);

  const acc = useMemo(() => accuracyPerFuel(entries), [entries]);
  const hasAcc = useMemo(() => Object.values(acc).some(Boolean), [acc]);
  const warnOutliers = useMemo(() => {
    const liters = {};
    for (const f of FUELS) {
      const v = toNum(vals[f.key]);
      if (v != null) liters[f.key] = v;
    }
    return outliers(liters, entries);
  }, [vals, entries]);

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
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg("Σφάλμα: " + (d.error || "αποτυχία καταχώρησης"));
    }
  }

  async function del(d) {
    if (!confirm(`Διαγραφή εγγραφής ${d};`)) return;
    await fetch(`/api/fuel?date=${d}`, { method: "DELETE" });
    load();
  }

  async function toggleExcluded(entry) {
    await fetch("/api/fuel", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_date: entry.entry_date,
        excluded: !entry.excluded,
      }),
    });
    load();
  }

  async function savePreset() {
    if (!presetName.trim()) return;
    await fetch("/api/fuel-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: presetName, weights }),
    });
    setPresetName("");
    loadPresets();
  }
  async function delPreset(id) {
    if (!confirm("Διαγραφή preset;")) return;
    await fetch(`/api/fuel-presets?id=${id}`, { method: "DELETE" });
    loadPresets();
  }

  function dateCount(rows, hr, col) {
    let n = 0;
    for (let i = hr + 1; i < rows.length; i++) {
      if (excelToISO((rows[i] || [])[col]) ) n++;
    }
    return n;
  }

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

  const required = requiredLiters(forecast?.perFuel || {}, weights);
  const anyWeight = Object.values(weights).some((w) => w > 0);

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Καύσιμα</h1>
        <p className="sub">
          Ημερήσιες πωλήσεις, πρόβλεψη ανά ημέρα εβδομάδας και υπολογισμός
          απαιτούμενων λίτρων για κάλυψη.
        </p>

        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"tab" + (tab === t.id ? " on" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------------- ΠΡΟΒΛΕΨΗ ---------------- */}
        {tab === "forecast" && (
          <>
            {forecast ? (
              <div className="card">
                <h2>Πρόβλεψη — από σήμερα και για 7 μέρες</h2>
                <p className="sub" style={{ marginBottom: 10 }}>
                  Μέσος όρος των έως 4 πιο πρόσφατων ίδιων ημερών. Δεδομένα:{" "}
                  {forecast.count} μέρες ({forecast.from} έως {forecast.to}).
                </p>
                <div className="gridwrap">
                  <table className="sched">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", paddingLeft: 10 }}>Καύσιμο</th>
                        {forecast.days.map((d, i) => (
                          <th key={i} style={i === 0 ? { background: "#FFE099", color: "#5C4300" } : undefined}>
                            {DAY_NAMES[(d.getDay() + 6) % 7]}
                            <div className="d">{i === 0 ? "σήμερα" : fmtShort(d)}</div>
                          </th>
                        ))}
                        <th>Σύνολο</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FUELS.map((f) => {
                        const row = forecast.perFuel[f.key] || [];
                        const total = row.reduce((s, c) => s + (c?.value || 0), 0);
                        if (!total) return null;
                        return (
                          <tr key={f.key}>
                            <td className="name">{f.label}</td>
                            {row.map((c, i) => {
                              const cf = confidenceOf(c?.n || 0);
                              const st = CONF_STYLE[cf.level];
                              return (
                                <td key={i} style={{ padding: "5px 8px" }}>
                                  <div>{fmt(c?.value)}</div>
                                  <span
                                    className="confdot"
                                    style={{ background: st.bg, color: st.ink }}
                                    title={`${cf.label} εμπιστοσύνη — ${cf.days} αντίστοιχες ημέρες`}
                                  >
                                    {cf.days}
                                  </span>
                                </td>
                              );
                            })}
                            <td style={{ padding: "6px 8px", fontWeight: 700 }}>{fmt(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="sub" style={{ margin: "10px 0 0" }}>
                  Ο μικρός αριθμός κάτω από κάθε τιμή δείχνει σε πόσες αντίστοιχες
                  ημέρες βασίζεται: <strong>4+</strong> υψηλή, <strong>3</strong>{" "}
                  μέτρια, <strong>1–2</strong> χαμηλή εμπιστοσύνη.
                </p>
              </div>
            ) : (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <IconUpload width={20} height={20} />
                  <div>
                    <strong>Η πρόβλεψη ενεργοποιείται με 14 μέρες δεδομένων</strong>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>
                      Έχεις {entries.filter((e) => !e.excluded).length} — ανέβασε ένα
                      Excel μήνα από την καρτέλα «Εισαγωγή αρχείου».
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasAcc && (
              <div className="card">
                <h2>Ακρίβεια πρόβλεψης ανά καύσιμο</h2>
                <p className="sub" style={{ marginBottom: 10 }}>
                  Κάθε καύσιμο μετριέται ξεχωριστά — ένα συνολικό νούμερο θα
                  έκρυβε αντίθετα λάθη μεταξύ καυσίμων.
                </p>
                <div className="gridwrap">
                  <table className="sched">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", paddingLeft: 10 }}>Καύσιμο</th>
                        <th>Μέση απόκλιση</th>
                        <th>Τάση</th>
                        <th>Ημέρες</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FUELS.map((f) => {
                        const a = acc[f.key];
                        if (!a) return null;
                        return (
                          <tr key={f.key}>
                            <td className="name">{f.label}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 700,
                              color: a.mape < 8 ? "var(--ok)" : "var(--danger)" }}>
                              ±{a.mape.toFixed(1)}%
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {a.tendency === "under"
                                ? "υποεκτιμά"
                                : a.tendency === "over"
                                ? "υπερεκτιμά"
                                : "ισορροπημένη"}
                            </td>
                            <td style={{ padding: "6px 8px" }}>{a.days}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- ΑΠΑΙΤΟΥΜΕΝΑ ΛΙΤΡΑ ---------------- */}
        {tab === "order" && (
          <div className="card">
            <h2>Απαιτούμενα λίτρα για κάλυψη</h2>
            <p className="sub" style={{ marginBottom: 12 }}>
              Διάλεξε ποιες μέρες πρέπει να καλύψει η παραλαβή. Ο υπολογισμός{" "}
              <strong>δεν αφαιρεί</strong> τρέχον απόθεμα δεξαμενής,
              προγραμματισμένη παραλαβή ή απόθεμα ασφαλείας.
            </p>

            {!forecast ? (
              <p className="sub">Χρειάζονται τουλάχιστον 14 μέρες δεδομένων.</p>
            ) : (
              <>
                {presets.length > 0 && (
                  <div className="toolbar" style={{ marginBottom: 12 }}>
                    {presets.map((p) => (
                      <span className="preset" key={p.id}>
                        <button className="btn secondary" onClick={() => setWeights(p.weights || {})}>
                          {p.name}
                        </button>
                        <button className="preset-x" onClick={() => delPreset(p.id)} title="Διαγραφή">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="toolbar" style={{ alignItems: "flex-end", marginBottom: 12 }}>
                  {forecast.days.map((d, i) => (
                    <label className="f" key={i}>
                      {DAY_NAMES[(d.getDay() + 6) % 7]} {i === 0 ? "(σήμερα)" : fmtShort(d)}
                      <select
                        value={weights[i] ?? 0}
                        onChange={(e) => setWeights({ ...weights, [i]: Number(e.target.value) })}
                        style={{ width: 92 }}
                      >
                        <option value={0}>—</option>
                        <option value={0.25}>25%</option>
                        <option value={0.5}>50%</option>
                        <option value={0.75}>75%</option>
                        <option value={1}>100%</option>
                      </select>
                    </label>
                  ))}
                  <button className="btn secondary" onClick={() => setWeights({})}>
                    Καθαρισμός
                  </button>
                </div>

                {anyWeight ? (
                  <>
                    <div className="gridwrap">
                      <table className="sched">
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", paddingLeft: 10 }}>Καύσιμο</th>
                            <th>Απαιτούμενα λίτρα</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FUELS.map((f) =>
                            required[f.key] ? (
                              <tr key={f.key}>
                                <td className="name">{f.label}</td>
                                <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 16 }}>
                                  {fmt(required[f.key])}
                                </td>
                              </tr>
                            ) : null
                          )}
                          <tr>
                            <td className="name" style={{ background: "#f0eee6" }}>
                              <strong>Σύνολο</strong>
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 800, fontSize: 16, background: "#f0eee6" }}>
                              {fmt(Object.values(required).reduce((s, x) => s + x, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="toolbar" style={{ marginTop: 12, alignItems: "flex-end" }}>
                      <label className="f">
                        Αποθήκευση ως preset
                        <input
                          type="text"
                          placeholder="π.χ. Παραγγελία Παρασκευής"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          style={{ minWidth: 200 }}
                        />
                      </label>
                      <button className="btn secondary" onClick={savePreset} disabled={!presetName.trim()}>
                        <IconPlus /> Αποθήκευση preset
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="sub">Διάλεξε ποσοστό σε τουλάχιστον μία μέρα.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------------- ΕΙΣΑΓΩΓΗ ---------------- */}
        {tab === "import" && (
          <>
            <div className="card">
              <h2>Εισαγωγή από Excel</h2>
              <p className="sub" style={{ marginBottom: 10 }}>
                Δέχεται .xls/.xlsx/.csv με μία γραμμή ανά μέρα. Αν το αρχείο έχει
                ένα φύλλο ανά μήνα, διάλεξε ποιον μήνα θες. Γραμμές χωρίς
                ημερομηνία και κενές μέρες αγνοούνται.
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
                        <option key={n} value={n}>{n}</option>
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
                        <option key={i} value={i}>Γραμμή {i + 1}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {sheetRows && !showMapping && (
                <div style={{ marginTop: 12 }}>
                  <div className="okbox">
                    <strong>
                      Βρέθηκαν {dateCount(sheetRows, headerRow, mapping.date)} μέρες
                      στο φύλλο «{sheetName}»
                    </strong>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.7 }}>
                      {FUELS.map((f) => {
                        const c = mapping[f.key];
                        const head =
                          c >= 0
                            ? String((sheetRows[headerRow] || [])[c] || "").replace(/\s+/g, " ").trim()
                            : null;
                        return (
                          <div key={f.key}>
                            {f.label}:{" "}
                            {head ? (
                              <strong style={{ color: "var(--ink)" }}>{head}</strong>
                            ) : (
                              <span style={{ color: "var(--danger)" }}>δεν βρέθηκε</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="toolbar" style={{ marginTop: 12 }}>
                    <button className="btn amber" onClick={doImport} disabled={importing}>
                      Εισαγωγή από «{sheetName}»
                    </button>
                    <button className="btn secondary" onClick={() => setShowMapping(true)}>
                      Αλλαγή αντιστοίχισης στηλών
                    </button>
                  </div>
                </div>
              )}

              {sheetRows && showMapping && (
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
                              Στ.{i + 1}: {String(h).replace(/\s+/g, " ").slice(0, 20) || "(χωρίς τίτλο)"}
                              {colCounts[i] ? ` — ${colCounts[i]} τιμές` : " — κενή"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button className="btn amber" onClick={doImport} disabled={importing}>
                      Εισαγωγή από «{sheetName}»
                    </button>
                    <button className="btn secondary" onClick={() => setShowMapping(false)}>
                      ← Απλή προβολή
                    </button>
                  </div>
                  <div className="gridwrap" style={{ marginTop: 10 }}>
                    <table className="sched">
                      <tbody>
                        {sheetRows.slice(headerRow, headerRow + 4).map((r, i) => (
                          <tr key={i}>
                            {r.slice(0, 12).map((c, j) => (
                              <td key={j} style={{ padding: "5px 8px", fontSize: 12.5, fontWeight: i === 0 ? 700 : 400 }}>
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
              <h2>Χειροκίνητη καταχώρηση</h2>
              <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 8 }}>
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
                  <IconSave /> Καταχώρηση
                </button>
                {msg && (
                  <span className={msg.startsWith("Σφάλμα") ? "msg-err" : "msg-ok"}>{msg}</span>
                )}
              </div>
              {warnOutliers.length > 0 && (
                <div className="warn" style={{ marginTop: 10 }}>
                  <strong>
                    <IconWarn width={14} height={14} /> Ασυνήθιστες τιμές
                  </strong>
                  <ul>
                    {warnOutliers.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* ---------------- ΙΣΤΟΡΙΚΟ ---------------- */}
        {tab === "history" && (
          <div className="card gridwrap">
            <table className="sched">
              <thead>
                <tr>
                  <th style={{ textAlign: "left", paddingLeft: 10 }}>Ημ/νία</th>
                  {FUELS.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  <th>Σημ.</th>
                  <th>Στην πρόβλεψη</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.entry_date} className={e.excluded ? "row-excluded" : ""}>
                    <td className="name">{e.entry_date}</td>
                    {FUELS.map((f) => (
                      <td key={f.key} style={{ padding: "6px 8px" }}>
                        {e.liters?.[f.key] != null ? fmt(e.liters[f.key]) : "—"}
                      </td>
                    ))}
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>{e.notes || ""}</td>
                    <td style={{ padding: 4, textAlign: "center" }}>
                      <button
                        className="btn secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => toggleExcluded(e)}
                        title="Εξαίρεση από την πρόβλεψη χωρίς διαγραφή δεδομένων"
                      >
                        {e.excluded ? "Εξαιρεμένη" : "Ναι"}
                      </button>
                    </td>
                    <td style={{ padding: 4 }}>
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
                    <td colSpan={9}>
                      <div className="empty">
                        <IconEmpty />
                        <strong>Καμία καταχώρηση πωλήσεων ακόμα</strong>
                        <p>
                          Ανέβασε το μηνιαίο Excel από την καρτέλα «Εισαγωγή
                          αρχείου» ή καταχώρησε χειροκίνητα τα λίτρα της ημέρας.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
