import { z } from "zod";

import { GenerateCodeInputSchema, type GenerateCodeInput } from "../../../src/codegen/schema.js";
import type { ValidationResult } from "../../../src/codegen/validation-errors.js";

export type InvariantId =
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "I6"
  | "I7"
  | "I8"
  | "I9"
  | "I10"
  | "I11"
  | "I12";

export interface ScenarioStepResult {
  readonly mode: GenerateCodeInput["mode"] | "validate";
  readonly filesWritten?: string[];
  readonly notice?: string;
  readonly validation?: ValidationResult;
}

export interface ScenarioRunResult {
  readonly scenario: ScenarioDefinition;
  readonly root: string;
  readonly stepResults: ScenarioStepResult[];
  readonly filesWritten: string[];
  readonly lastValidation?: ValidationResult;
  readonly error?: unknown;
}

const ScenarioProjectSchema = z.object({
  scaffold: z.enum(["minimal", "production"]).optional(),
  withBarrels: z.boolean().optional(),
  seedSchema: z
    .object({
      feature: z.string().min(1),
      schema: z.unknown()
    })
    .optional(),
  prewriteFiles: z.record(z.string(), z.string()).optional()
});

const ScenarioStepSchema = z.object({
  input: GenerateCodeInputSchema
});

const ScenarioErrorExpectationSchema = z.object({
  type: z.string().min(1),
  messageIncludes: z.string().min(1).optional(),
  fixIncludes: z.string().min(1).optional()
});

const ScenarioValidateExpectationSchema = z.object({
  valid: z.boolean(),
  errorCount: z.number().int().nonnegative().optional(),
  errorCountMin: z.number().int().positive().optional(),
  codesInclude: z.array(z.string().min(1)).optional(),
  pathsInclude: z.array(z.string().min(1)).optional()
});

const ScenarioStepValidateExpectationSchema = ScenarioValidateExpectationSchema.extend({
  stepIndex: z.number().int().nonnegative()
});

const ScenarioExpectSchema = z.object({
  ok: z.boolean(),
  validate: ScenarioValidateExpectationSchema.optional(),
  validateSteps: z.array(ScenarioStepValidateExpectationSchema).optional(),
  filesExist: z.array(z.string().min(1)).optional(),
  filesNotExist: z.array(z.string().min(1)).optional(),
  filesWrittenIncludes: z.array(z.string().min(1)).optional(),
  filesWrittenExcludes: z.array(z.string().min(1)).optional(),
  mustContain: z.record(z.string(), z.array(z.string())).optional(),
  mustNotContain: z.record(z.string(), z.array(z.string())).optional(),
  invariants: z
    .array(z.enum(["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I10", "I11", "I12"]))
    .optional(),
  compile: z.boolean().optional(),
  golden: z.boolean().optional(),
  goldenFiles: z.array(z.string().min(1)).optional(),
  error: ScenarioErrorExpectationSchema.optional()
});

export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)),
  project: ScenarioProjectSchema.optional(),
  steps: z.array(ScenarioStepSchema).min(1),
  expect: ScenarioExpectSchema
});

export type ScenarioErrorExpectation = z.infer<typeof ScenarioErrorExpectationSchema>;
export type ScenarioExpect = z.infer<typeof ScenarioExpectSchema>;
export type ScenarioProject = z.infer<typeof ScenarioProjectSchema>;
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;
