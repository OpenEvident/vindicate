import { describe, expect, it } from "vitest";

import { validateStoryContent } from "../../src/story/validate-story.js";

const VALID_STORY = `---
feature: login
status: approved
version: 1
---

# Login — dashboard access

Verify that a logged-out user can sign in with valid credentials and reach the dashboard.

**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)

# Feature

- [FA-01-4] User can sign in with email and password
- [FA-01-5] Invalid credentials show an error

# Acceptance Criteria

AC-1: User can sign in with valid credentials
AC-2: Invalid password shows an error

## Successful sign in [AC-1]
Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

## Invalid password [AC-2]
Given a logged-out user at the login page
When they enter an invalid password and click Sign in
Then an error message is shown

# Out of Scope

- Password reset flow
- Multi-factor authentication
`;

describe("validate-story", () => {
  it("accepts a valid deliveroo-style story file", () => {
    const result = validateStoryContent(VALID_STORY);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires frontmatter fields", () => {
    const result = validateStoryContent(`---
status: draft
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: one

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field === "feature")).toBe(true);
    expect(result.errors.some((error) => error.field === "version")).toBe(true);
  });

  it("rejects invalid status values", () => {
    const result = validateStoryContent(`---
feature: login
status: published
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: one

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.field === "status")).toBe(true);
  });

  it("requires sequential AC numbering", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: first
AC-3: skipped two

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.field === "acceptance_criteria")).toBe(true);
  });

  it("requires testcase headings to end with exactly one AC tag (from approved onward)", () => {
    const result = validateStoryContent(`---
feature: login
status: approved
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: first

## Missing tag

## Duplicate tags [AC-1] [AC-1]
`);
    expect(result.errors.filter((error) => error.field === "testcase").length).toBeGreaterThanOrEqual(2);
  });

  it("requires testcase AC tags to exist in Acceptance Criteria (from approved onward)", () => {
    const result = validateStoryContent(`---
feature: login
status: approved
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: first

## Unknown tag [AC-2]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.message.includes("AC-2"))).toBe(true);
  });

  it("requires every AC to have a matching testcase (from approved onward)", () => {
    const result = validateStoryContent(`---
feature: login
status: approved
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one
- [FA-01-5] two

# Acceptance Criteria

AC-1: first
AC-2: second

## Only first [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.message.includes("AC-2"))).toBe(true);
  });

  it("does not require [AC-n] testcase tags for a draft story (understand.md: 'may start un-numbered')", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one
- [FA-01-5] two

# Acceptance Criteria

AC-1: first
AC-2: second

## Missing tag entirely

## Also missing tag
Given context
When action
Then outcome
`);
    expect(result.errors.filter((error) => error.field === "testcase")).toEqual([]);
  });

  it("still requires [AC-n] tags once a draft is promoted to approved", () => {
    const draftContent = `---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one

# Acceptance Criteria

AC-1: first

## Untagged candidate scenario
`;
    const draftResult = validateStoryContent(draftContent);
    expect(draftResult.errors.filter((error) => error.field === "testcase")).toEqual([]);

    const approvedResult = validateStoryContent(draftContent.replace("status: draft", "status: approved"));
    expect(approvedResult.errors.some((error) => error.field === "testcase")).toBe(true);
  });

  it("rejects monolithic AC-1 when Feature has 3+ FA items", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] sign in
- [FA-01-5] navigate
- [FA-01-6] create project

# Acceptance Criteria

AC-1: User signs in, navigates, and creates a project

## Mega flow [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.field === "acceptance_criteria")).toBe(true);
  });

  it("requires Feature section with FA tags", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- missing FA tag

# Acceptance Criteria

AC-1: first

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.field === "feature")).toBe(true);
  });

  it("rejects legacy FE tags", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FE-1] legacy tag

# Acceptance Criteria

AC-1: first

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.field === "feature")).toBe(true);
  });

  it("rejects duplicate FA tags within a story", () => {
    const result = validateStoryContent(`---
feature: login
status: draft
version: 1
---

**Persona**
users.admin

# Feature
- [FA-01-4] one
- [FA-01-4] duplicate

# Acceptance Criteria

AC-1: first

## Case [AC-1]
Given context
When action
Then outcome
`);
    expect(result.errors.some((error) => error.message.includes("FA-01-4"))).toBe(true);
  });

  it("rejects FA tags duplicated across story files", () => {
    const otherStory = `---
feature: auth
status: draft
version: 1
---

# Feature
- [FA-01-4] existing tag

# Acceptance Criteria
AC-1: one
## Case [AC-1]
Given a
When b
Then c
`;
    const result = validateStoryContent(VALID_STORY, {
      filePath: ".vindicate/stories/login.story.md",
      otherStories: [{ path: ".vindicate/stories/auth.story.md", content: otherStory }]
    });
    expect(result.errors.some((error) => error.message.includes("FA-01-4"))).toBe(true);
  });

  it("accepts legacy Scenarios section for testcase headings", () => {
    const legacyStory = VALID_STORY.replace(
      /## Successful sign in \[AC-1\][\s\S]*# Out of Scope/,
      `# Scenarios

## Successful sign in [AC-1]
Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

## Invalid password [AC-2]
Given a logged-out user at the login page
When they enter an invalid password and click Sign in
Then an error message is shown

# Out of Scope`
    );
    const result = validateStoryContent(legacyStory);
    expect(result.valid).toBe(true);
  });

  it("parses CRLF frontmatter on Windows", () => {
    const crlfStory = VALID_STORY.replace(/\n/g, "\r\n");
    const result = validateStoryContent(crlfStory);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
