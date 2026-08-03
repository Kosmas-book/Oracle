// Όλοι οι κωδικοί βάρδιας του πρατηρίου.
// start/end: ώρες από τα μεσάνυχτα της ίδιας μέρας (end > 24 = ξημερώματα επόμενης).
export const SHIFTS = {
  "Π":  { label: "Πρωί",            hours: "06:00–14:00", start: 6,  end: 14, bg: "#FFE099", ink: "#5C4300" },
  "Π2": { label: "Πρωί Κυριακής",   hours: "08:00–16:00", start: 8,  end: 16, bg: "#FFD066", ink: "#5C4300" },
  "Π4": { label: "Ενδιάμεση",       hours: "10:00–18:00", start: 10, end: 18, bg: "#FFB44D", ink: "#5C3600" },
  "Α":  { label: "Απόγευμα",        hours: "14:00–22:00", start: 14, end: 22, bg: "#A9CFEA", ink: "#123B57" },
  "Α2": { label: "Απόγ. Κυριακής",  hours: "16:00–00:00", start: 16, end: 24, bg: "#82B5DC", ink: "#0E2F46" },
  "Α3": { label: "Βραδινή κάλυψη",  hours: "18:00–02:00", start: 18, end: 26, bg: "#6E86C4", ink: "#FFFFFF" },
  "Β":  { label: "Βράδυ",           hours: "22:00–06:00", start: 22, end: 30, bg: "#2B3A63", ink: "#FFFFFF" },
  "Ρ":  { label: "Ρεπό",            hours: "",            bg: "#E7E4DA", ink: "#6B6656" },
  "Ο":  { label: "Άδεια",           hours: "",            bg: "#DECBEE", ink: "#4A2E66" },
};

export const MIN_REST_HOURS = 11;

// Επιτρέπεται η nextCode την επόμενη μέρα μετά από prevCode; (κανόνας 11ωρης ανάπαυσης)
export function restOk(prevCode, nextCode) {
  const p = SHIFTS[prevCode];
  const n = SHIFTS[nextCode];
  if (!p || !n || p.end == null || n.start == null) return true; // Ρ/Ο/κενό
  return 24 + n.start - p.end >= MIN_REST_HOURS;
}

// Κωδικοί που μπορεί να απαιτήσει το πρόγραμμα (το Β ορίζεται από την εναλλαγή βραδινού).
export const REQUIRABLE = ["Π", "Π2", "Π4", "Α", "Α2", "Α3"];

// Παλέτα επεξεργασίας κελιών.
export const PAINTABLE = ["Π", "Π2", "Π4", "Α", "Α2", "Α3", "Β", "Ρ", "Ο"];

export const DAY_NAMES = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];

export function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0
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
