import path from "node:path";
import * as vscode from "vscode";
import type { StepId } from "../../shared/types";
import type { ISpecAnalyzer } from "./SpecAnalyzer";

export async function detectPresentOnboardingSteps(
  folderPath: string,
  specAnalysis: Awaited<ReturnType<ISpecAnalyzer["analyzeAll"]>>,
  hasTestFiles: boolean
): Promise<Set<StepId>> {
  const present = new Set<StepId>();

  // Steps 1 & 2 (domain.md / context.md) are optional in the current scaffold flow.
  // If domain.md or context.md exist, credit them as before.
  // If specs already exist but those files don't, auto-credit 1 & 2 so the
  // completion threshold (>= 4) can still be reached via specs + tests alone.
  const hasDomain = await fileExists(path.join(folderPath, ".vindicate", "domain.md"));
  const hasContext = await fileExists(path.join(folderPath, ".vindicate", "context.md"));
  const hasSpecs = specAnalysis.total > 0;

  if (hasDomain || hasSpecs) present.add(1);
  if (hasContext || hasSpecs) present.add(2);
  if (hasSpecs) present.add(3);
  // Step 4: any Playwright spec under tests/ (flat or nested) — not feature traceability.
  if (hasTestFiles) present.add(4);

  return present;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}
