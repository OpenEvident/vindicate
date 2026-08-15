/**
 * @vitest-environment happy-dom
 */
import type { StructuredLocator } from "@vindicate/protocol";
import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { captureInteractiveSnapshot } from "./interactive-capture.evaluate.js";
import { SnapshotMemoryTable } from "./snapshot-memory.js";
import { SnapshotEngine } from "./snapshot-engine.js";

function fakeLocatorFor(ariaSnapshotResult: string | Error, elementHandleResult: unknown): unknown {
  return {
    ariaSnapshot: (): Promise<string> =>
      ariaSnapshotResult instanceof Error
        ? Promise.reject(ariaSnapshotResult)
        : Promise.resolve(ariaSnapshotResult),
    elementHandle: (): Promise<unknown> => Promise.resolve(elementHandleResult)
  };
}

const cfg = {
  VINDICATE_SNAPSHOT_MAX_NODES: 100,
  VINDICATE_SNAPSHOT_MAX_HTML_BYTES: 50_000,
  VINDICATE_MAX_OUTPUT_CHARS: 10_000,
  VINDICATE_SNAPSHOT_DESCRIPTOR_CAP: 2_000,
  VINDICATE_READ_SETTLE_MS: 700
} as const;

function makeEvaluateRunner(): Page["evaluate"] {
  return (fn: unknown, arg?: unknown) => {
    if (fn === captureInteractiveSnapshot) {
      return Promise.resolve(
        captureInteractiveSnapshot(arg as Parameters<typeof captureInteractiveSnapshot>[0])
      );
    }
    return Promise.reject(new Error("unexpected evaluate function"));
  };
}

function makePage(
  currentUrl: { value: string },
  evaluate: Page["evaluate"],
  otherTabUrls: string[] = []
): Page {
  const page = {
    url: () => currentUrl.value,
    title: () => Promise.resolve("Example"),
    evaluate,
    // A real page with no iframes reports exactly one frame (the main frame) — matches
    // captureChildFrames' cheap zero-iframe fast path, so it never fires in these unit tests.
    frames: () => [page],
    context: () => ({
      pages: () => [page, ...otherTabUrls.map((u) => ({ url: () => u, isClosed: () => false }))]
    })
  } as unknown as Page;
  return page;
}

describe("SnapshotEngine", () => {
  it("computes delta when URL is unchanged", async () => {
    document.body.innerHTML = `<button data-testid="go">Go</button>`;
    const url = { value: "https://example.com/" };
    const memory = new SnapshotMemoryTable(8);
    const engine = new SnapshotEngine(memory, cfg, () => {});
    const first = await engine.takeSnapshot("sess-2", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });

    document.body.innerHTML = `<button data-testid="go">Go</button><input data-testid="extra" />`;
    const second = await engine.takeSnapshot("sess-2", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      delta: { since_snapshot_id: first.snapshot_id }
    });

    expect(second.delta_fallback).toBeUndefined();
    expect(second.added?.length).toBeGreaterThan(0);
  });

  it("marks a newly-added duplicate-named element as superseding the older one still present", async () => {
    // The actual kustom.co shape: an old "Card number" textbox is captured first; on the next read
    // it's still attached (a third-party SDK hasn't torn it down yet) AND a new one has appeared
    // alongside it with the same accessible name but a different underlying element (different ref).
    document.body.innerHTML = `<input data-testid="card-number-old" aria-label="Card number">`;
    const url = { value: "https://example.com/checkout" };
    const memory = new SnapshotMemoryTable(8);
    const engine = new SnapshotEngine(memory, cfg, () => {});
    const first = await engine.takeSnapshot(
      "sess-supersedes",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive"
      }
    );
    const oldRef = first.elements?.find((e) => e.testid === "card-number-old")?.ref;
    expect(oldRef).toBeDefined();

    document.body.innerHTML =
      `<input data-testid="card-number-old" aria-label="Card number">` +
      `<input data-testid="card-number-new" aria-label="Card number">`;
    const second = await engine.takeSnapshot(
      "sess-supersedes",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        delta: { since_snapshot_id: first.snapshot_id }
      }
    );

    const newEl = second.elements?.find((e) => e.testid === "card-number-new");
    const oldElStill = second.elements?.find((e) => e.testid === "card-number-old");
    expect(second.added).toContain(newEl?.ref);
    expect(newEl?.supersedes_ref).toBe(oldRef);
    expect(oldElStill?.supersedes_ref).toBeUndefined();
  });

  it("does not set supersedes_ref on a first-ever read (no delta context to compare against)", async () => {
    document.body.innerHTML =
      `<input data-testid="card-number-old" aria-label="Card number">` +
      `<input data-testid="card-number-new" aria-label="Card number">`;
    const url = { value: "https://example.com/checkout" };
    const memory = new SnapshotMemoryTable(8);
    const engine = new SnapshotEngine(memory, cfg, () => {});
    const first = await engine.takeSnapshot(
      "sess-supersedes-first",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive"
      }
    );

    expect(first.elements?.every((e) => e.supersedes_ref === undefined)).toBe(true);
  });

  it("sets delta_fallback when previous snapshot URL differs", async () => {
    document.body.innerHTML = `<button data-testid="go">Go</button>`;
    const url = { value: "https://example.com/page-a" };
    const memory = new SnapshotMemoryTable(8);
    const engine = new SnapshotEngine(memory, cfg, () => {});
    const first = await engine.takeSnapshot("sess-3", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });

    url.value = "https://example.com/page-b";
    const second = await engine.takeSnapshot("sess-3", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      delta: { since_snapshot_id: first.snapshot_id }
    });

    expect(second.delta_fallback).toBe(true);
    expect(second.added).toBeUndefined();
    expect(second.removed).toBeUndefined();
    expect(second.changed).toBeUndefined();
  });

  it("includes ARIA state fields on interactive elements", async () => {
    document.body.innerHTML = `
      <button data-testid="busy-btn" aria-busy="true" aria-expanded="false">Load</button>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-4", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });
    const btn = result.elements?.find((e) => e.testid === "busy-btn");
    expect(btn?.aria_busy).toBe(true);
    expect(btn?.aria_expanded).toBe(false);
  });

  it("excludes controls and alerts left behind under an aria-hidden stale page", async () => {
    // SPA routers (Ionic among them) commonly keep a previous page's DOM around, marked aria-hidden,
    // instead of removing it — e.g. a cached login form still sitting behind the live dashboard.
    document.body.innerHTML = `
      <div aria-hidden="true">
        <button data-testid="stale-login-btn">Sign In</button>
        <div role="alert">Stale error</div>
        <h1>Stale Heading</h1>
      </div>
      <button data-testid="live-btn">Go</button>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-hidden", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      include_verifiable: true
    });

    expect(result.elements?.some((e) => e.testid === "stale-login-btn")).toBe(false);
    expect(result.elements?.some((e) => e.testid === "live-btn")).toBe(true);
    expect(result.alerts ?? []).not.toContain("Stale error");
    expect(result.elements?.some((e) => e.name === "Stale Heading")).toBe(false);
  });

  it("captures alerts from live regions", async () => {
    document.body.innerHTML = `
      <div role="alert">Record saved</div>
      <button data-testid="ok">OK</button>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-alerts", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });
    expect(result.alerts).toContain("Record saved");
  });

  it("does not bind a content name to a live-region role locator (alert)", () => {
    document.body.innerHTML = `
      <div role="alert"><div><i></i><p>Invalid credentials</p></div></div>
      <button>Save</button>
    `;
    const result = captureInteractiveSnapshot({
      maxNodes: 100,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: true
    });

    // The alert's message lives in a child <p> with no aria-label — it is NOT the alert's accessible
    // name, so we must never emit getByRole('alert', { name: 'Invalid credentials' }).
    const alert = result.elements.find((e) => e.role === "alert");
    expect(alert).toBeDefined();
    expect(alert?.locator?.strategy === "role_name" && alert?.locator?.name !== undefined).toBe(
      false
    );

    // Control: a button's text IS its accessible name, so role_name keeps the name.
    const button = result.elements.find((e) => e.role === "button");
    expect(button?.locator).toMatchObject({ strategy: "role_name", role: "button", name: "Save" });
  });

  it("stores context on element descriptors", async () => {
    document.body.innerHTML = `
      <main>
        <button data-testid="in-main">Action</button>
      </main>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-ctx", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });
    const btn = result.elements?.find((e) => e.testid === "in-main");
    expect(btn?.context).toBe("main");
    const desc = engine.getDescriptor("sess-ctx", btn!.ref);
    expect(desc?.context).toBe("main");
  });

  it("scopes snapshot by CSS selector", async () => {
    document.body.innerHTML = `
      <div id="main"><button data-testid="in-scope">A</button></div>
      <aside><button data-testid="out-scope">B</button></aside>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-5", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      scope: { css: "#main" }
    });
    const testids = result.elements?.map((e) => e.testid) ?? [];
    expect(testids).toContain("in-scope");
    expect(testids).not.toContain("out-scope");
  });

  it("collapses near-duplicate siblings once there are genuinely many of them", async () => {
    // 15 identical, identically-labelled rows — a real data-list flood (search results, a table body),
    // well past SIBLING_COLLAPSE_THRESHOLD (12).
    const rows = Array.from(
      { length: 15 },
      (_, i) => `<button data-testid="row-${i}">Item</button>`
    ).join("");
    document.body.innerHTML = `<div id="list">${rows}</div>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-6", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: true
    });
    expect(result.collapsed_count).toBeGreaterThan(0);
    expect(result.elements?.some((e) => (e.collapsed_siblings ?? 0) > 0)).toBe(true);
    expect(result.elements?.length ?? 0).toBeLessThan(15);
  });

  it("does not collapse a small, permanent set of distinctly-labelled controls (a nav menu, a tab bar)", async () => {
    // Exactly the reported bug: a 6-item sidebar, each item structurally identical (icon + label) but
    // carrying a distinct, meaningful name — collapsing these hides real navigation options, unlike
    // collapsing 15 identically-labelled data rows above.
    const labels = ["Dashboard", "Events", "Members", "Memberships", "Messaging", "Settings"];
    const items = labels
      .map(
        (label) =>
          `<div class="menu-item" tabindex="0"><i class="icon"></i><span>${label}</span></div>`
      )
      .join("");
    document.body.innerHTML = `<div class="side-menu">${items}</div>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-6b", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: true
    });
    expect(result.collapsed_count ?? 0).toBe(0);
    for (const label of labels) {
      expect(result.elements?.some((e) => e.name === label)).toBe(true);
    }
  });

  it("does not collapse a real-world 19-item sidebar with no test-id instrumentation", async () => {
    // The actual production regression: a real Ionic app's sidebar had 19 permanent nav items, still
    // comfortably over a flat count threshold — none of them carry the project's test-id attribute,
    // which is the signal that lets an uninstrumented, large-but-static menu survive uncollapsed.
    const labels = [
      "Dashboard",
      "Events",
      "Members",
      "Memberships",
      "Coupons",
      "Newsletter",
      "Messaging",
      "Menu",
      "Inventory",
      "Store",
      "Groups",
      "Purchases & Refunds",
      "Reports",
      "Staff",
      "Surveys",
      "Ads",
      "Rules & Terms",
      "Alerts",
      "Settings"
    ];
    const items = labels
      .map(
        (label) =>
          `<div class="menu-item" tabindex="0"><i class="icon"></i><span>${label}</span></div>`
      )
      .join("");
    document.body.innerHTML = `<div class="side-menu">${items}</div>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(
      new SnapshotMemoryTable(8),
      { ...cfg, VINDICATE_SNAPSHOT_MAX_NODES: 100 },
      () => {}
    );
    const result = await engine.takeSnapshot("sess-6c", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: true
    });
    expect(result.collapsed_count ?? 0).toBe(0);
    for (const label of labels) {
      expect(result.elements?.some((e) => e.name === label)).toBe(true);
    }
  });

  it("still collapses a same-size (19-item) bucket when it IS test-id instrumented", async () => {
    // Same shape and count as the sidebar above, but each row carries the project's test-id attribute —
    // a deliberate developer signal of real, repeated data (e.g. 19 search results), so this one should
    // still collapse well before the uninstrumented case would.
    const rows = Array.from(
      { length: 19 },
      (_, i) => `<button data-testid="row-${i}">Item</button>`
    ).join("");
    document.body.innerHTML = `<div id="list">${rows}</div>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(
      new SnapshotMemoryTable(8),
      { ...cfg, VINDICATE_SNAPSHOT_MAX_NODES: 100 },
      () => {}
    );
    const result = await engine.takeSnapshot("sess-6d", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: true
    });
    expect(result.collapsed_count).toBeGreaterThan(0);
    expect(result.elements?.length ?? 0).toBeLessThan(19);
  });

  it("truncates when max_nodes cap is exceeded", async () => {
    const buttons = Array.from(
      { length: 12 },
      (_, i) => `<button data-testid="b-${i}">B${i}</button>`
    ).join("");
    document.body.innerHTML = `<div>${buttons}</div>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(
      new SnapshotMemoryTable(8),
      { ...cfg, VINDICATE_SNAPSHOT_MAX_NODES: 5 },
      () => {}
    );
    const result = await engine.takeSnapshot("sess-7", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });
    expect(result.truncated).toBe(true);
    expect(result.node_count).toBe(5);
    expect(result.elements?.length).toBe(5);
  });

  it("scopes snapshot by ref from a prior full capture", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <button data-testid="panel-btn">Inside</button>
      </div>
      <button data-testid="outside">Outside</button>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const full = await engine.takeSnapshot("sess-8", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });
    const panelRef = full.elements?.find((e) => e.testid === "panel-btn")?.ref;
    expect(panelRef).toBeDefined();

    const scoped = await engine.takeSnapshot("sess-8", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      scope: { ref: panelRef! },
      collapse: false
    });
    const scopedTestids = scoped.elements?.map((e) => e.testid) ?? [];
    expect(scopedTestids).toContain("panel-btn");
    expect(scopedTestids).not.toContain("outside");
  });

  it("scoping into a folded overlay's own ref (e.g. a locker-picker dialog) descends into its contents, not its parent", async () => {
    // Regression guard, confirmed against a real production failure: browser_read folds a large open
    // dialog (>=12 interactive descendants — a real "Choose package locker" checkout modal) into one
    // summary row per the overlay-flood-collapse above. ground.md documents "scope into it to read its
    // items" as the intended follow-up — but scoping used to resolve to the matched element's *parent*
    // (the leaf-anchor convention the test below this one exercises), which for an overlay ref escapes
    // OUT of the dialog into its wrapper instead of descending into it — so the promised "scope in and
    // read the Confirm button" never actually worked for a folded dialog.
    document.body.innerHTML = `
      <div class="modal-root">
        <div role="dialog" aria-label="Choose package locker">
          <button>Confirm</button>
          <button>Option 1</button><button>Option 2</button><button>Option 3</button>
          <button>Option 4</button><button>Option 5</button><button>Option 6</button>
          <button>Option 7</button><button>Option 8</button><button>Option 9</button>
          <button>Option 10</button><button>Option 11</button>
        </div>
        <button data-testid="sibling-of-dialog">SiblingOfDialog</button>
      </div>
      <button data-testid="outside">Outside</button>
    `;
    // happy-dom has no real layout engine — getBoundingClientRect always reports 0x0, which would make
    // detectTopmostOverlay's visibility filter (width/height > 0) treat the dialog as invisible and skip
    // it entirely. Stub it the same way the existing overlay tests in this file already do.
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.getBoundingClientRect = () => ({
      width: 320,
      height: 480,
      top: 10,
      left: 10,
      right: 330,
      bottom: 490,
      x: 10,
      y: 10,
      toJSON: () => ({})
    });
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});

    const full = await engine.takeSnapshot(
      "sess-overlay-scope",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive"
      }
    );
    // Folded: the 12 buttons collapse to one dialog summary row, not 12 individual rows.
    expect(full.elements?.some((e) => e.name === "Confirm")).toBe(false);
    const dialogRef = full.elements?.find((e) => e.role === "dialog")?.ref;
    expect(dialogRef).toBeDefined();

    const scoped = await engine.takeSnapshot(
      "sess-overlay-scope",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        scope: { ref: dialogRef! }
      }
    );

    expect(scoped.elements?.some((e) => e.name === "Confirm")).toBe(true);
    expect(scoped.elements?.some((e) => e.testid === "sibling-of-dialog")).toBe(false);
    expect(scoped.elements?.some((e) => e.testid === "outside")).toBe(false);
  });

  it("keeps earlier refs resolvable after a later scoped read (merge, no eviction)", async () => {
    document.body.innerHTML = `
      <div id="panel"><button data-testid="panel-btn">Inside</button></div>
      <button data-testid="outside">Outside</button>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const full = await engine.takeSnapshot("sess-merge", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });
    const outsideRef = full.elements?.find((e) => e.testid === "outside")?.ref;
    const panelRef = full.elements?.find((e) => e.testid === "panel-btn")?.ref;
    expect(outsideRef).toBeDefined();

    // A later scoped read that excludes "outside" must not evict its descriptor (old replace-on-read bug).
    await engine.takeSnapshot("sess-merge", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      scope: { ref: panelRef! },
      collapse: false
    });

    expect(engine.getDescriptor("sess-merge", outsideRef!)?.snapshotUrl).toBe(
      "https://example.com/"
    );
  });

  it("gives colliding row controls distinct refs scoped to their named rows", async () => {
    document.body.innerHTML = `
      <table>
        <tr aria-label="Product ABC"><td>ABC</td><td><button>Delete</button></td></tr>
        <tr aria-label="Product XYZ"><td>XYZ</td><td><button>Delete</button></td></tr>
      </table>
    `;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-rows", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });
    const deletes = result.elements?.filter((e) => e.name === "Delete") ?? [];
    expect(deletes.length).toBe(2);
    // Distinct refs (no collapse to one descriptor) and each scoped to its own row.
    expect(new Set(deletes.map((e) => e.ref)).size).toBe(2);
    expect(deletes.map((e) => e.container?.name).sort()).toEqual(["Product ABC", "Product XYZ"]);
    for (const d of deletes) {
      expect(engine.getDescriptor("sess-rows", d.ref)?.container?.name).toBe(d.container?.name);
    }
  });

  it("collapses a large open overlay to one summary row so base controls survive", async () => {
    const days = Array.from({ length: 20 }, (_, i) => `<button>Day ${i + 1}</button>`).join("");
    document.body.innerHTML = `
      <button data-testid="search">Search</button>
      <div role="dialog" aria-label="Calendar">${days}</div>
    `;
    // happy-dom does no layout, so give the overlay a non-zero rect for the visibility check.
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.getBoundingClientRect = () => ({
      width: 300,
      height: 300,
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-overlay", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });

    const overlayRow = result.elements?.find((e) => e.overlay === true);
    expect(overlayRow).toBeDefined();
    expect(overlayRow?.collapsed_siblings ?? 0).toBeGreaterThanOrEqual(12);
    // The 20 day buttons are folded into the summary, not listed individually.
    expect((result.elements ?? []).filter((e) => e.name.startsWith("Day ")).length).toBe(0);
    // The base Search button outside the overlay survives.
    expect(result.elements?.some((e) => e.testid === "search")).toBe(true);
    // The overlay is also announced top-level (here a non-modal dialog — no aria-modal).
    expect(result.overlay_active).toBeDefined();
    expect(result.overlay_active?.modal).toBe(false);
  });

  it("announces a small blocking modal even when it has too few controls to collapse", async () => {
    // Booking.com-style sign-in promo: aria-modal, but only a dismiss button + a sign-in link.
    document.body.innerHTML = `
      <button data-testid="search">Search</button>
      <div role="dialog" aria-modal="true" aria-label="Window offering discounts of 10% or more">
        <button aria-label="Dismiss sign-in info.">x</button>
        <a href="/signin" data-testid="auth-link-in-view">Sign in or register</a>
      </div>
    `;
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.getBoundingClientRect = () => ({
      width: 300,
      height: 300,
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    const url = { value: "https://booking.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-modal", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });

    // Surfaced as a blocking modal, with the aria-label as its name.
    expect(result.overlay_active).toBeDefined();
    expect(result.overlay_active?.modal).toBe(true);
    expect(result.overlay_active?.role).toBe("dialog");
    expect(result.overlay_active?.name).toContain("Window offering discounts");
    // Below the flood threshold → the two controls are listed individually, not collapsed.
    expect(result.elements?.some((e) => e.overlay === true)).toBe(false);
    expect(result.elements?.some((e) => e.testid === "auth-link-in-view")).toBe(true);
  });

  it("registers a resolvable ref for a below-threshold overlay so scope:{ref} against the announced ref actually works", async () => {
    // Regression coverage for a real, confirmed bug: the banner says "scope into it" using the exact
    // ref in overlay_active, but that ref was previously never added to the session's ref-descriptor
    // map (only the flood-collapse summary row was) — so scope:{ref} against it always threw "not
    // found", no matter how fresh the read. The "Your Cart" drawer (4 controls, well under the flood
    // threshold of 12) is the confirmed live shape this fixes.
    document.body.innerHTML = `
      <div role="dialog" aria-label="Your Cart">
        <button data-testid="close">Close</button>
        <button data-testid="checkout">Checkout</button>
      </div>
    `;
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.getBoundingClientRect = () => ({
      width: 300,
      height: 300,
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    const url = { value: "https://demo.kustom.co/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const full = await engine.takeSnapshot(
      "sess-overlay-scope",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        collapse: false
      }
    );

    expect(full.overlay_active).toBeDefined();
    const overlayRef = full.overlay_active?.ref;
    expect(overlayRef).toBeDefined();
    // The exact ref the banner announces is now a normal, resolvable element in the response.
    expect(full.elements?.some((e) => e.ref === overlayRef && e.role === "dialog")).toBe(true);

    // The follow-up scoped read the banner tells the agent to make — must not throw.
    const scoped = await engine.takeSnapshot(
      "sess-overlay-scope",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        scope: { ref: overlayRef! }
      }
    );
    expect(scoped.elements?.some((e) => e.testid === "close")).toBe(true);
    expect(scoped.elements?.some((e) => e.testid === "checkout")).toBe(true);
  });

  it("announces an open overlay even when the read is scoped away from it", async () => {
    document.body.innerHTML = `
      <main id="main"><button data-testid="in-main">Search hotels</button></main>
      <div role="dialog" aria-modal="true" aria-label="Sign in required">
        <button aria-label="Dismiss">x</button>
      </div>
    `;
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.getBoundingClientRect = () => ({
      width: 320,
      height: 240,
      top: 10,
      left: 10,
      right: 330,
      bottom: 250,
      x: 10,
      y: 10,
      toJSON: () => ({})
    });

    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot(
      "sess-scope-overlay",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        scope: { css: "#main" },
        collapse: false
      }
    );

    expect(result.elements?.some((e) => e.testid === "in-main")).toBe(true);
    expect(result.elements?.some((e) => e.name === "Dismiss")).toBe(false);
    expect(result.overlay_active).toBeDefined();
    expect(result.overlay_active?.name).toBe("Sign in required");
    expect(result.overlay_active?.modal).toBe(true);
  });

  it("prefers the visually top overlay by z-index (not only DOM order)", async () => {
    document.body.innerHTML = `
      <div role="dialog" aria-label="Foreground dialog" style="position:fixed; z-index: 200;">
        <button>Top action</button>
      </div>
      <div role="dialog" aria-label="Background dialog" style="position:fixed; z-index: 100;">
        <button>Bottom action</button>
      </div>
    `;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const d of dialogs) {
      d.getBoundingClientRect = () => ({
        width: 300,
        height: 220,
        top: 0,
        left: 0,
        right: 300,
        bottom: 220,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });
    }

    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot(
      "sess-z-overlay",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        collapse: false
      }
    );

    expect(result.overlay_active).toBeDefined();
    expect(result.overlay_active?.name).toBe("Foreground dialog");
  });

  it("treats alertdialog overlays as blocking for banner semantics", async () => {
    document.body.innerHTML = `
      <div role="alertdialog" aria-label="Session timeout warning">
        <button>Stay signed in</button>
      </div>
    `;
    const alertDialog = document.querySelector('[role="alertdialog"]')!;
    alertDialog.getBoundingClientRect = () => ({
      width: 280,
      height: 180,
      top: 20,
      left: 20,
      right: 300,
      bottom: 200,
      x: 20,
      y: 20,
      toJSON: () => ({})
    });

    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot(
      "sess-alertdialog",
      makePage(url, makeEvaluateRunner()),
      {
        mode: "interactive",
        collapse: false
      }
    );

    expect(result.overlay_active).toBeDefined();
    expect(result.overlay_active?.role).toBe("alertdialog");
    expect(result.overlay_active?.modal).toBe(true);
  });

  it("space-joins abutting child-element text in accessible names", async () => {
    document.body.innerHTML = `<button><span>Colombo</span><span>Colombo District, Sri Lanka</span></button>`;
    const url = { value: "https://example.com/" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const result = await engine.takeSnapshot("sess-name", makePage(url, makeEvaluateRunner()), {
      mode: "interactive"
    });
    const btn = result.elements?.find((e) => e.role === "button");
    expect(btn?.name).toBe("Colombo Colombo District, Sri Lanka");
  });

  it("rejects a scope ref captured on a previous page (URL-guard)", async () => {
    document.body.innerHTML = `<div id="panel"><button data-testid="panel-btn">Inside</button></div>`;
    const url = { value: "https://example.com/a" };
    const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
    const full = await engine.takeSnapshot("sess-guard", makePage(url, makeEvaluateRunner()), {
      mode: "interactive",
      collapse: false
    });
    const panelRef = full.elements?.find((e) => e.testid === "panel-btn")?.ref;
    url.value = "https://example.com/b";
    await expect(
      engine.takeSnapshot("sess-guard", makePage(url, makeEvaluateRunner()), {
        mode: "interactive",
        scope: { ref: panelRef! }
      })
    ).rejects.toThrow(/previous page/);
  });

  describe("other_tabs", () => {
    it("is absent when this is the only open tab (the overwhelming common case)", async () => {
      document.body.innerHTML = `<button data-testid="go">Go</button>`;
      const url = { value: "https://example.com/" };
      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const result = await engine.takeSnapshot("sess-tabs-1", makePage(url, makeEvaluateRunner()), {
        mode: "interactive"
      });
      expect(result.other_tabs).toBeUndefined();
    });

    it("surfaces other open tabs — e.g. a payment/login popup a click just opened", async () => {
      document.body.innerHTML = `<button data-testid="pay">Pay order</button>`;
      const url = { value: "https://demo.kustom.co/checkout/" };
      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const result = await engine.takeSnapshot(
        "sess-tabs-2",
        makePage(url, makeEvaluateRunner(), ["https://login.klarna.com/oauth2/auth?x=1"]),
        { mode: "interactive" }
      );
      expect(result.other_tabs).toEqual({
        count: 1,
        urls: ["https://login.klarna.com/oauth2/auth?x=1"]
      });
    });

    it("caps the listed URLs but keeps the true count", async () => {
      document.body.innerHTML = `<button data-testid="go">Go</button>`;
      const url = { value: "https://example.com/" };
      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const manyTabs = Array.from({ length: 8 }, (_, i) => `https://example.com/tab-${i}`);
      const result = await engine.takeSnapshot(
        "sess-tabs-3",
        makePage(url, makeEvaluateRunner(), manyTabs),
        {
          mode: "interactive"
        }
      );
      expect(result.other_tabs?.count).toBe(8);
      expect(result.other_tabs?.urls.length).toBeLessThan(8);
    });

    it("never fails the snapshot if reading the other tabs throws (best-effort)", async () => {
      document.body.innerHTML = `<button data-testid="go">Go</button>`;
      const url = { value: "https://example.com/" };
      const page = makePage(url, makeEvaluateRunner());
      // Simulate a page mid-teardown where context() throws.
      Object.defineProperty(page, "context", {
        value: () => {
          throw new Error("context unavailable");
        }
      });
      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const result = await engine.takeSnapshot("sess-tabs-4", page, { mode: "interactive" });
      expect(result.other_tabs).toBeUndefined();
      expect(result.elements?.length).toBeGreaterThan(0);
    });
  });

  describe("scoping into a ref captured inside an iframe", () => {
    // Regression coverage for a real production failure: a folded overlay (a "Choose package locker"
    // checkout dialog) captured inside a Klarna/Stripe iframe got a valid ref, but scoping into that ref
    // always ran page.evaluate() against the *top* document — which can never find an element that only
    // exists inside the iframe's own document — and failed with "ref not found" even though the ref was
    // completely valid and fresh.
    const HOST_LOCATOR: StructuredLocator = {
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "klarna-checkout-iframe"
    };
    const DIALOG_ARIA_SNAPSHOT =
      '- iframe [ref=e2]:\n  - dialog "Choose package locker" [ref=f1]:\n    - button "Confirm"\n';
    const CANNED_DIALOG_RESULT = {
      elements: [
        {
          ref: "ref-raw-dialog",
          tag: "div",
          role: "dialog",
          name: "Choose package locker",
          in_viewport: true,
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "dialog",
            name: "Choose package locker"
          }
        }
      ],
      truncated: false,
      collapsed_count: 0,
      alerts: []
    };

    // `iframeHandle` is the one host element resolved two different ways depending on which pass is
    // running — via the ariaSnapshot-driven aria-ref lookup during discovery, and via the direct xpath
    // hop selector resolveFrameForPath renders during a later scoped read — exactly as production does,
    // since it's the same real <iframe> host element either way.
    function setupPage(iframeHandle: {
      contentFrame(): Promise<unknown>;
      ownerFrame?(): Promise<unknown>;
    }): Page {
      const topLocator = vi.fn((selector: string) => {
        if (selector === "body") return fakeLocatorFor(DIALOG_ARIA_SNAPSHOT, null);
        if (selector === "aria-ref=e2") return fakeLocatorFor("", iframeHandle);
        if (selector === 'xpath=//*[@data-testid="klarna-checkout-iframe"]')
          return fakeLocatorFor("", iframeHandle);
        throw new Error(`unexpected top selector ${selector}`);
      });

      const page = {
        url: () => "https://checkout.test/",
        title: () => Promise.resolve("Checkout"),
        evaluate: makeEvaluateRunner(),
        frames: () => [page, {}],
        locator: topLocator,
        context: () => ({ pages: () => [page] }),
        mainFrame: () => page
      } as unknown as Page;

      // The host element genuinely is a direct child of the top-level page in this fixture — its
      // ownerFrame matches the scope that discovered it, same as any real, correctly-scoped iframe.
      if (iframeHandle.ownerFrame === undefined) {
        iframeHandle.ownerFrame = vi.fn().mockResolvedValue(page);
      }

      return page;
    }

    it("captures inside the frame the ref actually lives in, and re-attaches frame_path so a follow-up act still resolves", async () => {
      document.body.innerHTML = `<button data-testid="continue">Continue</button>`;
      const childFrameEvaluate = vi.fn().mockResolvedValue(CANNED_DIALOG_RESULT);
      const childFrame = {
        evaluate: childFrameEvaluate,
        locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
        url: () => "https://checkout.test/klarna-frame",
        waitForURL: vi.fn().mockResolvedValue(undefined)
      };
      const iframeHandle = {
        evaluate: vi.fn().mockResolvedValue(HOST_LOCATOR),
        contentFrame: vi.fn().mockResolvedValue(childFrame)
      };
      const page = setupPage(iframeHandle);

      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const full = await engine.takeSnapshot("sess-iframe-scope", page, { mode: "interactive" });
      const dialogEl = full.elements?.find((e) => e.role === "dialog");
      expect(dialogEl).toBeDefined();
      expect(dialogEl?.locator?.frame_path).toEqual([HOST_LOCATOR]);

      childFrameEvaluate.mockResolvedValue({
        elements: [
          {
            ref: "ref-raw-confirm",
            tag: "button",
            role: "button",
            name: "Confirm",
            in_viewport: true,
            locator: { strategy: "role_name", confidence: "high", role: "button", name: "Confirm" }
          }
        ],
        truncated: false,
        collapsed_count: 0,
        alerts: []
      });

      const scoped = await engine.takeSnapshot("sess-iframe-scope", page, {
        mode: "interactive",
        scope: { ref: dialogEl!.ref }
      });

      expect(childFrameEvaluate).toHaveBeenCalledTimes(2);
      const confirmEl = scoped.elements?.find((e) => e.name === "Confirm");
      expect(confirmEl).toBeDefined();
      expect(confirmEl?.locator?.frame_path).toEqual([HOST_LOCATOR]);
    });

    it("throws a clear error, without falling back to the top page, when the iframe can no longer be located on a later scoped read", async () => {
      document.body.innerHTML = `<button data-testid="continue">Continue</button>`;
      const childFrame = {
        evaluate: vi.fn().mockResolvedValue(CANNED_DIALOG_RESULT),
        locator: vi.fn().mockReturnValue(fakeLocatorFor("", null)),
        url: () => "https://checkout.test/klarna-frame",
        waitForURL: vi.fn().mockResolvedValue(undefined)
      };
      // Discovery succeeds fine and establishes the descriptor — but by the time the scoped follow-up
      // read runs, the same host element's contentFrame() is no longer attached (the widget tore itself
      // down / re-rendered a fresh iframe in its place).
      let callCount = 0;
      const iframeHandle = {
        evaluate: vi.fn().mockResolvedValue(HOST_LOCATOR),
        contentFrame: vi.fn().mockImplementation(() => {
          callCount += 1;
          return Promise.resolve(callCount === 1 ? childFrame : null);
        })
      };
      const page = setupPage(iframeHandle);

      const engine = new SnapshotEngine(new SnapshotMemoryTable(8), cfg, () => {});
      const full = await engine.takeSnapshot("sess-iframe-gone", page, { mode: "interactive" });
      const dialogRef = full.elements?.find((e) => e.role === "dialog")?.ref;
      expect(dialogRef).toBeDefined();

      await expect(
        engine.takeSnapshot("sess-iframe-gone", page, {
          mode: "interactive",
          scope: { ref: dialogRef! }
        })
      ).rejects.toThrow(/could no longer be located/);
    });
  });
});
