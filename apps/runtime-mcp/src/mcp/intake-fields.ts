/**
 * @file Intake form field definitions for MCP Apps intake view.
 */
export interface IntakeField {
  readonly type: "text" | "select";
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

export function buildIntakeFields(): IntakeField[] {
  return [{ type: "text", name: "goal", label: "What do you want to do?", required: true }];
}
