# Сайт собачьего приюта

Сайт одного приюта для собак: **сбор денег на конкретные нужды** с радикальной прозрачностью (каждое поступление и каждый расход — публично, с чеками и фотоотчётом), **каталог собак** с кнопкой «Хочу забрать», виртуальная опека, помощь вещами и волонтёрство.

> Статус: подготовка. Код приложения появляется по задачам Фазы 0 — см. [вехи](https://github.com/LedLimon/shelter/milestones) и [docs/roadmap.md](docs/roadmap.md).

## Документация

|                                           |                                            |
| ----------------------------------------- | ------------------------------------------ |
| [Продукт](docs/product.md)                | Фичи, сценарии, роли                       |
| [Дизайн](docs/design.md)                  | UX-принципы, стиль, компоненты, тон        |
| [Архитектура](docs/architecture.md)       | Стек, структура, модель данных, маршруты   |
| [Книга операций](docs/ledger.md)          | Учёт денег по двойной записи               |
| [Платежи](docs/payments.md)               | CloudPayments, вебхуки, подписки, возвраты |
| [Юридическое](docs/legal.md)              | 152-ФЗ, 54-ФЗ, оферта, согласия            |
| [Тестирование](docs/testing.md)           | Что и как тестируем                        |
| [Инструменты агентов](docs/ai-tooling.md) | Скиллы и MCP для дизайна и UX              |
| [Роадмап](docs/roadmap.md)                | Фазы, вехи, эпики                          |
| [ADR](docs/adr/)                          | Архитектурные решения                      |

## Стек

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL 16 · Better Auth · pg-boss · CloudPayments · Vitest · Playwright. Хостинг и данные — в РФ.

## Быстрый старт

Инструменты закреплены в [`mise.toml`](mise.toml) (Node 24, pnpm 10):

```bash
brew install mise
mise install
```

Дальше (нужен Docker Engine 25+: Docker Desktop, OrbStack или Colima):

```bash
pnpm install
cp .env.example .env
pnpm dev:up      # Postgres, MinIO, Mailpit в Docker
pnpm db:migrate  # схема БД
pnpm db:seed     # владелец и настройки по умолчанию
pnpm dev         # http://localhost:3000
```

Проверки перед PR (`pnpm test` запускает и интеграционные тесты — нужен запущенный Docker):

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Dev-окружение

Зависимости приложения поднимаются в Docker из [`docker-compose.yml`](docker-compose.yml). Пароли — только для локальной разработки, они совпадают с [`.env.example`](.env.example).

| Сервис                   | Адрес                                    | Доступ                           |
| ------------------------ | ---------------------------------------- | -------------------------------- |
| PostgreSQL 16            | `localhost:5432`, база `shelter`         | `shelter` / `shelter`            |
| MinIO, S3 API            | `http://localhost:9000`, бакет `shelter` | `shelter` / `shelter-dev-secret` |
| MinIO, веб-консоль       | [localhost:9001](http://localhost:9001)  | `shelter` / `shelter-dev-secret` |
| Mailpit, SMTP            | `localhost:1025`                         | без авторизации                  |
| Mailpit, входящие письма | [localhost:8025](http://localhost:8025)  | —                                |

```bash
pnpm dev:up      # поднять и дождаться зелёных healthchecks, создать бакет
pnpm dev:down    # остановить; данные остаются в .data/
pnpm dev:reset   # стереть .data/ (база, файлы) и поднять заново
```

- **Данные** — в `.data/pg` и `.data/minio` (в `.gitignore`). Письма Mailpit не сохраняются между перезапусками.
- **База данных** — Prisma, схема в [`prisma/schema.prisma`](prisma/schema.prisma), соглашения — в [docs/architecture.md](docs/architecture.md#соглашения-схемы):

  ```bash
  pnpm db:migrate  # применить миграции; после правки схемы — создать новую: pnpm db:migrate --name <имя>
  pnpm db:seed     # настройки по умолчанию и владелец (SEED_OWNER_EMAIL), если его ещё нет; можно повторять
  pnpm db:reset    # стереть базу, применить миграции и seed заново (спросит подтверждение)
  pnpm db:studio   # Prisma Studio: данные в браузере
  pnpm db:generate # пересоздать Prisma Client (обычно делают pnpm install и db:migrate)
  ```

- **Один стек на машину.** Если стек уже поднят из другого checkout или worktree (`docker ps`), используйте его: порты и пароли те же. Второй `dev:up` из другого каталога упадёт с «port is already allocated». Перед удалением worktree выполните в нём `pnpm dev:down`.
- **Порт занят** — задайте в `.env` `POSTGRES_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, `MAILPIT_SMTP_PORT` или `MAILPIT_UI_PORT` и поправьте адрес сервиса там же (`DATABASE_URL`, `S3_ENDPOINT`, `SMTP_PORT`).
- **Переменные окружения** проверяются при старте `pnpm dev` и `next start` (схема — [`src/lib/env/schema.ts`](src/lib/env/schema.ts)). Если чего-то не хватает, сервер не запустится и перечислит, какие переменные не заданы или неверны. Значения запоминаются при старте: после правки `.env` перезапустите `pnpm dev`. Новую переменную добавляйте в схему и в `.env.example` — тест сверяет их.
- **MinIO** — официальные образы `minio/minio` больше не публикуются, поэтому используется [`pgsty/minio`](https://github.com/pgsty/minio) — поддерживаемая сообществом сборка того же сервера. Регион — `ru-central1`, как у Yandex Object Storage.

## Разработка с ИИ-агентами

Проект рассчитан на то, что большую часть кода пишут ИИ-агенты по задачам из GitHub Issues.

- **Правила для агентов** — [AGENTS.md](AGENTS.md) (общие для любых агентов) и [CLAUDE.md](CLAUDE.md) (особенности Claude Code).
- **Задачи** — [Issues](https://github.com/LedLimon/shelter/issues): эпики с под-задачами, зависимости «blocked by», вехи по фазам. Метки:
  - `agent-ready` — задачу может взять агент;
  - `needs-human` — нужен человек (юридическое, доступы, решения);
  - `money-critical` — затрагивает деньги: обязательное ревью `ledger-auditor` и человека.
- **Claude Code:**
  - `/work-on-issue 12` или `/work-on-issue next` — взять задачу и довести до PR;
  - `/new-issue …` — завести задачу по шаблону проекта;
  - субагенты `code-reviewer`, `ledger-auditor`, `ui-reviewer` — ревью перед PR.
- **Дизайн и UX:** требование — современный дизайн, отличимый от шаблонных ИИ-сайтов ([критерии](docs/design.md#отличие-от-шаблонных-ии-сайтов)). Для этого у агентов одинаковый набор инструментов, подключённый на уровне проекта:
  - скилл [Impeccable](https://github.com/pbakaus/impeccable) (`/impeccable critique | audit | polish | harden | shape`) и плагин context7 — в [`.claude/settings.json`](.claude/settings.json);
  - скиллы Vercel `web-design-guidelines` и `vercel-react-best-practices` — в [`.claude/skills/`](.claude/skills/);
  - MCP-серверы shadcn, next-devtools, chrome-devtools и playwright — в [`.mcp.json`](.mcp.json).

  При первом запуске Claude Code в папке проекта подтвердите доверие к папке и MCP-серверы из `.mcp.json`. Что откуда, лицензии и приватность — [docs/ai-tooling.md](docs/ai-tooling.md).

- **Процесс:** задача → ветка `feat/<номер>-<slug>` → PR с `Closes #N` → ревью → merge в `main`.

## CI

Каждый PR и каждый пуш в `main` проверяет [GitHub Actions](.github/workflows/ci.yml) — два параллельных job:

- **Checks** — `format:check` → `typecheck` → `lint` → `test` → `build`; интеграционные тесты поднимают Postgres 16 в Docker через Testcontainers, как локально;
- **E2E smoke** — production-сборка и Playwright: главная открывается на desktop и mobile без ошибок в консоли.

Локально e2e: один раз `pnpm exec playwright install --only-shell chromium`, дальше `pnpm e2e` — тесты сами поднимут `next dev` на порту 3100 (другой порт — `E2E_PORT=3200 pnpm e2e`). Если `pnpm dev` в этой папке уже запущен, второй Next.js не стартует — направьте тесты на него: `E2E_BASE_URL=http://localhost:3000 pnpm e2e`.

### Защита ветки `main`

Включает владелец репозитория один раз, после первого прогона CI — чтобы проверки появились в списке:

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset.**
2. **Ruleset name** — `main`, **Enforcement status** — Active, **Target branches** → Add a target → Include default branch. **Bypass list** оставить пустым: агенты работают с правами владельца, и обход сработал бы и для них.
3. Правила:
   - **Restrict deletions** и **Block force pushes** — включены по умолчанию, оставить;
   - **Require a pull request before merging** — включить, **Required approvals** оставить `0`: PR агентов открываются от аккаунта владельца, а одобрить собственный PR GitHub не даёт;
   - **Require status checks to pass before merging** — включить и кнопкой «+» добавить `Checks` и `E2E smoke`, источник — **GitHub Actions** (не «any source»: иначе проверку закроет любой commit status с тем же именем). Флажок **Require branches to be up to date before merging** надёжнее (PR проверяется поверх свежего `main`), но после каждого merge остальные PR придётся обновлять.
4. **Create.**

## Лицензия

[Apache-2.0](LICENSE)
