/**
 * @file Zod schemas for human recording artifacts (.vindicate/recordings/).
 */
import { z } from "zod";

import { UuidSchema } from "../common/ids.js";
import { StructuredLocatorSchema } from "./locator.js";

export const SelectorCandidateSchema = z.object({
  strategy: z.enum([
    "testid",
    "testid_xpath",
    "dom_id",
    "role_name",
    "label",
    "placeholder",
    "text",
    "attr_combo",
    "scoped",
    "sibling_text",
    "nth",
    // legacy recordings
    "role+name",
    "css",
    "xpath"
  ]),
  value: z.string(),
  /** Present when strategy is testid — the DOM attribute name (e.g. data-testid, data-cy, e2e). */
  attr: z.string().optional(),
  strength: z.enum(["strong", "medium", "weak"]).optional(),
  /** True when the candidate uses an unstable auto-generated id (hash, :r0:, numeric). */
  dynamic: z.boolean().optional(),
  /** Present when strategy is scoped — the repeating row/list container anchor. */
  container: z.object({ role: z.string(), name: z.string() }).optional(),
  /**
   * Ancestor `<iframe>` host-element locators, outermost first — same shape and rendering convention
   * as `StructuredLocator.frame_path` (see runtime/locator.ts). Absent/empty = not inside a frame, the
   * overwhelming common case. Populated for both human-recorded events (derived from the Playwright
   * `Frame` the DOM event fired in) and agent-recorded events (forwarded from the verified
   * `ElementDescriptor.locator.frame_path` browser_act already computed).
   */
  frame_path: z.array(StructuredLocatorSchema).optional(),
  /**
   * True when this candidate was derived from a click-delegate ANCESTOR, not the element the step
   * nominally targets — same meaning as `StructuredLocator.click_delegate` (runtime/locator.ts),
   * forwarded from `ElementDescriptor.locator.click_delegate` when an agent-recorded (`mode:'auto'`)
   * step's target resolved that way. Human-recorded steps never need this: a real click event's
   * target is already hit-test-correct (the browser skips a pointer-events:none element entirely),
   * so there is no delegate ambiguity to record in the first place.
   */
  click_delegate: z.boolean().optional()
});

/** One interactive element captured in a manual page snapshot step. */
export const RecordingPageSnapshotElementSchema = z.object({
  ref: z.string(),
  role: z.string(),
  name: z.string(),
  tag: z.string(),
  value: z.string().optional(),
  disabled: z.boolean().optional(),
  aria_invalid: z.boolean().nullable().optional(),
  aria_required: z.boolean().nullable().optional(),
  /** Set when candidates/chosen were derived from a click-delegate ancestor, not this element itself. */
  click_delegate: z.boolean().optional(),
  candidates: z.array(SelectorCandidateSchema),
  chosen: SelectorCandidateSchema.nullable(),
  element: z.object({
    role: z.string().optional(),
    name: z.string().optional(),
    tag: z.string(),
    id: z.string().optional(),
    placeholder: z.string().optional()
  })
});

/** Full page state from a manual snapshot — all elements with ranked selector candidates. */
export const RecordingPageSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  alerts: z.array(z.string()).optional(),
  truncated: z.boolean().optional(),
  elements: z.array(RecordingPageSnapshotElementSchema)
});

export const RecordedStepTargetSchema = z.object({
  candidates: z.array(SelectorCandidateSchema).optional(),
  chosen: SelectorCandidateSchema.nullish(),
  element: z
    .object({
      role: z.string().optional(),
      name: z.string().optional(),
      tag: z.string(),
      id: z.string().optional(),
      placeholder: z.string().optional()
    })
    .optional()
});

export const RecordedStepSchema = z.object({
  seq: z.number().int().positive(),
  action: z.enum([
    "click",
    "fill",
    "navigate",
    "select",
    "check",
    "uncheck",
    "press_key",
    "scroll",
    "snapshot",
    "hover",
    "upload_file",
    "drag",
    "dblclick",
    // Tab/popup awareness: "new_tab"/"switch_tab"/"switch_tab_by_url" mirror the identically-named
    // browser_act actions and are recorded verbatim when the agent performs them explicitly. A
    // site-opened popup during *human* recording (never an explicit agent call) is recorded as a
    // synthesized "switch_tab_by_url" step instead, the same way an implicit "navigate" step is
    // synthesized today — see recording.service.ts.
    "new_tab",
    "switch_tab",
    "switch_tab_by_url",
    "close_tab"
  ]),
  timestamp: z.string().datetime(),
  text: z.string().optional(),
  url: z.string().optional(),
  /** Present when action is switch_tab — the tab index to switch to (mirrors SwitchTabStep). */
  index: z.number().int().min(0).optional(),
  key: z.string().optional(),
  chosen: SelectorCandidateSchema.nullish(),
  candidates: z.array(SelectorCandidateSchema).optional(),
  element: z
    .object({
      role: z.string().optional(),
      name: z.string().optional(),
      tag: z.string(),
      id: z.string().optional(),
      placeholder: z.string().optional()
    })
    .optional(),
  target: RecordedStepTargetSchema.optional(),
  files: z.array(z.string()).optional(),
  screenshot_after: z.string().optional(),
  /** Present on manual snapshot steps — full page state with per-element selector candidates. */
  page_snapshot: RecordingPageSnapshotSchema.optional(),
  actor: z.enum(["human", "agent"]).optional(),
  /** explicit = typed URL / entry; implicit = navigation caused by a recent interaction. */
  navigation_trigger: z.enum(["explicit", "implicit"]).optional(),
  /** Advisory flag: fill value should be parameterized via env var at codegen time. */
  env_var: z.boolean().optional(),
  env_var_name: z.string().optional()
});

export const RecordingArtifactSchema = z.object({
  name: z.string(),
  recorded_at: z.string().datetime(),
  session_id: UuidSchema,
  project_root: z.string(),
  steps: z.array(RecordedStepSchema),
  status: z.literal("finalized"),
  /** Page snapshot captured when the user clicked Stop — same shape as manual snapshot steps. */
  final_snapshot: RecordingPageSnapshotSchema.optional(),
  started_by: z.enum(["human", "agent"]).optional(),
  actor_summary: z
    .object({
      human: z.number().int().min(0),
      agent: z.number().int().min(0)
    })
    .optional(),
  pre_conditions: z.array(z.string()).optional(),
  post_conditions: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  pages_covered: z.array(z.string()).optional(),
  summary: z.string().optional()
});

export const RecordingsIndexEntrySchema = z.object({
  name: z.string(),
  safe_name: z.string(),
  path: z.string(),
  summary: z.string(),
  pre_conditions: z.array(z.string()),
  post_conditions: z.array(z.string()),
  depends_on: z.array(z.string()),
  pages_covered: z.array(z.string()),
  started_by: z.enum(["human", "agent"]),
  recorded_at: z.string(),
  step_count: z.number().int(),
  thumbnail_path: z.string().optional(),
  status: z.literal("finalized")
});

export const RecordingsIndexSchema = z.object({
  version: z.literal(1),
  entries: z.array(RecordingsIndexEntrySchema)
});

export type RecordingsIndex = z.infer<typeof RecordingsIndexSchema>;
export type RecordingsIndexEntry = z.infer<typeof RecordingsIndexEntrySchema>;

export type SelectorCandidate = z.infer<typeof SelectorCandidateSchema>;
export type RecordingPageSnapshotElement = z.infer<typeof RecordingPageSnapshotElementSchema>;
export type RecordingPageSnapshot = z.infer<typeof RecordingPageSnapshotSchema>;
export type RecordedStepTarget = z.infer<typeof RecordedStepTargetSchema>;
export type RecordedStep = z.infer<typeof RecordedStepSchema>;
export type RecordingArtifact = z.infer<typeof RecordingArtifactSchema>;
