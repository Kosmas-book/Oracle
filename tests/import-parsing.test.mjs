import test from "node:test";
import assert from "node:assert/strict";
import { excelToISO, parseCsv } from "../lib/importParsing.js";

test("IMP1. CSV με ελληνικό διαχωριστικό και quoted τιμές", () => {
  const rows = parseCsv('Ημερομηνία;95;Diesel\r\n01/08/2026;"1.234,5";900\r\n');
  assert.deepEqual(rows, [
    ["Ημερομηνία", "95", "Diesel"],
    ["01/08/2026", "1.234,5", "900"],
  ]);
});

test("IMP2. CSV με κόμμα μέσα σε quoted κελί", () => {
  const rows = parseCsv('date,notes\n2026-08-01,"τιμή, δοκιμή"');
  assert.deepEqual(rows[1], ["2026-08-01", "τιμή, δοκιμή"]);
});

test("IMP3. Ημερομηνίες Excel/ISO/ελληνικής μορφής", () => {
  assert.equal(excelToISO("2026-8-1"), "2026-08-01");
  assert.equal(excelToISO("1/8/26"), "2026-08-01");
  assert.equal(excelToISO(new Date("2026-08-01T00:00:00Z")), "2026-08-01");
  assert.equal(excelToISO("όχι ημερομηνία"), null);
});
