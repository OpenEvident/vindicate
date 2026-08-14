// spec: .vindicate/stories/checkout.story.md
import { test } from '@config/page.config';

test.describe('App - Checkout', () => {


  // scenario: User checks out
  test('[AC-22] should complete checkout', async ({ loginPage, cartPage, checkoutPage }) => {
    await loginPage.step_navigate();
    await loginPage.step_continue();
    await cartPage.step_checkout();
    await checkoutPage.step_placeOrder();
  });

});
