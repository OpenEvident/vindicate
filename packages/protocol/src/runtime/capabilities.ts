/**
 * @file Worker capabilities discovery response.
 */
import { z } from "zod";

export const WorkerCapabilitiesResponseSchema = z.object({
  protocolVersion: z.string().min(1),
  browser: z.object({
    actions: z.array(z.string().min(1)),
    coming_soon: z.array(z.string().min(1))
  }),
  files: z.object({
    operations: z.array(z.string().min(1))
  })
});

export type WorkerCapabilitiesResponse = z.infer<typeof WorkerCapabilitiesResponseSchema>;
