import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TraceabilityMatcher } from "../../../src/extension/filesystem/TraceabilityMatcher";

describe("TraceabilityMatcher", () => {
  const root = path.join(process.cwd(), "tests", "tmp-trace");
  const matcher = new TraceabilityMatcher();

  beforeEach(async () => {
    await mkdir(path.join(root, "tests"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("matches authentication via filename", async () => {
    await writeFile(
      path.join(root, "tests", "authentication.spec.ts"),
      'test("x", () => {});',
      "utf8"
    );
    expect(await matcher.match("authentication", root)).toBe(true);
  });

  it("matches payments via describe() scan", async () => {
    await writeFile(
      path.join(root, "tests", "flows.spec.ts"),
      "describe('Payments checkout', () => {});",
      "utf8"
    );
    expect(await matcher.match("payments", root)).toBe(true);
  });

  it("returns false when no match", async () => {
    await writeFile(
      path.join(root, "tests", "other.spec.ts"),
      'describe("Other", () => {});',
      "utf8"
    );
    expect(await matcher.match("reporting", root)).toBe(false);
  });

  it("matchAll returns correct map", async () => {
    await writeFile(path.join(root, "tests", "auth.spec.ts"), "", "utf8");
    const map = await matcher.matchAll(["auth", "missing"], root);
    expect(map.get("auth")).toBe(true);
    expect(map.get("missing")).toBe(false);
  });

  it("ignores node_modules", async () => {
    await writeFile(path.join(root, "node_modules", "ignored", "auth.spec.ts"), "", "utf8");
    expect(await matcher.match("auth", root)).toBe(false);
  });
});
