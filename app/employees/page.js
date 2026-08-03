"use client";
import { useEffect, useState } from "react";
import Nav from "@/lib/Nav";
import { SHIFTS, PAINTABLE, DAY_NAMES } from "@/lib/shifts";

const SHIFT_OPTIONS = PAINTABLE.filter((c) => c !== "Ρ" && c !== "Ο");

const EMPTY = {
  name: "",
  active: true,
  employment_type: "full",
  min_days: 3,
  max_days: 6,
  allowed_shifts: ["Π", "Π4", "Α", "Α3"],
  night_rotation: false,
  sort_order: 100,
  fixed_days: {},
};

function EmployeeForm({ initial, onSaved, onCancel, onDeleted }) {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function toggleShift(code) {
    setE((x) => ({
      ...x,
      allowed_shifts: x.allowed_shifts.includes(code)
        ? x.allowed_shifts.filter((c) => c !== code)
        : [...x.allowed_shifts, code],
    }));
  }

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(d.error || "Σφάλμα");
      return;
    }
    onSaved(d.employee);
  }

  async function del() {
    if (!e.id) return;
    if (!confirm(`Διαγραφή «${e.name}»; Θα φύγει και από παλιά προγράμματα.`))
      return;
    setBusy(true);
    await fetch(`/api/employees?id=${e.id}`, { method: "DELETE" });
    setBusy(false);
    onDeleted(e.id);
  }

  return (
    <div className="rowline" style={{ background: "#fbfaf6", borderRadius: 10, padding: 12 }}>
      <label className="f">
        Όνομα
        <input
          type="text"
          value={e.name}
          onChange={(ev) => setE({ ...e, name: ev.target.value })}
          style={{ minWidth: 180 }}
        />
      </label>
      <label className="f">
        Τύπος
        <select
          value={e.employment_type}
          onChange={(ev) => setE({ ...e, employment_type: ev.target.value })}
        >
          <option value="full">Πλήρους (6 μέρες)</option>
          <option value="part">Part-time</option>
        </select>
      </label>
      {e.employment_type === "part" && (
        <>
          <label className="f">
            Ελάχ. μέρες
            <input
              type="number"
              min={1}
              max={6}
              value={e.min_days}
              onChange={(ev) => setE({ ...e, min_days: Number(ev.target.value) })}
              style={{ width: 70 }}
            />
          </label>
          <label className="f">
            Μέγ. μέρες
            <input
              type="number"
              min={1}
              max={6}
              value={e.max_days}
              onChange={(ev) => setE({ ...e, max_days: Number(ev.target.value) })}
              style={{ width: 70 }}
            />
          </label>
        </>
      )}
      <label className="f">
        Βάρδιες που κάνει
        <span className="shift-checks">
          {SHIFT_OPTIONS.map((c) => (
            <label
              key={c}
              className={e.allowed_shifts.includes(c) ? "on" : ""}
              style={
                e.allowed_shifts.includes(c)
                  ? { background: SHIFTS[c].bg, color: SHIFTS[c].ink }
                  : {}
              }
            >
              <input
                type="checkbox"
                checked={e.allowed_shifts.includes(c)}
                onChange={() => toggleShift(c)}
              />
              {c}
            </label>
          ))}
        </span>
      </label>
      <label className="f">
        Εναλλαγή βραδινού
        <select
          value={e.night_rotation ? "1" : "0"}
          onChange={(ev) => setE({ ...e, night_rotation: ev.target.value === "1" })}
        >
          <option value="0">Όχι</option>
          <option value="1">Ναι</option>
        </select>
      </label>
      <label className="f">
        Σταθερές μέρες (προαιρετικό)
        <span className="shift-checks" style={{ gap: 6 }}>
          {DAY_NAMES.map((dn, di) => (
            <span key={di} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 11 }}>
              {dn}
              <select
                value={e.fixed_days?.[di] || ""}
                onChange={(ev) => {
                  const fd = { ...(e.fixed_days || {}) };
                  if (ev.target.value) fd[di] = ev.target.value;
                  else delete fd[di];
                  setE({ ...e, fixed_days: fd });
                }}
                style={{ padding: "4px 6px", fontSize: 12 }}
              >
                <option value="">—</option>
                {["Ρ", "Π", "Π2", "Π4", "Α", "Α2", "Α3", "Β"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </span>
          ))}
        </span>
      </label>
      <label className="f">
        Σειρά
        <input
          type="number"
          value={e.sort_order}
          onChange={(ev) => setE({ ...e, sort_order: Number(ev.target.value) })}
          style={{ width: 70 }}
        />
      </label>
      <label className="f">
        Ενεργός
        <select
          value={e.active ? "1" : "0"}
          onChange={(ev) => setE({ ...e, active: ev.target.value === "1" })}
        >
          <option value="1">Ναι</option>
          <option value="0">Όχι</option>
        </select>
      </label>
      <button className="btn" onClick={save} disabled={busy || !e.name.trim()}>
        Αποθήκευση
      </button>
      <button className="btn secondary" onClick={onCancel} disabled={busy}>
        Άκυρο
      </button>
      {e.id && (
        <button className="btn danger" onClick={del} disabled={busy}>
          Διαγραφή
        </button>
      )}
      {err && <span className="msg-err">{err}</span>}
    </div>
  );
}

export default function EmployeesPage() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // id | "new" | null

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setList(d.employees || []));
  }, []);

  async function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const arr = [...list];
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
    const updates = [];
    arr.forEach((e, idx) => {
      const so = (idx + 1) * 10;
      if (e.sort_order !== so) {
        e.sort_order = so;
        updates.push(e);
      }
    });
    setList([...arr]);
    for (const e of updates) {
      await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      });
    }
  }

  function upsertLocal(emp) {
    setList((l) => {
      const i = l.findIndex((x) => x.id === emp.id);
      const next = i >= 0 ? l.map((x) => (x.id === emp.id ? emp : x)) : [...l, emp];
      return next.sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "el")
      );
    });
    setEditing(null);
  }

  return (
    <>
      <Nav />
      <div className="wrap">
        <h1>Προσωπικό</h1>
        <p className="sub">
          Εδώ ορίζεις ποιος δουλεύει, τι βάρδιες μπορεί να κάνει, ποιοι μπαίνουν
          στην εναλλαγή του βραδινού και ποιοι είναι part-time. Το «Δημιουργία
          προγράμματος» χρησιμοποιεί αυτές τις ρυθμίσεις.
        </p>

        <div className="card">
          {editing === "new" ? (
            <EmployeeForm
              initial={{ ...EMPTY }}
              onSaved={upsertLocal}
              onCancel={() => setEditing(null)}
              onDeleted={() => {}}
            />
          ) : (
            <button className="btn amber" onClick={() => setEditing("new")}>
              + Νέος υπάλληλος
            </button>
          )}
        </div>

        <div className="card">
          {list.map((e) =>
            editing === e.id ? (
              <EmployeeForm
                key={e.id}
                initial={{ ...EMPTY, ...e }}
                onSaved={upsertLocal}
                onCancel={() => setEditing(null)}
                onDeleted={(id) => {
                  setList((l) => l.filter((x) => x.id !== id));
                  setEditing(null);
                }}
              />
            ) : (
              <div className="rowline" key={e.id}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button className="btn secondary" style={{ padding: "1px 9px", fontSize: 13 }} onClick={() => move(list.indexOf(e), -1)} title="Πάνω">▲</button>
                  <button className="btn secondary" style={{ padding: "1px 9px", fontSize: 13 }} onClick={() => move(list.indexOf(e), 1)} title="Κάτω">▼</button>
                </span>
                <div style={{ minWidth: 200 }}>
                  <strong>{e.name}</strong>{" "}
                  {!e.active && (
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>
                      (ανενεργός)
                    </span>
                  )}
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {e.employment_type === "part"
                      ? `Part-time ${e.min_days}–${e.max_days} μέρες`
                      : "Πλήρους απασχόλησης"}
                    {e.night_rotation ? " · εναλλαγή βραδινού" : ""}
                    {e.fixed_days && Object.keys(e.fixed_days).length
                      ? " · σταθερά: " +
                        Object.entries(e.fixed_days)
                          .sort((a, b) => Number(a[0]) - Number(b[0]))
                          .map(([d, c]) => `${DAY_NAMES[Number(d)]} ${c}`)
                          .join(", ")
                      : ""}
                  </div>
                </div>
                <div className="shift-checks">
                  {(e.allowed_shifts || []).map((c) => (
                    <label
                      key={c}
                      className="on"
                      style={{ background: SHIFTS[c]?.bg, color: SHIFTS[c]?.ink, cursor: "default" }}
                    >
                      {c}
                    </label>
                  ))}
                </div>
                <span style={{ flex: 1 }} />
                <button className="btn secondary" onClick={() => setEditing(e.id)}>
                  Επεξεργασία
                </button>
              </div>
            )
          )}
          {list.length === 0 && <p>Δεν υπάρχουν υπάλληλοι ακόμα.</p>}
        </div>
      </div>
    </>
  );
}
