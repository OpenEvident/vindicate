import * as assert from "node:assert";
import * as vscode from "vscode";
import { COMMANDS, VIEW_IDS } from "../../src/extension/shared/constants";

const EXTENSION_ID = "vindicateai.vscode-extension";

suite("Vindicate extension E2E", () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension ${EXTENSION_ID} should be installed`);
    await ext.activate();
  });

  test("activates without throwing", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext?.isActive, "Extension should be active after activation");
  });

  test("registers Vindicate commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of Object.values(COMMANDS)) {
      assert.ok(commands.includes(id), `Command ${id} should be registered`);
    }
  });

  test("opens editor home tab via vindicate.openHome", async () => {
    await vscode.commands.executeCommand(COMMANDS.openHome);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const titles = vscode.window.tabGroups.all.flatMap((g) =>
      g.tabs.map((t) => (typeof t.label === "string" ? t.label : ""))
    );
    assert.ok(
      titles.some((t) => t.toLowerCase().includes("vindicate")),
      `Expected Vindicate editor tab, got: ${titles.join(", ")}`
    );
  });

  test("shows bottom panel container via vindicate.showPanel", async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand(COMMANDS.showPanel);
    });
  });

  test("sidebar and panel webview views are registered", async () => {
    await vscode.commands.executeCommand(`${VIEW_IDS.sidebar}.focus`);
    await vscode.commands.executeCommand(`${VIEW_IDS.panel}.focus`);
  });
});
