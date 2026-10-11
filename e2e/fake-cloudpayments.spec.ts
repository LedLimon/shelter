import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The CloudPayments emulator (PAYMENT_PROVIDER=fake, see playwright.config.ts):
// the page donation e2e tests pay on. Every outcome of the widget must end on
// a result screen that shows what was sent to our site and what it answered.
//
// The webhook endpoint doesn't exist yet (PAY-3), so every notification gets
// HTTP 404 here, and the emulator says so. When the endpoint appears, the
// expectations marked "PAY-3" change: an accepted Pay reads «Оплата прошла».

// The first visit compiles the pages in `next dev`.
test.describe.configure({ timeout: 60_000 });

// React's warnings (a misused form action, a hydration mismatch) come as
// console errors: none is expected on any screen of the emulator.
let consoleErrors: string[];
test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
});
test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

async function startPayment(
  page: Page,
  { amount = "1 500,50", monthly = false } = {},
) {
  await page.goto("/fake-cloudpayments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Тестовый платёж" }),
  ).toBeVisible();
  // Filled and submitted by scripts: wait until the form is hydrated.
  const monthlyBox = page.getByRole("checkbox", { name: "Ежемесячно" });
  await expect(monthlyBox).toBeVisible();

  await page.getByLabel("Сумма, ₽").fill(amount);
  if (monthly) await monthlyBox.click();
  await page.getByRole("button", { name: "Перейти к оплате" }).click();

  await expect(page).toHaveURL(/\/fake-cloudpayments\/checkout\/[\w-]{22}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Тестовая оплата" }),
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

const payButton = (page: Page) =>
  page.getByRole("button", { name: "Оплатить", exact: true });

const notificationLog = (page: Page) =>
  page.getByRole("region", { name: "Уведомления сайту" });

const notifications = (page: Page) =>
  notificationLog(page).getByRole("listitem");

test("pays: a signed Pay notification goes to our endpoint", async ({
  page,
  baseURL,
}) => {
  await startPayment(page);
  await expect(page.getByText("1 500,50 ₽")).toBeVisible();
  await withoutCheck(page);

  await payButton(page).click();

  // PAY-3: «Оплата прошла» and «Pay — принято: HTTP 200, code 0».
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Оплата прошла, но сайт её не записал",
    }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Pay — не принято: HTTP 404");
  // To this very server: APP_URL is its address.
  await expect(notifications(page)).toContainText(
    `POST ${baseURL}/api/webhooks/cloudpayments/pay`,
  );

  await page.getByText("Запрос Pay").click();
  const fields = notifications(page).getByRole("definition");
  await expect(fields.filter({ hasText: /^1500\.50$/ })).toHaveCount(2);
  const raw = notificationLog(page).locator("pre");
  await expect(raw).toContainText(/Content-HMAC: [A-Za-z0-9+/]{43}=/);
  await expect(raw).toContainText("Amount=1500.50");
  await expect(raw).toContainText("Status=Completed");
  await expect(raw).toContainText("GatewayName=");

  await page.getByRole("link", { name: "Вернуться на сайт" }).click();
  await expect(page).toHaveURL("/fake-cloudpayments");
});

test("declines a payment our Check doesn't approve", async ({ page }) => {
  await startPayment(page);

  // Check is on, and our site doesn't answer { code: 0 } — CloudPayments
  // would decline as well. (After PAY-3 too: the test invoice has no
  // donation behind it.)
  await payButton(page).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Сайт не подтвердил платёж" }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Check — не принято");
  await expect(page.getByText("снимите галочку")).toBeVisible();
});

test("declines by the bank: a Fail notification", async ({ page }) => {
  await startPayment(page);
  await withoutCheck(page);

  await page.getByRole("button", { name: "Отклонить платёж" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Банк отклонил платёж" }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(1);
  await expect(notifications(page)).toContainText("Fail — не принято");
  await page.getByText("Запрос Fail").click();
  await expect(notificationLog(page).locator("pre")).toContainText(
    "ReasonCode=5051",
  );
});

test("a declined payment can be retried: Fail, then Pay of the same order", async ({
  page,
}) => {
  await startPayment(page);
  await withoutCheck(page);
  await page.getByRole("button", { name: "Отклонить платёж" }).click();

  await page.getByRole("button", { name: "Повторить платёж" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Тестовая оплата" }),
  ).toBeVisible();
  await withoutCheck(page);
  await payButton(page).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /^Оплата прошла/ }),
  ).toBeVisible();
  await expect(notifications(page)).toHaveCount(2);
  await expect(notifications(page).nth(0)).toContainText("Fail");
  await expect(notifications(page).nth(1)).toContainText("Pay");
  // The same order, two transactions.
  await page.getByText("Запрос Fail").click();
  await page.getByText("Запрос Pay").click();
  const bodies = await notificationLog(page).locator("pre").allTextContents();
  const field = (body: string, name: string) =>
    new URLSearchParams(body.split("\n\n")[1]).get(name);
  expect(field(bodies[0]!, "InvoiceId")).toBe(field(bodies[1]!, "InvoiceId"));
  expect(field(bodies[0]!, "TransactionId")).not.toBe(
    field(bodies[1]!, "TransactionId"),
  );
});

test("3-D Secure: charges only after the bank's page", async ({ page }) => {
  await startPayment(page);
  await withoutCheck(page);

  await page.getByRole("button", { name: "Оплатить с 3-D Secure" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Банк просит код из СМС" }),
  ).toBeVisible();
  await expect(notificationLog(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Ввести верный код" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /^Оплата прошла/ }),
  ).toBeVisible();
  await expect(notifications(page)).toContainText("Pay");
});

test("3-D Secure failed: a Fail notification with its own code", async ({
  page,
}) => {
  await startPayment(page);
  await withoutCheck(page);
  await page.getByRole("button", { name: "Оплатить с 3-D Secure" }).click();

  await page.getByRole("button", { name: "Ввести неверный код" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "3-D Secure не пройден" }),
  ).toBeVisible();
  await page.getByText("Запрос Fail").click();
  await expect(notificationLog(page).locator("pre")).toContainText(
    "ReasonCode=5206",
  );
});

test("a monthly payment starts a subscription", async ({ page }) => {
  await startPayment(page, { amount: "500", monthly: true });
  await expect(
    page.getByText("Подписка: дальше 500 ₽ каждый месяц."),
  ).toBeVisible();
  await withoutCheck(page);

  await payButton(page).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /^Оплата прошла/ }),
  ).toBeVisible();
  await page.getByText("Запрос Pay").click();
  await expect(notificationLog(page).locator("pre")).toContainText(
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
  await expect(payButton(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Повторить платёж" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Вернуться на сайт" }),
  ).toBeVisible();
});

test("moves the focus to the result, for the keyboard and screen readers", async ({
  page,
}) => {
  await startPayment(page);
  await withoutCheck(page);

  await page.getByRole("button", { name: "Отклонить платёж" }).focus();
  await page.keyboard.press("Enter");

  const result = page.getByRole("heading", {
    level: 1,
    name: "Банк отклонил платёж",
  });
  await expect(result).toBeFocused();
  await expect(page).toHaveTitle(
    "Банк отклонил платёж — эмулятор CloudPayments",
  );
});

test("explains a payment the emulator doesn't remember", async ({ page }) => {
  await page.goto("/fake-cloudpayments/checkout/no-such-payment");

  await expect(
    page.getByRole("heading", { level: 1, name: "Платёж не найден" }),
  ).toBeVisible();
  await expect(page.getByText("Эмулятор", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Начать тестовый платёж" }).click();
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
    ["10,505", "После запятой — не больше двух цифр, например 10,50."],
    ["99999999999", "Слишком большая сумма: не больше 21 474 836,47 ₽."],
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

    await page.getByRole("button", { name: "Оплатить с 3-D Secure" }).click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Сайт не подтвердил платёж",
      }),
    ).toBeVisible();
    await page.getByText("Запрос Check").click();
    expect(await scan()).toEqual([]);
  });
}
