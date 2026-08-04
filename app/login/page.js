"use client";
import { useState } from "react";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    const url = mode === "login" ? "/api/auth" : "/api/signup";
    const body =
      mode === "login" ? { pin } : { pin, name, code: invite };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/";
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Λάθος PIN.");
    }
  }

  return (
    <div className="login-box">
      <div className="pump">⛽</div>
      <h1>Βάρδιες Πρατηρίου</h1>
      {mode === "login" ? (
        <>
          <p className="sub">Βάλε το PIN του καταστήματός σου</p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pin && submit()}
            autoFocus
          />
        </>
      ) : (
        <>
          <p className="sub">Νέο κατάστημα — φτιάξε όνομα και PIN</p>
          <input
            type="text"
            placeholder="π.χ. ΚΑΛΥΨΩ 102"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 16 }}
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN (4+ ψηφία)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <input
            type="text"
            placeholder="Κωδικός πρόσκλησης (αν σου δόθηκε)"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 14 }}
          />
        </>
      )}
      {err && <p className="msg-err">{err}</p>}
      <button
        className="btn"
        onClick={submit}
        disabled={busy || !pin || (mode === "signup" && !name)}
      >
        {mode === "login" ? "Είσοδος" : "Δημιουργία καταστήματος"}
      </button>
      <p style={{ marginTop: 14 }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setErr("");
            setMode(mode === "login" ? "signup" : "login");
          }}
          style={{ color: "var(--petrol)", fontWeight: 600, fontSize: 14 }}
        >
          {mode === "login"
            ? "Νέο κατάστημα; Φτιάξε το εδώ"
            : "← Έχω ήδη PIN, είσοδος"}
        </a>
      </p>
    </div>
  );
}
