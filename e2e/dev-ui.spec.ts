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
  // Base UI names its checkboxes from <label for> only after hydration, and a
  // cold `next dev` (CI) hydrates well after the network is idle.
  await expect(
    page.getByRole("checkbox", { name: "Прислать чек на почту" }),
  ).toBeVisible();
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

/** Opens a layer, returns the selector axe should scan, closes it afterwards. */
const LAYERS: {
  name: string;
  open: (page: Page) => Promise<void>;
  scope: string;
}[] = [
  {
    name: "Dialog",
    open: (page) => overlayButton(page, "Удалить черновик").click(),
    scope: "[data-slot=dialog-content]",
  },
  {
    name: "bottom Sheet",
    open: (page) => overlayButton(page, "Помочь Бурану").click(),
    scope: "[data-slot=sheet-content]",
  },
  {
    name: "Select list",
    open: (page) => page.locator("#select-value").click(),
    scope: "[data-slot=select-content]",
  },
  {
    name: "DropdownMenu with a submenu",
    open: async (page) => {
      await overlayButton(page, "Действия с нуждой").click();
      await page.getByRole("menuitem", { name: "Статус" }).hover();
      await expect(
        page.getByRole("menuitemradio", { name: "Идёт сбор" }),
      ).toBeVisible();
    },
    scope: "[data-slot=dropdown-menu-content]",
  },
  {
    name: "Popover",
    open: (page) => overlayButton(page, "Как считается остаток").click(),
    scope: "[data-slot=popover-content]",
  },
  {
    name: "Tooltip",
    open: async (page) => {
      await overlayButton(page, "Скопировать ссылку").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
    },
    scope: "[data-slot=tooltip-content]",
  },
  {
    name: "toasts",
    open: async (page) => {
      for (const name of ["Ошибка", "Предупреждение", "С действием"]) {
        await page
          .locator("section[aria-labelledby=feedback]")
          .getByRole("button", { name, exact: true })
          .click();
      }
    },
    scope: "[data-sonner-toast]",
  },
];

/** Waits for finite animations and transitions (fades mix colours for axe). */
async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));
    // Transitions start a frame or two after the open state is set.
    for (let round = 0; round < 10; round += 1) {
      await nextFrame();
      await nextFrame();
      const running = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        );
      if (running.length === 0) return;
      await Promise.all(
        running.map((animation) => animation.finished.catch(() => undefined)),
      );
    }
  });
}

function overlayButton(page: Page, name: string) {
  return page
    .locator("section[aria-labelledby=overlays]")
    .getByRole("button", { name, exact: true });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`open layers have no WCAG 2.1 AA violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openShowcase(page);

    const summary: string[] = [];
    for (const { name, open, scope } of LAYERS) {
      await open(page);
      await expect(page.locator(scope).first()).toBeVisible();
      await settleAnimations(page);
      const { violations } = await new AxeBuilder({ page })
        .include(scope)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      summary.push(
        ...violations.map(
          ({ id, nodes }) =>
            `${name} · ${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
        ),
      );
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    }
    expect(summary).toEqual([]);
  });
}

test("pins real hover styles on previews, stacked variants included", async ({
  page,
}) => {
  await openShowcase(page);

  // «Помочь» lifts on hover through `not-data-disabled:hover:-translate-y-px`.
  const help = page
    .locator("section[aria-labelledby=buttons] [data-preview=hover]")
    .first();
  await expect(help).toHaveText(/Помочь Бурану/i);
  await expect(help).toHaveCSS("translate", "0px -1px");
});

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
    form.getByText(
      "Без согласия на обработку персональных данных мы не сможем принять пожертвование.",
    ),
  ).toBeVisible();

  // What was typed survives a failed submit.
  await amount.fill("50");
  await submit.click();
  await expect(amount).toHaveValue("50");
  await expect(form.getByText("Минимальная сумма — 100 ₽.")).toBeVisible();
});
