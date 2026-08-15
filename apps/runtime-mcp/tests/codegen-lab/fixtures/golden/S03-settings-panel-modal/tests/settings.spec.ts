// spec: .vindicate/stories/settings.story.md
import { test } from "@config/page.config";

test.describe("App - Settings", () => {
  // scenario: Manage settings in panel
  test("[AC-3] should save settings", async ({ settingsPanel }) => {
    await settingsPanel.step_save();
    await settingsPanel.verify_panelVisible();
  });
});
