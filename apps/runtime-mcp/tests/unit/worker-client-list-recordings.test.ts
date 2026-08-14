import { describe, expect, it, vi } from "vitest";

import { WorkerClient } from "../../src/worker/worker-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("WorkerClient.listRecordings", () => {
  it("parses worker list response without a top-level version field", async () => {
    const entry = {
      name: "auth-login-flow",
      safe_name: "auth-login-flow",
      path: ".vindicate/recordings/auth-login-flow.json",
      summary: "Admin logs in",
      pre_conditions: ["Fresh session at login page"],
      post_conditions: ["User is authenticated"],
      depends_on: [],
      pages_covered: ["https://example.com/login"],
      started_by: "agent" as const,
      recorded_at: "2026-06-19T11:30:23.705Z",
      step_count: 6,
      status: "finalized" as const
    };

    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ entries: [entry] }));

    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 40,
      healthProbeMs: 10,
      fetchFn
    });

    const result = await client.listRecordings("E:\\testing-mcp\\testing-v4-1");

    expect(result.entries).toEqual([entry]);
  });
});
