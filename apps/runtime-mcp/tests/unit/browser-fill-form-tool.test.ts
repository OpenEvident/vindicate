import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import {
  buildFillFormSteps,
  formatFillFormFailure,
  formatFillFormSuccess,
  redactFillFormLogFields,
  registerBrowserFillFormTool,
  REDACTED_LOG_VALUE,
  type FillFormField
} from "../../src/mcp/tools/browser-fill-form-tool.js";
import type {
  CommandStreamOptions,
  ICommandRunner,
  StepResult,
  StepsResult,
  WorkerStep
} from "../../src/worker/worker-client.interface.js";

describe("buildFillFormSteps", () => {
  it("builds a fill step with value", () => {
    const steps = buildFillFormSteps([{ ref: "ref-00000001", action: "fill", value: "hello" }]);
    expect(steps).toEqual([{ action: "fill", ref: "ref-00000001", value: "hello" }]);
  });

  it("normalizes a bare-hex ref the same way browser_act does", () => {
    const steps = buildFillFormSteps([{ ref: "00000001", action: "fill", value: "x" }]);
    expect(steps[0]).toMatchObject({ ref: "ref-00000001" });
  });

  it("maps 'select' to worker action select_option", () => {
    const steps = buildFillFormSteps([{ ref: "ref-00000001", action: "select", value: "AED" }]);
    expect(steps).toEqual([{ action: "select_option", ref: "ref-00000001", value: "AED" }]);
  });

  it("builds check/uncheck with no value", () => {
    const steps = buildFillFormSteps([
      { ref: "ref-00000001", action: "check" },
      { ref: "ref-00000002", action: "uncheck" }
    ]);
    expect(steps).toEqual([
      { action: "check", ref: "ref-00000001" },
      { action: "uncheck", ref: "ref-00000002" }
    ]);
  });

  it("sets clear_first on type when value is an empty string", () => {
    const steps = buildFillFormSteps([{ ref: "ref-00000001", action: "type", value: "" }]);
    expect(steps).toEqual([{ action: "type", ref: "ref-00000001", value: "", clear_first: true }]);
  });

  it("does not set clear_first on type when value is non-empty", () => {
    const steps = buildFillFormSteps([{ ref: "ref-00000001", action: "type", value: "hi" }]);
    expect(steps).toEqual([{ action: "type", ref: "ref-00000001", value: "hi" }]);
  });

  it("processes fields in order, one worker step per field", () => {
    const fields: FillFormField[] = [
      { ref: "ref-00000001", action: "fill", value: "a" },
      { ref: "ref-00000002", action: "fill", value: "b" },
      { ref: "ref-00000003", action: "check" }
    ];
    expect(buildFillFormSteps(fields)).toHaveLength(3);
  });

  it("throws naming the field index and ref when fill is missing value", () => {
    expect(() => buildFillFormSteps([{ ref: "ref-00000001", action: "fill" }])).toThrow(
      /Field 0 \(ref-00000001, action 'fill'\) requires 'value'/
    );
  });

  it("throws when type is missing value", () => {
    expect(() => buildFillFormSteps([{ ref: "ref-00000001", action: "type" }])).toThrow(/requires 'value'/);
  });

  it("throws when select is missing value", () => {
    expect(() => buildFillFormSteps([{ ref: "ref-00000001", action: "select" }])).toThrow(/requires 'value'/);
  });

  it("throws a field-specific message for the second field, not the first", () => {
    const fields: FillFormField[] = [
      { ref: "ref-00000001", action: "fill", value: "ok" },
      { ref: "ref-00000002", action: "fill" }
    ];
    expect(() => buildFillFormSteps(fields)).toThrow(/Field 1 \(ref-00000002, action 'fill'\)/);
  });

  it("throws when check/uncheck is given a value (likely agent mistake)", () => {
    expect(() =>
      buildFillFormSteps([{ ref: "ref-00000001", action: "check", value: "true" }])
    ).toThrow(/does not take 'value'/);
  });

  it("validates and normalizes every field before any network call — no partial construction on error", () => {
    // second field is invalid; buildFillFormSteps must throw rather than returning [validStep, undefined]
    const fields: FillFormField[] = [
      { ref: "ref-00000001", action: "fill", value: "ok" },
      { ref: "ref-00000002", action: "select" }
    ];
    expect(() => buildFillFormSteps(fields)).toThrow();
  });
});

describe("redactFillFormLogFields", () => {
  it("redacts values for fill/type/select but preserves length metadata", () => {
    const out = redactFillFormLogFields([
      { ref: "ref-00000001", action: "fill", value: "user@example.com" },
      { ref: "ref-00000002", action: "type", value: "secret123" },
      { ref: "ref-00000003", action: "select", value: "AED" }
    ]);
    expect(out).toEqual([
      { ref: "ref-00000001", action: "fill", value: REDACTED_LOG_VALUE, value_len: 16 },
      { ref: "ref-00000002", action: "type", value: REDACTED_LOG_VALUE, value_len: 9 },
      { ref: "ref-00000003", action: "select", value: REDACTED_LOG_VALUE, value_len: 3 }
    ]);
  });

  it("leaves check/uncheck fields unchanged (no sensitive value)", () => {
    const out = redactFillFormLogFields([{ ref: "ref-00000001", action: "check" }]);
    expect(out).toEqual([{ ref: "ref-00000001", action: "check" }]);
  });
});

describe("formatFillFormSuccess", () => {
  it("shapes a clean per-field success response", () => {
    const fields: FillFormField[] = [
      { ref: "ref-00000001", action: "fill", value: "a" },
      { ref: "ref-00000002", action: "check" }
    ];
    const stepResults = [{ result: { ok: true } }, { result: { ok: true } }];
    expect(formatFillFormSuccess(fields, stepResults)).toEqual({
      ok: true,
      fields: [
        { ref: "ref-00000001", action: "fill", ok: true },
        { ref: "ref-00000002", action: "check", ok: true }
      ]
    });
  });

  it("passes through a per-field hint (e.g. the fill-empty-readback warning) without dropping it", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "fill", value: "Product-x" }];
    const stepResults = [
      { result: { ok: true, hint: "fill() reported success but the field reads back empty..." } }
    ];
    const response = formatFillFormSuccess(fields, stepResults);
    expect(response.fields[0]?.hint).toBe("fill() reported success but the field reads back empty...");
  });

  it("does not attach a hint field when the step result has none", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "fill", value: "a" }];
    const response = formatFillFormSuccess(fields, [{ result: { ok: true } }]);
    expect(response.fields[0]).not.toHaveProperty("hint");
  });

  it("tolerates a missing or malformed step result defensively rather than throwing", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "fill", value: "a" }];
    expect(() => formatFillFormSuccess(fields, [])).not.toThrow();
    const response = formatFillFormSuccess(fields, [{ result: undefined }]);
    expect(response.fields[0]).toEqual({ ref: "ref-00000001", action: "fill", ok: true });
  });

  it("surfaces ok:false for an individual field whose result explicitly says ok:false", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "check" }];
    const response = formatFillFormSuccess(fields, [{ result: { ok: false } }]);
    expect(response.fields[0]?.ok).toBe(false);
  });

  it("passes through the selected value(s) echoed back from a select field", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "select", value: "se" }];
    const response = formatFillFormSuccess(fields, [{ result: { ok: true, selected: ["se"] } }]);
    expect(response.fields[0]?.selected).toEqual(["se"]);
  });

  it("does not attach a selected field for actions that don't have one", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "fill", value: "a" }];
    const response = formatFillFormSuccess(fields, [{ result: { ok: true } }]);
    expect(response.fields[0]).not.toHaveProperty("selected");
  });

  it("ignores a malformed selected value (not a string array) rather than surfacing garbage", () => {
    const fields: FillFormField[] = [{ ref: "ref-00000001", action: "select", value: "se" }];
    const response = formatFillFormSuccess(fields, [{ result: { ok: true, selected: "not-an-array" } }]);
    expect(response.fields[0]).not.toHaveProperty("selected");
  });
});

describe("formatFillFormFailure", () => {
  const fields: FillFormField[] = [
    { ref: "ref-00000001", action: "fill", value: "a" },
    { ref: "ref-00000002", action: "fill", value: "b" },
    { ref: "ref-00000003", action: "select", value: "AED" }
  ];

  it("splits completed vs remaining at the failed index — remaining includes the failed field itself", () => {
    const response = formatFillFormFailure(fields, {
      step: 1,
      action: "fill",
      error: "Timeout 30000ms exceeded"
    });
    expect(response.ok).toBe(false);
    expect(response.failed_at).toEqual({ index: 1, ref: "ref-00000002", action: "fill" });
    expect(response.error).toBe("Timeout 30000ms exceeded");
    expect(response.completed).toEqual([{ ref: "ref-00000001", action: "fill" }]);
    expect(response.remaining).toEqual([
      { ref: "ref-00000002", action: "fill" },
      { ref: "ref-00000003", action: "select" }
    ]);
  });

  it("handles failure on the very first field — nothing completed, everything remaining", () => {
    const response = formatFillFormFailure(fields, { step: 0, action: "fill", error: "not found" });
    expect(response.completed).toEqual([]);
    expect(response.remaining).toHaveLength(3);
  });

  it("handles failure on the very last field — everything before it completed", () => {
    const response = formatFillFormFailure(fields, { step: 2, action: "select_option", error: "ambiguous" });
    expect(response.completed).toHaveLength(2);
    expect(response.remaining).toEqual([{ ref: "ref-00000003", action: "select" }]);
  });

  it("includes a hint telling the agent to re-verify and continue with browser_act", () => {
    const response = formatFillFormFailure(fields, { step: 1, action: "fill", error: "x" });
    expect(response.hint).toMatch(/browser_read/);
    expect(response.hint).toMatch(/browser_act/);
    expect(response.hint).toContain("1 of 3");
  });

  it("falls back gracefully when the failed event carries a non-string error", () => {
    const response = formatFillFormFailure(fields, { step: 0, action: "fill", error: undefined });
    expect(response.error).toBe("Field action failed");
  });
});

describe("registerBrowserFillFormTool — full handler wiring", () => {
  class FakeCommandRunner implements ICommandRunner {
    runStepsCalls: Array<{ steps: WorkerStep[]; options?: CommandStreamOptions | undefined }> = [];
    behavior: (steps: WorkerStep[], options?: CommandStreamOptions) => Promise<StepsResult> = () =>
      Promise.resolve({ steps: [] });

    async runStep(): Promise<StepResult> {
      throw new Error("not used by browser_fill_form");
    }

    async runSteps(_sessionId: string, steps: WorkerStep[], options?: CommandStreamOptions): Promise<StepsResult> {
      this.runStepsCalls.push({ steps, options });
      return this.behavior(steps, options);
    }
  }

  function captureHandler(workerClient: ICommandRunner) {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const spy = vi.spyOn(server, "registerTool");
    registerBrowserFillFormTool(server, workerClient);
    const call = spy.mock.calls.find((c) => c[0] === "browser_fill_form");
    if (call === undefined) {
      throw new Error("browser_fill_form was not registered");
    }
    return call[2] as (args: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>;
  }

  function jsonOf(result: { content: Array<{ type: string; text: string }> }): unknown {
    return JSON.parse(result.content[0]?.text ?? "null");
  }

  const SESSION_ID = "3bc5464c-7514-4f03-b32c-545ca2896def";

  it("on full success, returns ok:true with per-field results straight from the worker", async () => {
    const runner = new FakeCommandRunner();
    runner.behavior = () =>
      Promise.resolve({
        steps: [{ step: 0, result: { ok: true } }, { step: 1, result: { ok: true, hint: "check readback" } }]
      });
    const handler = captureHandler(runner);

    const result = await handler({
      session_id: SESSION_ID,
      fields: [
        { ref: "ref-00000001", action: "fill", value: "a" },
        { ref: "ref-00000002", action: "fill", value: "b" }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(jsonOf(result)).toEqual({
      ok: true,
      fields: [
        { ref: "ref-00000001", action: "fill", ok: true },
        { ref: "ref-00000002", action: "fill", ok: true, hint: "check readback" }
      ]
    });
  });

  it("sizes the batch timeout from field count (default 30s/field + 10s margin), not a single-step timeout", async () => {
    const runner = new FakeCommandRunner();
    runner.behavior = () => Promise.resolve({ steps: [{ step: 0, result: { ok: true } }, { step: 1, result: { ok: true } }, { step: 2, result: { ok: true } }] });
    const handler = captureHandler(runner);

    await handler({
      session_id: SESSION_ID,
      fields: [
        { ref: "ref-00000001", action: "fill", value: "a" },
        { ref: "ref-00000002", action: "fill", value: "b" },
        { ref: "ref-00000003", action: "check" }
      ]
    });

    expect(runner.runStepsCalls[0]?.options?.timeoutMs).toBe(3 * 30_000 + 10_000);
  });

  it("an explicit timeout_ms overrides both the per-step timeout and the batch timeout math", async () => {
    const runner = new FakeCommandRunner();
    runner.behavior = () => Promise.resolve({ steps: [{ step: 0, result: { ok: true } }] });
    const handler = captureHandler(runner);

    await handler({
      session_id: SESSION_ID,
      fields: [{ ref: "ref-00000001", action: "fill", value: "a" }],
      timeout_ms: 5_000
    });

    expect(runner.runStepsCalls[0]?.options?.timeoutMs).toBe(1 * 5_000 + 10_000);
    expect(runner.runStepsCalls[0]?.steps[0]?.timeout_ms).toBe(5_000);
  });

  it("on a mid-batch field failure, captures the SSE 'failed' event via onEvent and returns a structured ok:false result (not an MCP error)", async () => {
    const runner = new FakeCommandRunner();
    runner.behavior = (_steps, options) => {
      options?.onEvent?.({ event: "step_completed", step: 0 });
      options?.onEvent?.({ event: "failed", step: 1, action: "fill", error: "Timeout 30000ms exceeded", code: "browser.action_timeout" });
      return Promise.reject(new Error("Timeout 30000ms exceeded"));
    };
    const handler = captureHandler(runner);

    const result = await handler({
      session_id: SESSION_ID,
      fields: [
        { ref: "ref-00000001", action: "fill", value: "a" },
        { ref: "ref-00000002", action: "fill", value: "b" },
        { ref: "ref-00000003", action: "check" }
      ]
    });

    expect(result.isError).toBeUndefined();
    const body = jsonOf(result) as { ok: boolean; failed_at: unknown; completed: unknown[]; remaining: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.failed_at).toEqual({ index: 1, ref: "ref-00000002", action: "fill" });
    expect(body.completed).toEqual([{ ref: "ref-00000001", action: "fill" }]);
    expect(body.remaining).toEqual([
      { ref: "ref-00000002", action: "fill" },
      { ref: "ref-00000003", action: "check" }
    ]);
  });

  it("on a hard failure with no captured field-level event (e.g. session not found), returns a real MCP error instead of guessing", async () => {
    const runner = new FakeCommandRunner();
    runner.behavior = () => Promise.reject(new Error("Session not found"));
    const handler = captureHandler(runner);

    const result = await handler({
      session_id: SESSION_ID,
      fields: [{ ref: "ref-00000001", action: "fill", value: "a" }]
    });

    expect(result.isError).toBe(true);
  });

  it("rejects invalid field input before ever calling the worker", async () => {
    const runner = new FakeCommandRunner();
    const handler = captureHandler(runner);

    const result = await handler({
      session_id: SESSION_ID,
      fields: [{ ref: "ref-00000001", action: "fill" }]
    });

    expect(result.isError).toBe(true);
    expect(runner.runStepsCalls).toHaveLength(0);
  });
});
