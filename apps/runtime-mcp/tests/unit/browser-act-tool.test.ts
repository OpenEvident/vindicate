import { describe, expect, it } from "vitest";

import {
  buildWorkerStepForTest,
  redactBrowserActLogArgs,
  REDACTED_LOG_VALUE
} from "../../src/mcp/tools/browser-act-tool.js";

describe("redactBrowserActLogArgs", () => {
  it("redacts fill and type values while preserving length metadata", () => {
    const out = redactBrowserActLogArgs({
      session_id: "3bc5464c-7514-4f03-b32c-545ca2896def",
      action: "fill",
      ref: "ref-4fda6f59",
      value: "cagirew568@nriza.com"
    });
    expect(out.value).toBe(REDACTED_LOG_VALUE);
    expect(out.value_len).toBe(20);
    expect(out.ref).toBe("ref-4fda6f59");
  });

  it("leaves non-sensitive actions unchanged", () => {
    const out = redactBrowserActLogArgs({
      session_id: "3bc5464c-7514-4f03-b32c-545ca2896def",
      action: "click",
      ref: "ref-4fda6f59"
    });
    expect(out).toEqual({
      session_id: "3bc5464c-7514-4f03-b32c-545ca2896def",
      action: "click",
      ref: "ref-4fda6f59"
    });
  });
});

describe("buildWorkerStep", () => {
  it("maps fill to worker fill with value", () => {
    expect(buildWorkerStepForTest("fill", "ref-00000001", { value: "75" })).toEqual({
      action: "fill",
      ref: "ref-00000001",
      value: "75"
    });
  });

  it("maps dblclick and hover verbatim", () => {
    expect(buildWorkerStepForTest("dblclick", "ref-00000002", {})).toEqual({
      action: "dblclick",
      ref: "ref-00000002"
    });
    expect(buildWorkerStepForTest("hover", "ref-00000003", {})).toEqual({
      action: "hover",
      ref: "ref-00000003"
    });
  });

  it("maps drag with to_ref, strategy, and steps", () => {
    expect(
      buildWorkerStepForTest("drag", "ref-00000001", {
        to_ref: "ref-00000002",
        strategy: "native",
        steps: 5
      })
    ).toEqual({
      action: "drag",
      ref: "ref-00000001",
      to_ref: "ref-00000002",
      strategy: "native",
      steps: 5
    });
  });

  it("throws when drag is missing to_ref", () => {
    expect(() => buildWorkerStepForTest("drag", "ref-00000001", {})).toThrow(/to_ref/);
  });

  it("maps upload with sample through to worker (no path resolution on MCP)", () => {
    expect(buildWorkerStepForTest("upload_file", "ref-00000001", { sample: "pdf" })).toEqual({
      action: "upload_file",
      ref: "ref-00000001",
      sample: "pdf"
    });
  });

  it("forwards timeout_ms to the worker step so it is honored", () => {
    expect(buildWorkerStepForTest("click", "ref-00000001", { timeout_ms: 10_000 })).toEqual({
      action: "click",
      ref: "ref-00000001",
      timeout_ms: 10_000
    });
  });

  it("normalizes bare hex refs", () => {
    expect(buildWorkerStepForTest("fill", "00000001", { value: "x" }).ref).toBe("ref-00000001");
    expect(buildWorkerStepForTest("drag", "00000001", { to_ref: "00000002" }).to_ref).toBe(
      "ref-00000002"
    );
  });
});
