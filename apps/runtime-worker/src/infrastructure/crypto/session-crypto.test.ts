import { describe, expect, it } from "vitest";

import { PlaintextSessionCrypto } from "./session-crypto.js";

describe("PlaintextSessionCrypto", () => {
  it("round-trips UTF-8 text", async () => {
    const crypto = new PlaintextSessionCrypto();
    const enc = await crypto.encrypt('{"hello":"world"}');
    const dec = await crypto.decrypt(enc);
    expect(dec).toBe('{"hello":"world"}');
  });
});
