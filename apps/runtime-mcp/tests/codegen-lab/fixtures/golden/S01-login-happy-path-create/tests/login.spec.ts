// spec: .vindicate/stories/login.story.md
import { test } from '@config/page.config';
import { loginExpected as expected } from '@config/page-loader';

test.describe('App - Login', () => {


  // scenario: User signs in
  test('[AC-1] should sign in', async ({ loginPage }) => {
    await loginPage.step_navigate();
    await loginPage.step_signIn(expected.loginEmail, expected.loginPassword);
    await loginPage.verify_loginVisible();
  });

});
