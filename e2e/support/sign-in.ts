import { expect, test, type Page } from "@playwright/test";
import { totp } from "../../tests/support/totp";
import { E2E_PASSWORD, E2E_TOTP_SECRET } from "./users";

// Counts the tests of this worker, across the spec files it runs.
let ipCounter = 0;

/**
 * Gives every test of the file its own client IP (the app is not behind a
 * proxy here, so it takes X-Forwarded-For as is): sign-in attempts are
 * rate-limited per IP, and the tests run in parallel.
 */
export function giveEachTestItsOwnIp(): void {
  test.beforeEach(async ({ context }, testInfo) => {
    ipCounter += 1;
    const project = testInfo.project.name === "mobile" ? 2 : 1;
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${project}.${testInfo.workerIndex % 250}.${ipCounter % 250}`,
    });
  });
}

/** The first step of the sign-in form. */
export async function enterPassword(
  page: Page,
  email: string,
  password = E2E_PASSWORD,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Дальше" }).click();
}

/** Signs in a staff member whose TOTP is set up and lands on the dashboard. */
export async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await enterPassword(page, email);
  await page.getByLabel("Код").fill(totp(E2E_TOTP_SECRET));
  await expect(page).toHaveURL("/admin");
}
