# Тестирование

## Уровни

| Уровень            | Инструмент                                   | Что покрываем                                                                                              |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unit               | Vitest, fast-check                           | Чистая логика: распределение суммы, машина статусов, матрица прав, HMAC, форматирование ₽, склонения, даты |
| Integration        | Vitest + Testcontainers (настоящий Postgres) | Транзакции, триггеры книги, конкурентность вебхуков, идемпотентность, миграции, outbox и задачи воркера    |
| E2E                | Playwright (desktop + mobile)                | Пользовательские сценарии донора, админа, прав                                                             |
| Ручная проверка UI | Браузер (встроенный / Playwright MCP)        | Mobile 375 px и desktop, светлая и тёмная тема, клавиатура, состояния                                      |

## Интеграционные тесты

- Лежат в `tests/integration/**/*.test.ts` (проект Vitest `integration`). Нужен запущенный Docker — тот же, что для `pnpm dev:up`.
- На прогон [Testcontainers](https://node.testcontainers.org/) поднимает один контейнер Mailpit ([«Письма в тестах»](#письма-в-тестах)) и один контейнер `postgres:16.15-alpine` (образ как в `docker-compose.yml`, данные в памяти) и применяет миграции `prisma migrate deploy` к шаблонной базе. Так каждый прогон заодно проверяет, что миграции встают на чистую БД.
- Postgres в контейнере работает в поясе `Europe/Moscow`, а не в UTC — как сервер, где `initdb` взял системный пояс. Клиент, который не закрепил UTC на соединении, сдвигает времена, и тесты это ловят ([architecture.md](architecture.md#соглашения-схемы), [`timezone.test.ts`](../tests/integration/timezone.test.ts)).
- **Каждый тест-файл получает свою чистую базу** — копию шаблона (`CREATE DATABASE … TEMPLATE`, десятки миллисекунд); после файла она удаляется. Файлы идут параллельно и друг другу не мешают. Тесты внутри файла делят одну базу: берите разные ключи и email или учитывайте данные предыдущих тестов.
- БД в тестах — как в приложении: `getDb()` из `@/server/db`. Setup ([`tests/integration/setup/`](../tests/integration/setup/)) направляет `DATABASE_URL` на базу файла, остальные переменные берёт из `.env.example`; локальный `.env` тесты не читают.
- Команды: `pnpm test` — unit и интеграционные; `pnpm test:unit` — без Docker; `pnpm test:integration` — только интеграционные.
- Пример — [`tests/integration/settings.test.ts`](../tests/integration/settings.test.ts) (запись и чтение `Setting`, откат транзакции).
- **Фоновые задачи** — [`tests/integration/jobs/`](../tests/integration/jobs/). Воркер в тестах не запускают: `drainOutbox(getDb(), { handlers })` выполняет все готовые события outbox и возвращается, когда их не осталось; обработчик подменяется через `handlersWith()` ([`helpers.ts`](../tests/integration/jobs/helpers.ts)). Отсрочку повтора не ждём — её проматывает `skipBackoff()`. Тест своего обработчика: вызвать бизнес-функцию, выполнить `drainOutbox`, затем вернуть событие в `PENDING` и выполнить ещё раз — второго письма быть не должно. Для pg-boss — `createBoss()` с `__test__enableSpies` (spy запрашивают **до** отправки задачи: того, что было раньше, он не видит) и `TestClock`, который проматывает время до запуска по расписанию. Настоящий процесс `worker/index.ts` поднимает один тест — [`worker.test.ts`](../tests/integration/jobs/worker.test.ts): запуск, работа, выход по `SIGTERM`.

## Письма в тестах

- **Шаблоны** — unit-тесты рядом с кодом (`src/server/email`). [`render.test.tsx`](../src/server/email/render.test.tsx) проходит по всем примерам всех писем реестра: целый HTML-документ на русском, кириллица не превращена в сущности, нет «дыр» (`undefined`, `NaN`), название приюта — из `SHELTER_NAME`, ссылки ведут только на сайт. Новое письмо попадает под них само, как только у него появились `examples`. Содержание конкретного письма — в его собственном тесте ([`donation-thanks.test.tsx`](../src/server/email/emails/donation-thanks.test.tsx)): варианты текста, суммы, склонения, отказ на неверные данные.
- Проверять удобнее **текстовую версию** письма (`letter.text`): она без разметки и читается как письмо. Неразрывные пробелы из `formatRub` и `formatCount` перед сравнением заменяет `plain()` из [`tests/helpers/text.ts`](../tests/helpers/text.ts) — ожидания пишутся обычными пробелами, а невидимые символы в тестах встречаются только как `\u00A0`.
- **SMTP без Docker** — [`tests/helpers/fake-smtp.ts`](../tests/helpers/fake-smtp.ts): сервер на локальном порту, который принимает письмо и отдаёт его тесту как есть (заголовки, части) или отказывает получателю заданным ответом. На нём проверены заголовки, подпись, защита от подстановки второго адресата и то, что текст ошибки не называет адрес ([`transport.test.ts`](../src/server/email/transport.test.ts)).
- **Почтовый ящик интеграционных тестов** — Mailpit в контейнере: его поднимает [`tests/integration/setup/mailpit.ts`](../tests/integration/setup/mailpit.ts) рядом с Postgres, а `SMTP_HOST` и `SMTP_PORT` каждого тест-файла указывают на него. Письмо теста не уйдёт ни на настоящий сервер, ни в Mailpit от `pnpm dev:up`. Читают ящик через [`tests/helpers/mailpit.ts`](../tests/helpers/mailpit.ts):

  ```ts
  const address = uniqueAddress(); // контейнер общий на все файлы — у теста свой адресат
  // …бизнес-функция пишет событие в outbox…
  await drainOutbox(getDb(), { handlers: outboxHandlers({ sendJob }), logger });
  const [letter] = await waitForInbox(address); // ровно одно письмо
  expect(plain(letter.subject)).toBe(
    "Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
  );
  ```

- **Тест своего письма** ([`tests/integration/email/send.test.ts`](../tests/integration/email/send.test.ts) — образец): событие → одно письмо в ящике; событие вернули в `PENDING` и выполнили ещё раз — письмо по-прежнему одно; повторный `enqueue` с тем же `dedupeKey` — одно; SMTP отказал — в `Outbox.lastError` и в логе нет адреса, после повтора письмо одно.
- Настоящий процесс воркера с настоящим письмом — [`worker-process.test.ts`](../tests/integration/email/worker-process.test.ts): он один ловит ошибки сборки шаблонов под `tsx`, тесты в процессе Vitest их не видят.
- **Вид и доступность** — e2e [`e2e/dev-email.spec.ts`](../e2e/dev-email.spec.ts) на превью `/dev/email`: каждый пример каждого письма проверяется axe (WCAG 2.1 AA) в светлой и тёмной почтовой программе и не должен прокручиваться вбок при ширине 320 и 375 px.

## Обязательные тесты для денег

Любая задача с меткой `money-critical` должна включать:

- **Property-тесты распределения** (fast-check): сумма сохраняется (`toNeed + overflow = amount`), `toNeed ≤ remaining`, ничего не уходит в минус.
- **Конкурентность:** 50 параллельных обработчиков `pay` на одну нужду → собрано = цели, переплата = сумма − цель, ровно один переход в `COLLECTED`.
- **Идемпотентность:** один и тот же вебхук 5 раз → одна проводка.
- **Триггеры:** блокируют UPDATE/DELETE в `Ledger*`, несбалансированную транзакцию, запись в закрытый месяц.
- **Возврат после выполнения нужды** списывается из общего фонда.

Пример — [`tests/integration/ledger/`](../tests/integration/ledger/): триггеры книги (их тесты пишут в таблицы `Ledger*` напрямую, в обход модуля, поэтому каталог исключён из правила `shelter/ledger-boundary`), повторы и параллельные `post`/`reverse`, property-тесты балансов. Тесты одного файла делят базу и общий фонд: проверяйте изменение баланса или заводите свежие счета нужд, а не абсолютные значения. Публикация `MonthlyReport` необратима — тесты закрытого месяца держите в отдельном файле.

## Платежи в тестах

- `FakeCloudPayments` — адаптер `PaymentProvider` для dev и CI, без сети ([payments.md](payments.md#эмулятор-fakecloudpayments)). В тестах он включён сам: `PAYMENT_PROVIDER` в `.env.example` пуст, а `APP_URL` локальный.
- Симулятор подписанных вебхуков — [`tests/helpers/cloudpayments.ts`](../tests/helpers/cloudpayments.ts): `checkWebhook`, `payWebhook`, `failWebhook`, `refundWebhook`, `recurrentWebhook` собирают тело и заголовки так же, как CloudPayments, и подписывают их для провайдера приложения. `webhookRequest(webhook)` — готовый `Request` для обработчика маршрута, `tamper()` — то же тело с подменой и старой подписью, `rawWebhook()` — подписанное произвольное тело.

  ```ts
  const webhook = payWebhook({ invoiceId: donation.id, amountKop: 150_000 });
  const response = await POST(webhookRequest(webhook), { params });
  // повтор того же уведомления — тот же объект; другое списание — новый payWebhook()
  ```

- Уведомления, которые эмулятор шлёт сам (после `refund()`, `cancelSubscription()`, оплаты на его странице), в тестах в сеть не уходят: setup интеграционных тестов вызывает `interceptFakeWebhooks()`, иначе они постучались бы в `pnpm dev`, запущенный на `APP_URL`. Чтобы они дошли до обработчика, передайте его: `const sent = interceptFakeWebhooks((webhook) => POST(webhookRequest(webhook), { params }))`, затем `await provider.settled()` — он же пробросит исключение, если обработчик упал. Пример — [`tests/integration/payments.test.ts`](../tests/integration/payments.test.ts).
- Фикстуры [`tests/fixtures/cloudpayments-webhooks.ts`](../tests/fixtures/cloudpayments-webhooks.ts) — тела всех типов уведомлений с подписями, посчитанными вне нашего кода. На них проверяется адаптер CloudPayments (в том числе матрицей «тело одного типа, присланное на адрес другого, — отказ»); эмулятор проверяется тем же адаптером, чтобы симулятор и разбор не «соглашались» в общей ошибке.
- В e2e оплата идёт через страницу эмулятора ([`e2e/fake-cloudpayments.spec.ts`](../e2e/fake-cloudpayments.spec.ts)): Playwright всегда запускает сервер с `PAYMENT_PROVIDER=fake`, страница есть и в production-сборке.
- Staging: тестовый режим CloudPayments на публичном HTTPS, тестовые карты (успех, отказ, 3DS), рекуррент через API.

## E2E-сценарии MVP

- Донор: пожертвование на нужду → прогресс обновился; сообщение о переплате; ежемесячная подписка и отмена по токен-ссылке.
- Админ: нужда → сбор → расход с чеком → закрытие → строки в публичной книге.
- Права: куратор не может провести расход или опубликовать нужду.
- Вход сотрудников: владелец входит с паролем и TOTP, новый сотрудник сначала настраивает приложение, донор получает 403 в `/admin` ([`e2e/admin-auth.spec.ts`](../e2e/admin-auth.spec.ts)).
- Каркас админки: меню владельца, куратора и координатора; адрес раздела без права отвечает 403, несуществующий — 404; «Настройки» проверяют поля и сохраняются; axe по WCAG 2.1 AA в обеих темах; текстовый шрифт админки ([`e2e/admin-shell.spec.ts`](../e2e/admin-shell.spec.ts)). `DataTable` (сортировка, страницы, поиск и фильтр через адрес) проверяется на витрине — в `e2e/dev-ui.spec.ts`.

E2E ходят в базу приложения: перед прогоном [`e2e/global-setup.ts`](../e2e/global-setup.ts) создаёт тестовых пользователей `e2e-*@shelter.localhost` с известными паролем и TOTP-секретом ([`e2e/support/users.ts`](../e2e/support/users.ts)) — владельца, куратора, координатора и донора — и сбрасывает то, что тесты меняют (вход новых сотрудников, реквизиты и контакты в настройках). Вход в тесте — `signIn(page, email)` из [`e2e/support/sign-in.ts`](../e2e/support/sign-in.ts). Проекты `desktop` и `mobile` идут параллельно по одной базе: тест, который пишет общие данные (настройки), пишет в обоих проектах одни и те же значения. В настоящую базу он писать отказывается: хост должен быть локальным, а владелец из seed — с адресом `@shelter.localhost`. Каждая попытка теста первой настройки TOTP получает своего пользователя, поэтому повтор в CI не упирается в уже настроенный TOTP. TOTP-коды тесты считают сами ([`tests/support/totp.ts`](../tests/support/totp.ts), RFC 6238 — независимо от Better Auth). Каждый тест входит со своего IP (`X-Forwarded-For`), чтобы не упираться в лимит попыток.

- Каталог собак: фильтры работают и сохраняются в URL.

## Соглашения

- Тесты лежат рядом с кодом (`*.test.ts`) для unit; `tests/integration/` — для интеграционных; `e2e/` — Playwright.
- Тестовые данные — фабрики, а не копипаста; seed для dev — отдельно (`prisma/seed.ts`).
- Ни один тест не ходит в реальные внешние сервисы.
- CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)): job `Checks` — format → typecheck → lint → unit и integration → build; интеграционные тесты и в CI поднимают Postgres через Testcontainers (Docker есть на раннере), как локально. Параллельно job `E2E smoke` — Playwright по production-сборке (`node .next/standalone/server.js`), desktop и mobile; перед ним в сервисе Postgres применяются миграции и запускается seed. Локально `pnpm e2e` поднимает `next dev` на порту 3100. Проект `showcase` проверяет страницы `/dev`: витрину `/dev/ui` (`e2e/dev-ui.spec.ts` — axe по WCAG 2.1 AA в обеих темах, Esc и возврат фокуса у Dialog и Sheet, ошибки формы) и превью писем `/dev/email` (`e2e/dev-email.spec.ts`). Они есть только в `next dev`, поэтому в CI рядом с production-сервером Playwright поднимает `next dev` на порту 3101.
