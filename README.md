# Сайт собачьего приюта

Сайт одного приюта для собак: **сбор денег на конкретные нужды** с радикальной прозрачностью (каждое поступление и каждый расход — публично, с чеками и фотоотчётом), **каталог собак** с кнопкой «Хочу забрать», виртуальная опека, помощь вещами и волонтёрство.

> Статус: подготовка. Код приложения появляется по задачам Фазы 0 — см. [вехи](https://github.com/LedLimon/shelter/milestones) и [docs/roadmap.md](docs/roadmap.md).

## Документация

| | |
|---|---|
| [Продукт](docs/product.md) | Фичи, сценарии, роли |
| [Дизайн](docs/design.md) | UX-принципы, стиль, компоненты, тон |
| [Архитектура](docs/architecture.md) | Стек, структура, модель данных, маршруты |
| [Книга операций](docs/ledger.md) | Учёт денег по двойной записи |
| [Платежи](docs/payments.md) | CloudPayments, вебхуки, подписки, возвраты |
| [Юридическое](docs/legal.md) | 152-ФЗ, 54-ФЗ, оферта, согласия |
| [Тестирование](docs/testing.md) | Что и как тестируем |
| [Роадмап](docs/roadmap.md) | Фазы, вехи, эпики |
| [ADR](docs/adr/) | Архитектурные решения |

## Стек

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL 16 · Better Auth · pg-boss · CloudPayments · Vitest · Playwright. Хостинг и данные — в РФ.

## Быстрый старт

Инструменты закреплены в [`mise.toml`](mise.toml) (Node 24, pnpm 10):

```bash
brew install mise
mise install
```

Дальше — после задач FND-1 и FND-2 (каркас и dev-окружение):

```bash
pnpm install
pnpm dev:up      # Postgres, MinIO, Mailpit в Docker
pnpm db:migrate && pnpm db:seed
pnpm dev
```

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
- **Процесс:** задача → ветка `feat/<номер>-<slug>` → PR с `Closes #N` → ревью → merge в `main`.

## Лицензия

[Apache-2.0](LICENSE)
