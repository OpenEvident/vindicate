/**
 * @file Pure session lifecycle transitions (IMPLEMENTATION-PLAN §5.5, BROWSER-SERVICE precedence for `paused`).
 */
import { InvalidTransitionError } from "../../../shared/errors/worker.errors.js";

export type SessionState = "active" | "paused" | "dead" | "expired" | "closed";

export type SessionTrigger =
  | "end"
  | "crash"
  | "resume"
  | "ttl_elapsed"
  | "pause"
  | "resume_from_pause"
  | "paused_ttl_elapsed";

const transitions: Readonly<Record<string, SessionState>> = {
  "active:end": "closed",
  "active:crash": "dead",
  "active:pause": "paused",
  "paused:resume_from_pause": "active",
  "paused:paused_ttl_elapsed": "dead",
  "paused:end": "closed",
  "paused:crash": "dead",
  "dead:resume": "active",
  "dead:ttl_elapsed": "expired",
  "dead:end": "closed"
};

export function transition(current: SessionState, trigger: SessionTrigger): SessionState {
  const next = transitions[`${current}:${trigger}`];
  if (next === undefined) {
    throw new InvalidTransitionError(current, trigger);
  }
  return next;
}
