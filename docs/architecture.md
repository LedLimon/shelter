# Архитектура

## Стек

| Слой              | Выбор                                                                                      | Примечание                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Фреймворк         | Next.js (App Router), TypeScript strict                                                    | `output: standalone` для Docker                                          |
| UI                | Tailwind CSS v4, shadcn/ui (`base-nova` на Base UI), lucide-react                          | Токены через CSS-переменные, светлая/тёмная тема; Base UI, а не Radix    |
| Формы             | react-hook-form + zod                                                                      | zod-схемы общие для клиента и server action                              |
| Таблицы в админке | TanStack Table 9                                                                           | Сортировку, фильтры и страницы делает сервер, см. [«Админка»](#админка)  |
| Редактор текста   | Tiptap                                                                                     | Новости, истории, отчёты                                                 |
| БД                | PostgreSQL 16 + Prisma                                                                     | Денежные инварианты — триггерами в raw SQL миграции                      |
| Auth              | Better Auth + Prisma adapter                                                               | Сотрудники: пароль + TOTP. Доноры: код на email                          |
| Фоновые задачи    | pg-boss (на Postgres, без Redis)                                                           | Отдельный процесс `worker` из того же репо                               |
| Файлы             | S3-совместимое: MinIO (dev), Yandex Object Storage + CDN (prod)                            | Загрузка по presigned URL                                                |
| Картинки          | sharp в воркере                                                                            | WebP/AVIF, размеры, blur, удаление EXIF/GPS                              |
| Email             | React Email + Unisender Go или Yandex Cloud Postbox                                        | Mailpit в dev                                                            |
| Платежи           | CloudPayments                                                                              | За интерфейсом `PaymentProvider` ([ADR-0002](adr/0002-cloudpayments.md)) |
| Тесты             | Vitest, Testcontainers (Postgres), Playwright, fast-check                                  | См. [testing.md](testing.md)                                             |
| Мониторинг        | GlitchTip (self-hosted), Uptime Kuma, Яндекс Метрика (после согласия на cookie)            |                                                                          |
| Хостинг           | В РФ: Yandex Cloud или VPS Selectel/Timeweb + Docker Compose + управляемый Postgres, Caddy | [ADR-0004](adr/0004-hosting-ru.md)                                       |

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
    admin/                # adminAction() — обёртка server actions админки
    ledger/               # ЕДИНСТВЕННЫЙ модуль, который пишет в Ledger* и читает их
    payments/             # PaymentProvider, cloudpayments, fake
    needs/ dogs/ donations/ subscriptions/ inkind/ volunteer/ content/ legal/
    jobs/                 # pg-boss: регистрация задач, outbox
    email/                # шаблоны React Email, отправка
    audit/                # запись AuditLog
  components/
    ui/                   # shadcn
    form/                 # поля форм: react-hook-form + Field
    admin/                # каркас админки, меню, DataTable, useActionForm
    <домен>/              # доменные компоненты (NeedCard, DogCard, ...)
  lib/                    # общие утилиты: money.ts, plural.ts, dates.ts
worker/                   # точка входа фонового процесса
prisma/                   # schema.prisma, migrations/, seed.ts
eslint/                   # свои правила ESLint (shelter/ledger-boundary)
e2e/                      # Playwright
```

Правила:

- Страницы и server actions — тонкие: проверка прав (`can()`) → валидация (zod) → вызов `src/server/<домен>` → сброс кеша. В админке этот порядок держит `adminAction()` — см. [«Админка»](#админка).
- Публичные страницы — Server Components + ISR, теги вида `need:{id}`, `dog:{id}`, `needs`, `dogs`, `ledger`.
- Побочные эффекты (письма, уведомления) — через **outbox**: запись в таблицу `Outbox` в той же транзакции, что и бизнес-данные, воркер отправляет.

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
- Модули с `import "server-only"` (`@/server/db`, `@/server/settings` …) за пределами Next.js не загружаются: пакета `server-only` в зависимостях нет, Next подставляет его сам, Vitest — заглушкой из `tests/stubs/`. Seed поэтому берёт клиент из `createPrismaClient(url)` (`@/server/db/client`, без `server-only`). Как воркеру (tsx) пользоваться доменными модулями — решается в FND-5.
- **Ключи advisory-блокировок** (`pg_advisory_xact_lock`) — общие на всю базу, поэтому реестр здесь; новый ключ — сюда же:
  - `3700000001` — блокировка периода книги, `ledger_period_lock_key()` ([ledger.md](ledger.md#инварианты)).
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

- `Setting`: key, value (JSON) — часовой пояс, реквизиты, контакты, готовые суммы доната. Ключи и формы значений — `src/server/settings/schema.ts`, чтение и запись — `getSetting()` / `setSetting()` из `@/server/settings`; все настройки разом, с умолчаниями для несохранённых, — `getSettings()`, запись только изменившихся — `saveSettings()`. Правит их владелец на странице `/admin/settings`; Telegram и ВКонтакте приюта хранятся ссылками (`https://t.me/…`, `https://vk.com/…`), чтобы сайт подставлял их как есть. Тег кеша — `settings`. Часовой пояс приюта для показа дат — настройка `shelter.timezone`; переменная `SHELTER_TIMEZONE` — её начальное значение (seed) и запасное, пока настройки нет.
- `Outbox`: type, payload, dedupeKey (unique), status (`PENDING | PROCESSED | FAILED`), attempts, availableAt, lastError, processedAt — побочные эффекты после коммита (правило в [«Структуре кода»](#структура-кода)), выполняет [воркер](#фоновые-задачи-worker). В payload — только id, без ПДн: обработчик сам загружает email и имя; в lastError ПДн тоже не пишем.

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

## Админка

Каркас — задача FND-7. Вид и поведение описаны в [design.md](design.md#админка), здесь — как на нём строить раздел.

### Меню и доступ к разделам

- Реестр разделов — `ADMIN_NAV` в [`src/components/admin/nav-config.ts`](../src/components/admin/nav-config.ts): адрес, название, иконка и право, которое раздел открывает. Меню показывает роли только её разделы (`adminNavFor()`); какая роль что видит, записано таблицей в unit-тесте — как матрица прав.
- **Скрытый пункт — удобство, а не защита.** Страница раздела сама вызывает `requireStaff(<право раздела>)`, server action — `adminAction(…, <право>, …)`.
- **Разделы, которых ещё нет,** обслуживает одна страница-заглушка `src/app/admin/(staff)/[section]/page.tsx`: ссылка из меню работает, а адрес уже отвечает 403 без права и 404, если такого раздела нет. Чтобы раздел появился, достаточно создать `src/app/admin/(staff)/<slug>/page.tsx` — статический маршрут перекрывает заглушку, меню править не нужно. Когда будет готов последний раздел, заглушку удаляем.
- **403 — настоящий код ответа.** `forbidden()` даёт 403, только пока ответ не начал уходить потоком. Поэтому `requireStaff()` вызывается в начале страницы, а `loading.tsx` на уровне `/admin` нет: с ним страница оказалась бы внутри `Suspense`, и отказ пришёл бы с кодом 200. Скелетоны — `Suspense` внутри страницы, после проверки доступа.
- У сотрудника 403 и 404 рисуют `forbidden.tsx` и `not-found.tsx` из `admin/(staff)` — внутри каркаса. Проверка в layout (не сотрудник) уходит на общий `src/app/forbidden.tsx`.

### Server actions: `adminAction`

Любое изменение из админки — server action, собранный `adminAction(schema, permission, handler)` из [`@/server/admin/action`](../src/server/admin/action.ts):

```ts
"use server";

export const publishNeed = adminAction(
  publishSchema,
  "needs.publish",
  async ({ id }, { db, user, audit, revalidate }) => {
    await publish(db, id, user); // src/server/needs
    audit({ action: "need.publish", entity: "Need", entityId: id });
    revalidate(`need:${id}`, "needs");
  },
);
```

Что делает обёртка, по порядку:

1. **Сессия** — `getStaffUser()`: сотрудник, чья сессия прошла TOTP. Нет — ответ `unauthorized`.
2. **Право** — `assertCan(user, permission)`. Нет — `forbidden`. Право проверяется до разбора входа: посторонний не узнаёт даже, какие поля ждёт действие.
3. **Вход** — `schema.safeParse()`: браузер может прислать что угодно, тип параметра его не ограничивает. Ошибки — `validation` с первым сообщением каждого поля по его пути (`requisites.inn`).
4. **Обработчик в транзакции.** `context.db` — клиент транзакции: всё, что обработчик записал через него, фиксируется вместе с записями аудита или не фиксируется вовсе. Доменные функции принимают его как обычный `db: Db`.
5. **Аудит** — `context.audit(entry)` на каждую изменённую запись; после обработчика обёртка передаёт записи в `recordAudit(tx, user, entries)` из `@/server/audit` в той же транзакции. Это точка расширения для FND-9: пока модели `AuditLog` нет, функция ничего не сохраняет. В `diff` не кладём ПДн и секреты.
6. **Кеш** — `context.revalidate(...tags)`: теги публичных страниц сбрасываются **после** фиксации (`updateTag`). Сброс внутри транзакции мог бы закешировать старые данные заново.

Действие не бросает исключение, а возвращает `ActionResult` (`{ ok: true, data }` или `{ ok: false, error }`): текст брошенной ошибки до браузера не доходит. Отказать с понятным сообщением обработчик может через `throw new ActionError(message, fieldErrors?)` — транзакция откатится; дополнительное право он проверяет через `assertCan()`. Всё остальное, что он бросит, — баг: исключение уходит дальше, форма показывает общее сообщение. Типы и тексты ответов — [`src/server/admin/result.ts`](../src/server/admin/result.ts), без серверных импортов: их читает и браузер.

Внешние вызовы (платёжный API, почта) внутри обработчика держали бы транзакцию открытой — их делаем через outbox.

### Формы

- Схема zod лежит рядом с action (`schema.ts`) и общая для формы и сервера. Она описывает путь «что набрано» → «что хранится» (строки → копейки, ник → ссылка); форма отправляет в action значения как набраны, сервер разбирает их той же схемой — поэтому путь ошибки с сервера совпадает с именем поля.
- `useActionForm({ schema, defaultValues, action })` из `@/components/admin/action-form` связывает react-hook-form с action и одинаково во всех формах разбирает ответ: успех — тост и «чистое» состояние формы, ошибки полей — в поля, остальное — в `ActionFailureAlert` рядом с кнопкой. Если action возвращает сохранённые значения, `savedValues` сразу показывает их в форме в нормализованном виде.
- Поля — `TextField`, `TextareaField`, `SelectField` и `FormField` из `@/components/form/form-field`.
- Эталон — «Настройки»: `src/app/admin/(staff)/settings/` (`page.tsx`, `schema.ts`, `actions.ts`, `settings-form.tsx`).

### Таблицы: `DataTable`

Сортировка, поиск, фильтры и страницы списка — на сервере, а их состояние — в адресе: `?q=корм&status=DRAFT&sort=-createdAt&page=2`. Списком можно поделиться ссылкой, кнопка «Назад» возвращает прежний вид.

```tsx
// page.tsx — серверный компонент
const query = parseTableQuery(await searchParams, NEEDS_TABLE);
const total = await countNeeds(db, query);
const { skip, take } = pageOf(query, total);
const rows = await listNeeds(db, query, { skip, take });
return <NeedsTable rows={rows} total={total} query={query} />;
```

- `TableQueryConfig` (у примера выше — `NEEDS_TABLE`) перечисляет, по каким столбцам сервер умеет сортировать, порядок по умолчанию, размер страницы и фильтры с допустимыми значениями. `parseTableQuery()` из [`table-query.ts`](../src/components/admin/data-table/table-query.ts) превращает `searchParams` в безопасный запрос: неизвестный столбец или значение фильтра заменяются умолчанием, битый номер страницы — первой. В `orderBy` попадает только идентификатор из списка `sortable`.
- `pageOf(query, total)` считает `skip` / `take` и возвращает страницу за концом списка на последнюю — сначала `count`, потом выборка.
- Столбцы описывает клиентский компонент раздела (`dataTableColumns<Row>()`, вне компонента — TanStack Table нужны стабильные ссылки) и отдаёт их в `<DataTable>` вместе со строками и запросом. Заголовок становится кнопкой сортировки, если идентификатор столбца есть в `sortable`. Элементы управления — `DataTableSearch` и `DataTableFilter` в пропе `toolbar`.
- Строки — простые сериализуемые объекты: время — строкой ISO, деньги — копейками; форматирует ячейка (`formatRub`, `formatDate` с часовым поясом приюта).
- Живой пример с «базой» из выдуманных операций — раздел «Таблица» на витрине `/dev/ui` (`src/app/dev/ui/sections/data-table/`).

## Фоновые задачи (worker)

| Задача                                            | Когда               |
| ------------------------------------------------- | ------------------- |
| Отправка писем из outbox                          | постоянно           |
| Обработка загруженных картинок (sharp)            | по событию загрузки |
| Сверка с реестром CloudPayments, импорт комиссий  | ежедневно           |
| Проверка целостности книги и кэшей `collectedKop` | еженощно            |
| Напоминание о списании за 3 дня                   | ежедневно           |
| Истечение обещаний «помощи вещами»                | ежедневно           |
| Дайджест опекунам                                 | еженедельно         |
| Напоминания о сменах волонтёрам                   | ежедневно           |

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
- **Проверки.** `src/proxy.ts` — оптимистичная: нет cookie сессии → `/admin/login?next=…`. Server actions она пропускает: `adminAction()` сам ответит `unauthorized`, и форма, из которой его вызвали, сохранит введённое, а не сменится страницей входа. Настоящая — `adminAccessOf()` (`access.ts`): роль сотрудника, не удалён, TOTP настроен, сессия прошла TOTP. Страницы и layout вызывают `requireStaff(permission?)` (редирект на вход или настройку TOTP, иначе 403 через `forbidden()`); layout не перепроверяется при клиентской навигации, поэтому каждая страница админки вызывает его сама. Server actions админки собирает `adminAction()` — он вызывает `getStaffUser()` и `assertCan(user, permission)` ([«Админка»](#админка)); route handlers делают это сами.
- **Права** — карта `permission → roles` в [`permissions.ts`](../src/server/auth/permissions.ts), матрица проверяется unit-тестом; функции `can()` и `assertCan()`.
- **Ограничения попыток:** пароль — 5 в минуту с одного IP, коды — 3 за 10 секунд с IP и 5 на один вход; после 10 неверных кодов подряд вход в аккаунт закрыт на 15 минут. Счётчики IP — в таблице `RateLimit`. IP берётся из `X-Forwarded-For`, поэтому в production приложение доступно только через Caddy, который этот заголовок перезаписывает.
- **Прочее:** запросы к `/api/auth` принимаются только с origin `APP_URL`; сессия живёт 7 дней с момента входа и не продлевается (Server Components не могут переписать cookie, а продлевать только строку в БД бессмысленно); закрыты эндпоинты регистрации, правки профиля, отключения TOTP, повторного показа секрета и перевыпуска резервных кодов. `BETTER_AUTH_SECRET` подписывает cookie и шифрует TOTP-секреты: его смена завершает все сессии и ломает настроенные TOTP.
