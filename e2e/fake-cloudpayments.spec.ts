import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The CloudPayments emulator (PAYMENT_PROVIDER=fake, the default with a local
// APP_URL): the page donation e2e tests pay on. Every outcome of the widget
// must end on a result screen, with the notifications it sent to our site.

// The first visit compiles the pages in `next dev`.
test.describe.configure({ timeout: 60_000 });

async function startPayment(
  page: Page,
  { amount = "1 500,50", monthly = false } = {},
) {
  await page.goto("/fake-cloudpayments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Эмулятор CloudPayments" }),
  ).toBeVisible();
  // Filled and submitted by scripts: wait until the form is hydrated.
  const monthlyBox = page.getByRole("checkbox", { name: "Ежемесячно" });
  await expect(monthlyBox).toBeVisible();

  await page.getByLabel("Сумма, ₽").fill(amount);
  if (monthly) await monthlyBox.click();
  await page.getByRole("button", { name: "Перейти к оплате" }).click();

  await expect(page).toHaveURL(/\/fake-cloudpayments\/checkout\/[\w-]{22}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Оплата" }),
  ).toBeVisible();
}

/** The terminal doesn't send Check: the charge doesn't depend on our answer. */
async function withoutCheck(page: Page) {
  const check = page.getByRole("checkbox", {
    name: "Отправлять уведомление Check",
  });
  await expect(check).toBeChecked();
  await check.click();
  await expect(check).not.toBeChecked();
}

const notificationLog = (page: Page) =>
  page.getByRole("region", { name: "Уведомления сайту" });

const notifications = (page: Page) =>
  notificationLog(page).getByRole("listitem");

test("pays: a signed Pay notification goes to our endpoint", async ({
  page,
}) => {
  await startPayment(page);
  await expect(page.getByText("1 500,50 ₽")).toBeVisible();
  await withoutCheck(page);

  await page.getByRole("button", { name: "Оплатить" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Оплата прошла" }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Pay");

  await page.getByText("Запрос").click();
  const request = page.locator("pre");
  await expect(request).toContainText("POST /api/webhooks/cloudpayments/pay");
  await expect(request).toContainText(/Content-HMAC: [A-Za-z0-9+/]{43}=/);
  await expect(request).toContainText("Amount=1500.50");
  await expect(request).toContainText("Status=Completed");

  await page.getByRole("link", { name: "Вернуться на сайт" }).click();
  await expect(page).toHaveURL("/fake-cloudpayments");
});

test("declines a payment our Check doesn't approve", async ({ page }) => {
  await startPayment(page);

  // Check is on: the test invoice has no donation behind it, so our site
  // can't answer { code: 0 }, and CloudPayments would decline as well.
  await page.getByRole("button", { name: "Оплатить" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Сайт не подтвердил платёж" }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Check — не принято");
});

test("declines by the bank: a Fail notification", async ({ page }) => {
  await startPayment(page);
  await withoutCheck(page);

  await page.getByRole("button", { name: "Отказ банка" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Банк отклонил платёж" }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Fail");
  await page.getByText("Запрос").click();
  await expect(page.locator("pre")).toContainText("ReasonCode=5051");
});

test("3-D Secure: charges only after the bank's page", async ({ page }) => {
  await startPayment(page);
  await withoutCheck(page);

  await page.getByRole("button", { name: "С 3-D Secure" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Банк просит код из СМС" }),
  ).toBeVisible();
  await expect(notificationLog(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Код верный" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Оплата прошла" }),
  ).toBeVisible();
  await expect(notifications(page)).toContainText("Pay");
});

test("3-D Secure failed: a Fail notification with its own code", async ({
  page,
}) => {
  await startPayment(page);
  await withoutCheck(page);
  await page.getByRole("button", { name: "С 3-D Secure" }).click();

  await page.getByRole("button", { name: "Код неверный" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "3-D Secure не пройден" }),
  ).toBeVisible();
  await page.getByText("Запрос").click();
  await expect(page.locator("pre")).toContainText("ReasonCode=5206");
});

test("a monthly payment starts a subscription", async ({ page }) => {
  await startPayment(page, { amount: "500", monthly: true });
  await expect(
    page.getByText("Подписка: дальше 500 ₽ каждый месяц."),
  ).toBeVisible();
  await withoutCheck(page);

  await page.getByRole("button", { name: "Оплатить" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Оплата прошла" }),
  ).toBeVisible();
  await page.getByText("Запрос").click();
  await expect(page.locator("pre")).toContainText(
    /SubscriptionId=sc_[0-9a-f]{32}/,
  );
});

test("closing the widget sends nothing and can't be paid afterwards", async ({
  page,
}) => {
  await startPayment(page);

  await page.getByRole("button", { name: "Закрыть без оплаты" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Виджет закрыт без оплаты" }),
  ).toBeVisible();
  await expect(notificationLog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Оплатить" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Вернуться на сайт" }),
  ).toBeVisible();
});

test("explains a payment the emulator doesn't remember", async ({ page }) => {
  await page.goto("/fake-cloudpayments/checkout/no-such-payment");

  await expect(
    page.getByRole("heading", { level: 1, name: "Платёж не найден" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Новый тестовый платёж" }).click();
  await expect(page).toHaveURL("/fake-cloudpayments");
});

test("asks for a real amount before opening the widget", async ({ page }) => {
  await page.goto("/fake-cloudpayments");
  const amount = page.getByLabel("Сумма, ₽");
  await expect(
    page.getByRole("checkbox", { name: "Ежемесячно" }),
  ).toBeVisible();

  for (const [value, message] of [
    ["", "Введите сумму, например 500."],
    ["много", "Введите сумму цифрами, например 500 или 1 500,50."],
    ["0", "Сумма должна быть больше нуля."],
    ["10,505", "Копеек — не больше двух знаков после запятой."],
  ] as const) {
    await amount.fill(value);
    await page.getByRole("button", { name: "Перейти к оплате" }).click();

    await expect(page.getByText(message)).toBeVisible();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
  }
  await expect(page).toHaveURL("/fake-cloudpayments");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no WCAG 2.1 AA violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const scan = async () => {
      // Next streams the <title> of a dynamic page after its content.
      await expect(page).toHaveTitle(/эмулятор CloudPayments/i);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      return violations.map(
        ({ id, nodes }) =>
          `${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
      );
    };

    await page.goto("/fake-cloudpayments");
    await expect(
      page.getByRole("checkbox", { name: "Ежемесячно" }),
    ).toBeVisible();
    expect(await scan()).toEqual([]);

    await startPayment(page);
    await expect(
      page.getByRole("checkbox", { name: "Отправлять уведомление Check" }),
    ).toBeVisible();
    expect(await scan()).toEqual([]);

    await page.getByRole("button", { name: "Оплатить" }).click();
    await expect(notifications(page)).toHaveCount(1);
    await page.getByText("Запрос").click();
    expect(await scan()).toEqual([]);
  });
}
