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

test("consent boxes start unticked and link to the versions they are about", async ({
  page,
}) => {
  await openShowcase(page);
  const form = page.locator("section[aria-labelledby=form]");
  const boxes = form.getByRole("checkbox");

  // The offer, personal data and the newsletter: none is ticked for the donor.
  await expect(boxes).toHaveCount(3);
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();

  // A monthly donation asks for one more consent, with its sum and period.
  await form.getByRole("radio", { name: "Каждый месяц" }).click();
  await expect(boxes).toHaveCount(4);
  const recurring = form.getByRole("checkbox", { name: /каждый месяц/ });
  await expect(recurring).not.toBeChecked();

  const offer = form.getByRole("checkbox", { name: /Принимаю условия оферты/ });
  const link = form.getByRole("link", { name: /оферты о пожертвовании/ });
  await expect(link).toHaveAttribute("href", "/legal/offer/3");
  await expect(link).toHaveAttribute("target", "_blank");
  // Ticking is the donor's own action — by the box or its sentence.
  await offer.click();
  await expect(offer).toBeChecked();
  await form.getByText("Хочу получать новости приюта").click();
  await expect(
    form.getByRole("checkbox", { name: /Хочу получать новости/ }),
  ).toBeChecked();
  await expect(recurring).not.toBeChecked();
});

// DataTable of the admin (FND-7): the server sorts, filters and pages, the
// table only rewrites the URL.
test.describe("DataTable", () => {
  async function openTable(page: Page, query = "") {
    await page.goto(`/dev/ui${query}`);
    const table = page.getByRole("table", { name: "Операции" });
    await table.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    // Hydrated: see openShowcase().
    await expect(
      page.getByRole("checkbox", { name: "Прислать чек на почту" }),
    ).toBeVisible();
    return table;
  }

  const section = (page: Page) =>
    page.locator("section[aria-labelledby=data-table]");

  /** The «Сумма» column as numbers of rubles, top to bottom. */
  async function amounts(page: Page) {
    const cells = await page
      .getByRole("table", { name: "Операции" })
      .locator("tbody td:last-child")
      .allTextContents();
    return cells.map((text) => Number(text.replace(/[^\d]/g, "")));
  }

  test("sorts on the server and keeps the order in the URL", async ({
    page,
  }) => {
    const table = await openTable(page);
    const date = table.getByRole("columnheader", { name: "Дата" });
    const amount = table.getByRole("columnheader", { name: "Сумма" });
    await expect(date).toHaveAttribute("aria-sort", "descending");
    await expect(table.locator("tbody tr").first()).toContainText("8 октября");

    await amount.getByRole("link").click();
    await expect(page).toHaveURL(/[?&]sort=-amountKop/);
    await expect(amount).toHaveAttribute("aria-sort", "descending");
    await expect(date).not.toHaveAttribute("aria-sort");
    const descending = await amounts(page);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));

    // A link, so the order also opens in a new tab.
    await expect(amount.getByRole("link")).toHaveAttribute(
      "href",
      /[?&]sort=amountKop/,
    );
    await amount.getByRole("link").click();
    await expect(page).toHaveURL(/[?&]sort=amountKop/);
    await expect(amount).toHaveAttribute("aria-sort", "ascending");
    const ascending = await amounts(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(ascending).not.toEqual(descending);
  });

  test("walks through the pages and survives a page past the end", async ({
    page,
  }) => {
    await openTable(page);
    const status = section(page).getByRole("status");
    // Links while there is a page to go to, disabled buttons at the ends.
    const next = section(page).getByRole("link", { name: "Вперёд" });
    const back = section(page).getByRole("link", { name: "Назад" });
    const disabled = (name: string) =>
      section(page).getByRole("button", { name, disabled: true });
    await expect(status).toHaveText("Показаны 1–10 из 57");
    await expect(disabled("Назад")).toBeVisible();

    await next.click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(status).toHaveText("Показаны 11–20 из 57");

    await back.click();
    await expect(page).not.toHaveURL(/page=/);
    await expect(status).toHaveText("Показаны 1–10 из 57");

    await openTable(page, "?page=99");
    await expect(status).toHaveText("Показаны 51–57 из 57");
    await expect(disabled("Вперёд")).toBeVisible();
  });

  test("keeps a change made while the previous one is still loading", async ({
    page,
  }) => {
    const table = await openTable(page);
    // A slow server: every navigation of the table takes a while.
    await page.route(/\/dev\/ui\?.*_rsc=/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });

    const searching = page.waitForRequest(/\/dev\/ui\?.*q=/);
    await section(page).getByRole("searchbox", { name: "Поиск" }).fill("забор");
    await searching;
    // The search is on its way; sort before it arrives.
    await table
      .getByRole("columnheader", { name: "Сумма" })
      .getByRole("link")
      .click();

    await expect(page).toHaveURL(/[?&]sort=-amountKop/);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(section(page).getByRole("status")).toHaveText(
      "Показаны 1–10 из 10",
    );
  });

  test("searches, filters and offers a way out of an empty result", async ({
    page,
  }) => {
    const table = await openTable(page);
    const search = section(page).getByRole("searchbox", { name: "Поиск" });
    const status = section(page).getByRole("status");

    await search.fill("забор");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(status).toHaveText("Показаны 1–10 из 10");
    for (const row of await table.locator("tbody tr").all()) {
      await expect(row).toContainText("Ремонт забора");
    }

    await section(page).getByRole("combobox", { name: "Тип" }).click();
    await page.getByRole("option", { name: "Расход" }).click();
    await expect(page).toHaveURL(/[?&]kind=expense/);
    await expect(status).toHaveText("Показаны 1–5 из 5");

    await search.fill("такого здесь нет");
    await expect(section(page).getByText("Ничего не нашлось")).toBeVisible();
    await expect(table).toHaveCount(0);

    await section(page)
      .getByRole("button", { name: "Сбросить фильтры" })
      .click();
    await expect(page).not.toHaveURL(/[?&](q|kind)=/);
    await expect(status).toHaveText("Показаны 1–10 из 57");
    await expect(search).toHaveValue("");
    // The button is gone with the empty state: the focus went on to the search.
    await expect(search).toBeFocused();
  });
});
