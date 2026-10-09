# Архитектура

## Стек

| Слой              | Выбор                                                                                      | Примечание                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Фреймворк         | Next.js (App Router), TypeScript strict                                                    | `output: standalone` для Docker                                          |
| UI                | Tailwind CSS v4, shadcn/ui (`base-nova` на Base UI), lucide-react                          | Токены через CSS-переменные, светлая/тёмная тема; Base UI, а не Radix    |
| Формы             | react-hook-form + zod                                                                      | zod-схемы общие для клиента и server action                              |
| Таблицы в админке | TanStack Table                                                                             |                                                                          |
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
    ledger/               # ЕДИНСТВЕННЫЙ модуль, пишущий в Ledger*
    payments/             # PaymentProvider, cloudpayments, fake
    needs/ dogs/ donations/ subscriptions/ inkind/ volunteer/ content/ legal/
    jobs/                 # pg-boss: регистрация задач, outbox
    email/                # шаблоны React Email, отправка
    audit/                # запись AuditLog
  components/
    ui/                   # shadcn
    <домен>/              # доменные компоненты (NeedCard, DogCard, ...)
  lib/                    # общие утилиты: money.ts, plural.ts, dates.ts
worker/                   # точка входа фонового процесса
prisma/                   # schema.prisma, migrations/, seed.ts
e2e/                      # Playwright
```

Правила:

- Страницы и server actions — тонкие: валидация (zod) → `can()` → вызов `src/server/<домен>` → `revalidateTag`.
- Публичные страницы — Server Components + ISR, теги вида `need:{id}`, `dog:{id}`, `needs`, `dogs`, `ledger`.
- Побочные эффекты (письма, уведомления) — через **outbox**: запись в таблицу `Outbox` в той же транзакции, что и бизнес-данные, воркер отправляет.

## Модель данных

Схема — [`prisma/schema.prisma`](../prisma/schema.prisma), миграции — `prisma/migrations/`. Ниже — целевая модель: в схеме пока только то, что уже сделано задачами.

### Соглашения схемы

- **Имена.** Модель — PascalCase в единственном числе (`Need`, `LedgerEntry`), поле — camelCase, enum — PascalCase, значения enum — `UPPER_SNAKE`. В БД имена те же, без `@map` / `@@map`: таблица `"Need"`, колонка `"goalKop"`. В raw SQL (триггеры, `$queryRaw`) — в двойных кавычках.
- **`id`** — `String @id @default(cuid(2))`: 24 символа, не угадывается и не выдаёт порядок записей, поэтому годится для публичных URL (`/donate/status/[id]`). Строка, а не `uuid`, — в raw SQL не нужно приведение `::uuid`. Естественный ключ вместо `id` — только у справочников (`Setting.key`).
- **Время** — `DateTime @db.Timestamptz(3)`, хранится в UTC, в часовой пояс приюта переводится только при показе. `createdAt @default(now())` и `updatedAt @updatedAt` — у всех изменяемых моделей; у append-only (`Ledger*`) — только время создания или проводки. `@default(now())` Prisma вычисляет в приложении, а не в БД; где нужно время БД (момент проводки) — `@default(dbgenerated("now()"))`. В SQL часовой пояс указываем явно (`AT TIME ZONE`): `date_trunc` и `to_char` зависят от `TimeZone` сессии.
  - **Соединение с БД — в UTC, независимо от пояса сервера.** `@prisma/adapter-pg` отправляет параметры `Date` без смещения, а у прочитанных `timestamptz` подменяет смещение на `+00:00`, то есть рассчитывает на `TimeZone` сессии = UTC. На сервере с другим поясом по умолчанию (`initdb` берёт системный, например МСК) все времена молча сдвинулись бы: `2026-10-01T00:00Z` записался бы как `2026-09-30 21:00 UTC`, `now()` читался бы на 3 часа вперёд, а вместе с ними — `balance(at)` и границы закрытых месяцев книги. Поэтому `createPrismaClient()` (`@/server/db/client`) добавляет `-c TimeZone=UTC` в `options` строки подключения — последним, так что `options` из `DATABASE_URL` сохраняются, а `TimeZone` из них проигрывает. Клиенты Prisma создаются только через неё: импорт `@prisma/adapter-pg` в других местах запрещает ESLint.
  - Пояс сессии в коде не меняем (`SET [LOCAL] TIME ZONE`, `set_config('TimeZone', …)`): adapter-pg сразу начнёт сдвигать время, а без `LOCAL` настройка ещё и останется на соединении пула для чужих запросов. Raw SQL не должен возвращать `timestamp` без пояса: `date_trunc('month', "postedAt" AT TIME ZONE 'Europe/Moscow')` adapter-pg прочитает как время в UTC — возвращайте `timestamptz` или текст. Литералы времени в SQL миграций — только со смещением (`'2026-10-01 00:00+03'`): Prisma CLI подключается без закрепления UTC.
  - `ALTER DATABASE … SET timezone = 'UTC'` в миграции не делаем. Параметр соединения сильнее настроек базы и роли, так что при работающем закреплении он ничего не добавляет. Проверить его тестами нельзя: настройка базы не копируется в `CREATE DATABASE … TEMPLATE` (так создаются базы интеграционных тестов) и не попадает в дамп без `pg_dump --create`. Остальным клиентам (`psql`, `pg_dump`, node-postgres у pg-boss) он не нужен: они передают и читают смещение сами, а пояс сессии влияет у них на показ и на значения без смещения (литералы, `::date`, `date_trunc`). Остаётся риск, что пулер соединений молча отбросит `options` (как PgBouncer с `ignore_startup_parameters = options`); от него — проверка `TimeZone` при старте приложения и пояс UTC у сервера БД в продакшне ([FND-15](https://github.com/LedLimon/shelter/issues/114)). Интеграционные тесты поднимают Postgres в поясе `Europe/Moscow` ([testing.md](testing.md#интеграционные-тесты)).
- **Деньги** — `Int` в копейках, поле с суффиксом `Kop` (`goalKop`, `amountKop`). В Postgres это `integer`: до 21 474 836,47 ₽ в одном значении; накопительные итоги в `Int` не храним. Суммы положительные, кроме `LedgerEntry.amountKop` (со знаком). Суммы внутри JSON (например, в `Setting`) — тоже целые копейки с суффиксом `Kop`.
  - **Prisma не отклоняет дробное значение для `Int`, а молча отбрасывает дробную часть** (`1998.9999…` → `1998`, `NaN` в необязательном поле → `NULL`). Поэтому сумма проверяется до записи — zod `.int()` / `Number.isSafeInteger`, а рубли из внешних источников переводятся в копейки только общим хелпером.
  - `SUM()` в raw SQL возвращает `bigint` (в TS — `bigint`, в `number` переводите явно) и `NULL` на пустом наборе — нужен `COALESCE`. `SUM(x::bigint)` и `AVG()` возвращают `Prisma.Decimal` — для денег не используем. `aggregate({ _sum })` возвращает `number`.
- **Удаление.** Сущности с историей (пользователи, пожертвования) не удаляются — `deletedAt` или статус. Внешние ключи — `onDelete: Restrict`. Prisma ставит его по умолчанию **только у обязательных** связей, у необязательных (`needId String?`) — `SetNull`, и удаление нужды молча отвязало бы от неё пожертвования. Поэтому у необязательных связей `onDelete` пишем всегда: `Restrict` — для денег и всего, у чего есть история; `SetNull` — только для ссылок вроде «кто загрузил».
- **Индексы.** Postgres не индексирует внешние ключи сам — у каждого FK-поля `@@index`.
- **JSON** (`Json` → `jsonb`) — только для данных, по которым не фильтруют: настройки, payload событий, тексты Tiptap. Форма значения — zod-схема в коде, как в [`src/server/settings/schema.ts`](../src/server/settings/schema.ts). Сохранённые значения проверяются при чтении, поэтому новое поле в схеме — с `.optional()` / `.default()` или вместе с миграцией данных.
- **Email** хранится в нижнем регистре (CHECK в БД) — так уникальность не зависит от регистра.
- **Чего нет в Prisma** (CHECK, триггеры, частичные индексы) — raw SQL в той же миграции: `pnpm db:migrate --create-only --name <имя>`, дописать SQL в `migration.sql`, затем `pnpm db:migrate`. Миграцию, попавшую в `main`, не редактируем — только новая миграция. Если `schema.prisma` поменяли без миграции, интеграционные тесты падают.

### Доступ к БД

- `getDb()` из `@/server/db` — общий клиент процесса (`server-only`). Создаётся при первом вызове, а не при импорте: `next build` идёт без `DATABASE_URL`.
- Функции доменов принимают `db: Db` — клиент или `tx` из `db.$transaction(async (tx) => …)`, чтобы вызывающий мог объединить несколько вызовов в одну транзакцию. Тип не отличает клиент от `tx`: функция, которой транзакция обязательна (`FOR UPDATE`, проводки), проверяет это сама.
- Prisma Client генерируется в `src/generated/prisma` (не в git): `prisma generate` запускают `pnpm install` и `pnpm db:migrate`. Модели, типы и enum на сервере импортируем из `@/generated/prisma/client`, в клиентских компонентах — из `@/generated/prisma/browser`.
- Модули с `import "server-only"` (`@/server/db`, `@/server/settings` …) за пределами Next.js не загружаются: пакета `server-only` в зависимостях нет, Next подставляет его сам, Vitest — заглушкой из `tests/stubs/`. Seed поэтому берёт клиент из `createPrismaClient(url)` (`@/server/db/client`, без `server-only`). Как воркеру (tsx) пользоваться доменными модулями — решается в FND-5.
- `pnpm db:seed` ([`prisma/seed.ts`](../prisma/seed.ts)) создаёт настройки по умолчанию и владельца: пока в базе нет активного `OWNER`, им становится пользователь `SEED_OWNER_EMAIL` (создаётся, если его нет). Дальше роли меняются только в админке. Повторный запуск добавляет недостающее и не трогает то, что уже правили.

### Идентичность

- `User`: email (unique), emailVerified, name, phone?, role (`DONOR | VOLUNTEER | COORDINATOR | EDITOR | ADMIN | OWNER`), deletedAt + таблицы Better Auth.
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

- Сотрудники — TOTP обязателен; `/admin` закрыт в middleware и в layout.
- Rate limit (на Postgres) для форм доната, входа, upload.
- Вебхуки — проверка HMAC по **сырому** телу (`await req.text()`), Node runtime.
- Загрузки: лимит размера, проверка MIME, удаление EXIF/GPS, HEIC конвертируется в браузере.
- Каналы куратора: телефон раскрывается по клику (против скрейпинга).
