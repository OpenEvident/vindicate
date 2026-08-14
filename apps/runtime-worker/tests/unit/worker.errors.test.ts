import { describe, expect, it } from "vitest";

import {
  ElementNotFoundError,
  InvalidTransitionError,
  SessionNotFoundError,
  WorkerError
} from "../../src/shared/errors/worker.errors.js";

describe("WorkerError subclasses", () => {
  it("carries stable code and HTTP status", () => {
    const err = new SessionNotFoundError("sess-1");
    expect(err).toBeInstanceOf(WorkerError);
    expect(err.code).toBe("session.not_found");
    expect(err.httpStatus).toBe(404);
  });

  it("supports invalid transition errors", () => {
    const err = new InvalidTransitionError("paused", "navigate");
    expect(err.httpStatus).toBe(400);
    expect(err.from).toBe("paused");
    expect(err.trigger).toBe("navigate");
  });

  it("supports element not found", () => {
    const err = new ElementNotFoundError("r1");
    expect(err.code).toBe("browser.element_not_found");
    expect(err.ref).toBe("r1");
  });
});
