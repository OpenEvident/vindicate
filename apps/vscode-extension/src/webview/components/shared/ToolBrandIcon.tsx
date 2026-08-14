import { getToolBrandUri, type ToolBrandId } from "../../lib/brandAssets";

export function ToolBrandIcon({ brand }: { brand: ToolBrandId; label?: string }) {
  const src = getToolBrandUri(brand);
  if (!src) {
    return null;
  }
  return <img src={src} alt="" className="vindicate-tool-brand-img" />;
}
