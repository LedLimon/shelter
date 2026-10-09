import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The /dev/ui showcase of DS-2 (only in `next dev`, see playwright.config.ts):
// accessibility of every component and the keyboard contract of the layers.

// The first visit compiles the page in `next dev`.
test.describe.configure({ timeout: 90_000 });

async function openShowcase(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/dev/ui");
  await expect(
    page.getByRole("heading", { level: 1, name: "Витрина «Объявление»" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  return errors;
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no WCAG 2.1 AA violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const errors = await openShowcase(page);

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const summary = violations.map(
      ({ id, nodes }) =>
        `${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
    );
    expect(summary).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("has no horizontal scroll on a 375 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openShowcase(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBe(0);
});

for (const { name, trigger } of [
  { name: "Dialog", trigger: "Удалить черновик" },
  { name: "bottom Sheet", trigger: "Помочь Бурану" },
  { name: "side Sheet", trigger: "Фильтры" },
]) {
  test(`${name} opens from the keyboard, closes on Esc and returns focus`, async ({
    page,
  }) => {
    await openShowcase(page);
    const opener = page
      .locator("section[aria-labelledby=overlays]")
      .getByRole("button", { name: trigger, exact: true });

    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Focus moves into the layer and stays there.
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
}

test("form shows errors at the fields and focuses the first one", async ({
  page,
}) => {
  await openShowcase(page);
  const form = page.locator("section[aria-labelledby=form]");
  const submit = form.getByRole("button", { name: "Отправить" });

  await submit.click();

  const amount = form.getByLabel("Сумма, ₽");
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("Введите сумму, например 500.")).toBeVisible();
  await expect(
    form.getByText("Без согласия мы не сможем принять пожертвование."),
  ).toBeVisible();

  // What was typed survives a failed submit.
  await amount.fill("50");
  await submit.click();
  await expect(amount).toHaveValue("50");
  await expect(form.getByText("Минимальная сумма — 100 ₽.")).toBeVisible();
});
