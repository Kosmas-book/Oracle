"use client";
import { useState } from "react";
import Logo from "@/lib/Logo";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    setInfo("");
    let url = "/api/auth";
    let body = { name, pin };
    if (mode === "signup") {
      url = "/api/signup";
      body = { name, pin, email, code: invite };
    } else if (mode === "forgot") {
      url = "/api/reset";
      body = { email };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      if (mode === "forgot") setInfo(d.message || "Στάλθηκε email.");
      else window.location.href = "/";
    } else setErr(d.error || "Κάτι πήγε στραβά.");
  }

  const link = (m, text) => (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        setErr("");
        setInfo("");
        setMode(m);
      }}
      style={{ color: "var(--petrol)", fontWeight: 600, fontSize: 14 }}
    >
      {text}
    </a>
  );

  return (
    <div className="login-box">
      <div className="login-logo">
        <Logo size={44} />
      </div>
      <p className="login-tag">Πρόγραμμα βαρδιών &amp; καύσιμα</p>

      {mode === "login" && (
        <>
          <p className="sub">Όνομα καταστήματος και PIN</p>
          <input
            type="text"
            placeholder="π.χ. ΚΑΛΥΨΩ 024"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 16 }}
            autoFocus
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name && pin && submit()}
          />
        </>
      )}

      {mode === "signup" && (
        <>
          <p className="sub">Νέο κατάστημα</p>
          <input
            type="text"
            placeholder="Όνομα (π.χ. ΚΑΛΥΨΩ 102)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 16 }}
          />
          <input
            type="email"
            placeholder="Email (για ανάκτηση PIN)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 15 }}
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

      {mode === "forgot" && (
        <>
          <p className="sub">
            Βάλε το email του καταστήματος — θα λάβεις σύνδεσμο για νέο PIN.
          </p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ letterSpacing: "normal", fontSize: 15 }}
            autoFocus
          />
        </>
      )}

      {err && <p className="msg-err">{err}</p>}
      {info && <p className="msg-ok">{info}</p>}

      <button
        className="btn"
        onClick={submit}
        disabled={
          busy ||
          (mode === "login" && (!name || !pin)) ||
          (mode === "signup" && (!name || !pin || !email)) ||
          (mode === "forgot" && !email)
        }
      >
        {mode === "login"
          ? "Είσοδος"
          : mode === "signup"
          ? "Δημιουργία καταστήματος"
          : "Αποστολή συνδέσμου"}
      </button>

      <p style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {mode !== "login" && link("login", "← Είσοδος")}
        {mode === "login" && link("forgot", "Ξέχασα το PIN")}
        {mode === "login" && link("signup", "Νέο κατάστημα; Φτιάξε το εδώ")}
      </p>
    </div>
  );
}
