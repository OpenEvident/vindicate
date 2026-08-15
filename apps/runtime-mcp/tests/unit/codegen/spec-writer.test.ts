import { describe, expect, it } from "vitest";

import { appendTestCases, buildAuthSetup, buildNewSpec } from "../../../src/codegen/spec-writer.js";
import { persistedSchema, testCase } from "./helpers/fixtures.js";

describe("spec-writer", () => {
  const feature = "login";
  const schema = persistedSchema({
    spec: {
      suite: "App - Login",
      generates_storage_state: null,
      storage_state: null,
      before_each: null,
      cases: [
        testCase("AC-1", { scenario: "Happy Path", title: "[AC-1] should log in" }),
        testCase("AC-2", { scenario: "Invalid creds", title: "[AC-2] should show error" })
      ]
    }
  });

  describe("buildNewSpec", () => {
    it("SW1 — two test cases produce two test blocks in one describe", () => {
      const content = buildNewSpec(schema, feature);
      expect((content.match(/\btest\(/g) ?? []).length).toBe(2);
      expect(content).toContain("test.describe('App - Login'");
    });

    it("SW2 — each test title starts with matching AC tag", () => {
      const content = buildNewSpec(schema, feature);
      expect(content).toContain("'[AC-1] should log in'");
      expect(content).toContain("'[AC-2] should show error'");
    });

    it("SW3 — each test has scenario comment", () => {
      const content = buildNewSpec(schema, feature);
      expect(content).toContain("// scenario: Happy Path");
      expect(content).toContain("// scenario: Invalid creds");
    });

    it("SW4 — file header references story path", () => {
      const content = buildNewSpec(schema, feature);
      expect(content).toContain("// spec: .vindicate/stories/login.story.md");
    });

    it("SW5 — storage state emits test.use block", () => {
      const withState = persistedSchema({
        spec: {
          ...schema.spec,
          storage_state: "playwright/.auth/user.json"
        }
      });
      const content = buildNewSpec(withState, feature);
      expect(content).toContain("test.use({ storageState: 'playwright/.auth/user.json' });");
    });

    it("SW6 — no storage state omits test.use", () => {
      const content = buildNewSpec(schema, feature);
      expect(content).not.toContain("test.use(");
    });

    it("SW6b — omits expected import when schema has no expected block", () => {
      const content = buildNewSpec(schema, feature);
      expect(content).not.toContain("Expected as expected");
    });

    it("SW6c — includes expected import when schema defines expected", () => {
      const withExpected = persistedSchema({ expected: { title: "Hi" } });
      const content = buildNewSpec(withExpected, feature);
      expect(content).toContain("loginExpected as expected");
    });
  });

  describe("buildAuthSetup", () => {
    it("SW7 — buildAuthSetup returns auth setup file content string", () => {
      const withAuth = persistedSchema({
        spec: {
          ...schema.spec,
          generates_storage_state: "playwright/.auth/user.json"
        }
      });
      const content = buildAuthSetup(withAuth, feature);
      expect(content).toContain("setup('authenticate'");
      expect(content).toContain("storageState({ path:");
    });

    it("SW8 — notice is not embedded in buildAuthSetup output", () => {
      const withAuth = persistedSchema({
        spec: {
          ...schema.spec,
          generates_storage_state: "playwright/.auth/user.json"
        }
      });
      const content = buildAuthSetup(withAuth, feature);
      expect(content).not.toContain("playwright.config.ts");
      expect(content).not.toContain("Manual step");
    });

    it("SW9 — notice surfaces via generator not auth setup content", () => {
      const content = buildAuthSetup(schema, feature);
      expect(content).not.toMatch(/notice/i);
    });
  });

  describe("appendTestCases", () => {
    const existing = buildNewSpec(schema, feature);

    it("SW10 — appends before final describe close", () => {
      const appended = appendTestCases(existing, [
        testCase("AC-3", { scenario: "Logout", title: "[AC-3] should log out" })
      ]);
      const closeIdx = appended.lastIndexOf("\n\n});");
      expect(closeIdx).toBeGreaterThan(-1);
      expect(appended.indexOf("[AC-3]")).toBeLessThan(closeIdx);
    });

    it("SW11 — appended test uses AC and scenario format", () => {
      const appended = appendTestCases(existing, [
        testCase("AC-3", { scenario: "Logout", title: "[AC-3] should log out" })
      ]);
      expect(appended).toContain("// scenario: Logout");
      expect(appended).toContain("'[AC-3] should log out'");
    });

    it("SW12 — pre-existing tests remain untouched", () => {
      const appended = appendTestCases(existing, [
        testCase("AC-3", { scenario: "Logout", title: "[AC-3] should log out" })
      ]);
      expect(appended).toContain("'[AC-1] should log in'");
      expect(appended).toContain("'[AC-2] should show error'");
    });
  });
});
