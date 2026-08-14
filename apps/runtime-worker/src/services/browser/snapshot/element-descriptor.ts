/** Stored element identity for ref → Playwright locator resolution between snapshots. */
import type { StructuredLocator } from "@vindicate/protocol";

export interface ElementDescriptor {
  readonly testid?: string;
  readonly testidAttr: string;
  readonly domId?: string;
  readonly tag: string;
  readonly type?: string;
  readonly placeholder?: string;
  readonly role: string;
  readonly name: string;
  readonly context?: string;
  /** URL of the page this descriptor was captured on — refs are rejected if the page has since navigated. */
  readonly snapshotUrl: string;
  /**
   * Stable repeating-row anchor (table row / list item), set only when this ref collided with a
   * sibling in-snapshot. Lets resolution scope a per-row control to its uniquely-named row.
   */
  readonly container?: { readonly role: string; readonly name: string };
  /** The verified, render-agnostic locator derived at capture; rendered live by the ref resolver. */
  readonly locator?: StructuredLocator;
}
