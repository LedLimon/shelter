# Архитектура

## Стек

| Слой              | Выбор                                                                                      | Примечание                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Фреймворк         | Next.js (App Router), TypeScript strict                                                    | `output: standalone` для Docker                                          |
| UI                | Tailwind CSS v4, shadcn/ui, lucide-react                                                   | Токены через CSS-переменные, светлая/тёмная тема                         |
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

Деньги — **копейки, `Int`** (суммы в SQL — `bigint`). Время — UTC.

### Идентичность

- `User`: email (unique), emailVerified, name, phone?, role (`DONOR | VOLUNTEER | COORDINATOR | EDITOR | ADMIN | OWNER`), deletedAt + таблицы Better Auth.
- `StaffProfile`: userId, каналы связи (telegram, whatsapp, max, vk, phone), showPublicly.

### Собаки

- `Dog`: slug, name, sex, birthDate + birthDatePrecision, size, color, status (`LOOKING_FOR_HOME | ON_TREATMENT | RESERVED | AT_FOSTER | ADOPTED | RAINBOW`), temperament `String[]` (good_with_kids / cats / dogs, active, calm…), health, sterilized, chipped, story (JSON Tiptap), arrivedAt, curatorId, published, guardianshipEnabled, guardianshipGoalKop.
- `Vaccination`: dogId, type, date, nextDue.
- `DogUpdate`: dogId, body, visibility (`PUBLIC | GUARDIANS`), publishedAt, notifiedAt.
- `AdoptClick`: dogId, channel, sessionHash (соль, ротация раз в сутки, без ПДн), utm, createdAt.

### Медиа

- `Media`: storageKey, mime, w, h, blur, kind (`PHOTO | RECEIPT | INVOICE | DOCUMENT`), redacted, uploadedById.
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
- `Post` (новости, истории «Они дома»), `Page`, `Setting` (реквизиты, каналы, часовой пояс), `Outbox`.

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

## Безопасность

- Сотрудники — TOTP обязателен; `/admin` закрыт в middleware и в layout.
- Rate limit (на Postgres) для форм доната, входа, upload.
- Вебхуки — проверка HMAC по **сырому** телу (`await req.text()`), Node runtime.
- Загрузки: лимит размера, проверка MIME, удаление EXIF/GPS, HEIC конвертируется в браузере.
- Каналы куратора: телефон раскрывается по клику (против скрейпинга).
