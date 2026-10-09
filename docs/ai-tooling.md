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
- **`ui-reviewer`**: `/impeccable critique` и `/impeccable audit`, скилл `web-design-guidelines`; для главной, нужд и доната — performance trace через chrome-devtools MCP (production-сборка, Slow 4G, CPU ×4, LCP < 2.5 с, INP — отдельным трейсом).
- **DS-0 «Визуальная концепция»**: `/impeccable init` и `shape` плюс скилл `playground` — 2–3 контрастных направления, выбор за человеком.

## Impeccable: что важно знать

- **Контекст продукта.** Impeccable ищет `PRODUCT.md` и `DESIGN.md` в корне, а если их нет — в `docs/`. Поэтому сейчас он сам читает [product.md](product.md) и [design.md](design.md) — отдельно указывать их не нужно.
- **Команды, которые пишут контекст, — только в DS-0.** `init`, `document` и выбор визуального направления (new-work) переписывают найденные файлы по шаблону Impeccable, то есть правили бы наши `docs/*.md`. До DS-0 их не запускаем. В DS-0 сначала создаются корневые `PRODUCT.md` и `DESIGN.md` (на русском, со ссылками на `docs/` как источник правды), и Impeccable пишет уже в них. Правки вычитывает человек.
- **Хук-детектор.** Плагин добавляет хуки `SessionStart`, `PostToolUse` (Edit/Write) и `Stop`. Они запускают локальный движок и показывают агенту найденные антипаттерны. Хуки плагина работают без отдельного подтверждения команд. При первом запуске лаунчер скачивает бинарник движка из GitHub Releases `pbakaus/impeccable` в `~/.impeccable/bin/<версия>/` и сверяет sha256 с файлом из того же релиза. Выключить только хуки Impeccable: `IMPECCABLE_HOOK_DISABLED=1 claude` на один запуск или `/impeccable hooks off` (пишет в `config.local.json`, не в git). Не выключайте все хуки (`disableAllHooks`): вместе с ними отключится защита от пуша в `main`.
- **Настройки проекта** — `.impeccable/config.json`:
  - `updateCheck: false` — без ежедневного запроса к `impeccable.style/api/version` и без предложений `npx impeccable update`. **`npx impeccable install`/`update` не запускаем**: они поставят вторую, незакреплённую копию скилла и хуков прямо в проект;
  - `stalenessCheck: false` — пока контекст лежит в `docs/` в нашем формате, Impeccable считал бы его устаревшим и в каждой сессии предлагал `init`. Включается обратно в DS-0;
  - `detector.ignoreRules: ["em-dash-overuse"]` — для русской типографики тире нормальны («500 ₽ — 2 недели корма»).
- **Рабочие файлы** — в `.impeccable/`. Эфемерные файлы, макеты DS-0 (`mocks/`, `build/`) и отчёты `critique/` игнорируются (блок `impeccable-ignore` в `.gitignore`): итоги ревью идут в PR, макеты — в задачу. Коммитятся `config.json`, `design.json`, `surfaces/*.md`.
- **Исключения детектора** — только с причиной: точечно комментарием `impeccable-disable-next-line <правило>: <причина>`, на весь проект — в `.impeccable/config.json` (`detector.ignoreRules` / `ignoreValues`).
- **Закрепление версии** ограничено. Маркетплейс подключён по тегу `skill-v4.5.1` (по SHA коммита источник маркетплейса закрепить нельзя), а тег можно перевесить. Сверка sha256 защищает от битой загрузки, но не от подмены релиза. Если в `PATH` или в `~/.impeccable/bin/impeccable` уже есть другой движок, лаунчер возьмёт его.
- **Обновление:** прочитать changelog, поменять `ref` в `.claude/settings.json` на новый тег `skill-vX.Y.Z`, описать изменения в PR.

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

| Инструмент            | Что уходит в сеть                                                                                                                                                       | Настройка                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impeccable            | Скачивание движка из GitHub Releases. Выбор направления (`concept-seed`) обращается к каталогу impeccable.style. Проверка обновлений — к `impeccable.style/api/version` | Телеметрия выбора выключена: `IMPECCABLE_NO_TELEMETRY=1`, `DO_NOT_TRACK=1` в `env` проекта. Проверка обновлений выключена: `updateCheck: false` в `.impeccable/config.json` |
| web-design-guidelines | GET актуальных правил с `raw.githubusercontent.com`                                                                                                                     | Данные проекта не отправляются                                                                                                                                              |
| context7              | Название библиотеки и вопрос по API — на сервис Upstash (вне РФ)                                                                                                        | Не вставлять в запросы код с данными, ПДн, секреты                                                                                                                          |
| shadcn MCP            | Запросы к реестру компонентов                                                                                                                                           | Только названия компонентов                                                                                                                                                 |
| next-devtools MCP     | Анонимная телеметрия использования                                                                                                                                      | Выключена: `NEXT_TELEMETRY_DISABLED=1`                                                                                                                                      |
| chrome-devtools MCP   | Статистика использования для Google, URL трейсов в CrUX API, проверка обновлений                                                                                        | Выключены: `--no-usage-statistics`, `--no-performance-crux`, `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS`. `--isolated` — временный профиль Chrome без ваших cookie и сессий      |
| Playwright MCP        | Ничего, кроме открываемых страниц                                                                                                                                       | —                                                                                                                                                                           |

`NEXT_TELEMETRY_DISABLED=1` в `env` проекта заодно выключает телеметрию `next build` и `next dev`, которые запускают агенты.
