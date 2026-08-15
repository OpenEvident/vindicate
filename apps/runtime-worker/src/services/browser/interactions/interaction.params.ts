/** Zod schemas for browser interaction command steps validated at the worker command boundary. */
import { UrlSchema } from "@vindicate/protocol";
import { z } from "zod";

import { SnapshotScopeSchema } from "../snapshot/snapshot.params.js";

export const RefSchema = z
  .string()
  .min(1)
  .regex(/^ref-[0-9a-f]{8}$/);

export const NavigateStepSchema = z.object({
  action: z.literal("navigate"),
  url: UrlSchema,
  wait_for: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
});

export const ClickStepSchema = z.object({
  action: z.literal("click"),
  ref: RefSchema,
  button: z.enum(["left", "right", "middle"]).optional(),
  click_count: z.number().int().positive().optional()
});

export const TypeStepSchema = z.object({
  action: z.literal("type"),
  ref: RefSchema,
  value: z.string(),
  clear_first: z.boolean().optional()
});

export const SelectOptionStepSchema = z
  .object({
    action: z.literal("select_option"),
    ref: RefSchema
  })
  .and(
    z.union([
      z.object({ value: z.string().min(1) }),
      z.object({ label: z.string().min(1) }),
      z.object({ index: z.number().int().nonnegative() })
    ])
  );

export const HoverStepSchema = z.object({
  action: z.literal("hover"),
  ref: RefSchema
});

export const CheckStepSchema = z.object({
  action: z.literal("check"),
  ref: RefSchema
});

export const UncheckStepSchema = z.object({
  action: z.literal("uncheck"),
  ref: RefSchema
});

export const PressKeyStepSchema = z.object({
  action: z.literal("press_key"),
  ref: RefSchema.optional(),
  key: z.string().min(1)
});

export const ScrollByStepSchema = z.object({
  action: z.literal("scroll_by"),
  ref: RefSchema.optional(),
  direction: z.enum(["up", "down", "left", "right"]),
  amount_px: z.number().int().positive()
});

export const UploadFileStepSchema = z
  .object({
    action: z.literal("upload_file"),
    ref: RefSchema,
    files: z.array(z.string().min(1)).min(1).optional(),
    sample: z.enum(["image", "pdf", "csv", "txt"]).optional()
  })
  .superRefine((step, ctx) => {
    const hasFiles = step.files !== undefined && step.files.length > 0;
    const hasSample = step.sample !== undefined;
    if (hasFiles === hasSample) {
      ctx.addIssue({
        code: "custom",
        message: "upload_file requires exactly one of files or sample"
      });
    }
  });

export const WaitForLoadStateStepSchema = z.object({
  action: z.literal("wait_for_load_state"),
  state: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
});

export const WaitForResponseStepSchema = z.object({
  action: z.literal("wait_for_response"),
  url_pattern: z.string().min(1),
  timeout_ms: z.number().int().positive().optional()
});

export const ScreenshotStepSchema = z.object({
  action: z.literal("screenshot"),
  full_page: z.boolean().optional(),
  scope: SnapshotScopeSchema.optional(),
  quality: z.number().int().min(1).max(100).optional()
});

export const FillStepSchema = z.object({
  action: z.literal("fill"),
  ref: RefSchema,
  value: z.string()
});

export const DblclickStepSchema = z.object({
  action: z.literal("dblclick"),
  ref: RefSchema
});

export const DragStepSchema = z.object({
  action: z.literal("drag"),
  ref: RefSchema,
  to_ref: RefSchema,
  strategy: z.enum(["manual", "native"]).optional(),
  steps: z.number().int().positive().optional()
});

export type NavigateStep = z.infer<typeof NavigateStepSchema>;
export type ClickStep = z.infer<typeof ClickStepSchema>;
export type TypeStep = z.infer<typeof TypeStepSchema>;
export type SelectOptionStep = z.infer<typeof SelectOptionStepSchema>;
export type HoverStep = z.infer<typeof HoverStepSchema>;
export type CheckStep = z.infer<typeof CheckStepSchema>;
export type UncheckStep = z.infer<typeof UncheckStepSchema>;
export type PressKeyStep = z.infer<typeof PressKeyStepSchema>;
export type ScrollByStep = z.infer<typeof ScrollByStepSchema>;
export type UploadFileStep = z.infer<typeof UploadFileStepSchema>;
export type WaitForLoadStateStep = z.infer<typeof WaitForLoadStateStepSchema>;
export type WaitForResponseStep = z.infer<typeof WaitForResponseStepSchema>;
export type ScreenshotStep = z.infer<typeof ScreenshotStepSchema>;
export type FillStep = z.infer<typeof FillStepSchema>;
export type DblclickStep = z.infer<typeof DblclickStepSchema>;
export type DragStep = z.infer<typeof DragStepSchema>;
