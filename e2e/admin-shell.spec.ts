import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn, giveEachTestItsOwnIp } from "./support/sign-in";
import { E2E_USERS } from "./support/users";

// The admin frame of FND-7: the menu follows the role, a section's address
// answers 403 without the permission, and the settings form saves.

giveEachTestItsOwnIp();

/** Below `lg` the menu is a drawer behind the «Меню» button. */
async function openMenu(page: Page) {
  const menuButton = page.getByRole("button", { name: "Меню" });
  if (await menuButton.isVisible()) await menuButton.click();
  const menu = page.getByRole("navigation", { name: "Разделы админки" });
  await expect(menu).toBeVisible();
  return menu;
}

const linkNames = async (page: Page) =>
  (await openMenu(page)).getByRole("link").allTextContents();

test("the owner's menu has every section", async ({ page }) => {
  await signIn(page, E2E_USERS.owner);

  expect(await linkNames(page)).toEqual([
    "Дашборд",
    "Нужды",
    "Собаки",
    "Вещи",
    "Пожертвования",
    "Подписки",
    "Расходы",
    "Книга операций",
    "Отчёты",
    "Волонтёры",
    "Смены",
    "Задачи",
    "Контент",
    "Юридические документы",
    "Пользователи",
    "Настройки",
    "Аудит",
    "Вебхуки",
  ]);
});

test("a curator's menu has only the curator's sections", async ({ page }) => {
  await signIn(page, E2E_USERS.editor);

  expect(await linkNames(page)).toEqual([
    "Дашборд",
    "Нужды",
    "Собаки",
    "Расходы",
    "Контент",
  ]);
});

test("a coordinator's menu has only the coordinator's sections", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.coordinator);

  expect(await linkNames(page)).toEqual([
    "Дашборд",
    "Собаки",
    "Волонтёры",
    "Смены",
    "Задачи",
  ]);
});

test("the menu opens a section and marks it as the current page", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.editor);

  await (await openMenu(page)).getByRole("link", { name: "Нужды" }).click();

  await expect(page).toHaveURL("/admin/needs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Нужды" }),
  ).toBeVisible();
  const menu = await openMenu(page);
  await expect(menu.getByRole("link", { name: "Нужды" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(menu.getByRole("link", { name: "Дашборд" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("a section's address answers 403 to a role without the permission", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.editor);

  // Settings are a real page, donations and audit the placeholder, the last
  // one an address below a section: all check the section's permission.
  for (const path of [
    "/admin/settings",
    "/admin/donations",
    "/admin/audit",
    "/admin/donations/manual",
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(403);
  }
  // The curator's own sections open.
  expect((await page.request.get("/admin/needs")).status()).toBe(200);

  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Нет доступа" }),
  ).toBeVisible();
  await expect(page.getByLabel("ИНН")).toHaveCount(0);
  // The frame stays, so the way back to the curator's sections is there.
  const menu = await openMenu(page);
  await expect(menu.getByRole("link", { name: "Собаки" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Настройки" })).toHaveCount(0);
});

test("an address that is no section answers 404 to staff", async ({ page }) => {
  await signIn(page, E2E_USERS.editor);

  // Below a section of the curator's own, too: no page there yet.
  for (const path of ["/admin/no-such-section", "/admin/needs/42/edit"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);

    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Страница не найдена" }),
    ).toBeVisible();
    // Inside the frame, with the way back.
    const menu = await openMenu(page);
    await expect(menu.getByRole("link", { name: "Нужды" })).toBeVisible();
  }
});

test("the owner fills in the settings; they validate and stay saved", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await signIn(page, E2E_USERS.owner);
  await (await openMenu(page)).getByRole("link", { name: "Настройки" }).click();
  await expect(page).toHaveURL("/admin/settings");
  const save = page.getByRole("button", { name: "Сохранить" });

  // Nothing changed yet: nothing is sent.
  await save.click();
  await expect(page.getByText("Изменений нет")).toBeVisible();

  // An invalid field: the error is at the field, which takes the focus, and
  // what was typed stays.
  await page
    .getByLabel("Название организации")
    .fill("АНО «Мыс доброй надежды»");
  await page.getByLabel("ИНН").fill("12345");
  await save.click();
  const inn = page.getByLabel("ИНН");
  await expect(inn).toBeFocused();
  await expect(inn).toHaveAttribute("aria-invalid", "true");
  await expect(inn).toHaveAccessibleDescription(
    "ИНН — 10 цифр у организации или 12 у ИП.",
  );
  await expect(page.getByLabel("Название организации")).toHaveValue(
    "АНО «Мыс доброй надежды»",
  );

  // Both projects save the same values at the same time: the last write
  // wins, and it is the same write.
  await inn.fill("7707 083 893");
  await page.getByLabel("Телефон").fill("+7 900 123-45-67");
  await page.getByLabel("Telegram").fill("@mys_dobroy_nadezhdy");
  await save.click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();
  // The form shows what was stored: digits without spaces, a link for a nick.
  await expect(inn).toHaveValue("7707083893");
  await expect(page.getByLabel("Telegram")).toHaveValue(
    "https://t.me/mys_dobroy_nadezhdy",
  );

  await page.reload();
  await expect(page.getByLabel("Название организации")).toHaveValue(
    "АНО «Мыс доброй надежды»",
  );
  await expect(page.getByLabel("ИНН")).toHaveValue("7707083893");
  await expect(page.getByLabel("Телефон")).toHaveValue("+7 900 123-45-67");
  await expect(page.getByLabel("Часовой пояс")).toContainText("UTC+");
  expect(errors).toEqual([]);
});

test("a form keeps what was typed while it was being saved", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.owner);
  await page.goto("/admin/settings");
  await page.waitForLoadState("networkidle");
  // A slow server.
  await page.route("**/admin/settings", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.continue();
  });

  // A change that is sent but stores the same amount: this test runs next to
  // the one that saves the settings and must not write over it.
  const amount = page.getByLabel("Разово, ₽: сумма 1");
  await amount.fill(`${await amount.inputValue()} `);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByLabel("Адрес").fill("Лесная улица, 1");

  await expect(page.getByText("Настройки сохранены")).toBeVisible();
  await expect(page.getByLabel("Адрес")).toHaveValue("Лесная улица, 1");
  await expect(page.getByText("Есть несохранённые изменения")).toBeVisible();
});

test("a form keeps what was typed when the session has ended", async ({
  page,
  context,
}) => {
  await signIn(page, E2E_USERS.owner);
  await page.goto("/admin/settings");
  await page.getByLabel("Банк").fill("Банк, который не сохранится");

  // The cookie expired while the form was open.
  await context.clearCookies();
  await page.getByRole("button", { name: "Сохранить" }).click();

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toContainText("Сессия закончилась");
  await expect(alert.getByRole("link")).toHaveAttribute("target", "_blank");
  await expect(page).toHaveURL("/admin/settings");
  await expect(page.getByLabel("Банк")).toHaveValue(
    "Банк, который не сохранится",
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the frame and the settings form pass WCAG 2.1 AA in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await signIn(page, E2E_USERS.owner);

    const summary: string[] = [];
    for (const path of ["/admin", "/admin/settings", "/admin/needs"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      summary.push(
        ...violations.map(
          ({ id, nodes }) =>
            `${path} · ${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
        ),
      );
    }
    expect(summary).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBe(0);
  });
}

test("the user menu switches the theme and signs out", async ({ page }) => {
  await signIn(page, E2E_USERS.coordinator);
  await expect(page.getByRole("banner")).toContainText(
    "Координатор волонтёров",
  );

  await page.getByRole("button", { name: /Координатор/ }).click();
  await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("menuitemradio", { name: "Светлая" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL("/admin/login");
});

test("the admin's text face is self-hosted and covers Russian typography", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await signIn(page, E2E_USERS.editor);
  await page.waitForLoadState("networkidle");

  // As e2e/design-tokens.spec.ts does for the public faces: render every
  // character in the text stack and ask Chromium which font draws it. Sofia
  // Sans has no ₽: the mono face draws it, never a system font.
  await page.evaluate(async () => {
    const probe = document.createElement("p");
    probe.id = "glyph-probe";
    probe.style.fontFamily = "var(--font-body)";
    for (const character of "ёЁ«»—№₽") {
      const span = document.createElement("span");
      span.dataset.probe = character;
      span.textContent = character;
      probe.append(span);
    }
    document.querySelector("main")?.append(probe);
    await document.fonts.ready;
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "#glyph-probe span",
  });
  const uncovered: string[] = [];
  for (const nodeId of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
    const label = attributes[attributes.indexOf("data-probe") + 1];
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    for (const font of fonts.filter(({ isCustomFont }) => !isCustomFont)) {
      uncovered.push(`${label}: ${font.familyName}`);
    }
  }

  expect(uncovered).toEqual([]);
  // Sofia Sans itself, not the condensed display face of the headings.
  await expect(page.locator("body")).toHaveCSS(
    "font-family",
    /^"?Sofia Sans"?,/,
  );
  await expect(page.locator("h1")).toHaveCSS(
    "font-family",
    /Sofia Sans Extra Condensed/,
  );
  expect(googleRequests).toEqual([]);
});
