import { describe, expect, it } from "vitest";

import {
  CheckStepSchema,
  ClickStepSchema,
  SelectOptionStepSchema,
  UncheckStepSchema,
  UploadFileStepSchema,
  WaitForResponseStepSchema
} from "./interaction.params.js";

describe("interaction.params", () => {
  it("parses click step", () => {
    const parsed = ClickStepSchema.parse({
      action: "click",
      ref: "ref-a3f9c2b1",
      button: "right"
    });
    expect(parsed.button).toBe("right");
  });

  it("parses select_option by label", () => {
    const parsed = SelectOptionStepSchema.parse({
      action: "select_option",
      ref: "ref-a3f9c2b1",
      label: "United States"
    });
    expect("label" in parsed && parsed.label).toBe("United States");
  });

  it("parses check step", () => {
    const parsed = CheckStepSchema.parse({
      action: "check",
      ref: "ref-a3f9c2b1"
    });
    expect(parsed.ref).toBe("ref-a3f9c2b1");
  });

  it("parses uncheck step", () => {
    const parsed = UncheckStepSchema.parse({
      action: "uncheck",
      ref: "ref-a3f9c2b1"
    });
    expect(parsed.ref).toBe("ref-a3f9c2b1");
  });

  it("parses wait_for_response step", () => {
    const parsed = WaitForResponseStepSchema.parse({
      action: "wait_for_response",
      url_pattern: "/api/login",
      timeout_ms: 5000
    });
    expect(parsed.url_pattern).toBe("/api/login");
    expect(parsed.timeout_ms).toBe(5000);
  });

  it("parses upload_file with files array", () => {
    const parsed = UploadFileStepSchema.parse({
      action: "upload_file",
      ref: "ref-a3f9c2b1",
      files: ["C:/tmp/a.txt"]
    });
    expect(parsed.files).toEqual(["C:/tmp/a.txt"]);
  });

  it("parses upload_file with sample kind", () => {
    const parsed = UploadFileStepSchema.parse({
      action: "upload_file",
      ref: "ref-a3f9c2b1",
      sample: "pdf"
    });
    expect(parsed.sample).toBe("pdf");
  });

  it("rejects upload_file with both files and sample", () => {
    expect(() =>
      UploadFileStepSchema.parse({
        action: "upload_file",
        ref: "ref-a3f9c2b1",
        files: ["C:/tmp/a.txt"],
        sample: "pdf"
      })
    ).toThrow();
  });
});
