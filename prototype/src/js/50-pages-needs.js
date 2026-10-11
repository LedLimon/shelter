// Public pages: home, the list of needs, a need.

/** Pages by route name. A page returns { title, html } and optional flags. */
const PAGES = {};

function helpLabel(need) {
  return need.dogId ? `Помочь ${dogById(need.dogId).dat}` : "Помочь";
}

function todayHelped() {
  const gifts = latest(
    state.ledger.filter(
      (row) => row.kind === "donation" || row.kind === "guardian",
    ),
  );
  const today = gifts.filter(
    (row) => row.isNew || row.when.getDate() === NOW.getDate(),
  );
  const rows = (today.length ? today : gifts).slice(0, 3);
  const items = rows
    .map(
      (row) =>
        `<li><b>${row.who ? esc(row.who) : "Аноним"} — ${formatRub(row.amount)}</b><span>${formatRelative(row.when, NOW)}</span></li>`,
    )
    .join("");
  return `<aside class="today surface-notice" aria-labelledby="today-title">
    <h2 id="today-title">${today.length ? "Сегодня помогли" : "Недавно помогли"}</h2>
    <ul>${items}</ul>
    <a href="#/transparency/ledger">Все пожертвования и чеки</a>
  </aside>`;
}

function heroNeed(need) {
  const left = remaining(need);
  const visual = need.unit
    ? `<div class="hero-info">${needVisual(need)}</div>`
    : `${photo(need.photo, { alt: need.alt, focus: need.focus })}`;
  const sums = need.unit
    ? ""
    : `${needProgress(need)}
      <div class="row-baseline"><b class="t-sum-lg">${formatRub(need.collected)}</b><span class="muted t-caption">из ${formatRub(need.goal)} · осталось ${formatRub(left)}</span></div>`;
  return `<article class="sheet" aria-labelledby="hero-title">
    <div class="hero-body">
      <div class="need-meta"><span class="cat">${CATEGORIES[need.category].label}</span>${urgencyBadge(need.urgency)}</div>
      <h1 class="t-hero" id="hero-title">${esc(need.title)}</h1>
      <div class="hero-split">
        ${visual}
        <div class="hero-info">
          <p>${esc(need.lead)}</p>
          ${sums}
          <div class="hero-cta">
            <button type="button" class="btn btn-help" id="main-cta" data-action="donate" data-need="${need.id}">${helpLabel(need)}</button>
            <span class="when">${describeDeadline(need.deadline)}</span>
          </div>
          <a href="#/needs/${need.id}">Из чего складывается сумма и кто уже помог</a>
        </div>
      </div>
    </div>
    ${sumTabs(need, true)}
  </article>`;
}

function mapPreview() {
  return `<section class="section" aria-labelledby="map-preview-title">
    ${sectionHead("Карта приюта", "Открыть карту", "#/map", "map-preview-title")}
    ${note("p2", "Карта территории появится на втором этапе. Схему нарисуем по фото и плану приюта — здесь она условная.")}
    <div class="sheet report">
      <div class="stack-sm">
        <p class="report-say">Посмотрите, где кто живёт и что сейчас чиним: вольеры, выгул, ветпункт, склад и забор.</p>
        <a href="#/map">Пройтись по приюту</a>
      </div>
      <a class="map-mini" href="#/map" aria-label="Открыть карту приюта">${shelterMap(null, true)}</a>
    </div>
  </section>`;
}

function waysSheet(withTitle = true) {
  const ways = [
    ["#/donate", "Деньгами", "500 ₽ — две недели корма для одной собаки"],
    [
      "#/things",
      "Вещами",
      "Список на Ozon и WB, доставка в пункт выдачи приюта",
    ],
    [
      "#/guardianship",
      "Опекой",
      "От 300 ₽ в месяц на конкретную собаку, с фото и новостями",
    ],
    [
      "#/volunteers",
      "Руками",
      "Выгул по субботам с 10:00 до 14:00, нужны шесть человек",
    ],
  ];
  return `<section class="sheet ways" aria-label="Как помочь">
    <div class="sheet-body">
      ${withTitle ? '<h2 class="t-section caps">Как помочь</h2>' : ""}
      <p class="muted">Оторвите то, что подходит вам.</p>
    </div>
    <div class="tabs">${ways
      .map(
        ([href, title, text]) =>
          `<a class="tab" href="${href}"><b>${title}</b><span>${text}</span></a>`,
      )
      .join("")}</div>
  </section>`;
}

function storyCard(dog) {
  return `<article class="sheet story">
    ${photo(dog.photo, { ratio: "11", alt: `${dog.name} дома`, focus: dog.focus, stamp: "Дома" })}
    <div class="stack-xs"><h3>${dog.name}</h3><p class="t-caption">${dog.short}</p></div>
  </article>`;
}

/** For the home page: the latest purchases with receipts and the latest gift. */
function moneyRows() {
  const of = (group, count) =>
    latest(
      state.ledger.filter((row) => LEDGER_GROUP[row.kind] === group),
    ).slice(0, count);
  return latest([...of("in", 1), ...of("out", 3)]);
}

PAGES.home = () => {
  const urgent = activeNeeds();
  const [hero, ...rest] = urgent;
  const waiting = state.dogs
    .filter((dog) => dog.status === "looking")
    .sort((a, b) => a.since - b.since)
    .slice(0, 4);
  const stories = state.dogs.filter((dog) => dog.status === "home");
  const top = hero
    ? `<div class="board-top">${heroNeed(hero)}${todayHelped()}</div>`
    : `<h1 class="sr-only">Островок Надежды</h1>${emptyState("Пока все сыты 🎉 Посмотрите, кто ждёт дом.", "Собаки", "#/dogs")}`;
  return {
    title: "Главная",
    ownHelp: Boolean(hero),
    html: `
      ${note("mvp", "Первый экран — самая срочная нужда. Язычок с суммой сразу открывает оплату: два нажатия с главной. В жёлтом листе — последние пожертвования; имя показываем, только если человек разрешил.")}
      ${top}
      <section class="section" aria-labelledby="urgent-title">
        ${sectionHead("Срочно нужно", "Все нужды", "#/needs", "urgent-title")}
        ${note("mvp", "Нужды выстраиваются сами: сначала срочные и почти собранные. Срочность и порядок задаёт админ приюта.")}
        ${
          rest.length
            ? `<div class="grid-3">${rest
                .slice(0, 3)
                .map((need) => needCard(need))
                .join("")}</div>`
            : emptyState(
                "Остальное уже собрано. Можно поддержать общий фонд — из него закрываем срочное.",
                "Общий фонд",
                "#/donate",
              )
        }
      </section>
      <section class="section" aria-labelledby="waiting-title">
        ${sectionHead("Ждут дом", "Все собаки", "#/dogs", "waiting-title")}
        ${note("mvp", "Сначала те, кто ждёт дольше всех. Язычки «Хочу забрать» открывают контакты куратора — анкеты нет.")}
        <div class="dogs-strip">${waiting.map((dog) => dogCard(dog)).join("")}</div>
      </section>
      <section class="section" aria-labelledby="money-title">
        ${sectionHead("Куда уходят деньги", "Все операции", "#/transparency/ledger", "money-title")}
        ${note("mvp", "Цифры и строки берутся из книги операций, руками их никто не вписывает. Сделайте пожертвование в прототипе — строка появится здесь.")}
        <div class="sheet report">
          <div class="stack-sm">
            <p class="report-say">В октябре пришло <b class="nowrap">${formatRub(state.stats.monthIn)}</b> от ${formatCount(state.stats.monthDonors, ["человека", "человек", "человек"])}. Потрачено <b class="nowrap">${formatRub(state.stats.monthOut)}</b>. К каждой покупке приложен чек.</p>
            <a href="#/transparency">Прозрачность: на что именно</a>
            <a href="#/transparency/reports/2026-09">Отчёт за сентябрь</a>
          </div>
          ${ledgerList(moneyRows())}
        </div>
      </section>
      ${mapPreview()}
      <section class="section" aria-labelledby="home-stories-title">
        ${sectionHead("Они дома", "Все истории", "#/stories", "home-stories-title")}
        ${note("p2", "Истории пристроенных собак — второй этап. Собаку не удаляем с сайта: у неё просто меняется статус на «Дома».")}
        <div class="grid-2">${stories.map((dog) => storyCard(dog)).join("")}</div>
      </section>
      ${waysSheet()}
      ${note("mvp", "Деньги — с запуска. Помощь вещами и опека — второй этап, волонтёрские смены — третий.")}`,
  };
};

const NEED_SHOW = {
  active: ["Идёт сбор", ["open"]],
  going: ["Собрано и в работе", ["funded", "working"]],
  closed: ["Выполнено и отменено", ["done", "cancelled"]],
};

function chipLink(href, label, on) {
  return `<a class="chip" href="${href}"${on ? ' aria-current="true"' : ""}>${on ? icon("check") : ""}${label}</a>`;
}

PAGES.needs = (params, query) => {
  const show = NEED_SHOW[query.show] ? query.show : "active";
  const cat = CATEGORIES[query.cat] ? query.cat : "all";
  const link = (next) => {
    const merged = { show, cat, ...next };
    const parts = [];
    if (merged.cat !== "all") parts.push(`cat=${merged.cat}`);
    if (merged.show !== "active") parts.push(`show=${merged.show}`);
    return `#/needs${parts.length ? `?${parts.join("&")}` : ""}`;
  };
  const list = state.needs
    .filter(
      (need) =>
        NEED_SHOW[show][1].includes(need.status) &&
        (cat === "all" || need.category === cat),
    )
    .sort(
      (a, b) =>
        URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency) ||
        progress(b) - progress(a),
    );
  const empty =
    show === "active" && cat === "all"
      ? emptyState(
          "Пока все сыты 🎉 Посмотрите, кто ждёт дом.",
          "Собаки",
          "#/dogs",
        )
      : emptyState(
          "Здесь сейчас пусто. Посмотрите другие нужды или поддержите общий фонд — из него закрываем срочное.",
          "Сбросить фильтры",
          "#/needs",
        );
  return {
    title: "Нужды",
    html: `
      ${pageHead("Нужды", "Каждая нужда — конкретная покупка или работа: с суммой, сроком и отчётом. Выберите, чему помочь.")}
      ${note("mvp", "Фильтры живут в адресе страницы: ссылкой на «только корм» можно поделиться в соцсетях. Когда нужда выполнена, у неё появляется отчёт с чеками.")}
      <div class="sheet filters filters-inline">
        <div class="filter-group"><span class="label" id="f-cat">Категория</span>
          <div class="chips" role="group" aria-labelledby="f-cat">${chipLink(link({ cat: "all" }), "Все", cat === "all")}${Object.entries(
            CATEGORIES,
          )
            .map(([key, item]) =>
              chipLink(link({ cat: key }), item.label, cat === key),
            )
            .join("")}</div>
        </div>
        <div class="filter-group"><span class="label" id="f-show">Показать</span>
          <div class="chips" role="group" aria-labelledby="f-show">${Object.entries(
            NEED_SHOW,
          )
            .map(([key, item]) =>
              chipLink(link({ show: key }), item[0], show === key),
            )
            .join("")}</div>
        </div>
      </div>
      ${list.length ? `<div class="grid-3">${list.map((need) => needCard(need, 2)).join("")}</div>` : empty}
      <section class="sheet sheet-body" aria-labelledby="fund-teaser">
        <h2 class="t-title" id="fund-teaser">Не знаете, что выбрать?</h2>
        <p>Общий фонд закрывает то, что не ждёт: комиссии банка, недостачи по сборам, срочный визит к врачу. Каждый рубль из него тоже виден в книге операций.</p>
        <div><a class="btn btn-outline" href="#/donate">В общий фонд</a></div>
      </section>`,
  };
};

function needState(need) {
  const dog = need.dogId ? dogById(need.dogId) : null;
  if (need.status === "open") {
    const tooSmall = remaining(need) < SHELTER.minDonation;
    return `<div class="hero-cta">
        <button type="button" class="btn btn-help" id="main-cta" data-action="donate" data-need="${need.id}">${helpLabel(need)}</button>
        <span class="when">${describeDeadline(need.deadline)}</span>
      </div>${
        tooSmall
          ? `<p class="t-caption muted">Осталось ${formatRub(remaining(need))} — меньше минимального пожертвования. Сумму можно выбрать в форме, лишнее уйдёт в общий фонд.</p>`
          : ""
      }`;
  }
  const texts = {
    draft:
      "Черновик: на сайте эту нужду пока никто не видит. Опубликовать её может админ.",
    funded: `Сбор закрыт. ${dog ? `Спасибо за ${dog.acc}!` : "Спасибо!"} Скоро купим и выложим чек.`,
    working:
      "Деньги собраны, покупаем. Чеки появляются в отчёте сразу после оплаты.",
    done: need.report,
    cancelled: need.report,
  };
  const mark =
    need.status === "funded"
      ? '<span class="stamp">Собрано</span>'
      : needStatusBadge(need.status);
  return `<div class="stack-sm"><div>${mark}</div><p>${esc(texts[need.status])}</p>
    <div class="row"><a class="btn btn-outline" href="#/needs">Другие нужды</a><a href="#/donate">В общий фонд</a></div></div>`;
}

function needMoney(need) {
  if (need.unit) return needVisual(need);
  const over =
    need.status !== "open" && need.status !== "draft" && need.covered
      ? `<p class="t-caption muted">Не хватило ${formatRub(need.covered)} — добавил общий фонд.</p>`
      : "";
  return `${needProgress(need)}
    <div class="row-baseline"><b class="t-sum-lg">${formatRub(need.collected)}</b><span class="muted t-caption">из ${formatRub(need.goal)}${
      need.status === "open" ? ` · осталось ${formatRub(remaining(need))}` : ""
    }</span></div>${over}`;
}

function needReport(need) {
  const expenses = (need.expenseIds ?? []).map(expenseById);
  if (!expenses.length) return "";
  const rows = latest(
    state.ledger.filter(
      (row) => row.needId === need.id && row.kind !== "donation",
    ),
  );
  return `<section class="section" aria-labelledby="report-title">
    ${sectionHead("Отчёт", "", "", "report-title")}
    ${note("mvp", "Отчёт собирается сам из расходов, которые админ внёс в админке: сумма, поставщик, чек и фото результата. На чеках закрашены персональные данные — без этой отметки документ не опубликуется.")}
    <div class="split split-even">
      <div class="sheet sheet-body">
        ${expenses
          .map(
            (expense) => `<div class="stack-sm">
              <div class="row-between"><h3 class="t-title"><a href="#/transparency/expenses/${expense.id}">${esc(expense.title)}</a></h3><b class="t-sum">${formatRub(expense.amount)}</b></div>
              <p class="when">${formatDate(expense.date)} · ${esc(expense.supplier)}</p>
              ${expenseDocs(expense)}
            </div>`,
          )
          .join('<hr class="divider" />')}
      </div>
      <div class="sheet sheet-body">
        <h3 class="t-title">Строки в книге операций</h3>
        ${ledgerList(rows)}
        <p class="t-caption muted">Собрано ${formatRub(need.collected)}, потрачено ${formatRub(need.spent)}.</p>
      </div>
    </div>
  </section>`;
}

PAGES.need = ({ id }) => {
  const need = needById(id);
  if (!need) return null;
  const dog = need.dogId ? dogById(need.dogId) : null;
  const zone = need.zoneId ? zoneById(need.zoneId) : null;
  const gifts = latest(
    state.ledger.filter(
      (row) => row.needId === need.id && row.kind === "donation",
    ),
  ).slice(0, 5);
  const breakdown = need.breakdown.length
    ? `<div class="stack-sm"><h2 class="t-title">Из чего складывается сумма</h2>
        <ul class="ledger">${need.breakdown
          .map(
            ([name, sum]) =>
              `<li class="ledger-row ledger-row-2"><span>${name}</span><b class="ledger-amt">${formatRub(sum)}</b></li>`,
          )
          .join("")}</ul></div>`
    : "";
  return {
    title: need.title,
    ownHelp: need.status === "open",
    sticky:
      need.status === "open"
        ? `<button type="button" class="btn btn-help btn-block" id="sticky-cta" data-action="donate" data-need="${need.id}">${helpLabel(need)}</button>`
        : null,
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/needs">Нужды</a> / ${CATEGORIES[need.category].label}</nav>
      ${note("mvp", "Прогресс — это сумма настоящих платежей, а не число, вписанное вручную. Когда сбор доходит до 100 %, он закрывается сам; всё, что пришло сверх цели, уходит в общий фонд отдельной строкой.")}
      <div class="split split-wide">
        <article class="sheet">
          <div class="hero-body">
            <div class="need-meta"><span class="cat">${CATEGORIES[need.category].label}</span>${
              need.status === "open" ? urgencyBadge(need.urgency) : ""
            }</div>
            <h1 class="need-h1">${esc(need.title)}</h1>
            ${need.photo && !need.unit ? photo(need.photo, { alt: need.alt, focus: need.focus }) : ""}
            <div class="prose"><p class="t-lead">${esc(need.lead)}</p>${need.body.map((text) => `<p>${text}</p>`).join("")}</div>
            ${needMoney(need)}
            ${needState(need)}
            ${breakdown}
          </div>
          ${sumTabs(need, true)}
        </article>
        <div class="stack">
          <section class="sheet sheet-body" aria-labelledby="donors-title">
            <h2 class="t-title" id="donors-title">Помогли</h2>
            <p class="t-caption muted">${need.donors ? `${formatCount(need.donors, ["человек", "человека", "человек"])}. Имя видно, только если человек разрешил.` : "Пока никто — вы можете быть первым."}</p>
            ${
              gifts.length
                ? `<ul class="ledger">${gifts
                    .map(
                      (row) =>
                        `<li class="ledger-row"><span class="ledger-date">${formatDay(row.when)}</span><span>${row.who ? esc(row.who) : "Аноним"}${row.isNew ? '<span class="ledger-new">новое</span>' : ""}</span><b class="ledger-amt is-in">${formatRub(row.amount)}</b></li>`,
                    )
                    .join("")}</ul>`
                : ""
            }
            <a href="#/transparency/ledger">Все пожертвования в книге операций</a>
          </section>
          <section class="sheet sheet-body" aria-labelledby="timeline-title">
            <h2 class="t-title" id="timeline-title">Что происходило</h2>
            ${timeline(need.timeline)}
          </section>
          ${
            dog
              ? `<section class="sheet sheet-body" aria-labelledby="need-dog"><h2 class="t-title" id="need-dog">Для кого</h2>
                  <a class="mini" href="#/dogs/${dog.id}">${photo(dog.photo, { ratio: "11", focus: dog.focus })}<span><b>${dog.name}</b><span class="t-caption muted">${DOG_STATUS[dog.status].label}</span></span></a></section>`
              : ""
          }
          ${
            zone
              ? `<section class="sheet sheet-body" aria-labelledby="need-zone"><h2 class="t-title" id="need-zone">Где это</h2>
                  <p>${zone.name}. <a href="#/map?zone=${zone.id}">Показать на карте</a></p>${note("p2", "Связь нужды с местом на карте появится вместе с картой приюта.")}</section>`
              : ""
          }
        </div>
      </div>
      ${needReport(need)}`,
  };
};
