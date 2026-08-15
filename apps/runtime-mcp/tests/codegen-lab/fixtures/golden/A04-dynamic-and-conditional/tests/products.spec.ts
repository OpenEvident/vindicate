// spec: .vindicate/stories/products.story.md
import { test } from "@config/page.config";
import { productsExpected as expected } from "@config/page-loader";

test.describe("App - Products", () => {
  // scenario: Delete a seeded product by id
  test("[AC-200] should delete a product by id", async ({ productsPage }) => {
    await productsPage.step_open();
    await productsPage.step_dismiss_promo();
    await productsPage.step_delete_product(expected.seedProductId);
    await productsPage.verify_row_removed(expected.seedProductId);
  });
});
