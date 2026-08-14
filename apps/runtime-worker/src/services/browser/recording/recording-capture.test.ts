import { describe, expect, it } from "vitest";

import { chooseBestSelectorCandidate, buildRecorderScript } from "./recording-capture.evaluate.js";
import { RECORDER_HOST_ID } from "./recording-overlay.constants.js";

describe("buildRecorderScript", () => {
  it("attaches capture listeners before mountIndicator", () => {
    const script = buildRecorderScript(["data-testid"]);
    const listenerIdx = script.indexOf("document.addEventListener('click'");
    const mountIdx = script.indexOf("function mountIndicator()");
    expect(listenerIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(-1);
    expect(listenerIdx).toBeLessThan(mountIdx);
  });

  it("uses shadow-host id and deferred mount", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain(RECORDER_HOST_ID);
    expect(script).toContain("DOMContentLoaded");
    expect(script).toContain("attachShadow({ mode: 'closed' })");
    expect(script).toContain("window.top !== window");
    expect(script).toContain("composedPath");
  });

  it("defines pause and hidden hooks", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("__vindicateSetRecorderHidden");
    expect(script).toContain("__vindicateBeginScreenshotHide");
    expect(script).toContain("__vindicateScreenshotHideDepth");
    expect(script).toContain("__vindicateSetRecorderPaused");
    expect(script).toContain("event: '__paused'");
    expect(script).toContain("Recorder lost");
  });

  it("defines a non-emitting pause-state applier for server-pushed cross-page sync", () => {
    // Regression guard: broadcasting via __vindicateSetRecorderPaused (which always re-emits a '__paused'
    // event) would ping-pong forever between the server and every open page. The sync target must be a
    // separate function that never calls safeRecordEvent.
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("__vindicateApplyPausedState");
    const fnIdx = script.indexOf("window.__vindicateApplyPausedState = function(p) {");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnEndIdx = script.indexOf("};", fnIdx);
    expect(fnEndIdx).toBeGreaterThan(fnIdx);
    const fnBody = script.slice(fnIdx, fnEndIdx);
    expect(fnBody).toContain("setRecordingUi()");
    expect(fnBody).not.toContain("safeRecordEvent");
  });

  it("includes actionable click resolution helpers", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("function resolveActionableElement(");
    expect(script).toContain("function isInteractive(");
    expect(script).toContain("if (actionable === null) return");
  });

  it("includes fill and upload_file change handling", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("emit('fill', el");
    expect(script).toContain("emit('upload_file', el");
    expect(script).toContain("emit('dblclick', actionable");
    expect(script).toContain("emitDrag(");
  });

  it("includes snapshot, pause, and stop controls in indicator", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain('id="__vindicate-snapshot-btn"');
    expect(script).toContain('id="__vindicate-pause-btn"');
    expect(script).toContain('id="__vindicate-stop-btn"');
    expect(script).toContain("action: 'snapshot'");
    expect(script).toContain("strength: 'strong'");
    expect(script).toContain("strength: 'medium'");
    expect(script).toContain("strength: 'weak'");
  });

  it("sizes the overlay to content instead of stretching full width", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("width:max-content");
    expect(script).toContain("display:inline-flex");
    expect(script).toContain('class="__vindicate-status"');
    expect(script).toContain('class="__vindicate-actions"');
  });

  it("includes a visible drag handle icon for repositioning the panel", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain('id="__vindicate-drag-handle"');
    expect(script).toContain('class="__vindicate-drag-icon"');
    expect(script).toContain("Drag to move recorder panel");
    expect(script).toContain("cursor:move");
  });

  it("builds the 'text' candidate from raw textContent, not the space-joined accessible-name helper", () => {
    // Regression guard: getAccessibleName (space-joined, for getByRole's ARIA accname matching) was
    // previously reused directly for the 'text' candidate too, which Playwright renders via
    // getByText(value, {exact:true}) — a different, non-space-joining matching algorithm. Confirmed live
    // against a real production timeout (a Klarna checkout payment radio's click-delegate label). See
    // getTextCandidateName's own comment in the source for the full writeup.
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("function getTextCandidateName(el)");
    const fnIdx = script.indexOf("function getTextCandidateName(el)");
    const fnEndIdx = script.indexOf("\n  }", fnIdx);
    const fnBody = script.slice(fnIdx, fnEndIdx);
    // Uses raw el.textContent, not the space-joining elementText() helper.
    expect(fnBody).toContain("el.textContent");
    expect(fnBody).not.toContain("elementText(el)");

    // The 'text' candidate push site must use this function's result, not getAccessibleName's.
    const pushIdx = script.indexOf("strategy: 'text'");
    expect(pushIdx).toBeGreaterThan(-1);
    const aroundPush = script.slice(Math.max(0, pushIdx - 300), pushIdx);
    expect(aroundPush).toContain("getTextCandidateName(el)");
  });

  it("chooseBestCandidate's priority list matches the real strategy names buildCandidates pushes", () => {
    const script = buildRecorderScript(["data-testid"]);
    // Regression guard: this local (browser-injected) chooseBestCandidate previously listed stale
    // display names ('role+name', 'css', 'xpath') that buildCandidates never pushes, silently reducing
    // it to an always-pool[0] fallback. It happened to still pick correctly (buildCandidates already
    // pushes in priority order and never marks anything dynamic), but the priority loop itself was dead
    // code — any future reordering or a dynamic flag would have silently broken selection.
    expect(script).toContain(
      "var order = ['testid', 'scoped', 'dom_id', 'role_name', 'text', 'attr_combo', 'sibling_text', 'nth'];"
    );
    expect(script).not.toContain("'role+name', 'css', 'xpath'");
  });

  it("wires the sibling_text fallback into candidate building, gated on no accessible name", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("function buildSiblingTextCandidate(el)");
    expect(script).toContain("strategy: 'sibling_text'");
    // Only offered when name is empty, and before the buildCandidates call site returns.
    const callSiteIdx = script.indexOf("var siblingText = buildSiblingTextCandidate(el);");
    expect(callSiteIdx).toBeGreaterThan(-1);
    expect(script.indexOf("function buildSiblingTextCandidate(el)")).toBeLessThan(callSiteIdx);
  });

  it("wires the cursor:pointer click-delegate fallback into resolveActionableElement", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("function resolveActionableElement(el)");
    expect(script).toContain("cursorFallback");
    expect(script).toContain("isPointerEventsNoneForActionable");
    expect(script).toContain("hasClickCursorForActionable");
  });

  it("offers a 'text' candidate for a role-less, non-form-control element with real text", () => {
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("strategy: 'text'");
    expect(script).toContain("isFormControlTag");
    // Gated on no explicit role attribute, so a real <button>'s own text never gets a redundant/wrong
    // text candidate alongside its role_name one.
    const textTierIdx = script.indexOf("isFormControlTag");
    expect(script.slice(textTierIdx, textTierIdx + 300)).toContain("el.getAttribute('role') === null");
  });

  it("uses the ARIA implicit role, never the raw tag name, for role_name and scoped candidates", () => {
    // Regression guard: <tr>'s implicit role is "row", not "tr" — getByRole('tr', ...) matches nothing
    // in a real browser. buildScopedCandidate's rowRole/targetRole and buildCandidates' role_name gate
    // previously fell back to the bare tag name for any element without an explicit role attribute.
    const script = buildRecorderScript(["data-testid"]);
    expect(script).toContain("function implicitRole(el)");
    expect(script).toContain("if (tag === 'tr') return 'row';");
    expect(script).toContain("if (tag === 'li') return 'listitem';");
    expect(script).toContain("var rowRole = implicitRole(container);");
    expect(script).toContain("var targetRole = implicitRole(el);");
    expect(script).toContain("const role = implicitRole(el);");
    expect(script).not.toContain("el.getAttribute('role') || el.tagName.toLowerCase()");
  });
});

describe("chooseBestSelectorCandidate", () => {
  it("prefers testid over other strategies", () => {
    const candidates = [
      { strategy: "role_name", value: 'button[name="Save"]' },
      { strategy: "testid", value: "save-btn", attr: "data-cy" },
      { strategy: "dom_id", value: "save" },
      { strategy: "nth", value: "//button" }
    ];
    expect(chooseBestSelectorCandidate(candidates)).toEqual({
      strategy: "testid",
      value: "save-btn",
      attr: "data-cy"
    });
  });

  it("falls back to role_name when no testid", () => {
    const candidates = [
      { strategy: "nth", value: "//button" },
      { strategy: "role_name", value: 'button[name="Save"]' },
      { strategy: "attr_combo", value: '//button[@type="submit"]' }
    ];
    expect(chooseBestSelectorCandidate(candidates)).toEqual({
      strategy: "role_name",
      value: 'button[name="Save"]'
    });
  });

  it("returns null for empty candidates", () => {
    expect(chooseBestSelectorCandidate([])).toBeNull();
  });
});
