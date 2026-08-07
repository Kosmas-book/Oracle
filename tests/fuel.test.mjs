import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateEntry,
  outliers,
  confidenceOf,
  forecast,
  accuracyPerFuel,
  requiredLiters,
} from "../lib/fuelCalc.js";

const day = (iso, liters, extra = {}) => ({ entry_date: iso, liters, ...extra });

test("F1. Απόρριψη αρνητικών λίτρων", () => {
  const r = validateEntry({ entry_date: "2026-08-01", liters: { unl95: -5 } });
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes("αρνητικά"));
});

test("F2. Απόρριψη άγνωστου καυσίμου (whitelist)", () => {
  const r = validateEntry({ entry_date: "2026-08-01", liters: { kerosene: 100 } });
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes("Άγνωστο"));
});

test("F3. Απόρριψη μη έγκυρης ημερομηνίας", () => {
  assert.equal(validateEntry({ entry_date: "01/08/2026", liters: {} }).ok, false);
  assert.equal(validateEntry({ entry_date: "2026-13-45", liters: {} }).ok, false);
  assert.equal(validateEntry({ entry_date: "2026-08-01", liters: { unl95: 10 } }).ok, true);
});

test("F4. Εντοπισμός ακραίας τιμής", () => {
  const hist = Array.from({ length: 8 }, (_, i) =>
    day(`2026-07-0${i + 1}`, { unl95: 5000 })
  );
  assert.equal(outliers({ unl95: 5200 }, hist).length, 0);
  assert.equal(outliers({ unl95: 40000 }, hist).length, 1);
});

test("F5. Confidence με 1, 2, 3 και 4+ αντίστοιχες ημέρες", () => {
  assert.equal(confidenceOf(1).level, "low");
  assert.equal(confidenceOf(2).level, "low");
  assert.equal(confidenceOf(3).level, "medium");
  assert.equal(confidenceOf(4).level, "high");
  assert.equal(confidenceOf(9).level, "high");
  assert.equal(confidenceOf(0).level, "none");
});

test("F6. Η πρόβλεψη αναφέρει πόσες ημέρες όντως χρησιμοποίησε", () => {
  // Δύο Δευτέρες μόνο
  const entries = [
    day("2026-07-06", { unl95: 1000 }),
    day("2026-07-13", { unl95: 2000 }),
  ];
  const target = new Date("2026-07-20T00:00:00"); // Δευτέρα
  const f = forecast(entries, [target]);
  assert.equal(f.unl95[0].n, 2);
  assert.equal(f.unl95[0].value, 1500);
  assert.equal(confidenceOf(f.unl95[0].n).level, "low");
});

test("F7. Εξαιρεμένη ημέρα δεν μπαίνει στην πρόβλεψη", () => {
  const entries = [
    day("2026-07-06", { unl95: 1000 }),
    day("2026-07-13", { unl95: 9999 }, { excluded: true }),
  ];
  const f = forecast(entries, [new Date("2026-07-20T00:00:00")]);
  assert.equal(f.unl95[0].n, 1);
  assert.equal(f.unl95[0].value, 1000);
});

test("F8. Accuracy ΞΕΧΩΡΙΣΤΑ ανά καύσιμο — αντίθετα λάθη δεν αλληλοεξουδετερώνονται", () => {
  // 95άρα σταθερά υπερεκτιμημένη, diesel σταθερά υποεκτιμημένη
  const entries = [];
  const mondays = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"];
  mondays.forEach((d, i) => {
    entries.push(day(d, { unl95: 1000, diesel: 1000 }));
  });
  // Συμμετρικά αντίθετα λάθη: −50% στη 95άρα, +50% στο diesel.
  entries.push(day("2026-07-06", { unl95: 500, diesel: 1500 }));
  const acc = accuracyPerFuel(entries);
  assert.ok(acc.unl95, "λείπει ακρίβεια 95");
  assert.ok(acc.diesel, "λείπει ακρίβεια diesel");
  assert.equal(acc.unl95.tendency, "over", "η 95άρα υπερεκτιμήθηκε");
  assert.equal(acc.diesel.tendency, "under", "το diesel υποεκτιμήθηκε");
  assert.ok(acc.unl95.mape > 0 && acc.diesel.mape > 0, "μηδενική απόκλιση");
  // Το ΚΡΙΣΙΜΟ: ένα συνολικό νούμερο θα έκρυβε τα δύο αντίθετα λάθη,
  // γιατί τα bias αλληλοεξουδετερώνονται.
  const combinedBias = acc.unl95.bias + acc.diesel.bias;
  assert.ok(
    Math.abs(combinedBias) < 0.001,
    `συνολικό bias ${combinedBias}: θα έδειχνε ψευδώς «τέλεια πρόβλεψη»`
  );
  assert.ok(
    Math.abs(acc.unl95.bias) > 10 && Math.abs(acc.diesel.bias) > 10,
    "τα επιμέρους λάθη πρέπει να παραμένουν ορατά"
  );
});

test("F9. Απαιτούμενα λίτρα με ποσοστά ανά ημέρα", () => {
  const perFuel = {
    unl95: [{ value: 1000, n: 4 }, { value: 2000, n: 4 }],
    unl98: [{ value: 100, n: 4 }, { value: 200, n: 4 }],
    unl100: [], diesel: [], diesel_avio: [],
  };
  const r = requiredLiters(perFuel, { 0: 0.5, 1: 1 });
  assert.equal(r.unl95, 2500);
  assert.equal(r.unl98, 250);
  assert.equal(r.diesel, undefined);
});

test("F10. Αυστηρός έλεγχος ημερολογιακών ημερομηνιών", () => {
  const ok = (d) => validateEntry({ entry_date: d, liters: { unl95: 1 } }).ok;
  assert.equal(ok("2026-02-28"), true, "2026-02-28 έγκυρη");
  assert.equal(ok("2026-02-29"), false, "το 2026 δεν είναι δίσεκτο");
  assert.equal(ok("2028-02-29"), true, "το 2028 είναι δίσεκτο");
  assert.equal(ok("2026-02-30"), false);
  assert.equal(ok("2026-02-31"), false);
  assert.equal(ok("2026-04-31"), false, "ο Απρίλιος έχει 30");
  assert.equal(ok("2026-13-01"), false);
  assert.equal(ok("2026-00-10"), false);
  assert.equal(ok("2026-12-31"), true);
});

test("F11. Οι εξαιρεμένες ημέρες αγνοούνται στον εντοπισμό ακραίων τιμών", () => {
  // Ιστορικό με διάμεσο 5000, αλλά γεμάτο εξαιρεμένες ακραίες τιμές.
  const hist = [
    ...Array.from({ length: 6 }, (_, i) =>
      day(`2026-07-0${i + 1}`, { unl95: 5000 })
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      day(`2026-07-1${i}`, { unl95: 60000 }, { excluded: true })
    ),
  ];
  // Χωρίς φιλτράρισμα η διάμεσος θα ανέβαινε και το 40000 θα φαινόταν φυσιολογικό.
  assert.equal(outliers({ unl95: 40000 }, hist).length, 1, "δεν εντοπίστηκε ακραία τιμή");
  assert.equal(outliers({ unl95: 5100 }, hist).length, 0);
});
