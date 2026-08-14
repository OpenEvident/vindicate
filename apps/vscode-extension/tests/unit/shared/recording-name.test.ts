import { describe, expect, it } from "vitest";

import {
  findRecordingNameConflict,
  formatRecordingNameConflictMessage,
  MAX_RECORDING_NAME_LENGTH,
  sanitizeRecordingName,
  validateRecordingName
} from "../../../src/shared/recording-name";

describe("recording-name", () => {
  it("sanitizeRecordingName matches worker slug rules", () => {
    expect(sanitizeRecordingName("Login Flow")).toBe("Login-Flow");
    expect(sanitizeRecordingName("???")).toBe("recording");
  });

  it("findRecordingNameConflict detects same safe name", () => {
    const conflict = findRecordingNameConflict("Login Flow", [
      { safeName: "Login-Flow", name: "Login Flow", status: "finalized" }
    ]);
    expect(conflict?.safeName).toBe("Login-Flow");
    expect(conflict?.status).toBe("finalized");
  });

  it("findRecordingNameConflict treats slug keys as case-insensitive", () => {
    const conflict = findRecordingNameConflict("login", [
      { safeName: "Login", name: "Login", status: "finalized" }
    ]);
    expect(conflict?.existingName).toBe("Login");
    expect(conflict?.status).toBe("finalized");
  });

  it("findRecordingNameConflict ignores abandoned sessions", () => {
    expect(
      findRecordingNameConflict("Login Flow", [
        { safeName: "Login-Flow", name: "Login Flow", status: "abandoned" }
      ])
    ).toBeNull();
  });

  it("formatRecordingNameConflictMessage describes finalized duplicate", () => {
    const msg = formatRecordingNameConflictMessage({
      safeName: "Login-Flow",
      existingName: "Login Flow",
      status: "finalized"
    });
    expect(msg).toContain("already exists");
    expect(msg).toContain("Login Flow");
  });

  it("validateRecordingName stays silent for empty name until required", () => {
    expect(validateRecordingName("", [])).toMatchObject({ ok: false, message: null });
    expect(validateRecordingName("", [], { requireNonEmpty: true })).toMatchObject({
      ok: false,
      issue: "empty",
      message: "Enter a recording name."
    });
  });

  it("validateRecordingName rejects names that are too long", () => {
    const longName = "a".repeat(MAX_RECORDING_NAME_LENGTH + 1);
    expect(validateRecordingName(longName, [])).toMatchObject({
      ok: false,
      issue: "too_long"
    });
  });

  it("validateRecordingName rejects names with no letters or numbers", () => {
    expect(validateRecordingName("???", [])).toMatchObject({
      ok: false,
      issue: "no_content"
    });
  });

  it("validateRecordingName accepts valid names and reports conflicts on change", () => {
    const sessions = [{ safeName: "Login-Flow", name: "Login Flow", status: "finalized" }];
    expect(validateRecordingName("Checkout", sessions)).toMatchObject({
      ok: true,
      sanitizedSlug: "Checkout"
    });
    expect(validateRecordingName("Login Flow", sessions)).toMatchObject({
      ok: false,
      issue: "conflict"
    });
  });
});
