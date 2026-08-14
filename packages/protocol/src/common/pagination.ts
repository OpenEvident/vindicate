/**
 * Cursor-based list pagination for control API list endpoints.
 */
import { z } from "zod";

/** Client request: page size and opaque cursor from a prior response. */
export const PaginationRequestSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(512).optional()
});

/** Server metadata: whether more pages exist and the cursor for the next page. */
export const PaginationMetaSchema = z.object({
  limit: z.number().int().min(1).max(200),
  nextCursor: z.string().min(1).max(512).optional(),
  hasMore: z.boolean()
});

/**
 * Builds a paginated list response schema for a given item type.
 *
 * @param itemSchema - Zod schema for each element in `items`.
 */
export function createPaginatedListSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: PaginationMetaSchema
  });
}

export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
