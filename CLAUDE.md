@AGENTS.md

# Особенности для Claude Code

## Скиллы проекта (`.claude/skills/`)

- **`/work-on-issue <номер>`** — основной рабочий цикл: прочитать задачу → проверить зависимости → прочитать docs → ветка → реализация → проверки → ревью субагентами → PR. Используй его для любой задачи из GitHub.
- **`/new-issue <описание>`** — завести новую задачу по шаблону проекта (метки, веха, эпик-родитель, зависимости).

## Дизайн и UX: скиллы и MCP

Подробно — откуда, какие лицензии, что с приватностью — в [docs/ai-tooling.md](docs/ai-tooling.md).

- **`/impeccable <команда>`** (плагин Impeccable) — дизайн-скилл с антипаттернами ИИ-шаблонов. В работе: `shape` — до кода, `polish` и `harden` — перед PR, `critique` и `audit` — в ревью. **`/impeccable init` не запускай** — это задача DS-0 с человеком.
- **`web-design-guidelines`** (Vercel) — проверка UI-кода на Web Interface Guidelines.
- **`vercel-react-best-practices`** (Vercel) — производительность React/Next.js: водопады, бандл, ре-рендеры.
- **MCP** (`.mcp.json`): `shadcn` — реестр компонентов shadcn/ui; `next-devtools` — ошибки и маршруты запущенного `pnpm dev`; `chrome-devtools` — performance trace и Core Web Vitals; `playwright` — сценарии в браузере. Плагин **context7** — актуальная документация библиотек.
- В сторонние инструменты (context7, скачивание правил) **не передавай ПДн**, секреты и содержимое `.env` — только код, названия библиотек и seed-данные.

## Субагенты (`.claude/agents/`)

- **`code-reviewer`** — ревью диффа перед PR: баги, соответствие AGENTS.md и docs. Вызывай всегда.
- **`ledger-auditor`** — обязателен для задач с меткой `money-critical` и для любого диффа, который трогает `src/server/ledger`, `src/server/payments`, `prisma/` (денежные модели) или вебхуки.
- **`ui-reviewer`** — для любого изменения UI: смотрит страницу в браузере на mobile и desktop, в светлой и тёмной теме.

## Проверка UI

- В desktop-приложении — встроенный браузер (preview_start / browser pane).
- В CLI — Playwright MCP из `.mcp.json`.
- Производительность (главная, нужды, донат) — chrome-devtools MCP на production-сборке: Slow 4G + CPU ×4, LCP < 2.5 с.
- Скриншоты и выводы прикладывай в PR, если меняется внешний вид.

## Прочее

- Длинные команды (`pnpm install`, `pnpm e2e`, `docker compose up`) запускай в фоне.
- Не пуш в `main` и не делай force-push — это запрещено в `.claude/settings.json`.
- Если задача упирается в решение, которое должен принять человек (юридическое, деньги, UX-компромисс), — спроси в комментарии к задаче или у пользователя, а не выбирай молча.
