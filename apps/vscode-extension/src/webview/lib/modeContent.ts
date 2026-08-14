import type { Mode } from "./types";

export interface ModeCardContent {
  id: Mode;
  tag: string;
  headline: string;
  symptoms: string[];
  vindicateStarts: string;
  enabled: boolean;
}

/** Mode cards from vindicate-vscode-mockup.html screen 5. */
export const MODE_CARDS: ModeCardContent[] = [
  {
    id: "build",
    tag: "BUILD",
    headline: "Codebase exists. No tests yet.",
    symptoms: [
      "No test files found in the project",
      "AI produces scripts without clear intent or control",
      "Clear intent, no execution yet"
    ],
    vindicateStarts:
      "Extracting intent through structured questions, then generating your first spec layer and test suite from scratch.",
    enabled: true
  },
  {
    id: "fix",
    tag: "FIX",
    headline: "Tests exist. You don't trust them.",
    symptoms: [
      "AI-generated tests match the code, not the intent",
      "Scripts aren't scalable or maintainable",
      "Tests pass but bugs still ship"
    ],
    vindicateStarts:
      "Reading your existing test base, rebuilding specs from inferred intent, then regenerating tests with best practices.",
    enabled: false
  },
  {
    id: "structure",
    tag: "STRUCTURE",
    headline: "Tests work. Traceability is missing.",
    symptoms: [
      "Tests pass, but requirements live nowhere",
      "Onboarding means explaining everything verbally",
      'Nobody can answer: "is this feature fully covered?"'
    ],
    vindicateStarts:
      "Mapping each test to requirements and design, then surfacing traceability from specification to execution.",
    enabled: false
  },
  {
    id: "bridge",
    tag: "BRIDGE",
    headline: "Tests work. Siloed structure.",
    symptoms: [
      "Lack of connection with requirement",
      "Tests, design and reporting live in external systems",
      "Coverage numbers tell you nothing about the current state"
    ],
    vindicateStarts:
      "Ingesting your test artifacts, then weaving a traceable connection between what you planned and what you verified.",
    enabled: false
  }
];
