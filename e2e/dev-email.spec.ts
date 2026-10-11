import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The /dev/email preview of the letters (only in `next dev`, see
// playwright.config.ts): the page itself, and the letters it shows — their
// accessibility in both themes of a mail client and their width on a phone.

// The first visit compiles the page in `next dev`.
test.describe.configure({ timeout: 90_000 });

const LETTER = "Спасибо! Мы получили ваше пожертвование";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function openPreview(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/dev/email${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Письма" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  return errors;
}

const frame = (page: Page) => page.locator("iframe[title^='Письмо']");

async function violations(page: Page): Promise<string[]> {
  // The letter's frame runs no scripts, axe's included: without the exclusion
  // the scan waits for it forever. The letters are scanned on their own below.
  const result = await new AxeBuilder({ page })
    .withTags(WCAG)
    .exclude("iframe")
    .analyze();
  return result.violations.map(
    ({ id, nodes }) =>
      `${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
  );
}

test("shows a letter of the registry with its subject and text version", async ({
  page,
}) => {
  const errors = await openPreview(page);

  await expect(page.getByText(`${LETTER} — 1 500 ₽`).first()).toBeVisible();
  const letter = frame(page).contentFrame();
  await expect(
    letter.getByRole("heading", { level: 1, name: "Спасибо за помощь!" }),
  ).toBeVisible();
  await expect(
    letter.getByText("Сбор «Корм на октябрь»", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Это письмо — подтверждение пожертвования").last(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps the chosen example, theme and width in the address", async ({
  page,
}) => {
  await openPreview(page);

  await page
    .getByRole("navigation", { name: "Пример" })
    .getByRole("link", { name: "На нужду с переплатой" })
    .click();
  await expect(page).toHaveURL(/example=split/);
  await expect(
    frame(page).contentFrame().getByText("В общий фонд", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Ширина окна" })
    .getByRole("link", { name: "Компьютер" })
    .click();
  await expect(page).toHaveURL(/example=split.*width=desktop/);
  await expect(
    page
      .getByRole("navigation", { name: "Ширина окна" })
      .getByRole("link", { name: "Компьютер" }),
  ).toHaveAttribute("aria-current", "true");
  await expect
    .poll(async () => (await frame(page).boundingBox())?.width)
    .toBeGreaterThan(600);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the page has no WCAG 2.1 AA violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const errors = await openPreview(page, "?example=split");

    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const example of ["need", "split", "closed", "general"]) {
  for (const theme of ["light", "dark"] as const) {
    test(`the «${example}» letter is accessible and fits a phone in a ${theme} mail client`, async ({
      page,
    }) => {
      await openPreview(page, `?example=${example}&theme=${theme}`);
      const html = await frame(page).getAttribute("srcdoc");
      expect(html).toContain(LETTER);

      // The letter on its own, as a mail client shows it: no script of ours
      // runs inside the preview's frame, so axe can't look into it there.
      for (const width of [320, 375]) {
        await page.setViewportSize({ width, height: 800 });
        await page.setContent(html!);

        expect(await violations(page)).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
      }
    });
  }
}
