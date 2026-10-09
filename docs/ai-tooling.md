# Инструменты ИИ-агентов для дизайна и UX

Требование к сайту — современный дизайн и UX, отличимый от шаблонных ИИ-сайтов (критерии — [design.md](design.md#отличие-от-шаблонных-ии-сайтов)). Чтобы все агенты работали одинаково, инструменты подключены на уровне проекта, а не у каждого разработчика отдельно. Секретов и токенов в репозитории нет.

## Что подключено

| Инструмент                      | Зачем                                                                                                                   | Где подключён                                                                                        | Источник                                                                                    | Лицензия   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| **Impeccable** 4.5.1            | Дизайн-скилл `/impeccable` (24 команды: `shape`, `critique`, `audit`, `polish`, `harden`…) и хук-детектор антипаттернов | `.claude/settings.json`: `extraKnownMarketplaces.impeccable` (тег `skill-v4.5.1`) + `enabledPlugins` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable)                                 | Apache-2.0 |
| **web-design-guidelines**       | Проверка UI-кода на Web Interface Guidelines                                                                            | `.claude/skills/web-design-guidelines/` (копия)                                                      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) @ `063bee9`         | MIT        |
| **vercel-react-best-practices** | 70 правил производительности React/Next.js                                                                              | `.claude/skills/vercel-react-best-practices/` (копия)                                                | там же                                                                                      | MIT        |
| **shadcn MCP**                  | Поиск, просмотр и установка компонентов из реестра shadcn/ui                                                            | `.mcp.json` → `shadcn`                                                                               | [shadcn-ui/ui](https://github.com/shadcn-ui/ui)                                             | MIT        |
| **next-devtools MCP**           | Ошибки, логи и маршруты запущенного `pnpm dev` (Next.js 16+)                                                            | `.mcp.json` → `next-devtools`                                                                        | [vercel/next-devtools-mcp](https://github.com/vercel/next-devtools-mcp)                     | MIT        |
| **chrome-devtools MCP**         | Performance trace, Core Web Vitals, сеть, консоль                                                                       | `.mcp.json` → `chrome-devtools`                                                                      | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Apache-2.0 |
| **Playwright MCP**              | Сценарии в браузере, скриншоты                                                                                          | `.mcp.json` → `playwright`                                                                           | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)                     | Apache-2.0 |
| **context7**                    | Актуальная документация библиотек по версиям                                                                            | `.claude/settings.json`: `enabledPlugins` (`claude-plugins-official`)                                | [upstash/context7](https://github.com/upstash/context7)                                     | MIT        |
| **playground**                  | Интерактивные HTML-«песочницы» для сравнения вариантов (нужен в DS-0)                                                   | `.claude/settings.json`: `enabledPlugins` (`claude-plugins-official`)                                | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Apache-2.0 |

Сознательно **не** подключены: UI UX Pro Max и Taste Skill (конфликтующие эстетики), frontend-design от Anthropic (Impeccable — его наследник: два скилла дали бы противоречивые указания), Figma MCP (макетов в Figma нет, концепция делается в коде в DS-0).

## Первый запуск

1. Откройте папку проекта в Claude Code и подтвердите доверие к ней. После этого Claude Code сам склонирует маркетплейс Impeccable и загрузит плагин. Официальный маркетплейс `claude-plugins-official` (context7, playground) регистрируется при первой интерактивной сессии. Для `claude -p` и облачных сессий на новой машине один раз выполните `claude plugin marketplace add anthropics/claude-plugins-official`.
2. Подтвердите MCP-серверы из `.mcp.json`, когда Claude Code спросит. Подтверждение сохраняется в `.claude/settings.local.json` (не в git).
3. MCP-серверы запускаются через `npx`, поэтому Node должен быть в `PATH` (`mise activate` в профиле шелла). Для chrome-devtools нужен установленный Google Chrome.
4. Проверьте:
   - `/mcp` — `shadcn`, `next-devtools`, `chrome-devtools`, `playwright` и `plugin:context7:context7`;
   - `/impeccable` — показывает меню команд (полное имя плагинного скилла — `impeccable:impeccable`);
   - в списке скиллов есть `web-design-guidelines` и `vercel-react-best-practices`.

## Как это встроено в процесс

- **`/work-on-issue`** (UI-задачи): перед реализацией читаем `docs/design.md`, компоненты берём через shadcn MCP, React-код пишем по `vercel-react-best-practices`. Перед PR — `/impeccable polish` и `/impeccable harden`.
- **`ui-reviewer`**: `/impeccable critique` и `/impeccable audit`, скилл `web-design-guidelines`; для главной, нужд и доната — performance trace через chrome-devtools MCP (production-сборка, Slow 4G, CPU ×4, LCP < 2.5 с).
- **DS-0 «Визуальная концепция»**: `/impeccable init` и `shape` плюс скилл `playground` — 2–3 контрастных направления, выбор за человеком.

## Impeccable: что важно знать

- **`/impeccable init` до DS-0 не запускаем.** Он пишет `PRODUCT.md` (и позже `DESIGN.md`) в корень. Источник правды остаётся в `docs/`: `PRODUCT.md` должен ссылаться на [product.md](product.md), а не дублировать его, и то же самое — `DESIGN.md` для [design.md](design.md).
- **Хук-детектор.** Плагин добавляет хуки `SessionStart`, `PostToolUse` (Edit/Write) и `Stop`. Они запускают локальный движок и показывают агенту найденные антипаттерны. Хуки плагина работают без отдельного подтверждения команд. При первом запуске лаунчер скачивает бинарник движка закреплённой версии из GitHub Releases `pbakaus/impeccable` в `~/.impeccable/bin/` и сверяет sha256. Отключить хуки на один запуск: `claude --settings '{"disableAllHooks": true}'`.
- **Рабочие файлы** — в `.impeccable/`. Эфемерные файлы игнорируются (блок `impeccable-ignore` в `.gitignore`). Общие артефакты (`config.json`, `design.json`, `surfaces/*.md`, `critique/*.md`) коммитятся.
- **Исключения детектора** — только с причиной, в `.impeccable/config.json` (`detector.ignoreRules` / `ignoreValues`) или комментарием `impeccable-disable <правило>: <причина>` в файле.
- **Обновление:** поменять `ref` в `.claude/settings.json` на новый тег `skill-vX.Y.Z` после чтения changelog и описать изменения в PR.

## Скиллы Vercel: как обновлять

Скиллы скопированы как есть, без правок (вне Prettier, см. `.prettierignore`), чтобы обновление было простым diff. Правила проекта пишем в `docs/`, а не в эти файлы.

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/vercel-labs/agent-skills.git /tmp/agent-skills
git -C /tmp/agent-skills sparse-checkout set skills/web-design-guidelines skills/react-best-practices
rsync -a --delete /tmp/agent-skills/skills/web-design-guidelines/ .claude/skills/web-design-guidelines/
rsync -a --delete /tmp/agent-skills/skills/react-best-practices/ .claude/skills/vercel-react-best-practices/
```

Новый коммит `agent-skills` впишите в таблицу выше.

## Приватность (152-ФЗ, ADR-0004)

Ни один из этих инструментов не должен получать персональные данные. Проверки UI и производительности делаем на seed-данных (localhost или staging без реальных доноров). В запросы к внешним сервисам не попадают ПДн, секреты и содержимое `.env`.

| Инструмент            | Что уходит в сеть                                                                           | Настройка                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impeccable            | Скачивание движка из GitHub Releases. `concept-seed` обращается к каталогу impeccable.style | Телеметрия выбора выключена: `IMPECCABLE_NO_TELEMETRY=1`, `DO_NOT_TRACK=1` в `env` проекта                                                                             |
| web-design-guidelines | GET актуальных правил с `raw.githubusercontent.com`                                         | Данные проекта не отправляются                                                                                                                                         |
| context7              | Название библиотеки и вопрос по API — на сервис Upstash (вне РФ)                            | Не вставлять в запросы код с данными, ПДн, секреты                                                                                                                     |
| shadcn MCP            | Запросы к реестру компонентов                                                               | Только названия компонентов                                                                                                                                            |
| next-devtools MCP     | Анонимная телеметрия использования                                                          | Выключена: `NEXT_TELEMETRY_DISABLED=1`                                                                                                                                 |
| chrome-devtools MCP   | Статистика использования для Google, URL трейсов в CrUX API, проверка обновлений            | Выключены: `--no-usage-statistics`, `--no-performance-crux`, `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS`. `--isolated` — временный профиль Chrome без ваших cookie и сессий |
| Playwright MCP        | Ничего, кроме открываемых страниц                                                           | —                                                                                                                                                                      |

`NEXT_TELEMETRY_DISABLED=1` в `env` проекта заодно выключает телеметрию `next build` и `next dev`, которые запускают агенты.
