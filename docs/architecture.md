# Архитектура

## Стек

| Слой              | Выбор                                                                                      | Примечание                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Фреймворк         | Next.js (App Router), TypeScript strict                                                    | `output: standalone` для Docker                                                      |
| UI                | Tailwind CSS v4, shadcn/ui (`base-nova` на Base UI), lucide-react                          | Токены через CSS-переменные, светлая/тёмная тема; Base UI, а не Radix                |
| Формы             | react-hook-form + zod                                                                      | zod-схемы общие для клиента и server action                                          |
| Таблицы в админке | TanStack Table                                                                             |                                                                                      |
| Редактор текста   | Tiptap                                                                                     | Новости, истории, отчёты                                                             |
| БД                | PostgreSQL 16 + Prisma                                                                     | Денежные инварианты — триггерами в raw SQL миграции                                  |
| Auth              | Better Auth + Prisma adapter                                                               | Сотрудники: пароль + TOTP. Доноры: код на email                                      |
| Фоновые задачи    | Outbox + pg-boss (на Postgres, без Redis)                                                  | Отдельный процесс `worker` из того же репо ([ADR-0007](adr/0007-outbox-and-jobs.md)) |
| Файлы             | S3-совместимое: MinIO (dev), Yandex Object Storage + CDN (prod)                            | Загрузка по presigned URL                                                            |
| Картинки          | sharp в воркере                                                                            | WebP/AVIF, размеры, blur, удаление EXIF/GPS                                          |
| Email             | React Email + Unisender Go или Yandex Cloud Postbox                                        | Mailpit в dev                                                                        |
| Платежи           | CloudPayments                                                                              | За интерфейсом `PaymentProvider` ([ADR-0002](adr/0002-cloudpayments.md))             |
| Тесты             | Vitest, Testcontainers (Postgres), Playwright, fast-check                                  | См. [testing.md](testing.md)                                                         |
| Мониторинг        | GlitchTip (self-hosted), Uptime Kuma, Яндекс Метрика (после согласия на cookie)            |                                                                                      |
| Хостинг           | В РФ: Yandex Cloud или VPS Selectel/Timeweb + Docker Compose + управляемый Postgres, Caddy | [ADR-0004](adr/0004-hosting-ru.md)                                                   |

## Структура кода

```
src/
  app/                    # маршруты Next.js
    (public)/             # публичный сайт
    admin/                # админка (guard в middleware + layout)
    account/              # кабинет донора
    api/                  # route handlers: вебхуки, upload, трекинг
  server/                 # бизнес-логика, только сервер ("server-only")
    db/                   # prisma client, транзакции
    auth/                 # better auth, permissions.ts (can())
    ledger/               # ЕДИНСТВЕННЫЙ модуль, который пишет в Ledger* и читает их
    payments/             # PaymentProvider, cloudpayments, fake
    needs/ dogs/ donations/ subscriptions/ inkind/ volunteer/ content/ legal/
    jobs/                 # outbox (enqueue и диспетчер), задачи pg-boss, сборка воркера
    email/                # шаблоны React Email, отправка
    audit/                # запись AuditLog
  components/
    ui/                   # shadcn
    <домен>/              # доменные компоненты (NeedCard, DogCard, ...)
  lib/                    # общие утилиты: money.ts, plural.ts, dates.ts
worker/                   # точка входа фонового процесса (pnpm worker)
prisma/                   # schema.prisma, migrations/, seed.ts
eslint/                   # свои правила ESLint (shelter/ledger-boundary)
e2e/                      # Playwright
```

Правила:

- Страницы и server actions — тонкие: валидация (zod) → `can()` → вызов `src/server/<домен>` → `revalidateTag`.
- Публичные страницы — Server Components + ISR, теги вида `need:{id}`, `dog:{id}`, `needs`, `dogs`, `ledger`.
- Побочные эффекты (письма, уведомления) — через **outbox**: запись в таблицу `Outbox` в той же транзакции, что и бизнес-данные, воркер отправляет. Как — в разделе [«Фоновые задачи»](#фоновые-задачи-worker).

## Модель данных

Схема — [`prisma/schema.prisma`](../prisma/schema.prisma), миграции — `prisma/migrations/`. Ниже — целевая модель: в схеме пока только то, что уже сделано задачами.

### Соглашения схемы

- **Имена.** Модель — PascalCase в единственном числе (`Need`, `LedgerEntry`), поле — camelCase, enum — PascalCase, значения enum — `UPPER_SNAKE`. В БД имена те же, без `@map` / `@@map`: таблица `"Need"`, колонка `"goalKop"`. В raw SQL (триггеры, `$queryRaw`) — в двойных кавычках.
- **`id`** — `String @id @default(cuid(2))`: 24 символа, не угадывается и не выдаёт порядок записей, поэтому годится для публичных URL (`/donate/status/[id]`). Строка, а не `uuid`, — в raw SQL не нужно приведение `::uuid`. Естественный ключ вместо `id` — только у справочников (`Setting.key`).
- **Время** — `DateTime @db.Timestamptz(3)`, хранится в UTC, в часовой пояс приюта переводится только при показе. `createdAt @default(now())` и `updatedAt @updatedAt` — у всех изменяемых моделей; у append-only (`Ledger*`) — только время создания или проводки. `@default(now())` Prisma вычисляет в приложении, а не в БД; где нужно время БД (момент проводки) — `@default(dbgenerated("transaction_timestamp()"))`. Это та же функция, что `now()`, но `dbgenerated("now()")` Prisma читает из базы как `@default(now())` и видит расхождение со схемой. В SQL часовой пояс указываем явно (`AT TIME ZONE`): `date_trunc` и `to_char` зависят от `TimeZone` сессии.
  - **Соединение с БД — в UTC, независимо от пояса сервера.** `@prisma/adapter-pg` отправляет параметры `Date` без смещения, а у прочитанных `timestamptz` подменяет смещение на `+00:00`, то есть рассчитывает на `TimeZone` сессии = UTC. На сервере с другим поясом по умолчанию (`initdb` берёт системный, например МСК) все времена молча сдвинулись бы: `2026-10-01T00:00Z` записался бы как `2026-09-30 21:00 UTC`, `now()` читался бы на 3 часа вперёд, а вместе с ними — `balance(at)` и границы закрытых месяцев книги. Поэтому `createPrismaClient()` (`@/server/db/client`) добавляет `-c TimeZone=UTC` в `options` строки подключения — последним, так что `options` из `DATABASE_URL` сохраняются, а `TimeZone` из них проигрывает. Клиенты Prisma создаются только через неё: импорт `@prisma/adapter-pg` в других местах запрещает ESLint.
  - Пояс сессии в коде не меняем (`SET [LOCAL] TIME ZONE`, `set_config('TimeZone', …)`): adapter-pg сразу начнёт сдвигать время, а без `LOCAL` настройка ещё и останется на соединении пула для чужих запросов. Raw SQL не должен возвращать `timestamp` без пояса: `date_trunc('month', "postedAt" AT TIME ZONE 'Europe/Moscow')` adapter-pg прочитает как время в UTC. Возвращайте `timestamptz` (`date_trunc('month', "postedAt", 'Europe/Moscow')`) или текст. Литералы времени в SQL миграций — только со смещением (`'2026-10-01 00:00+03'`): Prisma CLI подключается без закрепления UTC.
  - `ALTER DATABASE … SET timezone = 'UTC'` в миграции не делаем. Параметр соединения сильнее настроек базы и роли, так что при работающем закреплении он ничего не добавляет. До баз интеграционных тестов настройка не дошла бы (`CREATE DATABASE … TEMPLATE` её не копирует), а при восстановлении из дампа без `pg_dump --create` она теряется. Остальным клиентам (`psql`, `pg_dump`, node-postgres у pg-boss) он не нужен: они передают и читают смещение сами, а пояс сессии влияет у них на показ и на значения без смещения (литералы, `::date`, `date_trunc`). Остаётся риск, что пулер соединений молча отбросит `options` (как PgBouncer с `ignore_startup_parameters = options`); от него — проверка `TimeZone` при старте приложения и пояс UTC у сервера БД в продакшне ([FND-15](https://github.com/LedLimon/shelter/issues/114)). Интеграционные тесты поднимают Postgres в поясе `Europe/Moscow` ([testing.md](testing.md#интеграционные-тесты)).
- **Деньги** — `Int` в копейках, поле с суффиксом `Kop` (`goalKop`, `amountKop`). В Postgres это `integer`: до 21 474 836,47 ₽ в одном значении; накопительные итоги в `Int` не храним. Суммы положительные, кроме `LedgerEntry.amountKop` (со знаком). Суммы внутри JSON (например, в `Setting`) — тоже целые копейки с суффиксом `Kop`.
  - **Prisma не отклоняет дробное значение для `Int`, а молча отбрасывает дробную часть** (`1998.9999…` → `1998`, `NaN` в необязательном поле → `NULL`). Поэтому сумма проверяется до записи — zod `.int()` / `Number.isSafeInteger`, а рубли из внешних источников переводятся в копейки только общим хелпером.
  - `SUM()` в raw SQL возвращает `bigint` (в TS — `bigint`, в `number` переводите явно) и `NULL` на пустом наборе — нужен `COALESCE`. `SUM(x::bigint)` и `AVG()` возвращают `Prisma.Decimal` — для денег не используем. `aggregate({ _sum })` возвращает `number`.
- **Удаление.** Сущности с историей (пользователи, пожертвования) не удаляются — `deletedAt` или статус. Внешние ключи — `onDelete: Restrict`. Prisma ставит его по умолчанию **только у обязательных** связей, у необязательных (`needId String?`) — `SetNull`, и удаление нужды молча отвязало бы от неё пожертвования. Поэтому у необязательных связей `onDelete` пишем всегда: `Restrict` — для денег и всего, у чего есть история; `SetNull` — только для ссылок вроде «кто загрузил».
- **Индексы.** Postgres не индексирует внешние ключи сам — у каждого FK-поля `@@index`.
- **Связи с книгой.** Поле связи с моделью `Ledger*` называется по ней: `ledgerAccount`, `ledgerTransaction(s)`, `ledgerEntry`/`ledgerEntries`. Правило `shelter/ledger-boundary` не пускает такие ключи за пределы `src/server/ledger` (в `include`, вложенные записи, деструктуризацию), поэтому эти имена зарезервированы: свои поля и пропсы называйте иначе (`entries`, `rows`). Колонка внешнего ключа (`ledgerAccountId`) — обычное поле.
- **JSON** (`Json` → `jsonb`) — только для данных, по которым не фильтруют: настройки, payload событий, тексты Tiptap. Форма значения — zod-схема в коде, как в [`src/server/settings/schema.ts`](../src/server/settings/schema.ts). Сохранённые значения проверяются при чтении, поэтому новое поле в схеме — с `.optional()` / `.default()` или вместе с миграцией данных.
- **Email** хранится в нижнем регистре (CHECK в БД) — так уникальность не зависит от регистра.
- **Чего нет в Prisma** (CHECK, триггеры, частичные индексы) — raw SQL в той же миграции: `pnpm db:migrate --create-only --name <имя>`, дописать SQL в `migration.sql`, затем `pnpm db:migrate`. Миграцию, попавшую в `main`, не редактируем — только новая миграция. Если `schema.prisma` поменяли без миграции, интеграционные тесты падают.

### Доступ к БД

- `getDb()` из `@/server/db` — общий клиент процесса (`server-only`). Создаётся при первом вызове, а не при импорте: `next build` идёт без `DATABASE_URL`.
- Функции доменов принимают `db: Db` — клиент или `tx` из `db.$transaction(async (tx) => …)`, чтобы вызывающий мог объединить несколько вызовов в одну транзакцию. Тип не отличает клиент от `tx`: функция, которой транзакция обязательна (`FOR UPDATE`, проводки), проверяет это сама.
- Prisma Client генерируется в `src/generated/prisma` (не в git): `prisma generate` запускают `pnpm install` и `pnpm db:migrate`. Модели, типы и enum на сервере импортируем из `@/generated/prisma/client`, в клиентских компонентах — из `@/generated/prisma/browser`.
- Модули с `import "server-only"` (`@/server/db`, `@/server/settings` …) за пределами Next.js не загружаются: пакета `server-only` в зависимостях нет, Next подставляет его сам, Vitest — заглушкой из `tests/stubs/`. Seed поэтому берёт клиент из `createPrismaClient(url)` (`@/server/db/client`, без `server-only`). Воркер запускается с `tsconfig.worker.json`, где `server-only` указывает на пустой модуль [`worker/server-only.ts`](../worker/server-only.ts): доменные модули и `getDb()` работают в нём так же, как в приложении.
- **Ключи advisory-блокировок** (`pg_advisory_xact_lock`) — общие на всю базу, поэтому реестр здесь; новый ключ — сюда же:
  - `3700000001` — блокировка периода книги, `ledger_period_lock_key()` ([ledger.md](ledger.md#инварианты)).
  - pg-boss берёт свои advisory-блокировки сам; его ключи — 64-битные хеши имени базы и схемы, с нашими не пересекаются.
- **Схема `pgboss`** в той же базе — таблицы pg-boss (очереди, задачи, расписания). Её создаёт и обновляет сам pg-boss при старте воркера; в `schema.prisma` и миграциях Prisma её нет, руками и из приложения её не трогаем.
- `pnpm db:seed` ([`prisma/seed.ts`](../prisma/seed.ts)) создаёт настройки по умолчанию и владельца: пока в базе нет активного `OWNER`, им становится пользователь `SEED_OWNER_EMAIL` (создаётся, если его нет). Дальше роли меняются только в админке. Повторный запуск добавляет недостающее и не трогает то, что уже правили.

### Идентичность

- `User`: email (unique), emailVerified, name, phone?, role (`DONOR | VOLUNTEER | COORDINATOR | EDITOR | ADMIN | OWNER`), twoFactorEnabled, deletedAt + таблицы Better Auth: `Session` (с флагом `twoFactorVerified`), `Account` (хеш пароля), `Verification`, `TwoFactor`, `RateLimit`. Имена полей — как ждёт Better Auth (он сверяет их со схемой при старте), id — `cuid(2)` из схемы (`generateId: false`). У таблиц входа `onDelete: Cascade`: истории в них нет, а пользователей мы всё равно не удаляем.
- `StaffProfile`: userId, каналы связи (telegram, whatsapp, max, vk, phone), showPublicly.

### Собаки

- `Dog`: slug, name, sex, birthDate + birthDatePrecision, size, color, status (`LOOKING_FOR_HOME | ON_TREATMENT | RESERVED | AT_FOSTER | ADOPTED | RAINBOW`), temperament `String[]` (good_with_kids / cats / dogs, active, calm…), health, sterilized, chipped, story (JSON Tiptap), arrivedAt, curatorId, published, guardianshipEnabled, guardianshipGoalKop.
- `Vaccination`: dogId, type, date, nextDue.
- `DogUpdate`: dogId, body, visibility (`PUBLIC | GUARDIANS`), publishedAt, notifiedAt.
- `AdoptClick`: dogId, channel, sessionHash (соль, ротация раз в сутки, без ПДн), utm, createdAt.

### Медиа

- `Media`: storageKey, mime, width, height, blur, kind (`PHOTO | RECEIPT | INVOICE | DOCUMENT`), redacted, uploadedById.
- Join-таблицы с `position`: `DogMedia` (isCover), `NeedMedia`, `ExpenseMedia` (role `RECEIPT | INVOICE | RESULT`), `DogUpdateMedia`.

### Нужды

- `Need`: slug, title, description, category, urgency (`CRITICAL | HIGH | NORMAL | LOW`), dogId?, goalKop, collectedKop (кэш), inKindKop (кэш), status (`DRAFT | COLLECTING | COLLECTED | IN_PROGRESS | DONE | CANCELLED`), deadline?, collectedAt, purchasedAt, doneAt, unitLabel?, unitPriceKop?, quantityGoal?, ledgerAccountId (unique), reportBody, version.
- `NeedStatusEvent`: needId, from, to, actorId, note, at — публичный таймлайн.

### Деньги

- `Donation`: id (= InvoiceId у провайдера), provider, providerTxId (unique), userId?, email, displayName?, anonymous, comment, amountKop, overflowKop, refundedKop, target (`NEED | GENERAL | GUARDIANSHIP`), needId?, dogId?, subscriptionId?, status (`PENDING | SUCCEEDED | FAILED | REFUNDED | PARTIALLY_REFUNDED`), source (`WIDGET | RECURRING | MANUAL_BANK | CASH`), method, offerDocId, paidAt.
- `Subscription`: kind (`GENERAL_MONTHLY | GUARDIANSHIP`), dogId?, userId?, email, amountKop, providerSubscriptionId (unique), status (`ACTIVE | PAST_DUE | CANCELLED | EXPIRED`), nextChargeAt, failedCount, manageTokenHash, replacesId?, cancelledAt, cancelReason.
- `WebhookEvent`: dedupeKey (unique, напр. `cp:pay:{TransactionId}`), type, rawBody, signatureOk, status (`RECEIVED | PROCESSED | FAILED | DEFERRED`), error, attempts.
- Книга операций — `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, `Expense`, `MonthlyReport` — подробно в [ledger.md](ledger.md).

### Помощь вещами и волонтёрство

- `InKindPledge`: needId?, userId?, name, contact, item, qty, estValueKop, channel (`OZON | WB | YANDEX_MARKET | IN_PERSON`), orderRef, expiresAt, status (`PLEDGED | IN_TRANSIT | RECEIVED | CANCELLED | EXPIRED`), receivedQty, confirmedValueKop, receivedById.
- `VolunteerProfile`: userId, phone, telegram, skills[], hasCar, canFoster, adultConfirmed.
- `Shift`: type, startsAt, endsAt, capacity, coordinatorId. `ShiftSignup`: unique (shiftId, userId), status (`BOOKED | CANCELLED | ATTENDED | NO_SHOW`).
- `HelpTask`: type (`VET_RIDE | FOSTER | PICKUP`), dogId?, when, from, to, status, assigneeId.

### Комплаенс и контент

- `LegalDocument`: type (`OFFER | PRIVACY | PD_CONSENT | RECURRING | MARKETING`), version, body, sha256, effectiveAt.
- `ConsentRecord`: email | userId, documentId, context, ip, ua, givenAt, withdrawnAt.
- `AuditLog`: actorId, action, entity, entityId, diff, ip, at.
- `Post` (новости, истории «Они дома»), `Page`.

### Служебные

- `Setting`: key, value (JSON) — часовой пояс, реквизиты, контакты, готовые суммы доната. Ключи и формы значений — `src/server/settings/schema.ts`, чтение и запись — `getSetting()` / `setSetting()` из `@/server/settings`. Часовой пояс приюта для показа дат — настройка `shelter.timezone`; переменная `SHELTER_TIMEZONE` — её начальное значение (seed) и запасное, пока настройки нет.
- `Outbox`: type, payload, dedupeKey (unique), status (`PENDING | PROCESSED | FAILED`), attempts, availableAt, lastError, processedAt — побочные эффекты после коммита (правило в [«Структуре кода»](#структура-кода)), выполняет [воркер](#outbox). Пишет в таблицу только `outbox.enqueue()`, меняет статусы только диспетчер. `attempts` — сколько попыток начато; `availableAt` — «не раньше этого времени» (отсрочка повтора и аренда события воркером), по часам БД. Строки не удаляются: `dedupeKey` защищает от повторной отправки навсегда. В payload — только id, без ПДн: обработчик сам загружает email и имя; в lastError ПДн тоже не пишем.

## Маршруты

**Публичные**

- `/` · `/needs` · `/needs/[slug]` · `/dogs` · `/dogs/[slug]` · `/donate` · `/donate/status/[id]` · `/guardianship` · `/help/in-kind`
- `/transparency` · `/transparency/ledger` · `/transparency/reports/[yyyy-mm]` · `/transparency/expenses/[id]`
- `/news` · `/news/[slug]` · `/stories` · `/about` · `/documents` · `/contacts` · `/how-to-help`
- `/legal/offer` · `/legal/privacy` · `/legal/consent` · `/legal/recurring`
- `/volunteer` · `/volunteer/shifts` · `/volunteer/tasks`
- `/account` (вход) · `/account/donations` · `/account/subscriptions` · `/account/wards` · `/account/volunteer` · `/account/settings`
- `/subscriptions/manage?token=…` — управление подпиской без аккаунта
- API: `/api/webhooks/cloudpayments/[type]` · `/api/track/adopt` · `/api/upload/presign` · `/api/donations/[id]/status`
- `sitemap.xml`, `robots.txt`, OG-картинки (`next/og`)

**Админка** `/admin`

- дашборд · `needs` · `dogs` · `donations` (+ `manual`) · `subscriptions` · `expenses` · `ledger` · `reports` · `in-kind` · `volunteers` · `shifts` · `tasks` · `content` · `legal` · `users` · `settings` · `audit` · `webhooks`

## Фоновые задачи (worker)

Отдельный процесс из того же репозитория: `pnpm worker` ([`worker/index.ts`](../worker/index.ts)). Он делает две вещи:

- **разбирает outbox** — выполняет побочные эффекты, которые приложение записало вместе с бизнес-данными;
- **выполняет задачи pg-boss** — по расписанию и по запросу.

Приложение (Next.js) в pg-boss не ходит: всё, что должно случиться после коммита, оно пишет в таблицу `Outbox`. Почему так — [ADR-0007](adr/0007-outbox-and-jobs.md). Код — [`src/server/jobs`](../src/server/jobs).

### Outbox

```ts
import { outbox } from "@/server/jobs";

await db.$transaction(async (tx) => {
  // …бизнес-изменения…
  await outbox.enqueue(
    tx,
    "donation.thanks",
    { donationId },
    { dedupeKey: `donation.thanks:${donationId}` },
  );
});
```

- Событие пишется в транзакцию вызывающего: откатилась она — события нет, закоммитилась — воркер его выполнит.
- Типы событий и формы payload (zod) — [`outbox/events.ts`](../src/server/jobs/outbox/events.ts), обработчики — [`handlers.ts`](../src/server/jobs/handlers.ts). Новое событие — запись в обоих файлах: без обработчика TypeScript не соберёт проект. Payload проверяется при записи и ещё раз перед обработчиком. В таблице лежат события прошлых версий кода, поэтому форму payload меняем совместимо (`.optional()`, `.default()`).
- **Доставка — «хотя бы один раз».** Одно событие в один момент выполняет один воркер, но если обработчик сделал дело, а записать результат не успел (процесс убили, вышло время), событие выполнится снова. Поэтому обработчик идемпотентен: `context.eventId` один и тот же на всех попытках — используйте его как ключ. Порядок событий не гарантируется.
- `dedupeKey` — одно событие на ключ: повторный `enqueue` (вебхук пришёл дважды, действие повторили) ничего не пишет и возвращает `null`. Строки из `Outbox` не удаляются, поэтому ключ занят навсегда.
- **Диспетчер** ([`outbox/dispatcher.ts`](../src/server/jobs/outbox/dispatcher.ts)) раз в секунду забирает готовые события — до 5 одновременно на процесс. Забрать — значит одним запросом (`FOR UPDATE SKIP LOCKED`) увеличить `attempts` и отодвинуть `availableAt` на 3 минуты: это аренда, пока она не истекла, другой воркер событие не увидит. На обработчик — 2 минуты, потом попытка считается неудачной, а `context.signal` прерывается (передавайте его в сетевые вызовы).
- **Ошибка обработчика** → повтор через 1, 2, 4, 8 … минут, но не больше 4 часов; `lastError` хранит причину. После 10-й неудачной попытки (около 8 часов) событие получает статус `FAILED` и больше не выполняется. Неизвестный тип события или payload, не прошедший схему, повторяются так же: во время деплоя воркер может быть на версию старше приложения.
- **Логи** (stdout процесса): `[outbox] <тип> <id>: done (attempt 1)`; на каждую неудачу — предупреждение `attempt 2 of 10 failed, next in 120 s: <ошибка>`; на `FAILED` — ошибка `FAILED after 10 attempts: <ошибка>`. Текст ошибки проходит через `describeError()`: email и длинные числа маскируются, сообщения Prisma (в них попадают аргументы запроса) заменяются кодом. Имена и адреса так не поймать — не кладите их в текст ошибок.
- **Время — по часам БД** (`now()`), и в диспетчере, и в значении `availableAt` по умолчанию: часы приложения, воркера и базы могут расходиться.
- Вернуть `FAILED`-событие в работу, пока в админке нет такой кнопки: `UPDATE "Outbox" SET "status" = 'PENDING', "attempts" = 0, "availableAt" = now() WHERE "id" = '…'`.

### Задачи pg-boss

Задача — очередь pg-boss с тем же именем. Описание — [`definitions.ts`](../src/server/jobs/definitions.ts): форма payload (zod), расписание, настройки очереди; обработчик — в [`handlers.ts`](../src/server/jobs/handlers.ts). Пример — задача `noop`.

```ts
// definitions.ts
"ledger.integrity": defineJob({
  payload: z.object({}),
  schedule: { cron: "0 4 * * *" },
  queue: { policy: "singleton" },
}),
```

- **Расписание** — cron из пяти полей (точность — минута) в часовом поясе приюта: настройка `shelter.timezone`, а пока её нет — `SHELTER_TIMEZONE`. Пояс читается при старте воркера. Запуск, пропущенный из-за деплоя или простоя, выполняется один раз, когда воркер вернётся (`missed: "once"`, для каждой задачи можно `"skip"`). При нескольких воркерах запуск всё равно один. Расписания задач, которых больше нет в коде, воркер удаляет при старте.
- **Запуск из приложения** (ручной запуск из админки, тяжёлая работа после записи) — `enqueueJob(tx, "имя", payload)` из `@/server/jobs`. Он идёт через outbox событием `job.run`: задача стартует тогда и только тогда, когда транзакция закоммитилась, а повторная доставка события второй задачи не создаёт (id задачи выводится из id события).
- **Повторы**: по умолчанию 3 повтора — через 1–2, 2–4 и 4–8 минут (pg-boss добавляет случайную добавку), на одно выполнение — 15 минут; дальше задача остаётся в состоянии `failed`. Запуск, не уложившийся во время, pg-boss считает неудачным сам, а обработчик при этом продолжает работать, если не следит за `context.signal`. Настройки меняются полем `queue` (`retryLimit`, `expireInSeconds`, `policy` …) и применяются к существующей очереди при старте воркера — кроме `policy`, её pg-boss менять не даёт. Логи — как у outbox, с префиксом `[jobs]`; запуск, оборванный по времени или остановкой воркера, пишется как неудача (`cut off while running`).
- Обработчик тоже может выполниться повторно — идемпотентность обязательна.
- Payload и событий, и задач — простой JSON: без `.transform()`, дат и приведения типов. Он проверяется схемой на каждом шаге заново (при записи, после чтения из `Outbox`, в воркере), каждый раз из результата предыдущего.
- Только [`boss.ts`](../src/server/jobs/boss.ts) импортирует `pg-boss` (остальным запрещает ESLint), и только воркер его запускает. Версия pg-boss закреплена: при обновлении он сам мигрирует схему `pgboss` при старте воркера.

### Запуск

- **Разработка:** `pnpm worker` во втором терминале рядом с `pnpm dev`; `.env` он читает сам. Без воркера события копятся в `Outbox` со статусом `PENDING` и выполнятся, когда он запустится.
- Процесс запускает `tsx` с `tsconfig.worker.json`. При старте он проверяет те же переменные окружения, что и приложение, создаёт или обновляет схему `pgboss`, регистрирует задачи и расписания. Если база недоступна или окружение неверно — завершается с кодом 1: перезапускает его Docker (`restart`).
- **Остановка:** по `SIGTERM` и `SIGINT` (Ctrl+C) воркер перестаёт брать новую работу — и события, и задачи — и до 25 секунд ждёт начатую, потом выходит с кодом 0. Что не успело — выполнится снова: событие — после истечения аренды, задача — как повтор. Если остановка зависла (например, база не отвечает), через 28 секунд процесс выходит сам с кодом 1. Контейнеру нужен `stop_grace_period` не меньше 30 секунд (по умолчанию Docker ждёт 10). Повторный сигнал через пару секунд после первого завершает процесс сразу.
- Воркеров может быть несколько: события и задачи между ними не дублируются. Но все они должны быть одной версии: при старте воркер удаляет расписания, которых нет в его коде, поэтому при деплое старый воркер останавливается до запуска нового.
- **Соединения с БД:** у воркера два пула — Prisma и pg-boss, до 10 соединений каждый.
- **Права в БД:** роли воркера нужно право создать схему `pgboss` при первом старте (или готовая схема, которой она владеет) — учесть при разделении ролей ([LED-7](https://github.com/LedLimon/shelter/issues/110)).
- **Тесты и CI:** отдельный процесс не нужен — интеграционные тесты вызывают диспетчер и pg-boss в своём процессе, а один тест запускает настоящий `worker/index.ts` ([testing.md](testing.md#интеграционные-тесты)).

### Какие задачи будут

| Задача                                            | Когда               | Механизм |
| ------------------------------------------------- | ------------------- | -------- |
| Отправка писем                                    | по событию          | outbox   |
| Обработка загруженных картинок (sharp)            | по событию загрузки | outbox   |
| Сверка с реестром CloudPayments, импорт комиссий  | ежедневно           | pg-boss  |
| Проверка целостности книги и кэшей `collectedKop` | еженощно            | pg-boss  |
| Напоминание о списании за 3 дня                   | ежедневно           | pg-boss  |
| Истечение обещаний «помощи вещами»                | ежедневно           | pg-boss  |
| Дайджест опекунам                                 | еженедельно         | pg-boss  |
| Напоминания о сменах волонтёрам                   | ежедневно           | pg-boss  |

Задача по расписанию, которой нужно разослать письма, сама ничего не отправляет: она пишет события в outbox.

## Переменные окружения

- Схема — `src/lib/env/schema.ts` (zod). Серверные переменные читаются через `getEnv()` из `@/lib/env`, браузерные (`NEXT_PUBLIC_*`) — через `getPublicEnv()` из `@/lib/env/public`. Напрямую `process.env` не читаем (кроме служебных `NODE_ENV` и `NEXT_RUNTIME` и конфигов инструментов в корне: `prisma.config.ts` берёт `DATABASE_URL` сам, потому что `prisma generate` должен работать без него).
- Проверка — при старте сервера (`src/instrumentation.ts`): если переменная не задана или неверна, процесс перечисляет проблемы (имена, без значений) и завершается с кодом 1. `next build` переменных не требует — Docker-образ собирается без секретов. Поэтому `getEnv()` вызываем внутри функций, а не на уровне модуля: при сборке Next импортирует модули маршрутов.
- `NEXT_PUBLIC_*` вшиваются в сборку. Значения, которые различаются между staging и prod (ключи, ID счётчиков), передаём из Server Components, а не через `NEXT_PUBLIC_*`.
- Новая переменная — в схему и в `.env.example` (unit-тест сверяет их). Пустое значение (`FOO=`) считается незаданным.
- Локальные сервисы (Postgres, MinIO, Mailpit) — `docker-compose.yml`, порты и доступы — в [README](../README.md#dev-окружение).

## Безопасность

- Сотрудники — TOTP обязателен; `/admin` закрыт в proxy и в layout. Подробно — [«Вход сотрудников»](#вход-сотрудников).
- Rate limit (на Postgres) для форм доната, входа, upload.
- Вебхуки — проверка HMAC по **сырому** телу (`await req.text()`), Node runtime.
- Загрузки: лимит размера, проверка MIME, удаление EXIF/GPS, HEIC конвертируется в браузере.
- Каналы куратора: телефон раскрывается по клику (против скрейпинга).

### Вход сотрудников

Better Auth ([`src/server/auth`](../src/server/auth)): email + пароль, затем TOTP-код из приложения. Регистрации нет — сотрудников заводит владелец (первого — seed).

- **Конфигурация** — `createAuth()` в `config.ts` (без `server-only`: её же используют seed и e2e, чтобы формат хеша пароля и шифрования TOTP-секрета был тот же). Приложение берёт экземпляр через `getAuth()` из `@/server/auth`, браузер ходит в `/api/auth/*` через `authClient` из `src/components/auth`.
- **Второй фактор обязателен.** Сессия создаётся только после кода: пароль без кода сессии не даёт. Сотрудник без настроенного приложения после пароля попадает только на `/admin/two-factor` (подтвердить пароль → QR → код → резервные коды). Сессия, прошедшая TOTP или резервный код, помечена `Session.twoFactorVerified`; админка пускает только такие — поэтому вход донора по коду на email (ACC-1) или через VK ID не откроет админку сотруднику. Сессия без этой отметки у пользователя с TOTP не может ничего, кроме входа с кодом и выхода (смена пароля, управление сессиями и т. п. отвечают 403), а после входа с кодом такие сессии пользователя удаляются. «Доверять устройству» запрещено; отключить TOTP, увидеть секрет заново или перевыпустить резервные коды по сессии и паролю нельзя (сброс — владельцем, задача `users.manage`).
- **Проверки.** `src/proxy.ts` — оптимистичная: нет cookie сессии → `/admin/login?next=…`. Настоящая — `adminAccessOf()` (`access.ts`): роль сотрудника, не удалён, TOTP настроен, сессия прошла TOTP. Страницы и layout вызывают `requireStaff(permission?)` (редирект на вход или настройку TOTP, иначе 403 через `forbidden()`); layout не перепроверяется при клиентской навигации, поэтому каждая страница админки вызывает его сама. Server actions и route handlers — `getStaffUser()` и `assertCan(user, permission)`.
- **Права** — карта `permission → roles` в [`permissions.ts`](../src/server/auth/permissions.ts), матрица проверяется unit-тестом; функции `can()` и `assertCan()`.
- **Ограничения попыток:** пароль — 5 в минуту с одного IP, коды — 3 за 10 секунд с IP и 5 на один вход; после 10 неверных кодов подряд вход в аккаунт закрыт на 15 минут. Счётчики IP — в таблице `RateLimit`. IP берётся из `X-Forwarded-For`, поэтому в production приложение доступно только через Caddy, который этот заголовок перезаписывает.
- **Прочее:** запросы к `/api/auth` принимаются только с origin `APP_URL`; сессия живёт 7 дней с момента входа и не продлевается (Server Components не могут переписать cookie, а продлевать только строку в БД бессмысленно); закрыты эндпоинты регистрации, правки профиля, отключения TOTP, повторного показа секрета и перевыпуска резервных кодов. `BETTER_AUTH_SECRET` подписывает cookie и шифрует TOTP-секреты: его смена завершает все сессии и ломает настроенные TOTP.
