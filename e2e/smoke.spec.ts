import { expect, test } from "@playwright/test";

test("home page opens without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The heading is already in the SSR HTML; wait for scripts to load and
  // hydrate so that hydration errors are caught too.
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
