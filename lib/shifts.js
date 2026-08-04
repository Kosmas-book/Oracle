// Προεπιλεγμένες βάρδιες (μοτίβο ΚΑΛΥΨΩ 024). Κάθε κατάστημα μπορεί να ορίσει
// τις δικές του στις Ρυθμίσεις — αυτές χρησιμοποιούνται μόνο όσο δεν έχει.
// start/end: ώρες από τα μεσάνυχτα (end > 24 = ξημερώματα επόμενης μέρας).
export const DEFAULT_SHIFTS = {
  "Π":  { label: "Πρωί",           start: 6,  end: 14 },
  "Π2": { label: "Πρωί Κυριακής",  start: 8,  end: 16 },
  "Π4": { label: "Ενδιάμεση",      start: 10, end: 18 },
  "Α":  { label: "Απόγευμα",       start: 14, end: 22 },
  "Α2": { label: "Απόγ. Κυριακής", start: 16, end: 24 },
  "Α3": { label: "Βραδινή κάλυψη", start: 18, end: 26 },
  "Β":  { label: "Βράδυ",          start: 22, end: 30 },
};

// Συστημικοί κωδικοί — υπάρχουν πάντα, δεν επεξεργάζονται.
export const SYSTEM_CODES = {
  "Ρ": { label: "Ρεπό",  bg: "#E7E4DA", ink: "#6B6656", hours: "" },
  "Ο": { label: "Άδεια", bg: "#DECBEE", ink: "#4A2E66", hours: "" },
};

export const MIN_REST_HOURS = 11;

function hh(h) {
  const x = ((h % 24) + 24) % 24;
  const m = Math.round((x % 1) * 60);
  return String(Math.floor(x)).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function styleFor(code, def) {
  if (code === "Β") return { bg: "#2B3A63", ink: "#FFFFFF" };
  const s = def.start ?? 12;
  if (s < 8) return { bg: "#FFE099", ink: "#5C4300" };
  if (s < 10) return { bg: "#FFD066", ink: "#5C4300" };
  if (s < 13) return { bg: "#FFB44D", ink: "#5C3600" };
  if (s < 16) return { bg: "#A9CFEA", ink: "#123B57" };
  if (s < 18) return { bg: "#82B5DC", ink: "#0E2F46" };
  return { bg: "#6E86C4", ink: "#FFFFFF" };
}

// Πλήρης χάρτης βαρδιών καταστήματος: ωράρια + χρώματα + κείμενο ωρών + Ρ/Ο.
export function allShifts(custom) {
  const base =
    custom && typeof custom === "object" && Object.keys(custom).length
      ? custom
      : DEFAULT_SHIFTS;
  const out = {};
  for (const [code, def] of Object.entries(base)) {
    if (def == null || def.start == null || def.end == null) continue;
    out[code] = {
      label: def.label || code,
      start: Number(def.start),
      end: Number(def.end),
      hours: hh(def.start) + "–" + hh(def.end),
      ...styleFor(code, def),
    };
  }
  return { ...out, ...SYSTEM_CODES };
}

// 11ωρη ανάπαυση μεταξύ διαδοχικών ημερών, με βάση τον χάρτη βαρδιών SH.
export function restOk(prevCode, nextCode, SH) {
  const p = SH[prevCode];
  const n = SH[nextCode];
  if (!p || !n || p.end == null || n.start == null) return true;
  return 24 + n.start - p.end >= MIN_REST_HOURS;
}

export const DAY_NAMES = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];

export function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDate(d) {
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  return new Date(x.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtShort(d) {
  const x = new Date(d);
  return `${x.getDate()}/${x.getMonth() + 1}`;
}
