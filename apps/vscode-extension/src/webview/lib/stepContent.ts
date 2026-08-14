import type { StepId } from "./types";
import { STEP_PROMPTS } from "./prompts";

export interface StepContent {
  title: string;
  description: string;
  creates: string;
  required: boolean;
  prompt: string;
}

/** Getting-started steps from vindicate-vscode-mockup.html screen 6. */
export const STEP_CONTENT: Record<StepId, StepContent> = {
  1: {
    title: "Domain Knowledge",
    description:
      "Run the prompt in your AI — paste in a README, description, or raw code. Vindicate structures it into a domain document automatically.",
    creates: ".vindicate/domain.md",
    required: true,
    prompt: STEP_PROMPTS[1]
  },
  2: {
    title: "Project Context",
    description:
      "Map the technical architecture — stack, key modules, and how they connect. Helps Vindicate reason about your codebase more accurately.",
    creates: ".vindicate/context.md",
    required: false,
    prompt: STEP_PROMPTS[2]
  },
  3: {
    title: "Feature Specs",
    description:
      "Generate structured spec files for each feature. Run the prompt in your AI — Vindicate detects new files inside .vindicate/stories/ automatically.",
    creates: ".vindicate/stories/*.story.md",
    required: true,
    prompt: STEP_PROMPTS[3]
  },
  4: {
    title: "Test Suite",
    description:
      "Generate requirement-first tests from your feature specs. Vindicate detects new test files written to the project and marks this step complete.",
    creates: "tests/**/*.spec.ts",
    required: true,
    prompt: STEP_PROMPTS[4]
  }
};

export const GETTING_STARTED_TOTAL = 5;
