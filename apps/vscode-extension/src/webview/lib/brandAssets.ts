/** Brand icon URIs injected on `#root` by WebviewHtmlBuilder. */
export type ToolBrandId = "cursor" | "claude" | "copilot" | "antigravity";

function getRootDataset(): DOMStringMap {
  return document.getElementById("root")?.dataset ?? {};
}

export function getToolBrandUri(brand: ToolBrandId): string | undefined {
  const key = `brand${brand.charAt(0).toUpperCase()}${brand.slice(1)}Uri` as keyof DOMStringMap;
  return getRootDataset()[key];
}
