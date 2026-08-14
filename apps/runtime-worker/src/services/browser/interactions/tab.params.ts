import { UrlSchema } from "@vindicate/protocol";
import { z } from "zod";

export const NewTabStepSchema = z.object({
  action: z.literal("new_tab"),
  url: UrlSchema.optional()
});

export const SwitchTabStepSchema = z.object({
  action: z.literal("switch_tab"),
  index: z.number().int().nonnegative()
});

export const SwitchTabByUrlStepSchema = z.object({
  action: z.literal("switch_tab_by_url"),
  url_pattern: z.string().min(1)
});

export const CloseTabStepSchema = z.object({
  action: z.literal("close_tab"),
  index: z.number().int().nonnegative().optional()
});

export const HandleDialogStepSchema = z.object({
  action: z.literal("handle_dialog"),
  dialog_action: z.enum(["accept", "dismiss"]),
  prompt_text: z.string().optional()
});

export type NewTabStep = z.infer<typeof NewTabStepSchema>;
export type SwitchTabStep = z.infer<typeof SwitchTabStepSchema>;
export type SwitchTabByUrlStep = z.infer<typeof SwitchTabByUrlStepSchema>;
export type CloseTabStep = z.infer<typeof CloseTabStepSchema>;
export type HandleDialogStep = z.infer<typeof HandleDialogStepSchema>;
