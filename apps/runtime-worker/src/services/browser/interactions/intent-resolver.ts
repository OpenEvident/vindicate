/** Server-side intent matching of natural-language targets against stored element descriptors. */
import type { ElementDescriptor } from "../snapshot/element-descriptor.js";

export interface IntentCandidate {
  readonly ref: string;
  readonly name: string;
  readonly role: string;
  readonly context?: string;
}

export type IntentResolution =
  | { readonly type: "found"; readonly ref: string; readonly descriptor: ElementDescriptor }
  | { readonly type: "ambiguous"; readonly candidates: IntentCandidate[] }
  | { readonly type: "not_found" };

const ROLE_SYNONYMS: Record<string, string[]> = {
  button: ["button", "btn", "submit", "save", "cancel", "delete", "add", "create", "click"],
  textbox: ["input", "field", "text", "textbox", "entry", "box"],
  combobox: ["dropdown", "select", "picker", "combobox", "menu"],
  checkbox: ["checkbox", "check", "toggle", "tick"],
  link: ["link", "anchor", "href"]
};

function scoreDescriptor(target: string, descriptor: ElementDescriptor): number {
  const t = target.toLowerCase().trim();
  const name = descriptor.name.toLowerCase();
  const role = descriptor.role.toLowerCase();
  let score = 0;

  if (name === t) {
    score += 100;
  } else if (name.length > 0 && t.includes(name)) {
    score += 70;
  } else if (name.length > 0 && name.includes(t)) {
    score += 60;
  } else {
    const tWords = t.split(/\s+/).filter((w) => w.length > 2);
    const nWords = name.split(/\s+/);
    for (const tw of tWords) {
      if (nWords.some((nw) => nw === tw || nw.startsWith(tw) || tw.startsWith(nw))) {
        score += 20;
      }
    }
  }

  const synonyms = ROLE_SYNONYMS[role] ?? [];
  if (synonyms.some((s) => t.includes(s))) {
    score += 15;
  }

  if (descriptor.testid) {
    const tid = descriptor.testid.toLowerCase();
    if (t.includes(tid) || tid.includes(t)) {
      score += 50;
    }
  }

  if (descriptor.placeholder) {
    const ph = descriptor.placeholder.toLowerCase();
    if (t.includes(ph) || ph.includes(t)) {
      score += 30;
    }
  }

  return score;
}

const SCORE_THRESHOLD = 40;
/** second score must be ≤ winner / 1.3 (winner ~30%+ above second). */
const WINNER_GAP_RATIO = 1 / 1.3;

export function resolveByTarget(
  target: string,
  descriptors: Map<string, ElementDescriptor>
): IntentResolution {
  const scored = [...descriptors.entries()]
    .map(([ref, desc]) => ({ ref, desc, score: scoreDescriptor(target, desc) }))
    .filter((r) => r.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { type: "not_found" };
  }

  const top = scored[0]!;
  const second = scored[1];

  if (!second || top.score >= second.score / WINNER_GAP_RATIO) {
    return { type: "found", ref: top.ref, descriptor: top.desc };
  }

  return {
    type: "ambiguous",
    candidates: scored.slice(0, 5).map((r) => ({
      ref: r.ref,
      name: r.desc.name,
      role: r.desc.role,
      ...(r.desc.context !== undefined ? { context: r.desc.context } : {})
    }))
  };
}
