import { expect, test, type Page } from "@playwright/test";
import { secretFromOtpauth, totp, wrongTotp } from "../tests/support/totp";
import {
  E2E_PASSWORD,
  E2E_TOTP_SECRET,
  E2E_USERS,
  newStaffEmail,
} from "./support/users";

// Every test signs in from its own client IP (the app is not behind a proxy
// here, so it takes X-Forwarded-For as is): sign-in attempts are rate-limited
// per IP, and the tests run in parallel.
let ipCounter = 0;
test.beforeEach(async ({ context }, testInfo) => {
  ipCounter += 1;
  const project = testInfo.project.name === "mobile" ? 2 : 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${project}.${testInfo.workerIndex % 250}.${ipCounter % 250}`,
  });
});

async function enterPassword(
  page: Page,
  email: string,
  password = E2E_PASSWORD,
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Дальше" }).click();
}

test("the admin sends a visitor to sign in and back", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL("/admin/login?next=%2Fadmin");
  await expect(
    page.getByRole("heading", { name: "Вход для сотрудников" }),
  ).toBeVisible();
});

test("the owner signs in with a password and a TOTP code", async ({ page }) => {
  await page.goto("/admin/login");
  await enterPassword(page, E2E_USERS.owner);

  await expect(
    page.getByRole("heading", { name: "Код из приложения" }),
  ).toBeVisible();
  // The password alone opens nothing.
  const blocked = await page.request.get("/admin", { maxRedirects: 0 });
  expect(blocked.status()).toBe(307);
  expect(blocked.headers().location).toContain("/admin/login");

  await page.getByLabel("Код").fill(totp(E2E_TOTP_SECRET));

  await expect(page).toHaveURL("/admin");
  await expect(
    page.getByRole("heading", { name: /Здравствуйте/ }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Владелец");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL("/admin/login");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a wrong code keeps the owner out", async ({ page }) => {
  await page.goto("/admin/login");
  await enterPassword(page, E2E_USERS.owner);

  await page.getByLabel("Код").fill(wrongTotp(E2E_TOTP_SECRET));

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Код не подошёл",
  );
  await expect(page).toHaveURL("/admin/login");
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/admin/login");
  await enterPassword(page, E2E_USERS.owner, "not-the-password");

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Неверный email или пароль",
  );
});

test("new staff set up TOTP before the admin opens", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/login");
  await enterPassword(page, newStaffEmail(testInfo.project.name));

  await expect(page).toHaveURL("/admin/two-factor");
  await page.getByLabel("Пароль").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Продолжить" }).click();

  const uri = await page
    .getByRole("link", { name: "Открыть в приложении на этом телефоне" })
    .getAttribute("href");
  expect(uri).toMatch(/^otpauth:\/\/totp\//);
  // Not in yet: the authenticator hasn't proven itself.
  const blocked = await page.request.get("/admin", { maxRedirects: 0 });
  expect(blocked.headers().location).toContain("/admin/two-factor");

  await page
    .getByLabel("Код из приложения")
    .fill(totp(secretFromOtpauth(uri!)));

  await expect(
    page.getByRole("heading", { name: "Сохраните резервные коды" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await page
    .getByRole("button", { name: "Коды сохранены — в админку" })
    .click();
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("banner")).toContainText("Куратор");
});

test("a donor gets 403 in the admin", async ({ page }) => {
  await page.goto("/admin/login");
  await enterPassword(page, E2E_USERS.donor);

  await expect(
    page.getByRole("heading", { name: "Нет доступа" }),
  ).toBeVisible();
  const response = await page.request.get("/admin");
  expect(response.status()).toBe(403);
});
