import { z } from "zod";

const scalarValue = z.union([z.string().max(512), z.number(), z.boolean()]);

/** CodeArtifact ac_coverage block (code-write checkpoint). */
export const AcCoverageCheckpointSchema = z
  .object({
    total: z.number(),
    covered: z.array(z.string().max(64)).max(50),
    missing: z.array(z.string().max(64)).max(50),
    stale: z.array(z.string().max(64)).max(50)
  })
  .strict();

// Arrays of scalars are allowed (e.g. acceptance_criteria, test_cases)
const checkpointValue = z.union([
  scalarValue,
  z.array(scalarValue).max(50),
  AcCoverageCheckpointSchema
]);

const CheckpointArtifactSchema = z.record(z.string().min(1).max(64), checkpointValue);

export type CheckpointArtifact = z.infer<typeof CheckpointArtifactSchema>;
export type CheckpointValue = z.infer<typeof checkpointValue>;

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: string[];
}

export interface ICheckpointValidator {
  validate(artifact: unknown): ValidationResult;
}

export class CheckpointValidator implements ICheckpointValidator {
  validate(artifact: unknown): ValidationResult {
    const parsed = CheckpointArtifactSchema.safeParse(artifact);
    if (parsed.success) {
      return { valid: true };
    }
    const errors = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path.length > 0
        ? `Checkpoint field "${path}" is invalid: ${issue.message}`
        : issue.message;
    });
    return { valid: false, errors };
  }
}

export function parseCheckpointArtifact(artifact: unknown): CheckpointArtifact {
  return CheckpointArtifactSchema.parse(artifact);
}
