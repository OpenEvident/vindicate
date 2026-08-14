import { describe, expect, it } from "vitest";

import { InvalidTransitionError } from "../../../shared/errors/worker.errors.js";
import { transition, type SessionState, type SessionTrigger } from "./session.state-machine.js";

const validCases: ReadonlyArray<{
  from: SessionState;
  trigger: SessionTrigger;
  to: SessionState;
}> = [
  { from: "active", trigger: "end", to: "closed" },
  { from: "active", trigger: "crash", to: "dead" },
  { from: "active", trigger: "pause", to: "paused" },
  { from: "paused", trigger: "resume_from_pause", to: "active" },
  { from: "paused", trigger: "paused_ttl_elapsed", to: "dead" },
  { from: "paused", trigger: "end", to: "closed" },
  { from: "paused", trigger: "crash", to: "dead" },
  { from: "dead", trigger: "resume", to: "active" },
  { from: "dead", trigger: "ttl_elapsed", to: "expired" },
  { from: "dead", trigger: "end", to: "closed" }
];

describe("transition", () => {
  it.each(validCases)("allows $from + $trigger → $to", ({ from, trigger, to }) => {
    expect(transition(from, trigger)).toBe(to);
  });

  it("rejects unknown combinations", () => {
    expect(() => transition("closed", "resume")).toThrow(InvalidTransitionError);
    expect(() => transition("expired", "end")).toThrow(InvalidTransitionError);
    expect(() => transition("expired", "resume")).toThrow(InvalidTransitionError);
    expect(() => transition("active", "resume")).toThrow(InvalidTransitionError);
    expect(() => transition("paused", "ttl_elapsed")).toThrow(InvalidTransitionError);
    expect(() => transition("paused", "resume")).toThrow(InvalidTransitionError);
  });
});
