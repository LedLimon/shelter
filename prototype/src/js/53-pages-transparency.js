// Transparency: the dashboard, the public ledger, an expense with receipts, a monthly report.

function bars(rows) {
  const max = Math.max(...rows.map(([, sum]) => sum), 1);
  return `<div class="bars">${rows
    .map(
      ([
        label,
        sum,
      ]) => `<div class="bar"><span>${label}</span><b class="ledger-amt">${formatRub(sum)}</b>
        ${progressBar(sum / max, `${label}: ${formatRub(sum)}`, true)}</div>`,
    )
    .join("")}</div>`;
}

function spentRows() {
  return Object.entries(state.stats.spentByCategory)
    .filter(([, sum]) => sum > 0)
    .map(([key, sum]) => [
      key === "fee" ? "Комиссии банка" : CATEGORIES[key].label,
      sum,
    ])
    .sort((a, b) => b[1] - a[1]);
}

PAGES.transparency = () => ({
  title: "Прозрачность",
  html: `
    ${pageHead("Прозрачность", "Каждое поступление и каждый расход записаны в книгу операций. Запись нельзя стереть или поправить задним числом — только добавить новую.")}
    ${note("mvp", "Это главная ценность сайта: человек видит путь своих денег до чека и фото. Цифры считает программа из платежей и расходов — подправить их руками нельзя.")}
    <section class="sheet report" aria-labelledby="month-title">
      <div class="stack-sm">
        <h2 class="t-title" id="month-title">Октябрь, на сегодня</h2>
        <p class="report-say">Пришло <b class="nowrap">${formatRub(state.stats.monthIn)}</b> от ${formatCount(state.stats.monthDonors, ["человека", "человек", "человек"])}. Потрачено <b class="nowrap">${formatRub(state.stats.monthOut)}</b>. В общем фонде — <b class="nowrap">${formatRub(state.stats.fund)}</b>.</p>
        <a href="#/donate">Что такое общий фонд</a>
      </div>
      <div class="stack-sm">
        <h3 class="t-label">На что потрачено</h3>
        ${bars(spentRows())}
      </div>
    </section>
    <section class="section" aria-labelledby="last-title">
      ${sectionHead("Последние операции", "Вся книга", "#/transparency/ledger", "last-title")}
      <div class="sheet sheet-body">${ledgerList(latest(state.ledger).slice(0, 6))}</div>
    </section>
    <div class="split split-even">
      <section class="sheet sheet-body" aria-labelledby="rules-title">
        <h2 class="t-title" id="rules-title">Как мы считаем</h2>
        <ul class="prose">
          <li>Сбор закрывается сам, когда набрано 100 %. Всё, что пришло сверх цели, уходит в общий фонд отдельной строкой.</li>
          <li>Купили дешевле — остаток переходит в общий фонд. Вышло дороже — недостачу добавляет фонд, и это тоже строка.</li>
          <li>Ошибку нельзя стереть: её исправляет обратная запись, и обе остаются на виду.</li>
          <li>Комиссии банка платит общий фонд, раз в неделю одной строкой.</li>
        </ul>
      </section>
      <section class="sheet sheet-body" aria-labelledby="reports-title">
        <h2 class="t-title" id="reports-title">Отчёты по месяцам</h2>
        <ul class="doc-list">
          <li>${icon("file-text")}<span><a href="#/transparency/reports/2026-09">Сентябрь 2026</a><br /><span class="t-caption muted">опубликован 5 октября, месяц закрыт</span></span>${icon("lock", "Закрыт для правок")}</li>
          <li>${icon("file-text")}<span><button type="button" class="btn-link" ${stub("Отчёты за прошлые месяцы открываются так же, как сентябрьский.", "p2")}>Август 2026</button><br /><span class="t-caption muted">опубликован 4 сентября, месяц закрыт</span></span>${icon("lock", "Закрыт для правок")}</li>
          <li>${icon("hourglass")}<span>Октябрь 2026<br /><span class="t-caption muted">выйдет до 5 ноября</span></span><span></span></li>
        </ul>
        ${note("p2", "Месячный отчёт — снимок цифр и комментарий приюта. После публикации месяц закрывается: строки в нём больше не меняются.")}
      </section>
    </div>`,
});

const LEDGER_TYPES = {
  all: "Все",
  in: "Поступления",
  out: "Расходы",
  move: "Переводы в фонд и из фонда",
};

PAGES.ledger = (params, query) => {
  const type = LEDGER_TYPES[query.type] ? query.type : "all";
  const need = needById(query.need) ? query.need : "all";
  const link = (next) => {
    const merged = { type, need, ...next };
    const parts = Object.entries(merged)
      .filter(([, value]) => value !== "all")
      .map(([key, value]) => `${key}=${value}`);
    return `#/transparency/ledger${parts.length ? `?${parts.join("&")}` : ""}`;
  };
  const rows = latest(state.ledger).filter(
    (row) =>
      (type === "all" || LEDGER_GROUP[row.kind] === type) &&
      (need === "all" || row.needId === need),
  );
  const needOptions = [
    ["all", "Все нужды и общий фонд"],
    ...state.needs.filter(isPublic).map((item) => [item.id, item.title]),
  ];
  return {
    title: "Книга операций",
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/transparency">Прозрачность</a></nav>
      ${pageHead("Книга операций", "Все поступления и расходы приюта, строка за строкой. Синим — то, что пришло.")}
      ${note("mvp", "Пожертвования и расходы, сделанные в прототипе, появляются здесь сразу и помечены словом «новое». На настоящем сайте книгу можно листать по месяцам и выгрузить в таблицу.")}
      <div class="sheet filters filters-inline">
        <div class="filter-group"><span class="label" id="lf-type">Что показать</span>
          <div class="chips" role="group" aria-labelledby="lf-type">${Object.entries(
            LEDGER_TYPES,
          )
            .map(([key, label]) =>
              chipLink(link({ type: key }), label, type === key),
            )
            .join("")}</div>
        </div>
        ${selectField({ id: "ledger-need", label: "Нужда", model: "ledgerFilter.need", value: need, options: needOptions, change: "ledger-need" })}
        <div class="row">
          <span class="when">Октябрь 2026</span>
          <button type="button" class="btn btn-outline" ${stub("Здесь выбирают месяц или любые две даты.")}>${icon("calendar-days")}Другой период</button>
          <button type="button" class="btn btn-outline" ${stub("Кнопка скачает все строки за выбранный период в файле CSV — его открывает Excel.")}>${icon("download")}Выгрузить CSV</button>
        </div>
      </div>
      <div class="sheet sheet-body">
        ${ledgerList(rows, { numbers: true })}
        <div class="row-between"><span class="when">${formatCount(rows.length, ["операция", "операции", "операций"])}</span>
          <button type="button" class="btn-link" ${stub("Книга листается по страницам до самой первой операции приюта.")}>Показать более ранние</button></div>
      </div>`,
  };
};

PAGES.expense = ({ id }) => {
  const expense = expenseById(id);
  if (!expense) return null;
  const need = expense.needId ? needById(expense.needId) : null;
  const rows = latest(
    state.ledger.filter(
      (row) =>
        row.expenseId === expense.id ||
        (need &&
          row.needId === need.id &&
          ["from_fund", "to_fund"].includes(row.kind)),
    ),
  );
  return {
    title: expense.title,
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/transparency">Прозрачность</a> / <a href="#/transparency/ledger">Книга операций</a></nav>
      <div class="split split-even">
        <article class="sheet sheet-body">
          <span class="cat">Расход · ${formatDate(expense.date)}</span>
          <h1 class="t-section">${esc(expense.title)}</h1>
          <b class="t-sum-lg">${formatRub(expense.amount)}</b>
          <dl class="kv">
            <dt>Поставщик</dt><dd>${esc(expense.supplier)}</dd>
            <dt>На что</dt><dd>${need ? `<a href="#/needs/${need.id}">${esc(need.title)}</a>` : "Из общего фонда"}</dd>
            <dt>Кто внёс</dt><dd>Ирина, админ</dd>
          </dl>
          ${expense.text ? `<p>${esc(expense.text)}</p>` : ""}
          <div class="stack-sm"><h2 class="t-title">Строки в книге операций</h2>${ledgerList(rows, { numbers: true })}</div>
        </article>
        <div class="stack">
          <section class="sheet sheet-body" aria-labelledby="docs-title">
            <h2 class="t-title" id="docs-title">Чеки и фото</h2>
            ${expenseDocs(expense)}
            <p class="t-caption muted">Фамилии, телефоны и номера карт на документах закрашены.</p>
          </section>
          ${note("mvp", "Чек или счёт нельзя опубликовать, пока сотрудник не отметит, что персональные данные на нём закрашены. В прототипе вместо сканов — нарисованные заглушки.")}
        </div>
      </div>`,
  };
};

PAGES.report = ({ id }) => {
  if (id !== REPORT_SEPTEMBER.id) return null;
  const report = REPORT_SEPTEMBER;
  return {
    title: "Отчёт за сентябрь",
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/transparency">Прозрачность</a></nav>
      ${pageHead("Отчёт за сентябрь", "")}
      ${iconLine("lock", `Опубликован ${report.closedOn}. Месяц закрыт: строки сентября больше не меняются.`, "muted")}
      ${note("p2", "Отчёт собирается из книги операций одним нажатием; приют добавляет только комментарий. Подписчикам он уходит письмом.")}
      <section class="sheet report" aria-labelledby="rep-sum">
        <div class="stack-sm">
          <h2 class="sr-only" id="rep-sum">Итоги месяца</h2>
          <p class="report-say">Пришло <b class="nowrap">${formatRub(report.in)}</b> от ${formatCount(report.donors, ["человека", "человек", "человек"])}. Потрачено <b class="nowrap">${formatRub(report.out)}</b>.</p>
          <p class="muted">На 30 сентября в общем фонде осталось ${formatRub(report.fundEnd)}.</p>
        </div>
        <div class="stack-sm"><h3 class="t-label">На что потрачено</h3>${bars(report.byCategory)}</div>
      </section>
      <div class="split split-even">
        <section class="sheet sheet-body" aria-labelledby="rep-say">
          <h2 class="t-title" id="rep-say">Что успели</h2>
          <div class="prose">${report.comment.map((text) => `<p>${text}</p>`).join("")}</div>
          <p class="when">Ирина, владелец приюта · демо-текст</p>
        </section>
        <section class="sheet sheet-body" aria-labelledby="rep-big">
          <h2 class="t-title" id="rep-big">Крупные расходы</h2>
          <ul class="ledger">${report.rows
            .map(
              (
                row,
              ) => `<li class="ledger-row"><span class="ledger-date">${row.day}</span>
                <div class="ledger-what"><span>${row.title}</span><span class="sub"><button type="button" class="btn-link" ${stub("Откроется страница расхода с документами — такая же, как у расходов октября.")}>${row.doc}</button></span></div>
                <b class="ledger-amt">${formatRub(-row.amount)}</b></li>`,
            )
            .join("")}</ul>
          <a href="#/transparency/ledger">Книга операций</a>
        </section>
      </div>`,
  };
};
