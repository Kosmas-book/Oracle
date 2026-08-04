"use client";
import { useState } from "react";

export default function ResetPage({ searchParams }) {
  const token = searchParams?.token || "";
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pin !== pin2) {
      setErr("Τα δύο PIN δεν ταιριάζουν.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await fetch("/api/reset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setErr(d.error || "Κάτι πήγε στραβά.");
  }

  return (
    <div className="login-box">
      <div className="pump">⛽</div>
      <h1>Νέο PIN</h1>
      {!token ? (
        <p className="msg-err">
          Λείπει ο σύνδεσμος ανάκτησης. Ζήτησε νέον από τη σελίδα εισόδου.
        </p>
      ) : (
        <>
          <p className="sub">Όρισε το νέο PIN του καταστήματος</p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="Νέο PIN (4+ ψηφία)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="Επανάληψη PIN"
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pin && submit()}
          />
          {err && <p className="msg-err">{err}</p>}
          <button className="btn" onClick={submit} disabled={busy || pin.length < 4}>
            Αποθήκευση PIN
          </button>
        </>
      )}
      <p style={{ marginTop: 14 }}>
        <a href="/login" style={{ color: "var(--petrol)", fontWeight: 600, fontSize: 14 }}>
          ← Σελίδα εισόδου
        </a>
      </p>
    </div>
  );
}
