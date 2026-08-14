import * as vscode from "vscode";

type SurfaceId = "sidebar" | "panel" | "editor";

export class SurfaceVisibilityTracker implements vscode.Disposable {
  private readonly visibleBySurface = new Map<SurfaceId, boolean>([
    ["sidebar", false],
    ["panel", false],
    ["editor", false]
  ]);
  private readonly didChangeEmitter = new vscode.EventEmitter<boolean>();

  readonly onDidChange = this.didChangeEmitter.event;

  isAnyVisible(): boolean {
    return [...this.visibleBySurface.values()].some(Boolean);
  }

  setSurfaceVisibility(surface: SurfaceId, visible: boolean): void {
    const prev = this.visibleBySurface.get(surface) ?? false;
    if (prev === visible) return;
    this.visibleBySurface.set(surface, visible);
    this.didChangeEmitter.fire(this.isAnyVisible());
  }

  dispose(): void {
    this.didChangeEmitter.dispose();
  }
}
