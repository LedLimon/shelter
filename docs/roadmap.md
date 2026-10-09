# Роадмап

Работа ведётся задачами в [GitHub Issues](https://github.com/LedLimon/shelter/issues): эпики с под-задачами (sub-issues), зависимости «blocked by», вехи по фазам. Агент берёт задачу с меткой `agent-ready`, только если все блокирующие задачи закрыты (скилл `/work-on-issue`).

| Фаза                         | Цель                                                                                                        | Оценка      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| **0 — Фундамент**            | Оргвопросы и юридическое (параллельно), каркас проекта, дизайн-система, БД, авторизация, медиа, CI, staging | ~1–1.5 нед. |
| **1 — MVP: прозрачный сбор** | Собаки, нужды, пожертвования, книга операций, прозрачность, контент, юридические страницы, запуск           | ~4–6 нед.   |
| **2 — Доноры и опека**       | Личный кабинет, виртуальная опека, помощь вещами, ежемесячные отчёты, «Они дома»                            | ~4 нед.     |
| **3 — Сообщество**           | Волонтёрство, доступность, нагрузка                                                                         | ~4–6 нед.   |
| **Бэклог идей**              | Идеи для роста пожертвований и пристройства                                                                 | —           |

## [Фаза 0 — Фундамент](https://github.com/LedLimon/shelter/milestone/1)

- **[Организационные и юридические задачи](https://github.com/LedLimon/shelter/issues/1)** — 6 задач
- **[Фундамент проекта](https://github.com/LedLimon/shelter/issues/2)** — 10 задач
- **[Дизайн-система и публичный каркас](https://github.com/LedLimon/shelter/issues/3)** — 7 задач

## [Фаза 1 — MVP: прозрачный сбор](https://github.com/LedLimon/shelter/milestone/2)

- **[Книга операций и прозрачность](https://github.com/LedLimon/shelter/issues/4)** — 6 задач
- **[Собаки](https://github.com/LedLimon/shelter/issues/5)** — 4 задачи
- **[Нужды](https://github.com/LedLimon/shelter/issues/6)** — 4 задачи
- **[Пожертвования и платежи](https://github.com/LedLimon/shelter/issues/7)** — 10 задач
- **[Контент, SEO и юридические страницы](https://github.com/LedLimon/shelter/issues/8)** — 6 задач
- **[Админ-дашборд, качество и запуск](https://github.com/LedLimon/shelter/issues/9)** — 5 задач

## [Фаза 2 — Доноры и опека](https://github.com/LedLimon/shelter/milestone/3)

- **[Личный кабинет донора](https://github.com/LedLimon/shelter/issues/10)** — 4 задачи
- **[Виртуальная опека](https://github.com/LedLimon/shelter/issues/11)** — 3 задачи
- **[Помощь вещами](https://github.com/LedLimon/shelter/issues/12)** — 3 задачи
- **[Отчёты и вовлечение](https://github.com/LedLimon/shelter/issues/13)** — 3 задачи

## [Фаза 3 — Сообщество](https://github.com/LedLimon/shelter/milestone/4)

- **[Волонтёрство](https://github.com/LedLimon/shelter/issues/14)** — 3 задачи

## [Бэклог идей](https://github.com/LedLimon/shelter/milestone/5)

- **[Бэклог идей](https://github.com/LedLimon/shelter/issues/15)** — 9 задач

## С чего начать

Задачи без зависимостей — их можно брать сразу:

- [#16](https://github.com/LedLimon/shelter/issues/16) [ORG-1] Подтвердить юрлицо приюта и расчётный счёт — 👤 человек
- [#20](https://github.com/LedLimon/shelter/issues/20) [ORG-5] Бренд приюта, фото и тексты первых собак и нужд — 👤 человек
- [#21](https://github.com/LedLimon/shelter/issues/21) [ORG-6] Хостинг и домен в РФ: выбрать провайдера, выдать доступы — 👤 человек
- [#22](https://github.com/LedLimon/shelter/issues/22) [FND-1] Инициализация Next.js: TS strict, pnpm, ESLint, Prettier, Tailwind v4, shadcn/ui — 🤖 агент

Критический путь MVP: FND-1 → FND-2 → FND-4 → LED-1 / FND-6 → FND-7 → NEED-1 → NEED-2 → PAY-3 → PAY-4 → OPS-2 → OPS-3. Параллельно — дизайн-система (`DS-*`, начиная с DS-0 — визуальная концепция с человеком) и оргзадачи (`ORG-*`).
