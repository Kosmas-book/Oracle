"use client";
import { useState } from "react";

export default function Login() {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/";
    } else {
      setErr("Λάθος PIN.");
      setPin("");
    }
  }

  return (
    <div className="login-box">
      <div className="pump">⛽</div>
      <h1>ΚΑΛΥΨΩ · Βάρδιες</h1>
      <p className="sub">Βάλε το PIN για να συνεχίσεις</p>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && pin && submit()}
        autoFocus
      />
      {err && <p className="msg-err">{err}</p>}
      <button className="btn" onClick={submit} disabled={!pin || busy}>
        Είσοδος
      </button>
    </div>
  );
}
