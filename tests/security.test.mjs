import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  escapeHtml,
  hashOpaqueToken,
  hashPin,
  validPin,
  verifyLegacyPin,
  verifyPin,
  verifySessionToken,
} from "../lib/authSecurity.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "a-secure-test-secret-with-more-than-32-characters";

test("SEC1. Το PIN αποθηκεύεται ως salted scrypt hash", async () => {
  const first = await hashPin("123456");
  const second = await hashPin("123456");
  assert.notEqual(first, second);
  assert.equal(first.includes("123456"), false);
  assert.equal(await verifyPin("123456", first), true);
  assert.equal(await verifyPin("654321", first), false);
});

test("SEC2. Νέα PIN 6–12 ψηφία, legacy login από 4", () => {
  assert.equal(validPin("123456"), true);
  assert.equal(validPin("1234"), false);
  assert.equal(validPin("1234", { allowLegacy: true }), true);
  assert.equal(validPin("12ab56"), false);
  assert.equal(verifyLegacyPin("1234", "1234"), true);
  assert.equal(verifyLegacyPin("1234", "9999"), false);
});

test("SEC3. Υπογεγραμμένο session επαληθεύεται και ανιχνεύει αλλοίωση", () => {
  const token = createSessionToken(UUID, 3, { secret: SECRET, now: 1_000 });
  assert.deepEqual(verifySessionToken(token, { secret: SECRET, now: 1_001 }), {
    stationId: UUID,
    sessionVersion: 3,
    expiresAt: 1_000 + 60 * 60 * 24 * 30,
  });
  assert.equal(verifySessionToken(token + "x", { secret: SECRET, now: 1_001 }), null);
  assert.equal(verifySessionToken(token, { secret: SECRET + "x", now: 1_001 }), null);
  assert.equal(
    verifySessionToken(token, { secret: SECRET, now: 1_000 + 60 * 60 * 24 * 30 }),
    null
  );
});

test("SEC4. Reset token γίνεται μονόδρομο hash και το email HTML γίνεται escape", () => {
  assert.equal(hashOpaqueToken("abc"), hashOpaqueToken("abc"));
  assert.notEqual(hashOpaqueToken("abc"), "abc");
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});
