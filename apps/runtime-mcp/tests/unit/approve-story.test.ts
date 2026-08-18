import { describe, expect, it } from "vitest";

import { buildApprovedCandidate, evaluateApproval } from "../../src/story/approve-story.js";

const DRAFT_STORY_READY = `---
feature: login
status: draft
version: 1
---

# Login — dashboard access

Verify that a logged-out user can sign in with valid credentials and reach the dashboard.

**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)

# Feature

- [FA-01-4] User can sign in with email and password

# Acceptance Criteria

AC-1: User can sign in with valid credentials

## Successful sign in [AC-1]
Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

# Out of Scope

- Password reset flow
`;

const DRAFT_STORY_MISSING_AC_TAG = `---
feature: login
status: draft
version: 1
---

# Login — dashboard access

Verify that a logged-out user can sign in with valid credentials and reach the dashboard.

**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)

# Feature

- [FA-01-4] User can sign in with email and password

# Acceptance Criteria

AC-1: User can sign in with valid credentials

## Successful sign in
Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

# Out of Scope

- Password reset flow
`;

describe("buildApprovedCandidate", () => {
  it("swaps a draft status to approved", () => {
    const result = buildApprovedCandidate(DRAFT_STORY_READY);
    expect(result).toContain("\nstatus: approved\n");
    expect(result).not.toContain("status: draft");
  });

  it("is a no-op in effect when already approved", () => {
    const already = DRAFT_STORY_READY.replace("status: draft", "status: approved");
    const result = buildApprovedCandidate(already);
    expect(result).toBe(already);
  });

  it("leaves content unchanged when there is no frontmatter block", () => {
    const noFrontmatter = "# Just a heading\n\nSome body text.\n";
    expect(buildApprovedCandidate(noFrontmatter)).toBe(noFrontmatter);
  });

  it("leaves content unchanged when the frontmatter has no status field", () => {
    const noStatus = `---\nfeature: login\nversion: 1\n---\n\n# Body\n`;
    expect(buildApprovedCandidate(noStatus)).toBe(noStatus);
  });

  it("does not touch a 'status:' occurrence in the body, only inside frontmatter", () => {
    const bodyMentionsStatus = `---\nfeature: login\nstatus: draft\nversion: 1\n---\n\n# Notes\n\nstatus: this is prose, not frontmatter\n`;
    const result = buildApprovedCandidate(bodyMentionsStatus);
    expect(result).toContain("\nstatus: approved\n");
    expect(result).toContain("status: this is prose, not frontmatter");
  });

  it("preserves CRLF line endings", () => {
    const crlf = DRAFT_STORY_READY.replace(/\n/g, "\r\n");
    const result = buildApprovedCandidate(crlf);
    expect(result).toContain("\r\nstatus: approved\r\n");
    expect(result).not.toContain("status: draft");
  });
});

describe("buildApprovedCandidate — requirements-path template (richer frontmatter + Change Log tail)", () => {
  const REQUIREMENTS_PATH_STORY = `---
feature: login-create-automation-project
status: draft
version: 1
generated: 2026-08-10
last_updated: 2026-08-10
source:
  - recording:login-flow
---

# Login — dashboard access

Verify that a logged-out user can sign in with valid credentials and reach the dashboard.

**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)

# Feature

- [FA-01-4] User can sign in with email and password

# Acceptance Criteria

AC-1: User can sign in with valid credentials

## Successful sign in [AC-1]

Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

# Out of Scope

- Password reset flow

# Change Log

- 2026-08-10: drafted from recording login-flow (agent)
`;

  it("swaps only the status line, leaving generated/last_updated/source and the Change Log untouched — ref-requirements.md says Change Log 'stays at the bottom, unchanged'", () => {
    const result = buildApprovedCandidate(REQUIREMENTS_PATH_STORY);
    expect(result).toContain("\nstatus: approved\n");
    expect(result).toContain("generated: 2026-08-10");
    expect(result).toContain("last_updated: 2026-08-10");
    expect(result).toContain("source:\n  - recording:login-flow");
    expect(result).toContain(
      "# Change Log\n\n- 2026-08-10: drafted from recording login-flow (agent)"
    );
  });

  it("approves the requirements-path story end to end", () => {
    const result = evaluateApproval(REQUIREMENTS_PATH_STORY);
    expect(result.approved).toBe(true);
  });
});

describe("evaluateApproval", () => {
  it("approves a story that is genuinely ready", () => {
    const result = evaluateApproval(DRAFT_STORY_READY);
    expect(result.approved).toBe(true);
    if (result.approved) {
      expect(result.content).toContain("status: approved");
    }
  });

  it("rejects a story whose testcase is missing its [AC-n] tag — a check that only applies from approved onward, so validating the still-draft content would have missed it", () => {
    const result = evaluateApproval(DRAFT_STORY_MISSING_AC_TAG);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.errors.some((e) => e.field === "testcase")).toBe(true);
    }
  });

  it("does not report the swapped status as an error when the story is otherwise incomplete", () => {
    const result = evaluateApproval(DRAFT_STORY_MISSING_AC_TAG);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.errors.some((e) => e.field === "status")).toBe(false);
    }
  });

  it("respects cross-file FA-tag uniqueness via the same context validate_story already uses", () => {
    const otherStory = DRAFT_STORY_READY.replace("feature: login", "feature: other-feature");
    const result = evaluateApproval(DRAFT_STORY_READY, {
      filePath: ".vindicate/stories/login.story.md",
      otherStories: [{ path: ".vindicate/stories/other-feature.story.md", content: otherStory }]
    });
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.errors.some((e) => e.message.includes("already used in another story"))).toBe(
        true
      );
    }
  });
});
