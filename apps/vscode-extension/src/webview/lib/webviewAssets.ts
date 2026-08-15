/** URIs and metadata injected on `#root` by WebviewHtmlBuilder. */
export function getRootDataset(): DOMStringMap {
  return document.getElementById("root")?.dataset ?? {};
}

export function getLogoUri(): string | undefined {
  return getRootDataset()["logoUri"];
}

export function getLogoTextUri(): string | undefined {
  return getRootDataset()["logoTextUri"];
}

export function getFaviconUri(): string | undefined {
  return getRootDataset()["faviconUri"];
}

export function getExtensionVersion(): string {
  return getRootDataset()["extensionVersion"] ?? "0.0.0";
}
