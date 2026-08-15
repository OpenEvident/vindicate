import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { WorkerManager } from "../../../src/extension/processes/WorkerManager";
import { RecordingController } from "../../../src/extension/recording/recording-controller";

// Regression coverage for the project_root hardening fix: annotate/delete_recording used to
// trust a `projectRoot` field supplied by the webview via postMessage, falling back to the
// live workspace folder only if the webview omitted it. That meant a compromised/buggy webview
// could point these calls at an arbitrary directory. Both handlers now always read
// vscode.workspace.workspaceFolders directly and ignore any projectRoot the message carries.
describe("RecordingController project_root hardening", () => {
  const context = {
    globalState: {
      get: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined)
    }
  };

  const workerManager = {
    onWorkerEvent: vi.fn().mockReturnValue(() => {}),
    getInternalKey: vi.fn().mockReturnValue("test-internal-key")
  } as unknown as WorkerManager;

  let fetchMock: ReturnType<typeof vi.fn>;

  function fakePanel(): { postMessage: ReturnType<typeof vi.fn>; webview: unknown } {
    return { postMessage: vi.fn(), webview: {} };
  }

  function invokeHandleWebviewMessage(
    controller: RecordingController,
    panel: ReturnType<typeof fakePanel>,
    msg: Record<string, unknown>
  ): Promise<void> {
    return (
      controller as unknown as {
        handleWebviewMessage: (p: unknown, m: Record<string, unknown>) => Promise<void>;
      }
    ).handleWebviewMessage(panel, msg);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vscode.__resetVscodeMock();
    context.globalState.get.mockReturnValue(undefined);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [] })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  it("annotate uses the live workspace folder, ignoring a webview-supplied projectRoot", async () => {
    vscode.__setWorkspaceFolders([
      { uri: vscode.Uri.file("/real/workspace"), name: "real", index: 0 }
    ]);
    const controller = new RecordingController(
      context as never,
      workerManager,
      vscode.Uri.file("/ext")
    );

    await invokeHandleWebviewMessage(controller, fakePanel(), {
      type: "annotate",
      safeName: "café-login",
      projectRoot: "/malicious/attacker-controlled",
      pre_conditions: [],
      post_conditions: [],
      depends_on: [],
      summary: "updated"
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`project_root=${encodeURIComponent("/real/workspace")}`);
    expect(url).not.toContain("attacker-controlled");
  });

  it("delete_recording uses the live workspace folder, ignoring a webview-supplied projectRoot", async () => {
    vscode.__setWorkspaceFolders([
      { uri: vscode.Uri.file("/real/workspace"), name: "real", index: 0 }
    ]);
    const controller = new RecordingController(
      context as never,
      workerManager,
      vscode.Uri.file("/ext")
    );

    await invokeHandleWebviewMessage(controller, fakePanel(), {
      type: "delete_recording",
      safeName: "café-login",
      projectRoot: "/malicious/attacker-controlled"
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`project_root=${encodeURIComponent("/real/workspace")}`);
    expect(url).not.toContain("attacker-controlled");
  });

  it("annotate no-ops when no workspace folder is open, even if the webview supplies one", async () => {
    vscode.__setWorkspaceFolders(undefined);
    const controller = new RecordingController(
      context as never,
      workerManager,
      vscode.Uri.file("/ext")
    );

    await invokeHandleWebviewMessage(controller, fakePanel(), {
      type: "annotate",
      safeName: "café-login",
      projectRoot: "/malicious/attacker-controlled",
      pre_conditions: [],
      post_conditions: [],
      depends_on: [],
      summary: "updated"
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
