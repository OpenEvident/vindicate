import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  assertConsumerCompatibility,
  isCompatibleProtocolVersion
} from "../../src/index.js";

describe("versioning", () => {
  it("exposes current protocol version", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
  });

  it("checks compatibility by major/minor", () => {
    expect(isCompatibleProtocolVersion("1.0.0", "1.0.0")).toBe(true);
    expect(isCompatibleProtocolVersion("1.1.0", "1.0.0")).toBe(false);
    expect(isCompatibleProtocolVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("validates consumer compatibility range", () => {
    expect(() => assertConsumerCompatibility("runtime-mcp", "1.0.0")).not.toThrow();
    expect(() => assertConsumerCompatibility("runtime-mcp", "0.9.0")).toThrow();
  });
});
