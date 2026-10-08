# Книга операций (ledger)

Прозрачность — главная ценность продукта, поэтому все движения денег учитываются в **append-only книге по принципу двойной записи**. Из неё выводятся все публичные цифры: собрано, потрачено, остаток общего фонда. Решение — [ADR-0003](adr/0003-double-entry-ledger.md).

> Это инструмент прозрачности, а не бухгалтерия приюта. Цифры сверяются с бухгалтером и отчётами в Минюст отдельно.

## Модель

- `LedgerAccount`: code (unique), kind, needId? (unique).
- `LedgerTransaction`: kind, idempotencyKey (unique), occurredAt, postedAt, publicMemo, donationId?, expenseId?, inKindId?, reversesId? (unique), actorId?.
- `LedgerEntry`: transactionId, accountId, amountKop (**со знаком**). Индекс (accountId, postedAt).
- `Expense`: needId?, title, vendor, amountKop, paidAt, status (`DRAFT | POSTED | VOIDED`), ledgerTxId?.
- `MonthlyReport`: period (`YYYY-MM`, unique), status, snapshot (JSON), snapshotSha256, commentary, publishedAt.

### Виды счетов (`LedgerAccount.kind`)

| Kind | Смысл |
|---|---|
| `GENERAL_FUND` | Общий фонд приюта (один счёт) |
| `NEED` | Счёт конкретной нужды (по одному на нужду) |
| `DONATIONS_IN` | Источник: входящие денежные пожертвования |
| `EXPENSES_OUT` | Сток: расходы (покупки, услуги) |
| `REFUNDS_OUT` | Сток: возвраты донорам |
| `FEES_OUT` | Сток: комиссии эквайринга |
| `IN_KIND_IN` | Источник: полученные вещи (оценочная стоимость) |
| `IN_KIND_USED` | Сток: использованные вещи |

### Виды транзакций (`LedgerTransaction.kind`)

`DONATION · OVERFLOW · ALLOCATE_FROM_GENERAL · EXPENSE · LEFTOVER_TO_GENERAL · SHORTFALL_COVER · REFUND · FEE · IN_KIND · CANCEL_TO_GENERAL · REVERSAL`

## Инварианты

Обеспечиваются **триггерами в raw SQL миграции** и тестами:

1. **Append-only:** `UPDATE` и `DELETE` на `LedgerTransaction` и `LedgerEntry` запрещены. Ошибка исправляется транзакцией `REVERSAL` (зеркальные проводки, `reversesId` уникален — сторнировать дважды нельзя).
2. **Баланс:** сумма `amountKop` по всем проводкам одной транзакции = 0 (отложенный constraint trigger).
3. **Закрытый месяц:** `postedAt` не может попадать в месяц с опубликованным `MonthlyReport`.
4. **Идемпотентность:** `idempotencyKey` уникален (`donation:{id}`, `overflow:{donationId}`, `expense:{id}`, `refund:{donationId}:{n}` …). Повторная проводка с тем же ключом — no-op.
5. **Единственный писатель:** в таблицы `Ledger*` пишет только `src/server/ledger`. Остальной код вызывает его функции (`postDonation`, `postExpense`, `settleNeed`, …) внутри своей транзакции.

## Таблица проводок

Знак: «−» у источника, «+» у получателя. Сумма в каждой транзакции = 0.

| Событие | Проводки |
|---|---|
| Пожертвование 3000 ₽ на нужду, до цели осталось 2000 ₽ | Две транзакции: `DONATION` (DONATIONS_IN −2000; NEED +2000, ключ `donation:{id}`) и `OVERFLOW` (DONATIONS_IN −1000; GENERAL +1000, ключ `overflow:{id}`). Публично: «Переплата 1000 ₽ → общий фонд» |
| Пожертвование в общий фонд / опека | `DONATION`: DONATIONS_IN −x; GENERAL +x (для опеки — с `dogId` у Donation) |
| Перевод из общего фонда в нужду | `ALLOCATE_FROM_GENERAL`: GENERAL −x; NEED +x |
| Покрытие недостачи перед расходом | `SHORTFALL_COVER`: GENERAL −x; NEED +x |
| Расход 1800 ₽ | `EXPENSE`: NEED −1800; EXPENSES_OUT +1800 |
| Остаток 200 ₽ при закрытии нужды | `LEFTOVER_TO_GENERAL`: NEED −200; GENERAL +200 |
| Отмена нужды с собранными 5000 ₽ | `CANCEL_TO_GENERAL`: NEED −5000; GENERAL +5000 |
| Возврат (нужда ещё не в закупке) | `REFUND`: NEED −x; REFUNDS_OUT +x |
| Возврат (по нужде уже купили) | `REFUND`: GENERAL −x; REFUNDS_OUT +x |
| Комиссия эквайринга | `FEE`: GENERAL −x; FEES_OUT +x |
| Вещи получены на 1500 ₽ | `IN_KIND`: IN_KIND_IN −1500; NEED +1500; затем NEED −1500; IN_KIND_USED +1500 (прогресс учитывает, денежный баланс нужды не меняется) |

## Как считается «собрано»

`collected(need)` = сумма проводок `DONATION` + `ALLOCATE_FROM_GENERAL` + `IN_KIND` − `REFUND` на счёт нужды. `SHORTFALL_COVER` показывается отдельно («добавлено из общего фонда»).

`Need.collectedKop` и `Need.inKindKop` — **кэш**, обновляется в той же транзакции, что и проводка. Ночная задача пересчитывает из книги и поднимает тревогу при расхождении.

## Переплата

Когда сумма пожертвования больше остатка до цели, лишнее уходит в общий фонд. Нужда, достигшая цели, переходит в `COLLECTED` **ровно один раз**, даже при одновременных вебхуках.

Блокировки строк — в фиксированном порядке `Donation → Need`:

```ts
await prisma.$transaction(async (tx) => {
  // 1. Lock donation; if already SUCCEEDED — exit (idempotency).
  await tx.$queryRaw`SELECT id FROM "Donation" WHERE id = ${donationId} FOR UPDATE`;
  // 2. Lock need.
  const [n] = await tx.$queryRaw<NeedRow[]>`
    SELECT "goalKop", "collectedKop", status FROM "Need" WHERE id = ${needId} FOR UPDATE`;
  const remaining = n.status === 'COLLECTING' ? Math.max(0, n.goalKop - n.collectedKop) : 0;
  const toNeed = Math.min(amount, remaining);
  const overflow = amount - toNeed;
  await ledger.postDonation(tx, { donationId, toNeed, overflow }); // idempotencyKey = `donation:${id}`
  await tx.need.update({
    where: { id: needId },
    data: {
      collectedKop: { increment: toNeed },
      ...(remaining > 0 && toNeed === remaining && { status: 'COLLECTED', collectedAt: new Date() }),
    },
  });
  await outbox.enqueue(tx, 'donation.thanks', { donationId, overflow });
});
// после коммита: revalidateTag(`need:${needId}`)
```

Блокировка строки нужды заставляет конкурентные вебхуки идти по очереди, поэтому достаточно READ COMMITTED. Если нужда уже не `COLLECTING` (закрыта, отменена) — вся сумма уходит в общий фонд, донору — письмо с объяснением.

## Закрытие нужды (settlement)

1. Все расходы по нужде проведены (`Expense.status = POSTED`).
2. Если баланс счёта нужды > 0 → `LEFTOVER_TO_GENERAL` на остаток.
3. Если расходы больше собранного → `SHORTFALL_COVER` **до** проводки расхода (баланс нужды не уходит в минус).
4. Баланс счёта нужды после закрытия = 0. Нужда → `DONE` с отчётом.

## Месячные отчёты

- Снимок цифр месяца (поступления по типам, расходы по категориям, остаток фонда) + комментарий админа + SHA-256 снимка.
- Публикует только `OWNER`. После публикации месяц закрыт: триггер запрещает проводки с `postedAt` в этом месяце.
- Поздний вебхук за закрытый месяц проводится в текущем месяце с пометкой «относится к периоду …».

## Публичное отображение

- Публичная книга показывает: дату, тип, сумму, `publicMemo`, ссылку на нужду/расход. Имя донора — только если он разрешил, иначе «Аноним».
- Переплата, остаток, недостача, отмена — отдельные строки с понятными подписями.
- Документы расхода (чеки, счета) показываются только с флагом `redacted = true`.
