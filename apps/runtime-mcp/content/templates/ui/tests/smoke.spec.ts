// spec: .vindicate/stories/smoke.story.md
import { test, expect } from '@config/page.config';

// scenario: Happy Path
test('[AC-1] should be reachable at the base URL', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL('about:blank');
});
