// spec: .vindicate/stories/kitchen.story.md
import { test } from '@config/page.config';

test.describe('App - Kitchen', () => {


  // scenario: All actions
  test('[AC-100] should emit all actions', async ({ kitchenPage }) => {
    await kitchenPage.step_allActions();
    await kitchenPage.verify_done();
  });

});
