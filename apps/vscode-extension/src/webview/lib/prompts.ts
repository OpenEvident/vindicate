export const PROMPTS = {
  domain: {
    title: "Domain Knowledge",
    description: "Establish project domain context",
    category: "onboarding" as const,
    text: `Your task is to create \`.vindicate/domain.md\` for this project.

You must NOT infer domain information from source code, file names, database schemas, APIs, variable names, or implementation details unless I explicitly tell you to use them as sources of truth.

Your goal is to accurately understand the business/domain context before writing anything.

# Process Rules

1. Ask exactly ONE question at a time.
2. Do not batch questions.
3. After each answer:
   - evaluate whether enough information exists
   - ask the next highest-value question only
   - avoid redundant or low-signal questions
4. If existing documentation is available, prioritize it over follow-up questions.
5. Do not generate \`.vindicate/domain.md\` until you are confident the information is sufficient and internally consistent.
6. Do not invent, assume, generalize, or hallucinate missing domain information.
7. If information remains unclear after questioning, explicitly mark it as unresolved instead of guessing.

# Primary Discovery Areas

You should gather information about:

- What the product/system does
- Industry or business vertical
- Main business workflows
- Core business entities and concepts
- Important domain terminology
- User types and permissions
- Compliance/regulatory requirements
- Operational constraints
- External systems or integrations that matter to the business domain
- Business-critical rules or logic
- Any terminology with context-specific meaning

# Documentation Priority

Before asking deep discovery questions, ask whether I already have:
- PRDs
- Architecture docs
- Product specs
- Onboarding docs
- Confluence/Wiki pages
- Design documents
- Compliance documents
- Existing domain models/glossaries

If I provide documents, use them as the primary source of truth before asking additional questions.

# Questioning Strategy

Prefer high-information questions.

Examples:
- "What business problem does this product solve?"
- "Who are the primary users and what actions can each perform?"
- "Are there domain terms that have specialized meanings here?"
- "What mistakes would be costly in this domain?"
- "Are there workflows with approvals, audits, or legal implications?"
- "Are there tenant/account/business hierarchy concepts?"
- "Are there regional, legal, or compliance constraints?"

Avoid:
- implementation questions
- technical stack questions
- database questions
- API questions
- deployment/infrastructure questions

unless they directly affect domain understanding.

# Output Requirements

When enough information is collected, generate \`.vindicate/domain.md\`.

The document must contain:

# Industry
- product purpose
- business domain
- business model/context

# Compliance
- applicable standards/regulations
- security/privacy considerations
- audit or operational requirements

# Domain Glossary
- important business terms
- precise contextual meanings
- acronyms and abbreviations

# User Types
- each user role
- responsibilities
- permissions/capabilities
- workflow involvement

# Core Workflows
- major business flows
- approvals/state transitions if relevant

# Business Rules
- important constraints
- invariants
- validation logic
- domain-specific rules

# External Systems
- business-relevant integrations only

# Open Questions
- unresolved ambiguities
- missing information requiring clarification

# Change Log
- <YYYY-MM-DD>: <what changed> (<who: agent | developer>)

# Writing Rules

- No placeholders
- No invented content
- No generic filler
- No implementation details unless domain-relevant
- Use precise, business-oriented language
- Prefer explicit statements over assumptions
- If uncertain, say so clearly
- Keep terminology consistent throughout the document`
  },
  context: {
    title: "Project Context",
    description: "Add technical and architectural context",
    category: "onboarding" as const,
    text: `Your task is to create \`.vindicate/context.md\` for this project.

This document captures VERIFIED technical and architectural context for engineers and AI agents.

It is NOT for business/domain understanding. Business concepts belong in \`.vindicate/domain.md\`.

# Primary Objective

Build an accurate technical context document using:
1. repository inspection first
2. existing documentation second
3. targeted clarification questions last

Never guess technical details.

# Discovery Process

## Phase 1 — Repository Analysis

First, inspect the repository and extract information directly from files.

Prioritize reading:

- package.json
- pnpm-lock.yaml / yarn.lock / package-lock.json
- tsconfig.json
- playwright.config.*
- vite.config.*
- next.config.*
- turbo.json
- nx.json
- docker-compose.*
- Dockerfiles
- README files
- CI/CD configs
- lint/format configs
- test configs
- environment example files
- workspace configs
- infrastructure configs
- monorepo structure
- root folder structure

Also inspect:
- source layout
- module organization
- naming conventions
- shared libraries/packages
- test structure
- build tooling
- scripts
- automation tooling

Only include facts that can be verified directly.

# Questioning Rules

After repository inspection:

1. Ask EXACTLY ONE question at a time.
2. Only ask questions for information that:
   - materially improves architectural understanding
   - cannot be verified from files
3. Prefer high-signal questions.
4. Avoid unnecessary questions.
5. Do not ask about things already visible in the repository.
6. If something remains unknown, explicitly mark it:
   - \`unknown — ask team\`
   instead of guessing.

# Critical Constraints

You MUST NOT:
- invent architecture decisions
- infer infrastructure from partial hints
- assume cloud providers
- assume deployment patterns
- assume environments
- assume testing strategies
- assume framework usage from folder names alone
- assume package usage means active adoption
- assume conventions without evidence

Distinguish clearly between:
- verified
- implied
- unknown

# What To Capture

Generate \`.vindicate/context.md\` with these sections:

# Repository Overview
- repository type
- monorepo/polyrepo
- major applications/packages
- overall structure

# Stack
Include ONLY verified technologies:
- frontend frameworks
- backend frameworks
- languages
- package managers
- build tools
- testing frameworks
- automation tools
- infrastructure tooling
- databases
- messaging/event systems
- observability tooling

Where possible include:
- versions
- workspace/package usage
- purpose in system

# Architecture
Document ONLY what can be verified:
- application boundaries
- service structure
- module organization
- package relationships
- runtime separation
- communication patterns
- layering patterns
- shared libraries
- plugin/extension systems

If architecture is unclear:
- explicitly say so

# Test Configuration
- frameworks
- test structure
- naming conventions
- playwright/jest/vitest/cypress config
- coverage tooling
- CI test execution patterns if visible

# Conventions
Capture repository conventions such as:
- folder organization
- import patterns
- naming conventions
- linting
- formatting
- branching/release conventions if documented
- commit tooling
- code generation patterns

Only include conventions backed by files or documentation.

# Environments
Document VERIFIED environment information:
- local development
- staging
- production
- environment variable patterns
- secrets management references
- docker usage
- deployment configs

If environments are undocumented:
- say so explicitly

# Tooling & Automation
- CI/CD systems
- scripts
- task runners
- workspace tooling
- generators/scaffolding
- pre-commit hooks
- release automation

# AI Agent Notes
Document repository-specific guidance useful for AI coding agents:
- important directories
- unsafe areas to modify
- generated code locations
- testing expectations
- architectural boundaries
- common pitfalls
- required workflows

Only include verified guidance.

# Unknowns
List important missing or ambiguous technical details:
- unknown infrastructure
- unknown deployment model
- unknown ownership boundaries
- undocumented services
- missing architecture docs

Use:
- \`unknown — ask team\`

# Change Log
- <YYYY-MM-DD>: <what changed> (<who: agent | developer>)

# Writing Rules

- No placeholders
- No hallucinated content
- No generic engineering filler
- No speculative architecture
- Be concise but precise
- Prefer bullet points over prose
- Clearly separate facts from uncertainty
- Keep terminology consistent
- Use engineer-oriented language
- Optimize for future AI-agent consumption`
  },
  features: {
    title: "Feature Specs",
    description: "Author feature specifications",
    category: "onboarding" as const,
    text: `Your task is to create feature specification files in \`.vindicate/stories/\` for this project.

These specs are intended to drive:
- automated testing
- QA validation
- AI-generated test cases
- future feature understanding

The specs MUST reflect actual application behavior — not assumptions.

# Required Discovery Workflow

## Phase 1 — Read Existing Context

Before anything else, read:

- \`.vindicate/domain.md\`
- \`.vindicate/context.md\`

Use them as foundational context.

## Phase 2 — Repository Inspection

Inspect the application source code to identify:
- user-facing features
- workflows
- screens/pages/routes
- API-backed actions
- forms
- state transitions
- permissions
- major UI capabilities

Prioritize:
- route definitions
- navigation structure
- page components
- feature folders
- API clients
- Playwright/Cypress tests
- Storybook stories
- existing test suites
- README/docs
- menu/sidebar configuration
- state stores/actions

You are identifying DISTINCT FEATURES — not components.

Examples of valid features:
- user login
- password reset
- invoice creation
- cart checkout
- order search
- tax configuration

Examples of INVALID features:
- button component
- modal
- table
- dropdown
- card layout

# Feature Confirmation Rule

Before generating ANY spec files:

1. Produce a proposed feature list.
2. Ask me to confirm/correct the list.
3. Ask EXACTLY ONE question.
4. Do NOT generate any spec files until I confirm.

# Spec File Rules

After confirmation:

- Create ONE file per feature
- File naming:
  \`.vindicate/stories/<feature-name>.story.md\`
- Use:
  - lowercase
  - hyphenated names
  - singular feature scope
- Never combine unrelated features into one file

# Required File Structure

Each spec file MUST follow this exact structure:

\`\`\`md
---
feature: <feature-slug>
status: draft
version: 1
generated: <YYYY-MM-DD>
last_updated: <YYYY-MM-DD>
source:
  - repository-inspection
  - .vindicate/domain.md
  - .vindicate/context.md
---

# <Human Title> — <context>

<1–3 sentence verification objective.>

**Persona**
<role> — credentials via <ENV_VARS> (from .env)

# Feature

- [FA-01-4] <high-level capability>
- [FA-01-5] <optional additional capability>

# Acceptance Criteria

AC-1: <atomic testable outcome>
AC-2: <atomic testable outcome>

## Happy Path [AC-1]
Given <starting context>
When <action>
Then <observable outcome>

## Edge Case: <name> [AC-2]
Given <context>
When <action>
Then <observable outcome>

# Out of Scope

- explicitly excluded behavior
- adjacent features not covered
- unsupported flows

# Change Log
\`\`\`

# Traceability Rules

- \`[FA-x-y]\` tags on Feature bullets — format \`[FA-{domain-id}-{sub-domain}]\` (e.g. \`[FA-01-4]\`); must be unique across all story files in the project.
- Plain \`AC-n:\` lines (no checkboxes) — one atomic outcome each, numbered sequentially.
- \`[AC-n]\` on each \`##\` testcase heading — exactly one AC per testcase; no \`# Testcases\` wrapper.
- Testcase bodies use Given/When/Then BDD, not step bullets.
- When automation is generated later, each testcase maps to one Playwright \`test()\` whose title starts with the same \`[AC-n]\`.
- **Spec ↔ story sync:** if a spec file changes (tests added/removed/renamed), update the linked story's AC lines, testcase headings, and Feature bullets to match; story AC count must equal spec test count.`
  },
  tests: {
    title: "Test Suite",
    description: "Add Playwright tests traced to specs",
    category: "onboarding" as const,
    text: `Your task is to generate Playwright test code for every approved spec in \`.vindicate/stories/\` using Vindicate workflows and \`vindicate_generate_code\`.

Before writing anything, read every \`.vindicate/stories/*.story.md\` that has \`status: approved\` in its frontmatter. Do not generate tests for specs with \`status: draft\`.

# File Rules

- Specs are generated at \`tests/<feature-name>.spec.ts\`
- One generated spec file per approved feature story

# Required Structure Per Test File

Each generated feature must:

- Start with \`// spec: .vindicate/stories/<feature-name>.story.md\`
- Have one \`test()\` per testcase defined in the spec — title must match the testcase name exactly
- Include \`// scenario: <testcase-name>\` on the line before each test block
- Include exactly one AC trace tag at the **start** of every test title using \`[AC-x]\` format, mapping to the AC ID on the matching testcase heading
  (example: \`test('[AC-2] should reject invalid token', ...)\`) — one tag only, tag first, no multi-AC tags
- Use page objects for all UI interaction — never raw locators or DOM queries in the test body
- Never hand-write spec/page-object files; always apply changes through \`vindicate_generate_code\`
- Resolve base URL and credentials from \`playwright.config.ts\` and \`.env\` — no hardcoded values

# Constraints

- Do not add tests for testcases not present in the spec
- Do not invent AC IDs or use AC IDs that are not present in \`# Acceptance Criteria\`
- Do not modify any file inside \`.vindicate/stories/\`
- Do not hardcode selectors, URLs, or credentials anywhere in the test body
- After generating tests, include a short traceability audit in your response:
  \`total AC\`, \`covered AC IDs\`, \`missing AC IDs\`, \`unknown/stale AC IDs\`
- Run \`npm run audit\` after generation — fix any type errors before finishing`
  }
} as const;

export const SCAFFOLD_PROMPT = `Set up my project with Vindicate.`;

export const STEP_PROMPTS: Record<1 | 2 | 3 | 4, string> = {
  1: PROMPTS.domain.text,
  2: PROMPTS.context.text,
  3: PROMPTS.features.text,
  4: PROMPTS.tests.text
};

export function RECORDING_CODEGEN_PROMPT(args: {
  path: string;
  name: string;
  isAgentRecorded: boolean;
  projectRoot: string;
}): string {
  const agentNote = args.isAgentRecorded
    ? "// Note: this flow was recorded by your agent; a test may already exist in tests/ — check before regenerating.\n\n"
    : "";
  return `${agentNote}Generate a Playwright test from the Vindicate recording at \`${args.path}\` (name: "${args.name}").

Steps:
1. Read the recording with \`browser_record_read\` (name: "${args.name}", project_root: ${args.projectRoot}) to get the flow, locators, and any pre-conditions / env-var candidates.
2. If a matching spec exists at \`.vindicate/stories/<feature>.story.md\`, trace ACs to it and follow the test-suite conventions; otherwise generate the test directly from the recording.
3. Use page objects via \`vindicate_generate_code\` — never raw locators in the test body.
4. For any step flagged as an env-var candidate, read the value from \`.env\` / \`process.env\` (resolve through \`playwright.config.ts\`); never hardcode credentials.
5. For data-scoped (row/list) locators, parameterize them (dynamic element + refArgs) instead of hardcoding the captured row value.
6. Honor pre-conditions: ensure prerequisite flows run/are assumed before the recorded steps.
After generating, run \`npm run audit\` and fix any type errors.`;
}

export function RECORDING_REQUIREMENTS_PROMPT(args: {
  path: string;
  name: string;
  projectRoot: string;
}): string {
  return `Use the Vindicate recording at \`${args.path}\` (name: "${args.name}") to generate requirements/a story only — do NOT generate Playwright automation or any code.

Steps:
1. Call \`vindicate_workflow(path: "requirements", node: "requirements", completed: [])\` to get the phase guidance, then follow it.
2. Read the recording with \`browser_record_read\` (name: "${args.name}", project_root: ${args.projectRoot}). The recording artifact path is \`${args.path}\`.
3. Draft or update \`.vindicate/stories/<feature>.story.md\` using the deliveroo-style top:
   - **Title (H1)** + short prose verification objective
   - **Persona** — roles and credential env vars (never literal secrets)
   - **Feature** — \`[FA-{domain-id}-{sub-domain}]\` capability bullets (e.g. \`[FA-01-4]\`); scan all existing stories — FA tags must be unique project-wide
   - **Acceptance Criteria** — plain \`AC-n:\` lines, split by phase (login, navigation, wizard, verify/open). Do NOT collapse the entire recording into a single AC-1.
   - **Testcases** — one \`## {Name} [AC-n]\` per AC with Given/When/Then BDD (no \`# Testcases\` wrapper, no step bullets)
   - **Out of Scope** — unchanged style at the bottom
4. Enforce 1:1 AC ↔ testcase mapping — AC count must equal testcase count.
5. Leave the story \`status: draft\` — do not approve it, do not call \`vindicate_generate_code\`, do not write or edit any files under \`tests/\`, \`pages/\`, or \`panels/\`, and do not run \`npm run audit\`.
6. Report the drafted feature slug, FA count, AC count, and testcase count — nothing else.`;
}

type BuiltInPromptId = keyof typeof PROMPTS;

type BuiltInPromptCategory = "onboarding" | "domain" | "specs" | "tests";

export interface BuiltInPrompt {
  id: BuiltInPromptId;
  title: string;
  description: string;
  category: BuiltInPromptCategory;
  text: string;
}

function normalizeCategory(id: BuiltInPromptId): BuiltInPromptCategory {
  if (id === "domain") return "domain";
  if (id === "features") return "specs";
  if (id === "tests") return "tests";
  return "onboarding";
}

export const BUILT_IN_PROMPTS: BuiltInPrompt[] = (
  Object.entries(PROMPTS) as Array<[BuiltInPromptId, (typeof PROMPTS)[BuiltInPromptId]]>
).map(([id, prompt]) => ({
  id,
  title: prompt.title,
  description: prompt.description,
  category: normalizeCategory(id),
  text: prompt.text
}));
