/**
 * @file Single source of truth for the ARIA "name from content" rule used in locator derivation.
 *
 * `getByRole(role, { name })` matches an element's *computed accessible name*. Only the roles listed
 * here take that name from descendant text; for every other role — notably live regions like `alert`
 * and `status` — the inner text is NOT a matchable role name (binding it yields a locator Playwright
 * can never resolve). This is the rule whose absence caused the OrangeHRM error-alert failure.
 *
 * The `page.evaluate` capture functions are serialized with `fn.toString()` and cannot import, so each
 * keeps an inline copy of this list. `name-from-content.test.ts` pins those copies equal to this canon
 * so a future edit to one copy can never silently drift the others.
 */
export const ROLE_NAME_FROM_CONTENT: readonly string[] = [
  "button",
  "link",
  "heading",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "checkbox",
  "switch",
  "tab",
  "treeitem",
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
  "row",
  "tooltip"
];

/** Whether `role`'s accessible name may be derived from its descendant text. */
export function roleTakesNameFromContent(role: string): boolean {
  return ROLE_NAME_FROM_CONTENT.includes(role);
}
