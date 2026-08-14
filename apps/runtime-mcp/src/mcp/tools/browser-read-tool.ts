/** MCP tool for compact ARIA page reads, delta snapshots, and optional console/network logs. */
import { UuidSchema } from "@vindicate/protocol";
import type { StructuredLocator } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner, ILogReader } from "../../worker/worker-client.interface.js";
import { logger } from "../../core/logger.js";
import type { BrowserReadSessionState } from "./browser-read-session-state.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolMarkdown } from "./result.js";

export const BROWSER_READ_CHAR_BUDGET = 8_000;

interface SnapshotElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly testid?: string;
  readonly testid_attr?: string;
  readonly type?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly aria_required?: boolean | null;
  readonly aria_expanded?: boolean | null;
  readonly aria_checked?: boolean | "mixed" | null;
  readonly aria_invalid?: boolean | null;
  readonly locator?: StructuredLocator;
  /** Set when `locator` was derived from a click-delegate ancestor because this element itself is
   * computed pointer-events:none — click works, check/uncheck do not (the delegate isn't a checkbox/radio). */
  readonly click_delegate?: boolean;
  /** Set only when `false` — computed CSS visibility (display/visibility/opacity), distinct from
   * viewport-bounds geometry. Tells apart two structurally-identical candidates for the same role/name
   * at different frame_path depths (e.g. a payment SDK's pre-mounted-but-hidden iframe alongside the
   * real, user-facing one). Live-only — never persisted into a codegen schema or recording. */
  readonly visible?: false;
  /** Set when this element's ref is brand new this read AND an older element with the same role+name
   * was already present — the ref of that older element. A third-party SDK swapping one iframe-hosted
   * control for another as page state changes (e.g. a payment provider remounting its card-input
   * iframe once a payment method is selected) — prefer this element over the one it names. */
  readonly supersedes_ref?: string;
}

interface OverlayActive {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly modal: boolean;
}

interface OtherTabs {
  readonly count: number;
  readonly urls: string[];
}

interface SnapshotWire {
  readonly snapshot_id: number;
  readonly url: string;
  readonly title: string;
  readonly elements?: SnapshotElement[];
  readonly alerts?: string[];
  readonly overlay_active?: OverlayActive;
  readonly other_tabs?: OtherTabs;
  readonly truncation_warning?: string;
  readonly delta_fallback?: boolean;
}

/** Cap an accessible name in a banner so a verbose aria-label can't blow the line out. */
function clampName(name: string, max = 80): string {
  const trimmed = name.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Top-of-response banner announcing an open overlay. A `modal` overlay intercepts clicks on the page
 * behind it, so the agent must act inside it or dismiss it before the rest of the read is reachable;
 * a non-modal overlay (open listbox/menu/popover) is surfaced so the agent can scope into or close it.
 */
function overlayBanner(o: OverlayActive): string {
  const named = o.name.length > 0 ? ` "${clampName(o.name)}"` : "";
  if (o.modal) {
    return `⚠️ modal open: ${o.role}${named} @${o.ref} — page is blocked; act inside it or dismiss it, then re-read`;
  }
  return `⚠️ overlay open: ${o.role}${named} @${o.ref} — scope into it or dismiss it, then re-read`;
}

/**
 * Top-of-response banner announcing browser tab(s) other than the one just read — a site-opened popup
 * (payment, login, OAuth: Klarna, PayPal, Google login, …) lands here exactly like one the agent opened
 * itself. Without this, a page that just clicked "Pay" and opened a login popup reads as if nothing
 * happened at all — there is nothing else in a normal snapshot to suggest looking elsewhere.
 */
function otherTabsBanner(t: OtherTabs): string {
  const shown = t.urls.map((u) => `"${clampName(u, 60)}"`).join(", ");
  const more = t.count > t.urls.length ? ` (+${t.count - t.urls.length} more)` : "";
  return `⚠️ ${t.count} other tab(s) open: ${shown}${more} — call browser_navigate switch_to_url:'<part of the url>' to check them`;
}

/** Live-region/display roles whose visible text is content, not a matchable accessible name. */
const LIVE_REGION_ROLES = new Set(["alert", "status", "log"]);

/**
 * Identifying label for one `frame_path` hop (an iframe HOST element) — `deriveIframeHostLocator`
 * (runtime-worker) already restricts hops to the XPath-renderable tiers, so every case here has a
 * stable, reportable identity. Without this, an agent hand-authoring a `frame_path` for
 * `vindicate_generate_code` has no way to see the real `id`/attr a captured hop resolved to — it only
 * sees a depth count — and ends up guessing (e.g. reusing one visible `title` for two distinct
 * iframes), producing an invalid duplicate-hop chain that fails at first test run.
 */
function frameHopLabel(hop: StructuredLocator): string {
  switch (hop.strategy) {
    case "testid":
    case "testid_xpath":
      return `${hop.attr ?? "testid"}=${clampName(hop.value ?? "", 40)}`;
    case "dom_id":
      return `id=${clampName(hop.value ?? "", 40)}`;
    case "attr_combo":
      return clampName(hop.xpath ?? "attr combo", 50);
    case "nth":
      return "positional, low confidence";
    default:
      return hop.strategy;
  }
}

function frameChainLabel(framePath: readonly StructuredLocator[]): string {
  return framePath.map(frameHopLabel).join(" > ");
}

/** Short label for how this element will actually be located, derived from the structured locator. */
function viaLabel(loc: StructuredLocator | undefined): string | undefined {
  if (loc === undefined) {
    return undefined;
  }
  switch (loc.strategy) {
    case "testid":
    case "testid_xpath":
      return "testid";
    case "dom_id":
      return "id";
    case "role_name":
      return loc.name !== undefined && loc.name.length > 0 ? "role+name" : "role";
    case "label":
    case "placeholder":
    case "text":
      return loc.strategy;
    case "attr_combo":
      return "attr";
    case "scoped":
      return "scoped";
    case "sibling_text":
      return "sibling text";
    case "nth":
      return "nth, low confidence";
    default:
      return loc.strategy;
  }
}

/**
 * Same accessible name, different role, both present in this one read — e.g. a cart drawer's real
 * "Checkout" navigation link sitting next to an `[expanded]` "Checkout" toggle button. Role alone (and,
 * for a disclosure widget, the `[expanded]` flag) is real signal, but only for a reader who already
 * knows `aria-expanded` marks a toggle rather than navigation — not guaranteed for a first-time agent.
 * Pure same-snapshot grouping (unlike `supersedes_ref`, which needs a delta against a prior read) — one
 * representative ref per other distinct role, so the badge stays short even with 3+ same-named elements.
 */
function computeSameNameDifferentRole(
  elements: readonly SnapshotElement[]
): ReadonlyMap<string, ReadonlyArray<{ readonly ref: string; readonly role: string }>> {
  const byName = new Map<string, Array<{ readonly ref: string; readonly role: string }>>();
  for (const el of elements) {
    if (el.name.length === 0) {
      continue;
    }
    const list = byName.get(el.name) ?? [];
    list.push({ ref: el.ref, role: el.role });
    byName.set(el.name, list);
  }

  const result = new Map<string, Array<{ readonly ref: string; readonly role: string }>>();
  for (const group of byName.values()) {
    if (new Set(group.map((g) => g.role)).size < 2) {
      continue;
    }
    for (const el of group) {
      const seenRoles = new Set<string>([el.role]);
      const others: Array<{ readonly ref: string; readonly role: string }> = [];
      for (const other of group) {
        if (other.ref === el.ref || seenRoles.has(other.role)) {
          continue;
        }
        seenRoles.add(other.role);
        others.push(other);
      }
      if (others.length > 0) {
        result.set(el.ref, others);
      }
    }
  }
  return result;
}

/**
 * Trailing badge that tells the agent how the element resolves and, for live regions, that the text is
 * content to assert (not a role name to match). Keeps the agent from binding e.g. an alert's message as
 * a `getByRole` name — which never matches.
 *
 * `testidShown` reports whether the line already carries a `[testid=…]` badge; when it does, a redundant
 * `via testid` is suppressed so the line stays compact (the testid badge already says how it resolves).
 */
function locatorBadge(
  el: SnapshotElement,
  testidShown: boolean,
  sameNameOtherRoles?: ReadonlyArray<{ readonly ref: string; readonly role: string }>
): string {
  const parts: string[] = [];
  const via = viaLabel(el.locator);
  if (via !== undefined && !(via === "testid" && testidShown)) {
    // No real accessible name exists for this tier (that's why it was needed at all) — the matched
    // text is the only thing that tells the agent which element this is, so it goes in the badge
    // itself rather than the name column. Applies to "text" too: a click-delegate checkbox resolves
    // via the delegate's own text (e.g. "STRAIGHT EVENT"), which never appears in the checkbox's own
    // (correctly empty) accessible name — omitting it here left the agent unable to tell options apart.
    if (
      (el.locator?.strategy === "sibling_text" || el.locator?.strategy === "text") &&
      el.locator.value !== undefined
    ) {
      parts.push(`via ${via}: "${clampName(el.locator.value)}"`);
    } else {
      parts.push(`via ${via}`);
    }
  }
  if (el.locator === undefined) {
    // Proactive, not discovered only after a failed act: an element with no derivable locator at all
    // (e.g. inside a shadow root with no accessible name from any source) will only ever throw at act
    // time — say so up front rather than let the agent spend an attempt (or a retry loop) finding out.
    parts.push("no locator — cannot be reliably automated");
  }
  if (el.click_delegate === true) {
    // The real click target is a delegate ancestor (this element itself is pointer-events:none) —
    // `click` works, but `check`/`uncheck` call Playwright's checkbox/radio-specific APIs, which the
    // delegate (a plain container, not itself a checkbox/radio) will reject immediately.
    parts.push("click only — check/uncheck unsupported");
  }
  if (el.visible === false) {
    // Distinct from in-viewport geometry: this element is laid out but hidden via display/visibility/
    // opacity (on itself or an ancestor). Surfaced because a page can carry two structurally-identical
    // candidates for the same role/name at different frame_path depths — e.g. a payment SDK's pre-
    // mounted-but-hidden card iframe alongside the real one once a payment method is actually selected.
    // Prefer a visible candidate when more than one line matches the element you're looking for.
    parts.push("not visible");
  }
  if (el.supersedes_ref !== undefined) {
    // This element's ref is brand new this read; an older element with the identical role+name is
    // still listed too (a third-party SDK swapping one iframe-hosted control for another as page
    // state changes, e.g. a payment provider remounting its card-input iframe once a payment method
    // is selected). The old one hasn't necessarily broken yet, but it's stale — prefer this one.
    parts.push(`replaces @${el.supersedes_ref} — prefer this one`);
  }
  if (sameNameOtherRoles !== undefined && sameNameOtherRoles.length > 0) {
    // Two genuinely different, simultaneously-present elements — not a collision, not a duplicate —
    // that happen to share an accessible name (a cart drawer's real "Checkout" link next to an
    // `[expanded]` "Checkout" toggle button is the confirmed real case). Nothing else in the line
    // reliably tells them apart for a reader who doesn't already know an ARIA role/expanded-state
    // convention, so name it explicitly rather than relying on that.
    const others = sameNameOtherRoles.map((o) => `@${o.ref} (${o.role})`).join(", ");
    parts.push(`same name as ${others} — verify which is the real target`);
  }
  const framePath = el.locator?.frame_path ?? [];
  if (framePath.length > 0) {
    // Purely informational — the locator already resolves correctly through the iframe chain (act-time
    // renders it as a page.frameLocator(...) chain automatically). Surfaced so the agent understands why
    // an element it can see and act on wouldn't appear if it tried to grep the page's raw HTML/DOM, and
    // so codegen output containing frameLocator() calls doesn't come as a surprise. The chain itself
    // (frameChainLabel) is what lets an agent hand-author a correct frame_path for codegen instead of
    // guessing — see frameHopLabel.
    const chain = frameChainLabel(framePath);
    parts.push(
      framePath.length === 1 ? `in iframe: ${chain}` : `in nested iframe ×${framePath.length}: ${chain}`
    );
  }
  if (LIVE_REGION_ROLES.has(el.role)) {
    parts.push("assert text with toContainText");
  }
  return parts.length > 0 ? ` [${parts.join(" — ")}]` : "";
}

function formatElementLine(
  el: SnapshotElement,
  sameNameOtherRoles?: ReadonlyArray<{ readonly ref: string; readonly role: string }>
): string {
  const flags: string[] = [];
  if (el.aria_required === true) {
    flags.push("required");
  }
  if (el.aria_expanded === true) {
    flags.push("expanded");
  }
  if (el.aria_checked === true) {
    flags.push("checked");
  }
  if (el.aria_checked === "mixed") {
    flags.push("mixed");
  }
  if (el.disabled === true) {
    flags.push("disabled");
  }
  if (el.aria_invalid === true) {
    flags.push("invalid");
  }

  const testidShown = el.testid !== undefined;
  const testidBadge = testidShown ? ` [${el.testid_attr ?? "testid"}=${el.testid}]` : "";
  // Surfaced only for non-default input types (email/password/tel/...) — a plain "text" input is
  // already implied by role="textbox" and would just add noise to every read.
  const typeBadge = el.type !== undefined && el.type.length > 0 && el.type !== "text" ? ` (type=${el.type})` : "";
  const valueBadge = el.value !== undefined && el.value.length > 0 ? ` (${el.value})` : "";
  const flagBadge = flags.length > 0 ? ` [${flags.join(", ")}]` : "";

  return `- ${el.role} "${el.name}"${typeBadge}${valueBadge} @${el.ref}${testidBadge}${flagBadge}${locatorBadge(el, testidShown, sameNameOtherRoles)}`;
}

export function formatSnapshot(r: SnapshotWire, charBudget = BROWSER_READ_CHAR_BUDGET): string {
  const prefix: string[] = [];
  prefix.push(`page: ${r.title} — ${r.url}`);
  if (r.overlay_active !== undefined) {
    prefix.push(overlayBanner(r.overlay_active));
  }
  if (r.other_tabs !== undefined) {
    prefix.push(otherTabsBanner(r.other_tabs));
  }
  if (r.truncation_warning !== undefined) {
    prefix.push(r.truncation_warning);
  }

  const elements = r.elements ?? [];
  const sameNameOtherRoles = computeSameNameDifferentRole(elements);
  const elementLines = elements.map((el) => formatElementLine(el, sameNameOtherRoles.get(el.ref)));
  const totalElements = elementLines.length;

  const suffix: string[] = [];
  if (r.alerts !== undefined && r.alerts.length > 0) {
    suffix.push(`⚠️ ${r.alerts.length} alert(s): ${r.alerts.map((a) => `"${a}"`).join(", ")}`);
  }
  if (r.delta_fallback === true) {
    suffix.push("(full snapshot — page navigated)");
  }
  suffix.push(`snapshot_id: ${r.snapshot_id}`);

  // Confirmed live: on an iframe-heavy page (embedded checkout, payment widgets) the target is
  // routinely the last thing cut, since captureChildFrames appends iframe content after the top page.
  // `scope:{css}` never reaches past the iframe boundary (it resolves against the top document only —
  // returns nothing for content inside), and `scope:{ref}` needs a ref from the very read that just got
  // truncated, so neither actually recovers a truncated-away target. `viewport_only` is the one that
  // does (it drops off-screen top-page noise, freeing budget for what's still cut) — lead with it.
  const noticeFor = (shown: number, total: number): string =>
    `⚠️ showing ${shown} of ${total} elements — try viewport_only:true first (scope:{css} only reaches the top-level page, not iframe content; scope:{ref} needs a ref from a read that wasn't truncated)`;

  const joinLines = (elements: string[], notice?: string): string => {
    const lines = [...prefix, ...elements];
    if (notice !== undefined) {
      lines.push(notice);
    }
    lines.push(...suffix);
    return lines.join("\n");
  };

  if (elementLines.length === 0) {
    return joinLines([]);
  }

  const fullText = joinLines(elementLines);
  if (fullText.length <= charBudget) {
    return fullText;
  }

  let low = 0;
  let high = elementLines.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = joinLines(elementLines.slice(0, mid), noticeFor(mid, totalElements));
    if (candidate.length <= charBudget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  if (low === elementLines.length) {
    return fullText;
  }

  return joinLines(elementLines.slice(0, low), noticeFor(low, totalElements));
}

function isSnapshotWire(value: unknown): value is SnapshotWire {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.snapshot_id === "number" &&
    typeof r.url === "string" &&
    typeof r.title === "string"
  );
}

function unwrapSnapshot(result: unknown): SnapshotWire {
  if (typeof result !== "object" || result === null) {
    throw new Error("browser_read received invalid snapshot result — retry browser_read");
  }
  const record = result as Record<string, unknown>;
  if (record.action === "snapshot") {
    const rest = { ...record };
    delete rest.action;
    if (!isSnapshotWire(rest)) {
      throw new Error("browser_read snapshot missing snapshot_id, url, or title — retry browser_read");
    }
    return rest;
  }
  if (!isSnapshotWire(record)) {
    throw new Error("browser_read snapshot missing snapshot_id, url, or title — retry browser_read");
  }
  return record;
}

export interface BrowserReadToolDeps {
  readonly workerClient: ICommandRunner & ILogReader;
  readonly browserReadState: BrowserReadSessionState;
}

export function registerBrowserReadTool(server: McpServer, deps: BrowserReadToolDeps): void {
  server.registerTool(
    "browser_read",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Read the current page as compact ARIA text and return refs for `browser_act`. Refs stay valid within the same page and are reset on navigation — re-read after the URL changes. When a read is truncated or noisy, narrow it with `scope` (ref or css). A large open overlay (dialog/calendar/listbox) is folded into one summary row — scope into it to read its items. Overlays are announced at top (`⚠️ modal/overlay open`); dismiss or scope into them before other actions. `delta:true` returns only changes; `include_verifiable` captures headings plus alert/status targets.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        session_id: UuidSchema,
        delta: z.boolean().optional(),
        viewport_only: z.boolean().optional(),
        scope: z
          .union([z.object({ ref: z.string() }), z.object({ css: z.string() })])
          .optional(),
        include_verifiable: z.boolean().optional(),
        include_console_logs: z.boolean().optional(),
        include_network_errors: z.boolean().optional(),
        highlight: z.boolean().optional(),
        no_settle: z.boolean().optional()
      },
      _meta: { "anthropic/maxResultSizeChars": BROWSER_READ_CHAR_BUDGET }
    },
    async (args) => {
      try {
        logger.info({ ...args }, "[browser_read] request");

        const step: Record<string, unknown> = {
          action: "snapshot",
          mode: "interactive"
        };
        if (args.viewport_only !== undefined) {
          step.viewport_only = args.viewport_only;
        }
        if (args.scope !== undefined) {
          step.scope = args.scope;
        }
        if (args.include_verifiable !== false) {
          step.include_verifiable = true;
        }
        const maxNodes = deps.browserReadState.getMaxNodes(args.session_id);
        if (maxNodes !== undefined) {
          step.max_nodes = maxNodes;
        }

        const sinceId = deps.browserReadState.getLastSnapshotId(args.session_id);
        if (args.delta !== false && sinceId !== undefined) {
          step.delta = { since_snapshot_id: sinceId };
        }

        if (args.highlight === true) {
          step.highlight = true;
        }
        if (args.no_settle === true) {
          step.no_settle = true;
        }

        const stepResult = await deps.workerClient.runStep(args.session_id, step);
        const snap = unwrapSnapshot(stepResult.result);
        deps.browserReadState.setLastSnapshotId(args.session_id, snap.snapshot_id);

        logger.info(
          {
            session_id: args.session_id,
            snapshot_id: snap.snapshot_id,
            element_count: snap.elements?.length ?? 0,
            alerts: snap.alerts?.length ?? 0,
            overlay_active: snap.overlay_active !== undefined,
            overlay_role: snap.overlay_active?.role,
            overlay_modal: snap.overlay_active?.modal
          },
          "[browser_read] response"
        );

        const lines = [formatSnapshot(snap)];

        if (args.include_console_logs === true) {
          const logs = await deps.workerClient.getConsoleLogs(args.session_id, {
            since_snapshot_id: snap.snapshot_id,
            level: "error",
            limit: 20
          });
          const entries = logs.entries as Array<{ message?: string; level?: string }>;
          if (entries.length > 0) {
            lines.push("");
            lines.push("console errors:");
            for (const entry of entries) {
              lines.push(`- [${entry.level ?? "error"}] ${entry.message ?? ""}`);
            }
          }
        }

        if (args.include_network_errors === true) {
          const logs = await deps.workerClient.getNetworkLogs(args.session_id, {
            since_snapshot_id: snap.snapshot_id,
            status_min: 400,
            limit: 20
          });
          const entries = logs.entries as Array<{ url?: string; status?: number }>;
          if (entries.length > 0) {
            lines.push("");
            lines.push("network errors:");
            for (const entry of entries) {
              lines.push(`- ${entry.status ?? "?"} ${entry.url ?? ""}`);
            }
          }
        }

        return toolMarkdown(lines.join("\n"));
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}
