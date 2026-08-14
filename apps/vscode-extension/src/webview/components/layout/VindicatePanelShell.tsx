import type { ReactNode } from "react";
import { PanelFooter } from "./PanelFooter";
import { PanelHeader } from "./PanelHeader";

interface VindicatePanelShellProps {
  children: ReactNode;
}

/**
 * Editor-tab chrome from vindicate-vscode-mockup.html: header, scrollable content, status footer.
 */
export function VindicatePanelShell({ children }: VindicatePanelShellProps) {
  return (
    <div className="vindicate-panel">
      <PanelHeader />
      <main className="vindicate-panel-content">{children}</main>
      <PanelFooter />
    </div>
  );
}
