// Checks the built prototype in a real browser: every route at 375 px and
// 1280 px in both themes (no horizontal scroll, no console errors, at most
// one yellow button in view), dead links, and the three client scenarios.
//
//   node prototype/build.mjs && node prototype/tools/check.mjs
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const PUBLIC = [
  "#/",
  "#/home",
  "#/needs",
  "#/needs?show=closed",
  "#/needs?cat=gear&show=going",
  "#/needs/buran-surgery",
  "#/needs/feed-november",
  "#/needs/deworming",
  "#/needs/bowls",
  "#/needs/utilities",
  "#/needs/boards-floor",
  "#/needs/feed-october",
  "#/needs/roof",
  "#/donate",
  "#/dogs",
  "#/dogs?status=rainbow",
  "#/dogs/marta",
  "#/dogs/buran",
  "#/dogs/vega",
  "#/dogs/pirat",
  "#/transparency",
  "#/transparency/ledger",
  "#/transparency/ledger?type=move",
  "#/transparency/expenses/exp-feed",
  "#/transparency/expenses/exp-boards",
  "#/transparency/reports/2026-09",
  "#/map",
  "#/map?zone=vet",
  "#/help",
  "#/guardianship",
  "#/things",
  "#/volunteers",
  "#/stories",
  "#/about",
  "#/documents",
  "#/contacts",
  "#/plan",
  "#/credits",
  "#/admin/login",
  "#/no-such-page",
];

const ADMIN = [
  "#/admin",
  "#/admin/needs",
  "#/admin/needs/new",
  "#/admin/needs/buran-surgery",
  "#/admin/needs/boards-floor",
  "#/admin/needs/boards-floor/expense",
  "#/admin/dogs",
  "#/admin/dogs/marta",
  "#/admin/ledger",
  "#/admin/map",
  "#/admin/more",
];

const problems = [];
const fail = (text) => problems.push(text);

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(await readFile(join(root, "dist/preview.html")));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview.html`;

const browser = await chromium.launch();

async function open(size, dark) {
  const context = await browser.newContext({
    viewport: size,
    colorScheme: dark ? "dark" : "light",
    locale: "ru-RU",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon"))
      fail(`консоль: ${message.text()}`);
  });
  page.on("pageerror", (error) => fail(`ошибка скрипта: ${error.message}`));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

const signIn = async (page) => {
  await page.goto(`${base}#/admin/login`);
  await page.click("#login-next");
  await page.click("#login-enter");
  await page.waitForSelector(".admin-nav");
};

/** Layout facts of the current screen, measured in the page. */
const measure = () => {
  const width = window.innerWidth;
  const scrolls = ".table-wrap, .dogs-strip, .admin-nav, .layer-panel";
  const wide = [...document.querySelectorAll("#app *")]
    .filter((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.right > width + 1 && !el.closest(scrolls);
    })
    .slice(0, 3)
    .map(
      (el) => `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`,
    );
  const yellow = [...document.querySelectorAll(".btn-help")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
  }).length;
  return {
    overflow: document.documentElement.scrollWidth - width,
    wide,
    yellow,
    heading: document.querySelector("h1")?.textContent ?? "",
  };
};

async function sweep(label, size, dark) {
  const { context, page } = await open(size, dark);
  const visit = async (route) => {
    await page.goto(`${base}${route}`);
    await page.waitForTimeout(60);
    const facts = await page.evaluate(measure);
    const where = `${label} ${route}`;
    if (facts.overflow > 0 || facts.wide.length)
      fail(
        `${where}: горизонтальный скролл ${facts.overflow}px ${facts.wide.join(", ")}`,
      );
    if (facts.yellow > 1)
      fail(`${where}: жёлтых кнопок в кадре ${facts.yellow}`);
    if (!facts.heading) fail(`${where}: нет заголовка h1`);
  };
  for (const route of PUBLIC) await visit(route);
  await signIn(page);
  for (const route of ADMIN) await visit(route);
  const check = await page.evaluate(() => window.protoCheck());
  for (const text of check.problems) fail(`${label}: ${text}`);
  await context.close();
  return check.pages;
}

async function scenarios() {
  const { context, page } = await open({ width: 375, height: 812 }, false);
  const expectText = async (selector, text, where) => {
    // The page glues short words with non-breaking spaces: compare without them.
    const content = (
      await page.locator(selector).first().innerText()
    ).replaceAll("\u00a0", " ");
    if (!content.includes(text)) fail(`${where}: нет текста «${text}»`);
  };

  // 1. Home → tab with a sum → consent → payment stand-in → thanks → ledger.
  await page.goto(`${base}#/home`);
  await page.click("#tab-buran-surgery-100000-hero");
  await page.waitForSelector(".layer-panel");
  const inView = await page.evaluate(() => {
    const box = document
      .getElementById("donate-submit")
      .getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  });
  if (!inView)
    fail("сценарий 1: кнопка «Помочь» в шторке не видна без прокрутки");
  await page.click("#donate-submit");
  await expectText(
    ".layer-panel",
    "Без согласия",
    "сценарий 1, ошибка согласия",
  );
  await page.check("#donate-offer");
  await page.click("#donate-submit");
  await page.click("#pay-race");
  await page.waitForSelector(".ok");
  await expectText("main", "Спасибо", "сценарий 1");
  await expectText("main", "общий фонд", "сценарий 1, переплата");
  await page.click('a[href="#/transparency/ledger"]');
  await expectText("main", "НОВОЕ", "сценарий 1, книга операций");

  // The payment can also fail: nothing is charged and the form is kept.
  await page.goto(`${base}#/needs/feed-november`);
  await page.click("#tab-feed-november-250000-hero");
  await page.check("#donate-offer");
  await page.click("#donate-submit");
  await page.click("#pay-fail");
  await page.waitForSelector("#retry");
  await expectText("main", "Деньги не списаны", "сценарий 1, отказ банка");

  // 2. Catalogue → dog → «Хочу забрать» → curator's contacts.
  await page.goto(`${base}#/dogs?sex=f&with=kids`);
  await page.click('.dog a[href="#/dogs/marta"] >> nth=0');
  await page.click("#adopt-marta-profile");
  await page.waitForSelector(".channels");
  await page.click("#channel-phone");
  await expectText(".layer-panel", "+7 (900) 000-00-00", "сценарий 2");
  await page.keyboard.press("Escape");
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== "adopt-marta-profile")
    fail(`сценарий 2: фокус после Esc на «${focused}»`);

  // 3. Admin: new need → publish → donations → purchase → receipt → close → ledger.
  await signIn(page);
  await page.goto(`${base}#/admin/needs/new`);
  await page.click("#save-need");
  await expectText("main", "Назовите нужду", "сценарий 3, пустая форма");
  await page.click("#fill-need");
  await page.click("#save-need");
  await page.waitForSelector('[id^="publish-"]');
  const id = await page.evaluate(() => location.hash.split("/").pop());
  await page.click(`#publish-${id}`);
  await page.click(`#fill-${id}`);
  await page.click(`#work-${id}`);
  await page.click(`a[href="#/admin/needs/${id}/expense"]`);
  await page.click("#fill-expense");
  await page.click("#save-expense");
  await expectText("main", "Закрасьте", "сценарий 3, отметка о ПДн");
  await page.check("#exp-redacted");
  await page.click("#save-expense");
  await page.click(`#finish-${id}`);
  await page.click("#finish-need");
  await page.goto(`${base}#/transparency/ledger?need=${id}`);
  await expectText("main", "Остаток сбора", "сценарий 3, остаток в фонд");
  await page.goto(`${base}#/needs/${id}`);
  await expectText("main", "Выполнено", "сценарий 3, отчёт на сайте");
  await context.close();
}

/** Things a code review once found: they must stay fixed. */
async function regressions() {
  const { context, page } = await open({ width: 1280, height: 900 }, false);
  const text = async (selector) =>
    (await page.locator(selector).first().innerText()).replaceAll(
      "\u00a0",
      " ",
    );

  // The sticky bottom of the donate sheet must not cover the link above it.
  await page.goto(`${base}#/needs/buran-surgery`);
  await page.click("#main-cta");
  await page.click("#donate-more-toggle");
  if (!(await page.locator("#donate-more").count()))
    fail("шторка доната, 1280: ссылка на имя и комиссию перекрыта");

  // Consents are per payment: the next form starts unticked.
  await page.check("#donate-fee");
  await page.check("#donate-offer");
  await page.click("#donate-submit");
  await page.click("#pay-ok");
  await page.waitForSelector(".ok");
  if (!(await text("main")).includes("1 029 ₽"))
    fail("комиссия: в «Спасибо» нет полной суммы 1 029 ₽");
  await page.goto(`${base}#/home`);
  if (!(await text(".today")).includes("Анна — 1 029 ₽"))
    fail("комиссия: в «Сегодня помогли» не полная сумма платежа");
  await page.goto(`${base}#/needs/buran-surgery`);
  await page.click("#main-cta");
  if (await page.isChecked("#donate-offer"))
    fail("согласие осталось отмеченным после прошлого платежа");
  await page.keyboard.press("Escape");

  await signIn(page);

  // Text typed in the admin is shown as text, never as markup.
  await page.goto(`${base}#/admin/dogs/marta`);
  await page.fill(
    "#dog-short",
    '<b id="injected">x</b><img src=x onerror="window.injected=1">',
  );
  await page.click("#save-dog");
  for (const route of ["#/dogs", "#/home", "#/dogs/marta", "#/admin/dogs"]) {
    await page.goto(`${base}${route}`);
    const leaked = await page.evaluate(
      () =>
        Boolean(document.getElementById("injected")) ||
        Boolean(window.injected),
    );
    if (leaked) fail(`${route}: описание собаки попало в разметку`);
  }

  // A need is closed only with a result photo; the fund cannot go below zero.
  await page.goto(`${base}#/admin/needs/boards-floor`);
  if (!(await page.isDisabled("#finish-boards-floor")))
    fail("нужду можно закрыть без фото результата");
  await page.click('a[href="#/admin/needs/boards-floor/expense"]');
  await page.click("#fill-expense");
  await page.fill("#exp-amount", "100000");
  await page.check("#exp-redacted");
  await page.click("#save-expense");
  if (!(await text("main")).includes("столько нет"))
    fail("расход больше общего фонда проведён без ошибки");
  await page.goto(`${base}#/admin/needs/boards-floor`);
  await page.click("#photo-boards-floor");
  await page.click("#finish-boards-floor");
  await page.click("#finish-need");

  // No expenses on a closed need: its money has already gone to the fund.
  await page.goto(`${base}#/admin/needs/boards-floor/expense`);
  if ((await text("h1")).includes("Новый расход"))
    fail("по закрытой нужде открывается форма расхода");
  await context.close();
}

try {
  const pages = await sweep("375 светлая", { width: 375, height: 812 }, false);
  await sweep("375 тёмная", { width: 375, height: 812 }, true);
  await sweep("1280 светлая", { width: 1280, height: 900 }, false);
  await sweep("1280 тёмная", { width: 1280, height: 900 }, true);
  await scenarios();
  await regressions();
  console.log(
    `Маршрутов: ${PUBLIC.length + ADMIN.length} × 4, страниц в самопроверке: ${pages}, сценариев: 3.`,
  );
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Проблем нет.");
