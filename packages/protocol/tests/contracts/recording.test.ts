import { describe, expect, it } from "vitest";

import { RecordingArtifactSchema } from "../../src/runtime/recording.js";

describe("RecordingArtifactSchema", () => {
  it("accepts snapshot steps with chosen null", () => {
    const result = RecordingArtifactSchema.safeParse({
      name: "Login Flow Demo",
      recorded_at: "2026-06-07T13:24:40.754Z",
      session_id: "bcdaa3d0-6a1e-40b2-862e-a215dad7a0c7",
      project_root: "e:\\testing-mcp\\testing-project-22",
      status: "finalized",
      steps: [
        {
          seq: 6,
          action: "snapshot",
          timestamp: "2026-06-07T13:25:23.465Z",
          url: "https://grubcenter.staging.grubtech.io/login",
          candidates: [],
          chosen: null,
          page_snapshot: {
            url: "https://grubcenter.staging.grubtech.io/login",
            title: "GrubCENTER",
            alerts: ["Incorrect username or password."],
            elements: [
              {
                ref: "ref-63bf3552",
                role: "alert",
                name: "Incorrect username or password.",
                tag: "div",
                candidates: [{ strategy: "testid", value: "login-error", attr: "e2e" }],
                chosen: { strategy: "testid", value: "login-error", attr: "e2e" },
                element: { tag: "div", name: "Incorrect username or password.", id: "login-error" }
              }
            ]
          }
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts fill, drag, and dblclick steps", () => {
    const result = RecordingArtifactSchema.safeParse({
      name: "Rich Interactions",
      recorded_at: "2026-06-14T12:00:00.000Z",
      session_id: "bcdaa3d0-6a1e-40b2-862e-a215dad7a0c7",
      project_root: "e:\\testing-mcp\\testing-project-22",
      status: "finalized",
      steps: [
        {
          seq: 1,
          action: "fill",
          timestamp: "2026-06-14T12:00:01.000Z",
          text: "75",
          chosen: { strategy: "testid", value: "volume", attr: "data-testid" },
          element: { tag: "input" }
        },
        {
          seq: 2,
          action: "drag",
          timestamp: "2026-06-14T12:00:02.000Z",
          chosen: { strategy: "testid", value: "card-1", attr: "data-testid" },
          element: { tag: "div", name: "Card" },
          target: {
            chosen: { strategy: "testid", value: "drop-zone", attr: "data-testid" },
            element: { tag: "div", name: "Drop zone" }
          }
        },
        {
          seq: 3,
          action: "dblclick",
          timestamp: "2026-06-14T12:00:03.000Z",
          chosen: { strategy: "testid", value: "row-1", attr: "data-testid" },
          element: { tag: "tr", name: "Row 1" }
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts scoped and dynamic selector candidates", () => {
    const result = RecordingArtifactSchema.safeParse({
      name: "Scoped Locators",
      recorded_at: "2026-06-14T12:00:00.000Z",
      session_id: "bcdaa3d0-6a1e-40b2-862e-a215dad7a0c7",
      project_root: "e:\\testing-mcp\\testing-project-22",
      status: "finalized",
      steps: [
        {
          seq: 1,
          action: "click",
          timestamp: "2026-06-14T12:00:01.000Z",
          chosen: {
            strategy: "scoped",
            value: 'button[name="Delete"]',
            container: { role: "row", name: "Product ABC" },
            strength: "strong"
          },
          element: { tag: "button", name: "Delete" }
        },
        {
          seq: 2,
          action: "click",
          timestamp: "2026-06-14T12:00:02.000Z",
          chosen: {
            strategy: "css",
            value: "input[name='email']",
            dynamic: true,
            strength: "weak"
          },
          element: { tag: "input" }
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts navigation_trigger and env_var step fields", () => {
    const result = RecordingArtifactSchema.safeParse({
      name: "Nav and Env",
      recorded_at: "2026-06-14T12:00:00.000Z",
      session_id: "bcdaa3d0-6a1e-40b2-862e-a215dad7a0c7",
      project_root: "e:\\testing-mcp\\testing-project-22",
      status: "finalized",
      steps: [
        {
          seq: 1,
          action: "navigate",
          timestamp: "2026-06-14T12:00:00.000Z",
          url: "https://example.com/login",
          navigation_trigger: "explicit"
        },
        {
          seq: 2,
          action: "navigate",
          timestamp: "2026-06-14T12:00:05.000Z",
          url: "https://example.com/dashboard",
          navigation_trigger: "implicit"
        },
        {
          seq: 3,
          action: "fill",
          timestamp: "2026-06-14T12:00:10.000Z",
          text: "secret123",
          env_var: true,
          env_var_name: "PASSWORD",
          chosen: { strategy: "css", value: "input[type=password]" },
          element: { tag: "input" }
        }
      ]
    });

    expect(result.success).toBe(true);
  });
});
