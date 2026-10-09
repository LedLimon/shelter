import { expect, test } from "@playwright/test";

// CI tests the production build; `next dev` serves these pages on purpose.
test("dev showcases are not served in production", async ({ request }) => {
  test.skip(!process.env.CI, "only the production build hides /dev");

  const response = await request.get("/dev/tokens");

  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).not.toContain("«Объявление»");
  expect(html).not.toContain("surface-footer");
});
