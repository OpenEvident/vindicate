import type { ExtensionMessage } from "../shared/messages";
import type { BottomPanelProvider } from "./BottomPanelProvider";
import type { SidebarViewProvider } from "./SidebarViewProvider";

export interface IBroadcaster {
  broadcast(message: ExtensionMessage): void;
}

export interface IPostable {
  post(message: ExtensionMessage): void;
}

export class Broadcaster implements IBroadcaster {
  constructor(
    private readonly sidebar: SidebarViewProvider,
    private readonly bottomPanel: BottomPanelProvider,
    private readonly getEditorPanel: () => IPostable | undefined
  ) {}

  broadcast(message: ExtensionMessage): void {
    this.sidebar.post(message);
    this.getEditorPanel()?.post(message);
    this.bottomPanel.post(message);
  }
}
