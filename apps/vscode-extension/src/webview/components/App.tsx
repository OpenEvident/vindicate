import { useExtensionMessages } from "../hooks/useExtensionMessages";
import { useTheme } from "../hooks/useTheme";
import { EditorView } from "./EditorView";
import { PanelView } from "./panel/PanelView";
import { RecordingSurface } from "./recording/RecordingSurface";
import { SidebarView } from "./sidebar/SidebarView";

export type WebviewSurface = "sidebar" | "editor" | "panel" | "recording";

export function App({ surface }: { surface: WebviewSurface }) {
  useExtensionMessages();
  useTheme();

  if (surface === "sidebar") return <SidebarView />;
  if (surface === "panel") return <PanelView />;
  if (surface === "recording") return <RecordingSurface />;
  return <EditorView />;
}
