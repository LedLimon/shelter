import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { giveEachTestItsOwnIp, signIn } from "./support/sign-in";
import {
  E2E_USERS,
  UNSUBSCRIBE_VARIANTS,
  unsubscribeToken,
} from "./support/users";

// Legal documents (LEGAL-1): the owner publishes a new version and the
// public page shows it; nobody else gets into the section.

giveEachTestItsOwnIp();

// The projects run next to each other on one database, and a document has
// one draft at a time: each project publishes versions of its own document.
const DOCUMENTS = {
  desktop: { slug: "offer", title: "Оферта о пожертвовании" },
  mobile: {
    slug: "privacy",
    title: "Политика обработки персональных данных",
  },
} as const;

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${page.url()} scrolls sideways`).toBe(0);
}

const documentOf = (testInfo: TestInfo) =>
  DOCUMENTS[testInfo.project.name === "mobile" ? "mobile" : "desktop"];

test("the owner publishes a new version and the document's page shows it", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { slug, title } = documentOf(testInfo);
  const marker = `Проверочный пункт ${testInfo.project.name} ${Date.now()}`;

  // Visitors have the page before the publication: it is cached by now.
  await page.goto(`/legal/${slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(page.getByText(marker)).toHaveCount(0);

  await signIn(page, E2E_USERS.owner);
  await page.goto("/admin/legal");
  await page.getByRole("link", { name: new RegExp(`^${title}`) }).click();
  await expect(page).toHaveURL(`/admin/legal/${slug}`);

  // A retry, or a run that stopped halfway, has left a draft: go on with it.
  const create = page.getByRole("button", { name: /^Создать черновик версии/ });
  const editor = page.getByLabel("Текст документа");
  await expect(create.or(editor)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await expect(editor).toBeVisible();
  const draftHeading = await page
    .getByRole("heading", { name: /^Черновик версии \d+$/ })
    .textContent();
  const version = Number(/\d+/.exec(draftHeading ?? "")?.[0]);
  expect(version).toBeGreaterThanOrEqual(1);

  // An address without a single space: it must wrap, not widen the page.
  const longUrl = `https://priyut.example/${"ochen-dlinnyy-adres/".repeat(8)}`;
  await editor.fill(
    `## Раздел первый\n1.1. ${marker}.\n1.2. Подробнее: ${longUrl}\n- пункт списка`,
  );
  await expectNoSidewaysScroll(page);
  // What is published is the saved text: not before it is saved.
  const publish = page.getByRole("button", {
    name: "Опубликовать",
    exact: true,
  });
  await expect(publish).toBeDisabled();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён")).toBeVisible();

  // Left and reached again through the browser's history, the editor has
  // the saved text — not the page as it was loaded before the save, from
  // which the next save would drop this one.
  await page.getByRole("link", { name: "Все документы" }).click();
  await expect(page).toHaveURL("/admin/legal");
  await page.goBack();
  await expect(editor).toHaveValue(new RegExp(marker));
  await expect(publish).toBeEnabled();

  // The preview shows the text the way the site will.
  await page.getByRole("tab", { name: "Предпросмотр" }).click();
  await expect(
    page.getByRole("tabpanel").getByRole("heading", { name: "Раздел первый" }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);

  await publish.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Изменить опубликованную версию нельзя");
  await dialog
    .getByRole("button", { name: `Опубликовать версию ${version}` })
    .click();
  await expect(page.getByText(`Версия ${version} опубликована`)).toBeVisible();
  // The draft became a version: there is nothing left to edit, only the next one to start.
  await expect(
    page.getByRole("button", {
      name: `Создать черновик версии ${version + 1}`,
    }),
  ).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(
    page
      .getByRole("table", { name: "Опубликованные версии" })
      .getByRole("link", { name: `Версия ${version}`, exact: false })
      .first(),
  ).toBeVisible();

  // The public page: the new text, though it was cached with the old one.
  await page.goto(`/legal/${slug}`);
  await expect(page.getByText(`1.1. ${marker}.`)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Раздел первый" }),
  ).toBeVisible();
  await expect(
    page.getByText(new RegExp(`^Версия ${version} · действует с`)),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: longUrl })).toBeVisible();
  await expectNoSidewaysScroll(page);

  // The version it replaced stays readable at its own address.
  if (version > 1) {
    await page
      .getByRole("link", { name: new RegExp(`^Версия ${version - 1}\\b`) })
      .click();
    await expect(page).toHaveURL(`/legal/${slug}/${version - 1}`);
    await expect(page.getByText(`её заменила версия ${version}`)).toBeVisible();
    await expect(page.getByText(marker)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("a curator gets 403 in the legal documents", async ({ page }) => {
  await signIn(page, E2E_USERS.editor);

  for (const path of ["/admin/legal", "/admin/legal/offer"]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }

  await page.goto("/admin/legal/offer");
  await expect(
    page.getByRole("heading", { level: 1, name: "Нет доступа" }),
  ).toBeVisible();
  await expect(page.getByLabel("Текст документа")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Создать черновик/ }),
  ).toHaveCount(0);
});

test("the admin's legal section has no page for an unknown document", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.owner);

  expect((await page.request.get("/admin/legal/terms")).status()).toBe(404);
});

test("an unknown document, version or unsubscribe link says so", async ({
  page,
}) => {
  for (const path of ["/legal/terms", "/legal/offer/999", "/legal/offer/v2"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  await page.goto("/legal/terms");
  await expect(
    page.getByRole("heading", { level: 1, name: "Такого документа нет" }),
  ).toBeVisible();
  // The way to the documents that exist.
  await expect(
    page
      .getByRole("navigation", { name: "Документы приюта" })
      .getByRole("link", { name: "Оферта о пожертвовании" }),
  ).toHaveAttribute("href", "/legal/offer");

  // Opening an unsubscribe link changes nothing by itself; an unknown one
  // has nothing to unsubscribe.
  await page.goto("/unsubscribe/no-such-consent");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ссылка не подошла" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Отписаться" })).toHaveCount(0);
});

// The link at the bottom of a newsletter. Without JavaScript too: the form
// is posted by the browser itself when the button is pressed before the
// page's scripts have loaded.
for (const variant of UNSUBSCRIBE_VARIANTS) {
  test.describe(`unsubscribing (${variant})`, () => {
    test.use({ javaScriptEnabled: variant === "js" });

    test("opening the link changes nothing; the button withdraws the consent", async ({
      page,
    }, testInfo) => {
      const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
      const link = `/unsubscribe/${unsubscribeToken(project, testInfo.retry, variant)}`;
      const asked = page.getByRole("heading", {
        level: 1,
        name: "Отписаться от новостей приюта?",
      });
      const done = page.getByRole("heading", {
        level: 1,
        name: "Вы отписаны",
      });

      // A mail scanner follows the link, the person opens it twice: still
      // subscribed. The address is shown so that it can't be read off.
      await page.goto(link);
      await expect(asked).toBeVisible();
      await page.reload();
      await expect(asked).toBeVisible();
      await expect(page.getByText("e•••@shelter.localhost")).toBeVisible();
      await expect(page.getByText(/e2e-subscriber/)).toHaveCount(0);

      await page.getByRole("button", { name: "Отписаться" }).click();
      await expect(done).toBeVisible();

      // For good: the link now only says so.
      await page.goto(link);
      await expect(done).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Отписаться" }),
      ).toHaveCount(0);
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the legal pages and the admin section pass WCAG 2.1 AA in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await signIn(page, E2E_USERS.owner);

    const summary: string[] = [];
    for (const path of [
      "/legal/offer",
      "/legal/consent",
      "/legal/marketing/1",
      "/unsubscribe/no-such-consent",
      "/admin/legal",
      // Whatever the other tests left there: a draft's editor or the
      // «Создать черновик» sheet, and the table of versions.
      "/admin/legal/offer",
      "/admin/legal/recurring",
    ]) {
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
      await expectNoSidewaysScroll(page);
    }
    expect(summary).toEqual([]);
  });
}
