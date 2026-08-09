"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/lib/Nav";
import { allShifts, DEFAULT_SHIFTS, DAY_NAMES } from "@/lib/shifts";
import { IconSave, IconPlus, IconWarn } from "@/lib/Icons";

const hhmm = (h) =>
  `${String(Math.floor(h % 24)).padStart(2, "0")}:${String(
    Math.round(((h % 1) + 1e-6) * 60) % 60
  ).padStart(2, "0")}`;

// Έλεγχος κάλυψης 24ώρου + κορύφωσης, με βάση απαιτήσεις μιας μέρας.
function coverageOf(req, SHIFTS, includeNight = true) {
  const hours = Array(24).fill(0);
  const add = (code, n) => {
    const sh = SHIFTS[code];
    if (!sh || sh.start == null) return;
    for (let h = sh.start; h < sh.end; h++) hours[Math.floor(h) % 24] += n;
  };
  for (const [code, n] of Object.entries(req || {})) add(code, Number(n) || 0);
  if (includeNight) add("Β", 1);
  const gaps = [];
  let g = null;
  hours.forEach((v, h) => {
    if (v === 0 && g === null) g = h;
    if (v > 0 && g !== null) {
      gaps.push([g, h]);
      g = null;
    }
  });
  if (g !== null) gaps.push([g, 24]);
  return { hours, peak: Math.max(...hours), gaps };
}

function ReqEditor({ title, note, req, onChange, SHIFTS, maxPerShift }) {
  const codes = Object.keys(SHIFTS).filter(
    (c) => c !== "Β" && c !== "Ρ" && c !== "Ο"
  );
  const total = Object.values(req || {}).reduce((s, x) => s + (Number(x) || 0), 0);
  const cov = coverageOf(req, SHIFTS, !!SHIFTS["Β"]);
  return (
    <div className="card">
      <div className="sec-head">
        <h2>{title}</h2>
        <span className="pill">{total + 1} βάρδιες/μέρα</span>
      </div>
      <p className="sub" style={{ marginBottom: 14 }}>{note}</p>

      <div className="reqgrid">
        {codes.map((c) => (
          <div className="req-item" key={c}>
            <div className="req-label">
              <span
                className="emp-chip"
                style={{ background: SHIFTS[c].bg, color: SHIFTS[c].ink }}
              >
                {c}
              </span>
              <span className="req-hours">{SHIFTS[c].hours}</span>
            </div>
            <input
              type="number"
              min={0}
              max={8}
              value={req[c] ?? 0}
              onChange={(e) =>
                onChange({ ...req, [c]: Number(e.target.value) || 0 })
              }
            />
          </div>
        ))}
      </div>

      {(cov.gaps.length > 0 || cov.peak > maxPerShift) && (
        <div className="warn" style={{ marginTop: 14 }}>
          <strong>
            <IconWarn width={14} height={14} /> Προσοχή σε αυτές τις ρυθμίσεις
          </strong>
          <ul>
            {cov.gaps.length > 0 && (
              <li>
                Ακάλυπτες ώρες:{" "}
                {cov.gaps
                  .map(
                    ([a, b]) =>
                      `${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00`
                  )
                  .join(", ")}{" "}
                — το πρατήριο μένει χωρίς προσωπικό.
              </li>
            )}
            {cov.peak > maxPerShift && (
              <li>
                Κορύφωση {cov.peak} άτομα ταυτόχρονα, ενώ το όριο είναι{" "}
                {maxPerShift}.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function NewShiftRow({ onAdd, exists }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("14:00");
  const [err, setErr] = useState("");

  if (!open)
    return (
      <button className="btn secondary" onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
        <IconPlus /> Προσθήκη βάρδιας
      </button>
    );

  return (
    <div className="newshift">
      <label className="f">
        Κωδικός
        <input
          type="text"
          maxLength={3}
          placeholder="π.χ. Π3"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          style={{ width: 78 }}
        />
      </label>
      <label className="f">
        Ονομασία
        <input
          type="text"
          placeholder="π.χ. Ενδιάμεση"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ width: 160 }}
        />
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
        className="btn"
        onClick={() => {
          if (!code) return setErr("Βάλε κωδικό.");
          if (exists(code)) return setErr("Υπάρχει ήδη αυτός ο κωδικός.");
          const [sh, sm] = start.split(":").map(Number);
          const [eh, em] = end.split(":").map(Number);
          let st = sh + sm / 60;
          let en = eh + em / 60;
          if (en <= st) en += 24;
          onAdd(code, label || code, st, en);
          setCode("");
          setLabel("");
          setErr("");
          setOpen(false);
        }}
      >
        Προσθήκη
      </button>
      <button className="btn secondary" onClick={() => { setOpen(false); setErr(""); }}>
        Άκυρο
      </button>
      {err && <span className="msg-err">{err}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const [weekday, setWeekday] = useState({});
  const [sunday, setSunday] = useState({});
  const [workDays, setWorkDays] = useState(6);
  const [maxPerShift, setMaxPerShift] = useState(4);
  const [leaveReplacesRest, setLeaveReplacesRest] = useState(true);
  const [rotation, setRotation] = useState([]);      // ids με σειρά
  const [nightPool, setNightPool] = useState([]);    // υποψήφιοι με Β
  const [shiftDefs, setShiftDefs] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const SHIFTS = useMemo(() => allShifts(shiftDefs), [shiftDefs]);

  // Πλήρης σειρά rotation: πρώτα οι αποθηκευμένοι με τη σειρά τους,
  // μετά όσοι απέκτησαν δικαίωμα Β αργότερα.
  const orderedIds = useMemo(
    () => [
      ...rotation.filter((id) => nightPool.some((e) => e.id === id)),
      ...nightPool.filter((e) => !rotation.includes(e.id)).map((e) => e.id),
    ],
    [rotation, nightPool]
  );
  const moveRot = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= orderedIds.length) return;
    const arr = [...orderedIds];
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
    setDirty(true);
    setMsg("");
    setRotation(arr);
  };

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) =>
        setNightPool(
          (d.employees || []).filter(
            (e) => !e.deactivated_at && (e.allowed_shifts || []).includes("Β")
          )
        )
      );
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setWeekday(d.settings?.weekday_req || {});
        setSunday(d.settings?.sunday_req || {});
        setWorkDays(d.settings?.work_days || 6);
        setMaxPerShift(d.settings?.max_per_shift || 4);
        setLeaveReplacesRest(d.settings?.leave_replaces_rest !== false);
        setRotation(
          Array.isArray(d.settings?.night_rotation_order)
            ? d.settings.night_rotation_order
            : []
        );
        const sh = d.settings?.shifts;
        setShiftDefs(sh && Object.keys(sh).length ? sh : { ...DEFAULT_SHIFTS });
      });
  }, []);

  function touch(fn) {
    return (v) => {
      setDirty(true);
      setMsg("");
      fn(v);
    };
  }

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
        leave_replaces_rest: leaveReplacesRest,
        night_rotation_order: orderedIds,
        shifts: shiftDefs,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Αποθηκεύτηκε ✓");
      setDirty(false);
    } else setMsg("Σφάλμα αποθήκευσης");
  }

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Ρυθμίσεις καταστήματος</h1>
        <p className="sub">
          Εδώ ορίζεις τους κανόνες που χρησιμοποιεί η αυτόματη δημιουργία
          προγράμματος. Οι αλλαγές ισχύουν από την επόμενη δημιουργία.
        </p>

        {/* 1 — Βάρδιες */}
        <div className="card">
          <div className="sec-head">
            <h2>
              <span className="sec-num">1</span> Βάρδιες &amp; ωράρια
            </h2>
          </div>
          <p className="sub" style={{ marginBottom: 14 }}>
            Οι βάρδιες του δικού σου καταστήματος. Για βάρδια που ξημερώνει,
            βάλε λήξη μικρότερη από την έναρξη. Αν το πρατήριο δεν είναι 24ωρο,
            αφαίρεσε τη νυχτερινή (<strong>Β</strong>) — τότε το πρόγραμμα δεν
            θα ζητάει καθόλου βραδινούς.
          </p>

          {shiftDefs &&
            Object.entries(shiftDefs).map(([code, def]) => (
              <div className="shift-row" key={code}>
                <span
                  className="emp-chip lg"
                  style={{ background: SHIFTS[code]?.bg, color: SHIFTS[code]?.ink }}
                >
                  {code}
                </span>
                <input
                  className="shift-label"
                  type="text"
                  value={def.label || ""}
                  onChange={(e) =>
                    touch(setShiftDefs)({
                      ...shiftDefs,
                      [code]: { ...def, label: e.target.value },
                    })
                  }
                />
                <input
                  type="time"
                  value={hhmm(def.start)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    touch(setShiftDefs)({
                      ...shiftDefs,
                      [code]: { ...def, start: h + m / 60 },
                    });
                  }}
                />
                <span className="dash">–</span>
                <input
                  type="time"
                  value={hhmm(def.end)}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    let en = h + m / 60;
                    if (en <= def.start) en += 24;
                    touch(setShiftDefs)({
                      ...shiftDefs,
                      [code]: { ...def, end: en },
                    });
                  }}
                />
                <span className="dur">{Math.round(def.end - def.start)}ω</span>
                <span className="grow" />
                <button
                  className="btn secondary danger-text"
                  onClick={() => {
                    if (!confirm(`Αφαίρεση της βάρδιας «${code}»;`)) return;
                    const next = { ...shiftDefs };
                    delete next[code];
                    touch(setShiftDefs)(next);
                  }}
                >
                  Αφαίρεση
                </button>
              </div>
            ))}

          <NewShiftRow
            exists={(c) => !!shiftDefs?.[c]}
            onAdd={(code, label, start, end) =>
              touch(setShiftDefs)({ ...shiftDefs, [code]: { label, start, end } })
            }
          />
        </div>

        {/* 2 — Γενικοί κανόνες */}
        <div className="card">
          <div className="sec-head">
            <h2>
              <span className="sec-num">2</span> Γενικοί κανόνες
            </h2>
          </div>
          <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 4 }}>
            <label className="f">
              Εργάσιμες μέρες / εβδομάδα
              <select
                value={workDays}
                onChange={(e) => touch(setWorkDays)(Number(e.target.value))}
              >
                <option value={6}>Εξαήμερο — 6 μέρες + 1 ρεπό</option>
                <option value={5}>Πενθήμερο — 5 μέρες + 2 ρεπό</option>
              </select>
            </label>
            <label className="f">
              Η ημέρα άδειας (Ο) αντικαθιστά το εβδομαδιαίο ρεπό;
              <select
                value={leaveReplacesRest ? "1" : "0"}
                onChange={(e) => touch(setLeaveReplacesRest)(e.target.value === "1")}
              >
                <option value="1">Ναι — η άδεια μετράει ως το ρεπό</option>
                <option value="0">Όχι — δικαιούται και ρεπό</option>
              </select>
            </label>
            <label className="f">
              Μέγιστα άτομα ταυτόχρονα
              <input
                type="number"
                min={1}
                max={8}
                value={maxPerShift}
                onChange={(e) => touch(setMaxPerShift)(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <p className="sub" style={{ margin: "12px 0 0" }}>
            Με «Όχι» στην άδεια, μια εβδομάδα με ένα Ο σε εξαήμερο καταλήγει σε 5
            εργάσιμες + 1 Ο + 1 Ρ. Οι πλήρους απασχόλησης βγαίνουν αυστηρά τόσες μέρες. Όποιος
            περισσεύει από τις ελάχιστες απαιτήσεις μπαίνει ως επιπλέον άτομο σε
            βάρδια — όχι σε δεύτερο ρεπό. Το όριο μετράει πραγματική ταυτόχρονη
            παρουσία, μαζί με όσους ξημερώνουν από την προηγούμενη μέρα.
          </p>
        </div>

        {/* 3 & 4 — Απαιτήσεις */}
        <div className="card">
          <div className="sec-head">
            <h2>
              <span className="sec-num">3</span> Σειρά βραδινών
            </h2>
          </div>
          <p className="sub" style={{ marginBottom: 12 }}>
            Με ποια σειρά αναλαμβάνουν τα νυχτερινά μπλοκ στο αυτόματο rotation
            του μηνιαίου προγράμματος. Εμφανίζονται μόνο όσοι έχουν τη νυχτερινή
            (Β) στις βάρδιές τους.
          </p>
          {orderedIds.length === 0 ? (
            <p className="sub" style={{ color: "var(--danger)" }}>
              Κανένας εργαζόμενος δεν έχει τη νυχτερινή (Β). Πρόσθεσέ την στο
              «Προσωπικό» σε όσους κάνουν νύχτες.
            </p>
          ) : (
            orderedIds.map((id, i) => {
              const e = nightPool.find((x) => x.id === id);
              if (!e) return null;
              return (
                <div className="emp-card" key={id}>
                  <div className="emp-move">
                    <button className="emp-arrow" onClick={() => moveRot(i, -1)} title="Πάνω">▲</button>
                    <button className="emp-arrow" onClick={() => moveRot(i, 1)} title="Κάτω">▼</button>
                  </div>
                  <div className="emp-main">
                    <div className="emp-name">
                      <span className="sec-num">{i + 1}</span> {e.name}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <ReqEditor
          title={
            <>
              <span className="sec-num">4</span> Άτομα ανά βάρδια · Δευτέρα–Σάββατο
            </>
          }
          note="Πόσα άτομα χρειάζεται κάθε βάρδια τις καθημερινές. Οι βάρδιες με 2+ άτομα θεωρούνται βασικές και καλύπτονται πάντα πρώτες."
          req={weekday}
          onChange={touch(setWeekday)}
          SHIFTS={SHIFTS}
          maxPerShift={maxPerShift}
        />
        <ReqEditor
          title={
            <>
              <span className="sec-num">5</span> Άτομα ανά βάρδια · Κυριακή
            </>
          }
          note="Η Κυριακή έχει δικό της μοτίβο — συνήθως λιγότερο προσωπικό και διαφορετικά ωράρια."
          req={sunday}
          onChange={touch(setSunday)}
          SHIFTS={SHIFTS}
          maxPerShift={maxPerShift}
        />

        <div className={"savebar" + (dirty ? " on" : "")}>
          <span className="savebar-txt">
            {dirty
              ? "Έχεις αλλαγές που δεν έχουν αποθηκευτεί"
              : msg || "Όλες οι ρυθμίσεις είναι αποθηκευμένες"}
          </span>
          <button className="btn" onClick={save} disabled={busy || !dirty}>
            <IconSave /> Αποθήκευση ρυθμίσεων
          </button>
        </div>
      </div>
    </>
  );
}
