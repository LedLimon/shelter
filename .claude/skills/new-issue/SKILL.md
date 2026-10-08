---
name: new-issue
description: Завести новую задачу в GitHub Issues LedLimon/shelter по шаблону проекта — с метками (тип, область, приоритет, agent-ready/needs-human/money-critical), вехой, эпиком-родителем и зависимостями. Используй, когда нужно «заведи задачу», «создай issue», или когда в ходе работы найдена отдельная проблема.
argument-hint: "<краткое описание задачи>"
---

# Новая задача

## 1. Проверь, что такой задачи ещё нет

```bash
gh issue list -R LedLimon/shelter --state all --search "<ключевые слова>" --limit 20
```

Если похожая есть — дополни её комментарием, а не создавай дубль.

## 2. Определи атрибуты

- **Тип** (одна метка): `enhancement` (фича), `bug`, `chore`, `infra`, `design`, `documentation`, `idea`.
- **Область** (одна-две): `area:dogs`, `area:needs`, `area:payments`, `area:ledger`, `area:transparency`, `area:admin`, `area:auth`, `area:accounts`, `area:guardianship`, `area:in-kind`, `area:volunteers`, `area:content`, `area:legal`, `area:seo`, `area:design-system`, `area:infra`, `area:email`.
- **Приоритет:** `P0` — блокирует запуск; `P1` — важно; `P2` — можно позже.
- **Исполнение:**
  - `agent-ready` — только если задача описана настолько, что агент сделает её без уточнений;
  - `needs-human` — юридическое, оргвопросы, доступы, решения владельца;
  - `money-critical` — затрагивает деньги или книгу операций.
- **Веха:** `Фаза 0 — Фундамент`, `Фаза 1 — MVP: прозрачный сбор`, `Фаза 2 — Доноры и опека`, `Фаза 3 — Сообщество`, `Бэклог идей`.
- **Эпик-родитель:** найди подходящий: `gh issue list -R LedLimon/shelter --label epic --state open`.
- **Зависимости:** какие задачи должны быть закрыты раньше.

## 3. Тело задачи (на русском)

```markdown
## Зачем
1–3 предложения: какую проблему решаем и для кого.

## Что сделать
- конкретные шаги/компоненты/маршруты/модели

## Критерии приёмки
- [ ] проверяемый результат
- [ ] тесты: что именно покрыто

## Зависимости
- Блокируется: #N — название

## Документация
- docs/<файл>.md#<якорь>

---
Агенту: прочитай AGENTS.md, работай по скиллу work-on-issue.
```

Последнюю строку добавляй только для `agent-ready`.

## 4. Создай и свяжи

```bash
# создать
gh api repos/LedLimon/shelter/issues -X POST \
  -f title='<заголовок>' -F body=@body.md \
  -f 'labels[]=enhancement' -f 'labels[]=area:needs' -f 'labels[]=P1' -f 'labels[]=agent-ready' \
  -F milestone=<номер вехи> --jq '{number, id, html_url}'

# номер вехи
gh api repos/LedLimon/shelter/milestones --jq '.[] | "\(.number) \(.title)"'

# привязать к эпику (sub-issue): нужен id (не number) дочерней задачи
gh api repos/LedLimon/shelter/issues/<EPIC_N>/sub_issues -X POST -F sub_issue_id=<CHILD_ID>

# зависимость «blocked by»: id блокирующей задачи
gh api repos/LedLimon/shelter/issues/<N>/dependencies/blocked_by -X POST -F issue_id=<BLOCKER_ID>
```

Сообщи пользователю ссылку на созданную задачу.
