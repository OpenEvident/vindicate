import { getFaviconUri } from "../../lib/webviewAssets";

export function PanelHeader() {
  const faviconUri = getFaviconUri();

  return (
    <header className="vindicate-panel-header">
      {faviconUri && <img src={faviconUri} alt="" className="vindicate-header-favicon" />}
      <span className="text-sm font-semibold text-[var(--vindicate-fg)]">Vindicate</span>
      <div className="flex-1" />
    </header>
  );
}
