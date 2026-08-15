/**
 * @vitest-environment happy-dom
 */
import type { StructuredLocator } from "@vindicate/protocol";
import { describe, expect, it, vi } from "vitest";

import type { InteractiveCaptureOpts } from "./interactive-capture.evaluate.js";
import {
  captureChildFrames,
  computeFramePathForFrame,
  disambiguateDuplicateRefs,
  extractMeaningfulIframeRefs,
  rehashRefForFrame,
  resolveFrameForPath,
  withFramePath
} from "./frame-capture.js";
import type { InteractiveElementWire } from "./snapshot.types.js";

const OPTS: InteractiveCaptureOpts = {
  maxNodes: 500,
  testidCandidates: ["data-testid"],
  collapse: true,
  viewportOnly: false,
  includeVerifiable: false
};

describe("extractMeaningfulIframeRefs", () => {
  it("extracts refs from iframe nodes that carry nested content (trailing colon)", () => {
    const snap = `- generic [ref=e1]:\n  - iframe [ref=e24]:\n    - textbox "Email" [ref=f38e49]\n`;
    expect(extractMeaningfulIframeRefs(snap)).toEqual(["e24"]);
  });

  it("ignores an iframe node with no nested content (no trailing colon)", () => {
    const snap = `- generic [ref=e1]:\n  - iframe [ref=e5]\n`;
    expect(extractMeaningfulIframeRefs(snap)).toEqual([]);
  });

  it("still matches an iframe carrying an [active] annotation (DOM focus is inside it)", () => {
    // Regression guard, confirmed against a real capture: right after Klarna's checkout auto-focuses a
    // field on "Continue" (its own UI text: "your focus was automatically moved to field"), the OUTER
    // iframe itself renders as `iframe [active] [ref=e24]:`, not `iframe [ref=e24]:`. Missing this meant
    // the outer iframe dropped out of discovery the instant anything inside it gained focus, while its
    // nested children (never carrying [active] themselves) kept matching — the form vanished from
    // browser_read while the express-payment buttons inside it stayed.
    const snap = `- generic [ref=e1]:\n  - iframe [active] [ref=e24]:\n    - textbox "First name" [active] [ref=f40e59]\n`;
    expect(extractMeaningfulIframeRefs(snap)).toEqual(["e24"]);
  });

  it("matches an iframe with multiple bracket annotations in any combination", () => {
    const snap = `- iframe [active] [cursor=pointer] [ref=e9]:\n  - text: x\n`;
    expect(extractMeaningfulIframeRefs(snap)).toEqual(["e9"]);
  });

  it("finds multiple meaningful iframes at the same level", () => {
    const snap = `- iframe [ref=e2]:\n  - text: A\n- iframe [ref=e9]:\n  - text: B\n`;
    expect(extractMeaningfulIframeRefs(snap)).toEqual(["e2", "e9"]);
  });

  it("returns an empty array for a snapshot with no iframes at all", () => {
    expect(extractMeaningfulIframeRefs(`- button "Go" [ref=e1]\n`)).toEqual([]);
  });
});

describe("rehashRefForFrame", () => {
  const FRAME_PATH: StructuredLocator[] = [
    { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" }
  ];

  it("is deterministic for the same ref and frame_path", () => {
    expect(rehashRefForFrame("ref-abc12345", FRAME_PATH)).toBe(
      rehashRefForFrame("ref-abc12345", FRAME_PATH)
    );
  });

  it("produces the standard ref-xxxxxxxx shape", () => {
    expect(rehashRefForFrame("ref-abc12345", FRAME_PATH)).toMatch(/^ref-[0-9a-f]{8}$/);
  });

  it("differs from the original ref (so a top-frame element with the same digest never collides)", () => {
    expect(rehashRefForFrame("ref-abc12345", FRAME_PATH)).not.toBe("ref-abc12345");
  });

  it("differs between two different frame paths for the same original ref", () => {
    const otherPath: StructuredLocator[] = [
      { strategy: "dom_id", confidence: "high", value: "other-iframe" }
    ];
    expect(rehashRefForFrame("ref-abc12345", FRAME_PATH)).not.toBe(
      rehashRefForFrame("ref-abc12345", otherPath)
    );
  });
});

describe("disambiguateDuplicateRefs", () => {
  function el(overrides: Partial<InteractiveElementWire>): InteractiveElementWire {
    return {
      ref: "ref-32ff5778",
      tag: "button",
      role: "button",
      name: "",
      in_viewport: true,
      ...overrides
    };
  }

  it("leaves elements with unique refs untouched", () => {
    const input = [el({ ref: "ref-11111111", name: "A" }), el({ ref: "ref-22222222", name: "B" })];
    expect(disambiguateDuplicateRefs(input)).toEqual(input);
  });

  it("keeps the first occurrence's ref unchanged and rehashes later duplicates", () => {
    const dup = [
      el({ name: "Solna Live pickup" }),
      el({ name: "Paketbox pickup" }),
      el({ name: "Ombud pickup" })
    ];
    const result = disambiguateDuplicateRefs(dup);

    expect(result[0]!.ref).toBe("ref-32ff5778");
    expect(result[1]!.ref).not.toBe("ref-32ff5778");
    expect(result[2]!.ref).not.toBe("ref-32ff5778");
    expect(result[1]!.ref).not.toBe(result[2]!.ref);
  });

  it("produces the standard ref-xxxxxxxx shape for rehashed duplicates", () => {
    const result = disambiguateDuplicateRefs([el({}), el({})]);
    expect(result[1]!.ref).toMatch(/^ref-[0-9a-f]{8}$/);
  });

  it("is deterministic across calls with the same input shape", () => {
    const make = (): InteractiveElementWire[] => [el({ name: "A" }), el({ name: "B" })];
    expect(disambiguateDuplicateRefs(make())).toEqual(disambiguateDuplicateRefs(make()));
  });

  it("preserves every other field on a rehashed duplicate", () => {
    const result = disambiguateDuplicateRefs([
      el({ name: "Solna Live pickup" }),
      el({ name: "Paketbox pickup", testid: "delivery-option" })
    ]);
    expect(result[1]!.name).toBe("Paketbox pickup");
    expect(result[1]!.testid).toBe("delivery-option");
  });

  it("does not confuse three-or-more-way collisions with each other", () => {
    const result = disambiguateDuplicateRefs([
      el({ name: "A" }),
      el({ name: "B" }),
      el({ name: "C" })
    ]);
    const refs = result.map((e) => e.ref);
    expect(new Set(refs).size).toBe(3);
  });
});

describe("withFramePath", () => {
  const BASE_EL: InteractiveElementWire = {
    ref: "ref-11111111",
    tag: "input",
    role: "textbox",
    name: "Email address",
    in_viewport: true,
    locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Email address" }
  };
  const FRAME_PATH: StructuredLocator[] = [
    { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" }
  ];

  it("attaches frame_path to the element's locator and rehashes its ref", () => {
    const result = withFramePath(BASE_EL, FRAME_PATH);
    expect(result.locator?.frame_path).toBe(FRAME_PATH);
    expect(result.ref).not.toBe(BASE_EL.ref);
    expect(result.ref).toMatch(/^ref-[0-9a-f]{8}$/);
  });

  it("leaves every other field untouched", () => {
    const result = withFramePath(BASE_EL, FRAME_PATH);
    expect(result.tag).toBe("input");
    expect(result.role).toBe("textbox");
    expect(result.name).toBe("Email address");
    expect(result.locator?.strategy).toBe("role_name");
  });

  it("does not crash and adds no locator when the element itself has none", () => {
    const noLocatorEl: InteractiveElementWire = {
      ref: BASE_EL.ref,
      tag: BASE_EL.tag,
      role: BASE_EL.role,
      name: BASE_EL.name,
      in_viewport: BASE_EL.in_viewport
    };
    const result = withFramePath(noLocatorEl, FRAME_PATH);
    expect(result.locator).toBeUndefined();
  });
});

// ── captureChildFrames orchestration (mocked Page/Frame — the real cross-origin/nested behavior is
// verified separately against real Chromium, see the integration test) ──────────────────────────────

function fakeLocatorFor(ariaSnapshotResult: string | Error, elementHandleResult: unknown): unknown {
  return {
    ariaSnapshot: (): Promise<string> =>
      ariaSnapshotResult instanceof Error
        ? Promise.reject(ariaSnapshotResult)
        : Promise.resolve(ariaSnapshotResult),
    elementHandle: (): Promise<unknown> => Promise.resolve(elementHandleResult)
  };
}

/** Stable sentinel standing in for `page.mainFrame()` — every genuinely-top-level iframe handle's
 * mocked `ownerFrame()` resolves to this same reference, matching how a real, correctly-scoped
 * Playwright handle behaves (see the ownerFrame cross-frame-flattening guard in captureFramesBreadthFirst). */
const MAIN_FRAME = { __mainFrame: true };

describe("captureChildFrames", () => {
  it("returns [] immediately, with zero ariaSnapshot calls, when the page has only the main frame", async () => {
    const page = { frames: () => [{}] } as unknown as Parameters<typeof captureChildFrames>[0];
    const result = await captureChildFrames(page, OPTS);
    expect(result).toEqual([]);
  });

  it("captures one meaningful iframe's elements, tagging them with frame_path and a rehashed ref", async () => {
    const capturedEl: InteractiveElementWire = {
      ref: "ref-aaaaaaaa",
      tag: "input",
      role: "textbox",
      name: "Email address",
      in_viewport: true,
      locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Email address" }
    };
    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "klarna-checkout-iframe"
    };
    const childFrame = {
      evaluate: vi.fn().mockResolvedValue({
        elements: [capturedEl],
        truncated: false,
        collapsed_count: 0,
        alerts: []
      }),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("- text: nothing nested\n", null)),
      url: () => "https://checkout.klarna.com/frame",
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    const iframeHandle = {
      evaluate: vi.fn().mockResolvedValue(hostLocator),
      contentFrame: vi.fn().mockResolvedValue(childFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };

    const topLocator = vi.fn((selector: string) => {
      if (selector === "body")
        return fakeLocatorFor("- iframe [ref=e2]:\n  - text: Email address\n", null);
      if (selector === "aria-ref=e2") return fakeLocatorFor("", iframeHandle);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator,
      mainFrame: () => MAIN_FRAME
    } as unknown as Parameters<typeof captureChildFrames>[0];

    const result = await captureChildFrames(page, OPTS);

    expect(result).toHaveLength(1);
    expect(result[0]?.locator?.frame_path).toEqual([hostLocator]);
    expect(result[0]?.ref).not.toBe(capturedEl.ref);
  });

  it("never throws — a failing ariaSnapshot at the top degrades to no extra elements", async () => {
    const topLocator = vi.fn().mockReturnValue(fakeLocatorFor(new Error("frame detached"), null));
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator
    } as unknown as Parameters<typeof captureChildFrames>[0];
    await expect(captureChildFrames(page, OPTS)).resolves.toEqual([]);
  });

  it("skips a meaningful iframe when its host element yields no elementHandle (e.g. already detached)", async () => {
    const topLocator = vi.fn((selector: string) => {
      if (selector === "body") return fakeLocatorFor("- iframe [ref=e2]:\n  - text: x\n", null);
      if (selector === "aria-ref=e2") return fakeLocatorFor("", null);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator
    } as unknown as Parameters<typeof captureChildFrames>[0];
    await expect(captureChildFrames(page, OPTS)).resolves.toEqual([]);
  });

  it("waits for a still-blank child frame to leave about:blank before capturing its content", async () => {
    // The real race this guards against, verified live: a payment widget injects its iframe host on a
    // "Continue" click, and the frame starts life on about:blank for a beat before navigating to its
    // real content. Capturing during that window used to find nothing.
    const capturedEl: InteractiveElementWire = {
      ref: "ref-bbbbbbbb",
      tag: "input",
      role: "textbox",
      name: "Card number",
      in_viewport: true,
      locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
    };
    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "stripe-frame"
    };
    const callOrder: string[] = [];
    const childFrame = {
      evaluate: vi.fn().mockImplementation(() => {
        callOrder.push("evaluate");
        return Promise.resolve({
          elements: [capturedEl],
          truncated: false,
          collapsed_count: 0,
          alerts: []
        });
      }),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("- text: nothing nested\n", null)),
      url: () => "about:blank",
      waitForURL: vi.fn().mockImplementation(() => {
        callOrder.push("waitForURL");
        return Promise.resolve(undefined);
      })
    };
    const iframeHandle = {
      evaluate: vi.fn().mockResolvedValue(hostLocator),
      contentFrame: vi.fn().mockResolvedValue(childFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };
    const topLocator = vi.fn((selector: string) => {
      if (selector === "body")
        return fakeLocatorFor("- iframe [ref=e2]:\n  - text: loading\n", null);
      if (selector === "aria-ref=e2") return fakeLocatorFor("", iframeHandle);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator,
      mainFrame: () => MAIN_FRAME
    } as unknown as Parameters<typeof captureChildFrames>[0];

    const result = await captureChildFrames(page, OPTS);

    expect(callOrder).toEqual(["waitForURL", "evaluate"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.ref).not.toBe(capturedEl.ref);

    // The predicate handed to waitForURL must actually detect "left about:blank", not just be present.
    const predicate = childFrame.waitForURL.mock.calls[0]?.[0] as (url: {
      href: string;
    }) => boolean;
    expect(predicate({ href: "about:blank" })).toBe(false);
    expect(predicate({ href: "https://js.stripe.com/checkout-frame" })).toBe(true);
  });

  it("does not call waitForURL when the child frame has already left about:blank", async () => {
    const capturedEl: InteractiveElementWire = {
      ref: "ref-cccccccc",
      tag: "input",
      role: "textbox",
      name: "Email",
      in_viewport: true,
      locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Email" }
    };
    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "checkout-frame"
    };
    const childFrame = {
      evaluate: vi.fn().mockResolvedValue({
        elements: [capturedEl],
        truncated: false,
        collapsed_count: 0,
        alerts: []
      }),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("- text: nothing nested\n", null)),
      url: () => "https://checkout.klarna.com/frame",
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    const iframeHandle = {
      evaluate: vi.fn().mockResolvedValue(hostLocator),
      contentFrame: vi.fn().mockResolvedValue(childFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };
    const topLocator = vi.fn((selector: string) => {
      if (selector === "body") return fakeLocatorFor("- iframe [ref=e2]:\n  - text: Email\n", null);
      if (selector === "aria-ref=e2") return fakeLocatorFor("", iframeHandle);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator,
      mainFrame: () => MAIN_FRAME
    } as unknown as Parameters<typeof captureChildFrames>[0];

    const result = await captureChildFrames(page, OPTS);

    expect(childFrame.waitForURL).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("still attempts the capture, best-effort, when the frame never leaves about:blank within the wait", async () => {
    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "stuck-frame"
    };
    const childFrame = {
      evaluate: vi
        .fn()
        .mockResolvedValue({ elements: [], truncated: false, collapsed_count: 0, alerts: [] }),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
      url: () => "about:blank",
      waitForURL: vi.fn().mockRejectedValue(new Error("Timeout waiting for URL"))
    };
    const iframeHandle = {
      evaluate: vi.fn().mockResolvedValue(hostLocator),
      contentFrame: vi.fn().mockResolvedValue(childFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };
    const topLocator = vi.fn((selector: string) => {
      if (selector === "body")
        return fakeLocatorFor("- iframe [ref=e2]:\n  - text: still loading\n", null);
      if (selector === "aria-ref=e2") return fakeLocatorFor("", iframeHandle);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}] as unknown[],
      locator: topLocator,
      mainFrame: () => MAIN_FRAME
    } as unknown as Parameters<typeof captureChildFrames>[0];

    await expect(captureChildFrames(page, OPTS)).resolves.toEqual([]);
    expect(childFrame.waitForURL).toHaveBeenCalledTimes(1);
    expect(childFrame.evaluate).toHaveBeenCalledTimes(1);
  });

  it("processes sibling iframes breadth-first, before descending into any one branch's nested children", async () => {
    // Regression guard: a real page (Klarna checkout) has an "Express Checkout" branch that nests 2-3
    // levels deep (Stripe -> Google Pay) sitting *next to* the actual content iframe. Depth-first
    // traversal would fully explore the express branch's depth before ever reaching its sibling —
    // starving the frame budget on peripheral content instead of the primary form. This proves both
    // top-level siblings are captured before either one's nested child is even looked at.
    const callOrder: string[] = [];
    const HOST_LOCATOR: StructuredLocator = {
      strategy: "nth",
      confidence: "low",
      xpath: "/iframe[1]"
    };

    function trackedEvaluate(tag: string) {
      return vi.fn().mockImplementation(() => {
        callOrder.push(tag);
        return Promise.resolve({ elements: [], truncated: false, collapsed_count: 0, alerts: [] });
      });
    }

    const siblingAChildFrame = {
      evaluate: trackedEvaluate("siblingA-child"),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
      url: () => "https://example.com/siblingA-child",
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    // siblingAChildHandle is referenced from siblingAFrame.locator's closure (lazily evaluated, so
    // declaration order there doesn't matter) but siblingAFrame itself must exist before
    // siblingAChildHandle's ownerFrame mock is constructed below. Forward-reference — can't be
    // const without restructuring the declaration order.
    // eslint-disable-next-line prefer-const
    let siblingAChildHandle: unknown;
    const siblingAFrame = {
      evaluate: trackedEvaluate("siblingA"),
      locator: vi.fn((selector: string) => {
        if (selector === "body")
          return fakeLocatorFor("- iframe [ref=e10]:\n  - text: nested\n", null);
        if (selector === "aria-ref=e10") return fakeLocatorFor("", siblingAChildHandle);
        throw new Error(`unexpected selector ${selector}`);
      }),
      url: () => "https://example.com/siblingA",
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    siblingAChildHandle = {
      evaluate: vi.fn().mockResolvedValue(HOST_LOCATOR),
      contentFrame: vi.fn().mockResolvedValue(siblingAChildFrame),
      // Nested one level inside siblingAFrame — its real owner is that frame, not the top-level page.
      ownerFrame: vi.fn().mockResolvedValue(siblingAFrame)
    };
    const siblingAHandle = {
      evaluate: vi.fn().mockResolvedValue(HOST_LOCATOR),
      contentFrame: vi.fn().mockResolvedValue(siblingAFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };

    const siblingBFrame = {
      evaluate: trackedEvaluate("siblingB"),
      locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
      url: () => "https://example.com/siblingB",
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    const siblingBHandle = {
      evaluate: vi.fn().mockResolvedValue(HOST_LOCATOR),
      contentFrame: vi.fn().mockResolvedValue(siblingBFrame),
      ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
    };

    const topLocator = vi.fn((selector: string) => {
      if (selector === "body")
        return fakeLocatorFor(
          "- iframe [ref=e2]:\n  - text: A\n- iframe [ref=e3]:\n  - text: B\n",
          null
        );
      if (selector === "aria-ref=e2") return fakeLocatorFor("", siblingAHandle);
      if (selector === "aria-ref=e3") return fakeLocatorFor("", siblingBHandle);
      throw new Error(`unexpected selector ${selector}`);
    });
    const page = {
      frames: () => [{}, {}, {}] as unknown[],
      locator: topLocator,
      mainFrame: () => MAIN_FRAME
    } as unknown as Parameters<typeof captureChildFrames>[0];

    await captureChildFrames(page, OPTS);

    const childIndex = callOrder.indexOf("siblingA-child");
    expect(childIndex).toBeGreaterThan(-1);
    expect(callOrder.indexOf("siblingA")).toBeLessThan(childIndex);
    expect(callOrder.indexOf("siblingB")).toBeLessThan(childIndex);
  });

  describe("cross-frame ariaSnapshot flattening (the kustom.co Klarna+Stripe duplicate)", () => {
    // Confirmed live: Chrome's accessibility tree flattens across frame boundaries in a way the DOM
    // doesn't — a top-level `ariaSnapshot({mode:'ai'})` call can resolve an `aria-ref` to an iframe
    // that doesn't actually live in the document being searched, but two levels deeper inside a
    // *nested* iframe's own document (verified: `page.locator('iframe[title="..."]')` found zero at
    // the top level and exactly one inside klarna-checkout-iframe, while the top-level ariaSnapshot
    // still resolved a reference to that same element by name/src). Trusting that reference computes
    // a wrong, too-shallow frame_path and — since the real nested discovery pass finds the identical
    // element again — captures it twice under two different refs.

    it("skips a top-level discovery whose resolved handle actually belongs to a different frame", async () => {
      const OTHER_FRAME = { __otherFrame: true };
      const flattenedHandle = {
        evaluate: vi
          .fn()
          .mockResolvedValue({ strategy: "dom_id", confidence: "high", value: "stripe-frame" }),
        contentFrame: vi.fn().mockResolvedValue({}),
        // The flattening artifact: this handle was resolved via the top-level page's own
        // ariaSnapshot, but it doesn't actually live there.
        ownerFrame: vi.fn().mockResolvedValue(OTHER_FRAME)
      };
      const topLocator = vi.fn((selector: string) => {
        if (selector === "body")
          return fakeLocatorFor("- iframe [ref=e2]:\n  - text: Card number\n", null);
        if (selector === "aria-ref=e2") return fakeLocatorFor("", flattenedHandle);
        throw new Error(`unexpected selector ${selector}`);
      });
      const page = {
        frames: () => [{}, {}] as unknown[],
        locator: topLocator,
        mainFrame: () => MAIN_FRAME
      } as unknown as Parameters<typeof captureChildFrames>[0];

      const result = await captureChildFrames(page, OPTS);

      expect(result).toEqual([]);
      // Never even attempted to capture its content — filtered before that point, not after.
      expect(flattenedHandle.evaluate).not.toHaveBeenCalled();
    });

    it("captures the real element only once — via its correct, nested discovery — when a flattened top-level reference to the same element also exists", async () => {
      const capturedEl: InteractiveElementWire = {
        ref: "ref-cardnumber",
        tag: "input",
        role: "textbox",
        name: "Card number",
        in_viewport: true,
        locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
      };
      const realHostLocator: StructuredLocator = {
        strategy: "dom_id",
        confidence: "high",
        value: "stripe-frame"
      };

      const stripeChildFrame = {
        evaluate: vi.fn().mockResolvedValue({
          elements: [capturedEl],
          truncated: false,
          collapsed_count: 0,
          alerts: []
        }),
        locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
        url: () => "https://js.stripe.com/checkout-frame",
        waitForURL: vi.fn().mockResolvedValue(undefined)
      };

      // klarnaFrame is declared before klarnaHandle references it, but klarnaFrame's own locator
      // closure references stripeHandleViaKlarna lazily — safe forward reference. Can't be const
      // without restructuring the declaration order.
      // eslint-disable-next-line prefer-const
      let stripeHandleViaKlarna: unknown;
      const klarnaFrame = {
        evaluate: vi
          .fn()
          .mockResolvedValue({ elements: [], truncated: false, collapsed_count: 0, alerts: [] }),
        locator: vi.fn((selector: string) => {
          if (selector === "body")
            return fakeLocatorFor("- iframe [ref=e10]:\n  - text: Card number\n", null);
          if (selector === "aria-ref=e10") return fakeLocatorFor("", stripeHandleViaKlarna);
          throw new Error(`unexpected selector ${selector}`);
        }),
        url: () => "https://checkout.klarna.com/frame",
        waitForURL: vi.fn().mockResolvedValue(undefined)
      };
      // The correct discovery: resolved from within klarnaFrame's own document, and it genuinely
      // belongs there — ownerFrame matches the scope that found it.
      stripeHandleViaKlarna = {
        evaluate: vi.fn().mockResolvedValue(realHostLocator),
        contentFrame: vi.fn().mockResolvedValue(stripeChildFrame),
        ownerFrame: vi.fn().mockResolvedValue(klarnaFrame)
      };
      const klarnaHandle = {
        evaluate: vi.fn().mockResolvedValue({
          strategy: "dom_id",
          confidence: "high",
          value: "klarna-checkout-iframe"
        }),
        contentFrame: vi.fn().mockResolvedValue(klarnaFrame),
        ownerFrame: vi.fn().mockResolvedValue(MAIN_FRAME)
      };

      // The flattened, wrong discovery: the top-level page's OWN ariaSnapshot also reports a
      // reference to the very same Stripe iframe, but resolving it here yields a handle whose real
      // owner is klarnaFrame, not the top-level page.
      const flattenedStripeHandle = {
        evaluate: vi.fn().mockResolvedValue(realHostLocator),
        contentFrame: vi.fn().mockResolvedValue(stripeChildFrame),
        ownerFrame: vi.fn().mockResolvedValue(klarnaFrame)
      };

      const topLocator = vi.fn((selector: string) => {
        if (selector === "body") {
          return fakeLocatorFor(
            "- iframe [ref=e2]:\n  - text: Klarna\n- iframe [ref=e3]:\n  - text: Card number\n",
            null
          );
        }
        if (selector === "aria-ref=e2") return fakeLocatorFor("", klarnaHandle);
        if (selector === "aria-ref=e3") return fakeLocatorFor("", flattenedStripeHandle);
        throw new Error(`unexpected selector ${selector}`);
      });
      const page = {
        frames: () => [{}, {}, {}] as unknown[],
        locator: topLocator,
        mainFrame: () => MAIN_FRAME
      } as unknown as Parameters<typeof captureChildFrames>[0];

      const result = await captureChildFrames(page, OPTS);

      // Captured exactly once — via the correct, nested-inside-Klarna discovery — not twice.
      expect(result).toHaveLength(1);
      expect(result[0]?.locator?.frame_path).toEqual([
        { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" },
        realHostLocator
      ]);
      // The flattened top-level reference was filtered before ever attempting to capture content —
      // its content-capture function was never called.
      expect(flattenedStripeHandle.contentFrame).not.toHaveBeenCalled();
    });
  });
});

describe("computeFramePathForFrame", () => {
  it("returns [] with zero evaluate calls for the page's own main frame", async () => {
    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) };
    const result = await computeFramePathForFrame(
      mainFrame as unknown as Parameters<typeof computeFramePathForFrame>[0],
      { testidCandidates: ["data-testid"] }
    );
    expect(result).toEqual([]);
    expect(mainFrame.parentFrame).toHaveBeenCalledTimes(1);
  });

  it("derives a single-hop frame_path for an event inside one iframe", async () => {
    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "payment-frame"
    };
    const handle = { evaluate: vi.fn().mockResolvedValue(hostLocator) };
    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) };
    const leafFrame = {
      parentFrame: vi.fn().mockReturnValue(mainFrame),
      frameElement: vi.fn().mockResolvedValue(handle)
    };

    const result = await computeFramePathForFrame(
      leafFrame as unknown as Parameters<typeof computeFramePathForFrame>[0],
      { testidCandidates: ["data-testid"] }
    );

    expect(result).toEqual([hostLocator]);
    expect(leafFrame.frameElement).toHaveBeenCalledTimes(1);
  });

  it("orders a two-hop nested frame_path outermost first", async () => {
    const outerLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "klarna-checkout-iframe"
    };
    const innerLocator: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "stripe-frame"
    };
    const outerHandle = { evaluate: vi.fn().mockResolvedValue(outerLocator) };
    const innerHandle = { evaluate: vi.fn().mockResolvedValue(innerLocator) };
    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) };
    const outerFrame = {
      parentFrame: vi.fn().mockReturnValue(mainFrame),
      frameElement: vi.fn().mockResolvedValue(outerHandle)
    };
    const innerFrame = {
      parentFrame: vi.fn().mockReturnValue(outerFrame),
      frameElement: vi.fn().mockResolvedValue(innerHandle)
    };

    const result = await computeFramePathForFrame(
      innerFrame as unknown as Parameters<typeof computeFramePathForFrame>[0],
      { testidCandidates: ["data-testid"] }
    );

    expect(result).toEqual([outerLocator, innerLocator]);
  });

  it("returns whatever hops resolved so far when an ancestor's frameElement() rejects mid-navigation", async () => {
    const outerLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "outer-frame"
    };
    const outerHandle = { evaluate: vi.fn().mockResolvedValue(outerLocator) };
    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) };
    const outerFrame = {
      parentFrame: vi.fn().mockReturnValue(mainFrame),
      frameElement: vi.fn().mockResolvedValue(outerHandle)
    };
    const innerFrame = {
      parentFrame: vi.fn().mockReturnValue(outerFrame),
      frameElement: vi.fn().mockRejectedValue(new Error("frame navigated away"))
    };

    const result = await computeFramePathForFrame(
      innerFrame as unknown as Parameters<typeof computeFramePathForFrame>[0],
      { testidCandidates: ["data-testid"] }
    );

    // Outermost hop resolved fine before the inner one failed — partial-but-valid is kept, not discarded.
    expect(result).toEqual([outerLocator]);
  });
});

// ── resolveFrameForPath: the down-resolution mirror of computeFramePathForFrame, needed so a scoped
// browser_read can capture inside the frame a ref actually lives in instead of the top page ──────────

describe("resolveFrameForPath", () => {
  it("returns null immediately for an empty frame_path, with zero Playwright calls", async () => {
    const locator = vi.fn();
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];
    const result = await resolveFrameForPath(page, []);
    expect(result).toBeNull();
    expect(locator).not.toHaveBeenCalled();
  });

  it("resolves a single-hop frame_path to the iframe's content frame", async () => {
    const hop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "klarna-checkout-iframe"
    };
    const childFrame = { evaluate: vi.fn() };
    const handle = { contentFrame: vi.fn().mockResolvedValue(childFrame) };
    const locator = vi.fn().mockReturnValue({ elementHandle: vi.fn().mockResolvedValue(handle) });
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    const result = await resolveFrameForPath(page, [hop]);

    expect(result).toBe(childFrame);
    expect(locator).toHaveBeenCalledWith('xpath=//*[@data-testid="klarna-checkout-iframe"]');
  });

  it("walks a two-hop frame_path outermost first", async () => {
    const outerHop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "outer-frame"
    };
    const innerHop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "inner-frame"
    };
    const innerFrame = { evaluate: vi.fn() };
    const innerHandle = { contentFrame: vi.fn().mockResolvedValue(innerFrame) };
    const innerLocator = vi
      .fn()
      .mockReturnValue({ elementHandle: vi.fn().mockResolvedValue(innerHandle) });
    const outerFrame = { locator: innerLocator };
    const outerHandle = { contentFrame: vi.fn().mockResolvedValue(outerFrame) };
    const outerLocator = vi
      .fn()
      .mockReturnValue({ elementHandle: vi.fn().mockResolvedValue(outerHandle) });
    const page = { locator: outerLocator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    const result = await resolveFrameForPath(page, [outerHop, innerHop]);

    expect(result).toBe(innerFrame);
    expect(outerLocator).toHaveBeenCalledWith('xpath=//*[@data-testid="outer-frame"]');
    expect(innerLocator).toHaveBeenCalledWith('xpath=//*[@data-testid="inner-frame"]');
  });

  it("returns null, never throws, when a hop's strategy can't be rendered to a selector", async () => {
    const hop: StructuredLocator = { strategy: "sibling_text", confidence: "low", value: "//div" };
    const locator = vi.fn();
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    const result = await resolveFrameForPath(page, [hop]);

    expect(result).toBeNull();
    expect(locator).not.toHaveBeenCalled();
  });

  it("returns null when the hop's elementHandle() rejects (the ancestor navigated away mid-resolve)", async () => {
    const hop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "gone-frame"
    };
    const locator = vi
      .fn()
      .mockReturnValue({ elementHandle: vi.fn().mockRejectedValue(new Error("detached")) });
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    await expect(resolveFrameForPath(page, [hop])).resolves.toBeNull();
  });

  it("returns null when the hop element yields no elementHandle at all", async () => {
    const hop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "missing-frame"
    };
    const locator = vi.fn().mockReturnValue({ elementHandle: vi.fn().mockResolvedValue(null) });
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    const result = await resolveFrameForPath(page, [hop]);
    expect(result).toBeNull();
  });

  it("returns null when the iframe host's contentFrame() is not attached", async () => {
    const hop: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "torn-down-frame"
    };
    const handle = { contentFrame: vi.fn().mockResolvedValue(null) };
    const locator = vi.fn().mockReturnValue({ elementHandle: vi.fn().mockResolvedValue(handle) });
    const page = { locator } as unknown as Parameters<typeof resolveFrameForPath>[0];

    const result = await resolveFrameForPath(page, [hop]);
    expect(result).toBeNull();
  });
});
