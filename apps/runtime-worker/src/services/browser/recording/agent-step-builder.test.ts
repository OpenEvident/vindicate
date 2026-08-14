import { describe, expect, it } from "vitest";

import { buildAgentStepPayload } from "./agent-step-builder.js";
import type { ElementDescriptor } from "../snapshot/element-descriptor.js";

describe("buildAgentStepPayload", () => {
  const descriptor: ElementDescriptor = {
    testid: "submit-btn",
    testidAttr: "data-testid",
    tag: "button",
    role: "button",
    name: "Submit",
    snapshotUrl: "https://app.test/"
  };

  it("maps select_option to select and forwards strength via candidates", () => {
    const payload = buildAgentStepPayload(
      { action: "select_option", ref: "ref-1", value: "admin" },
      () => descriptor
    );
    expect(payload?.action).toBe("select");
    expect(payload?.actor).toBe("agent");
    expect(payload?.candidates[0]?.strength).toBe("strong");
    expect(payload?.chosen?.strategy).toBe("testid");
  });

  it("returns undefined for non-recordable actions", () => {
    expect(buildAgentStepPayload({ action: "wait_for_load_state" }, () => descriptor)).toBeUndefined();
  });

  it("forwards frame_path from the verified descriptor locator onto the recorded candidate", () => {
    const iframeDescriptor: ElementDescriptor = {
      ...descriptor,
      locator: {
        strategy: "role_name",
        confidence: "high",
        role: "textbox",
        name: "Email",
        frame_path: [{ strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" }]
      }
    };
    const payload = buildAgentStepPayload({ action: "click", ref: "ref-1" }, () => iframeDescriptor);
    expect(payload?.candidates[0]?.frame_path).toEqual([
      { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" }
    ]);
  });

  it("omits frame_path entirely when the descriptor locator has none (no regression)", () => {
    const payload = buildAgentStepPayload({ action: "click", ref: "ref-1" }, () => descriptor);
    expect(payload?.candidates[0]?.frame_path).toBeUndefined();
  });

  it("forwards click_delegate from the verified descriptor locator onto the recorded candidate", () => {
    const delegateDescriptor: ElementDescriptor = {
      ...descriptor,
      locator: {
        strategy: "text",
        confidence: "high",
        value: "GAY EVENT",
        click_delegate: true
      }
    };
    const payload = buildAgentStepPayload({ action: "click", ref: "ref-1" }, () => delegateDescriptor);
    expect(payload?.candidates[0]?.click_delegate).toBe(true);
  });

  it("omits click_delegate entirely when the descriptor locator isn't delegate-derived (no regression)", () => {
    const payload = buildAgentStepPayload({ action: "click", ref: "ref-1" }, () => descriptor);
    expect(payload?.candidates[0]?.click_delegate).toBeUndefined();
  });

  describe("tab actions", () => {
    it("records new_tab with the resolved url from the command result", () => {
      const payload = buildAgentStepPayload(
        { action: "new_tab", url: "https://example.com" },
        () => descriptor,
        { tabIndex: 1, url: "https://example.com/" }
      );
      expect(payload).toMatchObject({ action: "new_tab", actor: "agent", url: "https://example.com/" });
      expect(payload?.candidates).toEqual([]);
      expect(payload?.chosen).toBeNull();
    });

    it("records switch_tab with the index from the step input", () => {
      const payload = buildAgentStepPayload(
        { action: "switch_tab", index: 2 },
        () => descriptor,
        { title: "Popup", url: "https://payments.example.com/" }
      );
      expect(payload).toMatchObject({
        action: "switch_tab",
        index: 2,
        url: "https://payments.example.com/"
      });
    });

    it("records switch_tab_by_url, preferring the resolved result url over the input pattern", () => {
      const payload = buildAgentStepPayload(
        { action: "switch_tab_by_url", url_pattern: "klarna.com" },
        () => descriptor,
        { title: "Klarna", url: "https://checkout.klarna.com/session/abc123" }
      );
      expect(payload?.url).toBe("https://checkout.klarna.com/session/abc123");
    });

    it("falls back to the input url_pattern when no result is available", () => {
      const payload = buildAgentStepPayload({ action: "switch_tab_by_url", url_pattern: "klarna.com" }, () => descriptor);
      expect(payload?.url).toBe("klarna.com");
    });

    it("records close_tab even with no url in the result", () => {
      const payload = buildAgentStepPayload({ action: "close_tab" }, () => descriptor, { closed: true });
      expect(payload).toMatchObject({ action: "close_tab", actor: "agent" });
      expect(payload?.url).toBeUndefined();
    });
  });
});
