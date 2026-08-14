import { getLogoTextUri } from "../../lib/webviewAssets";

export function PanelHeader() {
  const logoTextUri = getLogoTextUri();

  return (
    <header className="vindicate-panel-header">
      {logoTextUri ? (
        <img src={logoTextUri} alt="Vindicate" className="vindicate-header-logo" />
      ) : (
        <span className="text-sm font-semibold text-[var(--vindicate-fg)]">Vindicate</span>
      )}
      <div className="flex-1" />
    </header>
  );
}
