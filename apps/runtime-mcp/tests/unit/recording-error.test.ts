import { describe, expect, it } from "vitest";

import { mapRecordingError, WorkerRecordingError } from "../../src/worker/recording-error.js";

describe("mapRecordingError", () => {
  it("maps session_not_active to actionable guidance", () => {
    expect(
      mapRecordingError(new WorkerRecordingError("session_not_active", 400, '{"error":"session_not_active"}'))
    ).toEqual({
      error: "session_not_active",
      message: "The session isn't active. Resume or recreate it before recording."
    });
  });

  it("falls back to recording_failed for unknown errors", () => {
    expect(mapRecordingError(new Error("network down"))).toEqual({
      error: "recording_failed",
      message: "network down"
    });
  });
});
