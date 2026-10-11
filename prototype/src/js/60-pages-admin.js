// Admin: sign-in, dashboard, a need from draft to report, a dog card, the ledger, map zones.

const STAFF = { name: "Ирина", role: "Владелец" };

/** Admin pages are for staff: without a session they lead to the sign-in. */
function staffOnly(page) {
  return (params, query) =>
    state.staff
      ? { admin: true, ...page(params, query) }
      : { redirect: "#/admin/login" };
}

PAGES.adminLogin = () => {
  const form = ui.login;
  const first = `<h1 class="t-title">Вход для сотрудников</h1>
    <p class="muted">После пароля спросим код из приложения на телефоне.</p>
    <form class="stack-sm" data-submit="login-next" novalidate>
      ${field({ id: "login-email", label: "Email", model: "login.email", value: form.email, type: "email", attrs: 'autocomplete="username"' })}
      ${field({ id: "login-password", label: "Пароль", model: "login.password", value: form.password, type: "password", attrs: 'autocomplete="current-password"', hint: "В прототипе вход уже заполнен — просто нажмите «Дальше»." })}
      <button type="submit" class="btn btn-block" id="login-next">Дальше</button>
    </form>
    <hr class="divider" />
    <p class="t-caption muted">Забыли пароль или потеряли телефон вместе с резервными кодами? Напишите владельцу приюта.</p>`;
  const second = `<h1 class="t-title">Код из приложения</h1>
    <p class="muted">Откройте приложение-аутентификатор на телефоне и введите шесть цифр.</p>
    <form class="stack-sm" data-submit="login-code" novalidate>
      ${field({ id: "login-code", label: "Код", model: "login.code", value: form.code, placeholder: "000 000", attrs: 'inputmode="numeric" autocomplete="one-time-code" maxlength="7"', hint: "В прототипе подойдёт любой код — можно оставить поле пустым." })}
      <button type="submit" class="btn btn-block" id="login-enter">Войти</button>
    </form>
    <div><button type="button" class="btn-link" id="login-back" data-action="login-back">Назад к паролю</button></div>`;
  return {
    title: "Вход для сотрудников",
    bare: true,
    html: `<div class="login admin stack">
      <div class="sheet sheet-body">${form.step === 1 ? first : second}</div>
      ${note("mvp", "У каждого сотрудника обязателен второй шаг — код из приложения на телефоне. Этот экран уже работает в настоящем коде сайта.")}
      <p class="center"><a href="#/home">На сайт приюта</a></p>
    </div>`,
  };
};

ACTIONS["login-next"] = () => {
  ui.login.step = 2;
  refresh("login-code");
};

ACTIONS["login-back"] = () => {
  ui.login.step = 1;
  refresh("login-email");
};

ACTIONS["login-code"] = () => {
  state.staff = STAFF;
  ui.login.step = 1;
  // Back to the page the visitor wanted before the sign-in, if there was one.
  const wanted = ui.afterLogin;
  ui.afterLogin = null;
  go(wanted && wanted !== "#/admin/login" ? wanted : "#/admin");
};

ACTIONS.logout = () => {
  state.staff = null;
  go("#/admin/login");
};

function attention() {
  const items = [];
  for (const need of state.needs) {
    const href = `#/admin/needs/${need.id}`;
    if (need.status === "draft")
      items.push([
        "pencil",
        `Черновик «${esc(need.title)}» ждёт публикации`,
        href,
      ]);
    if (need.status === "funded")
      items.push([
        "shopping-cart",
        `«${esc(need.title)}» — собрано, пора покупать`,
        href,
      ]);
    if (need.status === "working")
      items.push([
        "camera",
        `«${esc(need.title)}» — в работе: добавьте фото результата и закройте`,
        href,
      ]);
    if (need.status === "open" && progress(need) >= 0.9)
      items.push([
        "hand-coins",
        `«${esc(need.title)}» — до цели ${formatRub(remaining(need))}`,
        href,
      ]);
  }
  const rows = items
    .map(
      ([name, text, href]) =>
        `<li>${icon(name)}<span>${text}</span><a href="${href}">Открыть</a></li>`,
    )
    .join("");
  return `<ul class="attn">${rows}
    <li>${icon("triangle-alert")}<span>Один автоплатёж не прошёл: банк отклонил карту</span><button type="button" class="btn-link" ${stub("Раздел «Подписки»: неудачные списания, повторная попытка, письмо донору.")}>Открыть</button></li>
    <li>${icon("package")}<span>Две посылки ждут отметки «получено»</span><button type="button" class="btn-link" ${stub("Раздел «Вещи»: отметка «получено» засчитывает вещь в прогресс нужды.", "p2")}>Открыть</button></li>
    <li>${icon("circle-check")}<span>Уведомления от банка приходят без ошибок</span><span></span></li>
  </ul>`;
}

PAGES.admin = staffOnly(() => {
  const today = state.ledger.filter(
    (row) =>
      LEDGER_GROUP[row.kind] === "in" &&
      (row.isNew || row.when.getDate() === NOW.getDate()),
  );
  const sum = today.reduce((total, row) => total + (row.paid ?? row.amount), 0);
  const clicks = CURATOR.channels
    .map(
      (channel) =>
        `${channel.label === "Позвонить" ? "звонок" : channel.label} ${state.adoptClicks[channel.id]}`,
    )
    .join(" · ");
  return {
    title: "Админка",
    html: `
      <h1>Здравствуйте, ${STAFF.name}</h1>
      ${note("mvp", "Дашборд показывает то, что требует действия сегодня. Что видит сотрудник, зависит от роли: владелец, админ, куратор, координатор волонтёров. Каждое действие пишется в журнал.")}
      <section class="sheet sheet-body" aria-labelledby="adm-today">
        <h2 id="adm-today">Сегодня</h2>
        <p>Пришло <b class="nowrap">${formatRub(sum)}</b> — ${formatCount(today.length, ["пожертвование", "пожертвования", "пожертвований"])}. В общем фонде <b class="nowrap">${formatRub(state.stats.fund)}</b>.</p>
        <p class="hint">«Хочу забрать» за месяц: ${clicks}.</p>
        <div class="form-actions">
          <a class="btn btn-sm" href="#/admin/needs/new">${icon("plus")}Новая нужда</a>
          <a class="btn btn-outline btn-sm" href="#/admin/ledger">Книга операций</a>
        </div>
      </section>
      <section class="sheet sheet-body" aria-labelledby="adm-attn">
        <h2 id="adm-attn">Требует внимания</h2>
        ${attention()}
      </section>`,
  };
});

function needsTable(list) {
  const rows = list
    .map(
      (need) => `<tr>
        <td><a href="#/admin/needs/${need.id}">${esc(need.title)}</a><br /><span class="mono">${CATEGORIES[need.category].label}</span></td>
        <td>${urgencyBadge(need.urgency)}</td>
        <td>${needStatusBadge(need.status)}</td>
        <td class="r"><span class="amt">${formatRub(need.collected)}</span><br /><span class="mono">из ${formatRub(need.goal)}</span></td>
        <td class="mono">${describeDeadline(need.deadline)}</td>
      </tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="dt">
    <thead><tr><th scope="col">Нужда</th><th scope="col">Срочность</th><th scope="col">Статус</th><th scope="col" class="r">Собрано</th><th scope="col">Срок</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

PAGES.adminNeeds = staffOnly(() => {
  const order = ["draft", "open", "funded", "working", "done", "cancelled"];
  const list = [...state.needs].sort(
    (a, b) =>
      order.indexOf(a.status) - order.indexOf(b.status) ||
      URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency),
  );
  return {
    title: "Нужды",
    html: `
      <div class="row-between"><h1>Нужды</h1><a class="btn" href="#/admin/needs/new">${icon("plus")}Новая нужда</a></div>
      ${note("mvp", "Путь нужды: черновик → идёт сбор → собрано → закупаем → выполнено с отчётом. Черновик может создать куратор, публикует и закрывает админ.")}
      <div class="sheet sheet-pad">${needsTable(list)}</div>`,
  };
});

function blankNeedForm() {
  return {
    title: "",
    text: "",
    category: "gear",
    urgency: "normal",
    goal: "",
    unit: false,
    unitPrice: "",
    unitCount: "",
    deadline: "",
    dogId: "",
    zoneId: "",
    errors: {},
  };
}

PAGES.adminNeedNew = staffOnly(() => {
  ui.needForm ??= blankNeedForm();
  const form = ui.needForm;
  const errors = form.errors;
  const dogs = [
    ["", "Не привязана"],
    ...state.dogs
      .filter((dog) => dog.status !== "home")
      .map((dog) => [dog.id, dog.name]),
  ];
  const zones = [
    ["", "Не указано"],
    ...state.zones.map((zone) => [zone.id, zone.name]),
  ];
  const urgency = URGENCY_ORDER.map(
    (key) =>
      `<button type="button" class="pick-item" id="urgency-${key}" data-action="pick-urgency" data-urgency="${key}" aria-pressed="${form.urgency === key}">${urgencyBadge(key)}<span>${URGENCY[key].hint}</span></button>`,
  ).join("");
  const money = form.unit
    ? `<div class="form-row">
        ${field({ id: "need-unit-price", label: "Цена за штуку, ₽", model: "needForm.unitPrice", value: form.unitPrice, error: errors.unitPrice, attrs: 'inputmode="decimal"' })}
        ${field({ id: "need-unit-count", label: "Сколько штук", model: "needForm.unitCount", value: form.unitCount, error: errors.unitCount, attrs: 'inputmode="numeric"' })}
      </div>`
    : field({
        id: "need-goal",
        label: "Цель, ₽",
        model: "needForm.goal",
        value: form.goal,
        error: errors.goal,
        attrs: 'inputmode="decimal"',
        hint: "Сколько нужно собрать. Изменить цель после первых пожертвований можно только с причиной.",
      });
  return {
    title: "Новая нужда",
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/admin/needs">Нужды</a></nav>
      <h1>Новая нужда</h1>
      <div class="demo-box"><p class="t-label">Прототип</p>
        <p class="t-caption">Чтобы не печатать, заполните форму примером — и поправьте что угодно.</p>
        <div><button type="button" class="btn btn-outline btn-sm" id="fill-need" data-action="fill-need">Заполнить примером</button></div></div>
      <form class="sheet sheet-body form" data-submit="save-need" novalidate>
        ${field({ id: "need-title", label: "Название", model: "needForm.title", value: form.title, error: errors.title, placeholder: "Корм на ноябрь: 20 мешков" })}
        ${field({ id: "need-text", label: "Что нужно и зачем", model: "needForm.text", value: form.text, error: errors.text, textarea: true, hint: "Это увидят доноры: что, сколько, для кого и что это даст." })}
        <fieldset class="field"><legend class="label">Срочность</legend>
          <div class="pick" role="group" aria-label="Срочность">${urgency}</div>
          <p class="hint">Так бейдж будет выглядеть на сайте. Срочность решает, какая нужда встанет первой на главной.</p></fieldset>
        <div class="form-row">
          ${selectField({ id: "need-category", label: "Категория", model: "needForm.category", value: form.category, options: Object.entries(CATEGORIES).map(([key, item]) => [key, item.label]) })}
          ${field({ id: "need-deadline", label: "Срок", model: "needForm.deadline", value: form.deadline, type: "date", hint: "Необязательно. Просроченная нужда не закрывается сама — вы решаете." })}
        </div>
        <label class="switch" for="need-unit"><input type="checkbox" role="switch" id="need-unit" data-model="needForm.unit" data-rerender${form.unit ? " checked" : ""} /><span>Считать в штуках</span>
          <span class="hint">Например, «20 мешков по 2 500 ₽»: на сайте будет счётчик с клетками.</span></label>
        ${money}
        <div class="form-row">
          ${selectField({ id: "need-dog", label: "Для собаки", model: "needForm.dogId", value: form.dogId, options: dogs, hint: "Нужда появится в её профиле." })}
          ${selectField({ id: "need-zone", label: "Место на карте", model: "needForm.zoneId", value: form.zoneId, options: zones, hint: "Понадобится на втором этапе, вместе с картой." })}
        </div>
        <div class="upload"><span class="label">Фото</span>
          <p class="hint">Если нужда для собаки, возьмём её фото. Своё можно загрузить с телефона.</p>
          <button type="button" class="btn btn-outline btn-sm" ${stub("Откроется выбор фото с телефона или компьютера. Сайт сам уменьшит снимок и переведёт его в лёгкий формат.")}>${icon("upload")}Загрузить фото</button></div>
        <div class="form-actions">
          <button type="submit" class="btn" id="save-need">Сохранить черновик</button>
          <a class="btn btn-ghost" href="#/admin/needs">Отмена</a>
        </div>
      </form>
      ${note("mvp", "Форма не теряет введённое при ошибке и подсказывает у самого поля, что исправить. Сохранённый черновик на сайте не виден.")}`,
  };
});

ACTIONS["pick-urgency"] = (el) => {
  ui.needForm.urgency = el.dataset.urgency;
  refresh(el.id);
};

ACTIONS["fill-need"] = (el) => {
  Object.assign(ui.needForm, {
    title: "Тёплые попоны для трёх стариков",
    text: "Марте, Графу и Пирату тяжело в мороз: суставы. Три попоны с подкладкой — и они смогут гулять всю зиму.",
    category: "gear",
    urgency: "high",
    goal: "9600",
    unit: false,
    deadline: "2026-11-10",
    dogId: "marta",
    zoneId: "a",
    errors: {},
  });
  refresh(el.id);
};

ACTIONS["save-need"] = () => {
  const form = ui.needForm;
  const errors = {};
  if (form.title.trim().length < 5)
    errors.title =
      "Назовите нужду так, чтобы было понятно без пояснений. Например: «Корм на ноябрь: 20 мешков».";
  if (form.text.trim().length < 10)
    errors.text =
      "Опишите подробнее: что, сколько и для кого — это увидят доноры.";
  if (form.unit) {
    if (!parseRubInput(form.unitPrice))
      errors.unitPrice = "Укажите цену одной штуки цифрами.";
    if (!/^\d+$/.test(form.unitCount.trim()) || Number(form.unitCount) < 1)
      errors.unitCount = "Укажите количество целым числом.";
  } else if (
    !parseRubInput(form.goal) ||
    parseRubInput(form.goal) < SHELTER.minDonation
  ) {
    errors.goal = "Укажите цель цифрами, не меньше 100 ₽.";
  }
  form.errors = errors;
  const order = [
    ["title", "need-title"],
    ["text", "need-text"],
    ["unitPrice", "need-unit-price"],
    ["unitCount", "need-unit-count"],
    ["goal", "need-goal"],
  ];
  const invalid = order.find(([key]) => errors[key]);
  if (invalid) {
    refresh(invalid[1]);
    return;
  }
  const need = createNeed(form);
  ui.needForm = null;
  toast("Черновик сохранён. На сайте его пока не видно.");
  go(`#/admin/needs/${need.id}`);
};

function needSteps(need) {
  const now = NEED_FLOW.indexOf(need.status);
  const items = NEED_FLOW.map((key, index) => {
    const cls = index === now ? "is-now" : index < now ? "is-past" : "";
    return `<li class="${cls}"${index === now ? ' aria-current="step"' : ""}>${index ? icon("chevron-right") : ""}<span>${NEED_STATUS[key].label}</span></li>`;
  }).join("");
  return `<ol class="steps" aria-label="Путь нужды">${items}</ol>`;
}

function needNext(need) {
  const id = need.id;
  const cancel = `<button type="button" class="btn btn-danger btn-sm" id="cancel-${id}" data-action="ask-cancel" data-need="${id}">${icon("ban")}Отменить нужду</button>`;
  switch (need.status) {
    case "draft":
      return `<p>Черновик видят только сотрудники. Опубликуйте — и нужда появится на сайте и встанет в «Срочно нужно» по своей срочности.</p>
        <div class="form-actions"><button type="button" class="btn" id="publish-${id}" data-action="publish" data-need="${id}">Опубликовать</button>
          <a class="btn btn-outline" href="#/needs/${id}">Предпросмотр</a>${cancel}</div>`;
    case "open":
      return `<p>Идёт сбор: ${formatRub(need.collected)} из ${formatRub(need.goal)}. Когда наберётся вся сумма, сбор закроется сам.</p>
        <div class="demo-box"><p class="t-label">Прототип</p>
          <p class="t-caption">Пожертвования появятся, если пройти оплату на сайте. Или добавьте их кнопкой — будто прошло несколько дней.</p>
          <div class="form-actions">
            <button type="button" class="btn btn-outline btn-sm" id="sim-${id}" data-action="simulate" data-need="${id}">Пришли три пожертвования</button>
            <button type="button" class="btn btn-outline btn-sm" id="fill-${id}" data-action="simulate" data-need="${id}" data-fill="true">Собрать всю сумму</button>
          </div></div>
        <div class="form-actions"><button type="button" class="btn btn-outline" id="early-${id}" data-action="close-early" data-need="${id}">Закрыть сбор досрочно</button>${cancel}</div>`;
    case "funded":
      return `<p>Собрано. Когда начнёте покупать, отметьте это — доноры увидят новый шаг в истории нужды.</p>
        <div class="form-actions"><button type="button" class="btn" id="work-${id}" data-action="start-work" data-need="${id}">Начали закупку</button>${cancel}</div>`;
    case "working": {
      const expenses = (need.expenseIds ?? []).map(expenseById);
      const hasPhoto = expenses.some((expense) =>
        expense.docs.some((doc) => doc.kind === "photo"),
      );
      const ready = expenses.length > 0 && hasPhoto;
      const hint = !expenses.length
        ? "Закрыть можно после первого расхода с чеком и фото результата."
        : hasPhoto
          ? ""
          : "Чтобы закрыть нужду, прикрепите фото результата: доноры увидят, что купили.";
      return `<p>Внесите расход с чеком. Когда всё куплено и есть фото результата — закройте нужду: отчёт опубликуется сам.</p>
        <div class="form-actions">
          <a class="btn${expenses.length ? " btn-outline" : ""}" href="#/admin/needs/${id}/expense">${icon("plus")}Добавить расход</a>
          ${expenses.length && !hasPhoto ? `<button type="button" class="btn" id="photo-${id}" data-action="attach-result" data-need="${id}">${icon("camera")}Прикрепить фото результата (демо)</button>` : ""}
          <button type="button" class="btn" id="finish-${id}" data-action="ask-close" data-need="${id}"${ready ? "" : " disabled"}>Закрыть нужду</button>
          ${cancel}
        </div>
        ${hint ? `<p class="hint">${hint}</p>` : ""}`;
    }
    case "done":
      return `<p>Выполнено: отчёт опубликован, остаток переведён в общий фонд. Все, кто помог, получат письмо с отчётом.</p>
        <div class="form-actions"><a class="btn" href="#/transparency/ledger?need=${id}">Строки в публичной книге</a><a class="btn btn-outline" href="#/needs/${id}">Отчёт на сайте</a></div>`;
    default: {
      const text =
        need.published === false
          ? "Черновик отменён. На сайте он не появлялся."
          : need.returned > 0
            ? `Нужда отменена. ${formatRub(need.returned)} переведены в общий фонд, всем, кто помог, ушло письмо.`
            : need.donors
              ? "Нужда отменена. Всё собранное к этому времени уже было потрачено; всем, кто помог, ушло письмо."
              : "Нужда отменена. Пожертвований по ней не было.";
      return `<p>${text}</p>${
        isPublic(need)
          ? `<div class="form-actions"><a class="btn btn-outline" href="#/transparency/ledger?need=${id}">Строки в публичной книге</a></div>`
          : ""
      }`;
    }
  }
}

PAGES.adminNeed = staffOnly(({ id }) => {
  const need = needById(id);
  if (!need) return { html: null };
  const expenses = (need.expenseIds ?? []).map(expenseById);
  return {
    title: need.title,
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/admin/needs">Нужды</a></nav>
      <h1>${esc(need.title)}</h1>
      <div class="row">${needStatusBadge(need.status)}${urgencyBadge(need.urgency)}<span class="mono t-mono-sm muted">${CATEGORIES[need.category].label} · ${describeDeadline(need.deadline)}</span>${
        isPublic(need)
          ? `<a href="#/needs/${need.id}">Открыть на сайте</a>`
          : ""
      }</div>
      ${need.status === "cancelled" ? "" : needSteps(need)}
      <section class="sheet sheet-body" aria-labelledby="next-title"><h2 id="next-title">Что дальше</h2>${needNext(need)}</section>
      ${note("mvp", "Сайт сам подсказывает следующий шаг и не даёт закрыть нужду без расхода и чека. Отмена и закрытие необратимы, поэтому просят подтверждение.")}
      <div class="split split-even">
        <section class="sheet sheet-body" aria-labelledby="money-title"><h2 id="money-title">Деньги</h2>
          <dl class="kv">
            <dt>Цель</dt><dd class="num">${formatRub(need.goal)}</dd>
            <dt>Собрано</dt><dd class="num">${formatRub(need.collected)} · ${formatCount(need.donors, ["человек", "человека", "человек"])}</dd>
            <dt>Добавил общий фонд</dt><dd class="num">${formatRub(need.covered ?? 0)}</dd>
            <dt>Потрачено</dt><dd class="num">${formatRub(need.spent)}</dd>
            <dt>Осталось у нужды</dt><dd class="num"><b>${formatRub(["done", "cancelled"].includes(need.status) ? 0 : Math.max(0, balance(need)))}</b></dd>
          </dl>
          <h2>Расходы</h2>
          ${
            expenses.length
              ? `<ul class="attn">${expenses.map((expense) => `<li>${icon("receipt-text")}<span>${esc(expense.title)}<br /><span class="mono t-mono-sm muted">${esc(expense.supplier)} · ${formatCount(expense.docs.length, ["документ", "документа", "документов"])}</span></span><b class="nowrap">${formatRub(expense.amount)}</b></li>`).join("")}</ul>`
              : '<p class="hint">Расходов пока нет.</p>'
          }
        </section>
        <section class="sheet sheet-body" aria-labelledby="hist-title"><h2 id="hist-title">История</h2>${timeline(need.timeline)}
          <p class="hint">Эту историю видят и доноры — на странице нужды.</p></section>
      </div>`,
  };
});

ACTIONS.publish = (el) => {
  publishNeed(needById(el.dataset.need));
  toast("Опубликовано. Нужда уже на сайте.");
  refresh();
};

ACTIONS.simulate = (el) => {
  simulateDonations(needById(el.dataset.need), el.dataset.fill === "true");
  refresh();
};

ACTIONS["close-early"] = (el) => {
  closeCollection(needById(el.dataset.need));
  toast("Сбор закрыт досрочно.");
  refresh();
};

ACTIONS["start-work"] = (el) => {
  startWork(needById(el.dataset.need));
  refresh();
};

ACTIONS["attach-result"] = (el) => {
  const need = needById(el.dataset.need);
  const last = expenseById(need.expenseIds[need.expenseIds.length - 1]);
  last.docs.push({ kind: "photo", label: "Фото результата (демо-заглушка)" });
  toast("Фото прикреплено. Теперь нужду можно закрыть.");
  refresh(`finish-${need.id}`);
};

LIVE.expenseHint = () => {
  const form = ui.expenseForm;
  const need = needById(form.needId);
  const amount = parseRubInput(form.amount);
  const has = Math.max(0, balance(need));
  if (!amount) return `У нужды сейчас ${formatRub(has)}.`;
  return amount > has
    ? `У нужды ${formatRub(has)}. Не хватает ${formatRub(amount - has)} — их добавит общий фонд отдельной строкой в книге.`
    : `У нужды ${formatRub(has)}. После расхода останется ${formatRub(has - amount)}.`;
};

PAGES.adminExpense = staffOnly(({ id }) => {
  const need = needById(id);
  if (!need) return { html: null };
  // Expenses are posted only while the purchase is under way.
  if (need.status !== "working") return { redirect: `#/admin/needs/${id}` };
  if (!ui.expenseForm || ui.expenseForm.needId !== id)
    ui.expenseForm = {
      needId: id,
      title: "",
      supplier: "",
      amount: "",
      receipt: false,
      redacted: false,
      result: false,
      errors: {},
    };
  const form = ui.expenseForm;
  const errors = form.errors;
  const receiptBox = form.receipt
    ? `<p class="ok">${icon("circle-check")}<span>chek-demo.jpg прикреплён</span></p>
      ${checkField({ id: "exp-redacted", label: "На документе закрашены фамилии, телефоны и номер карты", model: "expenseForm.redacted", checked: form.redacted, error: errors.redacted, hint: "Без этой отметки документ не попадёт на сайт." })}`
    : `<button type="button" class="btn btn-outline btn-sm" id="attach-receipt" data-action="attach" data-what="receipt">${icon("upload")}Прикрепить чек (демо)</button>
      ${errors.receipt ? errorLine("attach-receipt", errors.receipt) : ""}`;
  return {
    title: "Новый расход",
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/admin/needs">Нужды</a> / <a href="#/admin/needs/${id}">${esc(need.title)}</a></nav>
      <h1>Новый расход</h1>
      <div class="demo-box"><p class="t-label">Прототип</p>
        <div><button type="button" class="btn btn-outline btn-sm" id="fill-expense" data-action="fill-expense">Заполнить примером</button></div></div>
      <form class="sheet sheet-body form" data-submit="save-expense" novalidate>
        ${field({ id: "exp-title", label: "Что купили или оплатили", model: "expenseForm.title", value: form.title, error: errors.title, placeholder: "Попоны зимние, 3 шт." })}
        <div class="form-row">
          ${field({ id: "exp-supplier", label: "Поставщик", model: "expenseForm.supplier", value: form.supplier, error: errors.supplier, placeholder: "Зоомаркет «Хвост»" })}
          ${field({ id: "exp-amount", label: "Сумма, ₽", model: "expenseForm.amount", value: form.amount, error: errors.amount, attrs: 'inputmode="decimal"' })}
        </div>
        <p class="icon-line hint">${icon("info")}<span data-live="expenseHint">${LIVE.expenseHint()}</span></p>
        <div class="form-row">
          <div class="upload"><span class="label">Чек или счёт</span>${receiptBox}</div>
          <div class="upload"><span class="label">Фото результата</span>${
            form.result
              ? `<p class="ok">${icon("circle-check")}<span>foto-demo.jpg прикреплено</span></p>`
              : `<button type="button" class="btn btn-outline btn-sm" id="attach-result" data-action="attach" data-what="result">${icon("camera")}Прикрепить фото (демо)</button>`
          }<p class="hint">Нужно, чтобы закрыть нужду: доноры увидят, что купили.</p></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn" id="save-expense">Провести расход</button>
          <a class="btn btn-ghost" href="#/admin/needs/${id}">Отмена</a>
        </div>
      </form>
      ${note("mvp", "Проведённый расход сразу виден в публичной книге операций вместе с чеком. Исправить его нельзя — только отменить обратной записью, и обе строки останутся на виду.")}`,
  };
});

ACTIONS.attach = (el) => {
  ui.expenseForm[el.dataset.what] = true;
  ui.expenseForm.errors.receipt = null;
  refresh(el.dataset.what === "receipt" ? "exp-redacted" : "save-expense");
};

ACTIONS["fill-expense"] = (el) => {
  const need = needById(ui.expenseForm.needId);
  const left = Math.max(0, balance(need));
  // With money left the example spends most of it; with none it shows a
  // small extra purchase that the general fund will have to cover.
  const example = left
    ? {
        title: "Попоны зимние с подкладкой, 3 шт.",
        supplier: "Зоомаркет «Хвост» (демо)",
        amount: String(Math.max(100, Math.round((left * 0.94) / 10000) * 100)),
      }
    : {
        title: "Саморезы и пропитка для досок",
        supplier: "Стройдвор (демо)",
        amount: "1800",
      };
  Object.assign(ui.expenseForm, example, {
    receipt: true,
    redacted: false,
    result: true,
    errors: {},
  });
  refresh(el.id);
};

ACTIONS["save-expense"] = () => {
  const form = ui.expenseForm;
  const errors = {};
  if (form.title.trim().length < 3)
    errors.title =
      "Напишите, что купили: это название строки в публичной книге.";
  if (!form.supplier.trim())
    errors.supplier = "Укажите магазин, клинику или мастера.";
  const amount = parseRubInput(form.amount);
  const need = needById(form.needId);
  const shortage = amount ? Math.max(0, amount - balance(need)) : 0;
  if (!amount) errors.amount = "Укажите сумму цифрами, как в чеке.";
  else if (shortage > state.stats.fund)
    errors.amount = `У нужды и в общем фонде столько нет: не хватает ${formatRub(shortage - state.stats.fund)}. Проверьте сумму или разбейте покупку.`;
  if (!form.receipt)
    errors.receipt =
      "Прикрепите чек или счёт: без документа расход не публикуется.";
  else if (!form.redacted)
    errors.redacted =
      "Закрасьте на документе фамилии, телефоны и номер карты и отметьте это здесь.";
  form.errors = errors;
  const order = [
    ["title", "exp-title"],
    ["supplier", "exp-supplier"],
    ["amount", "exp-amount"],
    ["receipt", "attach-receipt"],
    ["redacted", "exp-redacted"],
  ];
  const invalid = order.find(([key]) => errors[key]);
  if (invalid) {
    refresh(invalid[1]);
    return;
  }
  const { shortage: covered } = addExpense(need, form);
  ui.expenseForm = null;
  toast(
    covered
      ? `Расход проведён. ${formatRub(covered)} добавил общий фонд.`
      : "Расход проведён. Строка уже в публичной книге.",
  );
  go(`#/admin/needs/${need.id}`);
};

LAYERS.closeNeed = () => {
  const need = needById(ui.layer.needId);
  const rest = Math.max(0, balance(need));
  return layerShell(
    "Закрыть нужду",
    `<dl class="kv">
      <dt>Собрано</dt><dd class="num">${formatRub(need.collected)}</dd>
      <dt>Добавил фонд</dt><dd class="num">${formatRub(need.covered ?? 0)}</dd>
      <dt>Потрачено</dt><dd class="num">${formatRub(need.spent)}</dd>
      <dt>Остаток</dt><dd class="num"><b>${formatRub(rest)}</b></dd>
    </dl>
    <p>${rest > 0 ? `Остаток ${formatRub(rest)} перейдёт в общий фонд — отдельной строкой в публичной книге.` : "Остатка нет: всё собранное потрачено."} Отчёт с чеками появится на странице нужды, донорам уйдёт письмо.</p>
    <form class="stack-sm admin" data-submit="finish-need" novalidate>
      ${field({ id: "close-text", label: "Пара слов для доноров", model: "closeForm.text", value: ui.closeForm.text, textarea: true })}
      <div class="layer-foot">
        <button type="submit" class="btn" id="finish-need">Закрыть и опубликовать отчёт</button>
        <button type="button" class="btn btn-outline" data-action="close-layer">Не сейчас</button>
      </div>
    </form>`,
  );
};

ACTIONS["ask-close"] = (el) => {
  ui.closeForm = { text: "Всё купили, спасибо каждому, кто помог." };
  openLayer({ type: "closeNeed", needId: el.dataset.need }, el);
};

ACTIONS["finish-need"] = () => {
  const need = needById(ui.layer.needId);
  const rest = completeNeed(need, ui.closeForm.text);
  closeLayer(true);
  toast(
    rest > 0
      ? `Нужда закрыта. Остаток ${formatRub(rest)} — в общем фонде.`
      : "Нужда закрыта, отчёт опубликован.",
  );
};

LAYERS.cancelNeed = () => {
  const need = needById(ui.layer.needId);
  const rest = Math.max(0, balance(need));
  return layerShell(
    "Отменить нужду?",
    `<p>${
      rest > 0
        ? `Собранные ${formatRub(rest)} перейдут в общий фонд, а всем, кто помог, уйдёт письмо.`
        : need.donors
          ? "Всё собранное уже потрачено, в общий фонд ничего не перейдёт. Всем, кто помог, уйдёт письмо."
          : isPublic(need)
            ? "Пожертвований по этой нужде нет — она уйдёт из списка сборов."
            : "Черновик на сайте не появлялся — он просто уйдёт из работы."
    } Вернуть её обратно будет нельзя.</p>
    <form class="stack-sm admin" data-submit="cancel-need" novalidate>
      ${field({ id: "cancel-text", label: "Что случилось", model: "closeForm.text", value: ui.closeForm.text, textarea: true, hint: "Это увидят доноры. Пишите как есть, по-человечески." })}
      <div class="layer-foot">
        <button type="submit" class="btn btn-danger" id="cancel-need">${icon("ban")}Отменить нужду</button>
        <button type="button" class="btn btn-outline" data-action="close-layer">Не отменять</button>
      </div>
    </form>`,
  );
};

ACTIONS["ask-cancel"] = (el) => {
  ui.closeForm = { text: "" };
  openLayer({ type: "cancelNeed", needId: el.dataset.need }, el);
};

ACTIONS["cancel-need"] = () => {
  const rest = cancelNeed(needById(ui.layer.needId), ui.closeForm.text);
  closeLayer(true);
  toast(
    rest > 0
      ? `Нужда отменена. ${formatRub(rest)} — в общем фонде.`
      : "Нужда отменена.",
  );
};

PAGES.adminDogs = staffOnly(() => ({
  title: "Собаки",
  html: `
    <div class="row-between"><h1>Собаки</h1><button type="button" class="btn" ${stub("Форма новой собаки такая же, как карточка: кличка, статус, характер, здоровье, фото.")}>${icon("plus")}Новая собака</button></div>
    ${note("mvp", "Собак ведёт куратор. Собаку нельзя удалить — только сменить статус: так сохраняется её история и истории «Они дома».")}
    <div class="sheet sheet-pad"><div class="table-wrap"><table class="dt">
      <thead><tr><th scope="col">Собака</th><th scope="col">Статус</th><th scope="col">Место</th><th scope="col">В приюте</th></tr></thead>
      <tbody>${state.dogs
        .map(
          (
            dog,
          ) => `<tr><td><a href="#/admin/dogs/${dog.id}">${dog.name}</a><br /><span class="mono">${dogFacts(dog).sex.toLowerCase()}, ${dogFacts(dog).age}</span></td>
            <td>${dogStatusBadge(dog.status)}</td><td>${dog.zoneId ? zoneById(dog.zoneId).name : "—"}</td>
            <td class="mono">${formatDuration(monthsBetween(dog.since, NOW))}</td></tr>`,
        )
        .join("")}</tbody></table></div></div>`,
}));

PAGES.adminDog = staffOnly(({ id }) => {
  const dog = dogById(id);
  if (!dog) return { html: null };
  if (!ui.dogForm || ui.dogForm.id !== id)
    ui.dogForm = {
      id,
      name: dog.name,
      status: dog.status,
      short: dog.short,
      zoneId: dog.zoneId ?? "",
      kids: dog.traits.kids,
      cats: dog.traits.cats,
      dogs: dog.traits.dogs,
    };
  const form = ui.dogForm;
  const yesNo = [
    ["yes", "Да"],
    ["no", "Нет"],
    ["unknown", "Не проверяли"],
  ];
  return {
    title: dog.name,
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/admin/dogs">Собаки</a></nav>
      <div class="row-between"><h1>${dog.name}</h1><a href="#/dogs/${dog.id}">Открыть на сайте</a></div>
      <div class="split split-even">
        <form class="sheet sheet-body form" data-submit="save-dog" novalidate>
          ${field({ id: "dog-name", label: "Кличка", model: "dogForm.name", value: form.name, attrs: "disabled", hint: "В прототипе кличку не меняем: на ней держатся падежи в демо-текстах." })}
          ${selectField({ id: "dog-status", label: "Статус", model: "dogForm.status", value: form.status, options: Object.entries(DOG_STATUS).map(([key, item]) => [key, item.label]), hint: "«Забронирована» и «Дома» убирают язычки «Хочу забрать»." })}
          ${field({ id: "dog-short", label: "Коротко о характере", model: "dogForm.short", value: form.short, textarea: true, hint: "Две-три фразы для карточки в каталоге." })}
          <div class="form-row form-row-3">
            ${selectField({ id: "dog-kids", label: "С детьми", model: "dogForm.kids", value: form.kids, options: yesNo })}
            ${selectField({ id: "dog-cats", label: "С кошками", model: "dogForm.cats", value: form.cats, options: yesNo })}
            ${selectField({ id: "dog-dogs", label: "С собаками", model: "dogForm.dogs", value: form.dogs, options: yesNo })}
          </div>
          ${selectField({ id: "dog-zone", label: "Где живёт", model: "dogForm.zoneId", value: form.zoneId, options: [["", "Не в приюте"], ...state.zones.map((zone) => [zone.id, zone.name])] })}
          <div class="form-actions"><button type="submit" class="btn" id="save-dog">Сохранить</button></div>
        </form>
        <div class="stack">
          <section class="sheet sheet-body" aria-labelledby="dog-photos"><h2 id="dog-photos">Фото</h2>
            <div class="thumbs">
              <div class="thumb">${photo(dog.photo, { ratio: "45", focus: dog.focus })}<span class="mono t-mono-sm">обложка</span></div>
              <button type="button" class="thumb btn-link" ${stub("Фото загружают с телефона, порядок меняют перетаскиванием. Нажатие на снимок ставит точку фокуса — по ней фото обрезается под карточку.")}>${photo(null, { ratio: "45", empty: "Добавить" })}</button>
            </div>
            <p class="hint">Первое фото — обложка. Снимки с телефона подходят: сайт сам уменьшит и обрежет их по морде.</p>
          </section>
          ${note("mvp", "Изменения появляются на сайте сразу: смените статус на «Забронирована» — и у карточки пропадут язычки.")}
        </div>
      </div>`,
  };
});

ACTIONS["save-dog"] = () => {
  const form = ui.dogForm;
  const dog = dogById(form.id);
  dog.status = form.status;
  dog.short = form.short.trim() || dog.short;
  dog.zoneId = form.zoneId || null;
  dog.traits = {
    ...dog.traits,
    kids: form.kids,
    cats: form.cats,
    dogs: form.dogs,
  };
  if (dog.status === "home") dog.homeSince ??= "с октября";
  toast("Сохранено. Изменения уже на сайте.");
  refresh("save-dog");
};

PAGES.adminLedger = staffOnly(() => {
  const rows = latest(state.ledger)
    .map((row) => {
      const view = ledgerView(row);
      return `<tr><td class="mono">${row.id}<br />${formatDay(row.when)} ${formatTime(row.when)}</td>
        <td>${view.title}${row.isNew ? '<span class="ledger-new">новое</span>' : ""}<br /><span class="hint">${view.sub}</span></td>
        <td class="r"><span class="amt ${view.cls}">${view.amount}</span></td>
        <td class="r"><button type="button" class="btn btn-ghost btn-sm" ${stub("Ошибочную строку нельзя стереть: её отменяет обратная запись, и обе остаются в книге. Отменять записи может только владелец.")} aria-label="Отменить запись ${row.id}">${icon("undo-2")}Отменить</button></td></tr>`;
    })
    .join("");
  return {
    title: "Книга операций",
    html: `
      <div class="row-between"><h1>Книга операций</h1>
        <div class="row">
          <button type="button" class="btn btn-outline btn-sm" ${stub("Ручное поступление: перевод на расчётный счёт или наличные. Админ вносит сумму и прикладывает выписку.")}>${icon("plus")}Ручное поступление</button>
          <button type="button" class="btn btn-outline btn-sm" ${stub("Перевод из общего фонда на нужду — например, чтобы закрыть сбор, который встал.")}>Перевод из фонда</button>
        </div></div>
      ${note("mvp", "Это та же книга, что видят все, только с номерами и служебными действиями. Строки нельзя править и удалять — это проверяет сама база данных, а не только интерфейс.")}
      <div class="sheet sheet-pad"><div class="table-wrap"><table class="dt">
        <thead><tr><th scope="col">№ и время</th><th scope="col">Операция</th><th scope="col" class="r">Сумма</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`,
  };
});

PAGES.adminMap = staffOnly((params, query) => {
  const zone = zoneById(query.zone) ?? state.zones[0];
  if (!ui.zoneForm || ui.zoneForm.id !== zone.id) {
    const living = {};
    for (const dog of state.dogs) living[dog.id] = dog.zoneId === zone.id;
    ui.zoneForm = { id: zone.id, text: zone.text, living };
  }
  const form = ui.zoneForm;
  const residents = state.dogs
    .filter((dog) => !["home", "rainbow"].includes(dog.status))
    .map((dog) =>
      checkField({
        id: `zone-dog-${dog.id}`,
        label: dog.name,
        model: `zoneForm.living.${dog.id}`,
        checked: form.living[dog.id],
        hint:
          dog.zoneId && dog.zoneId !== zone.id
            ? `сейчас: ${zoneById(dog.zoneId).name}`
            : "",
      }),
    )
    .join("");
  return {
    title: "Карта приюта",
    html: `
      <h1>Карта приюта</h1>
      ${note("p2", "Геометрию схемы рисует дизайнер по фото и плану приюта. В админке меняют только содержание: описание места, кто там живёт, какие нужды к нему относятся.")}
      <div class="split split-narrow-first">
        <section class="sheet sheet-body" aria-labelledby="zones-adm"><h2 id="zones-adm">Места</h2>
          <ul class="zone-list">${state.zones
            .map(
              (item) =>
                `<li><a class="zone-link" id="zone-link-${item.id}" href="#/admin/map?zone=${item.id}"${item.id === zone.id ? ' aria-current="true"' : ""}><b>${item.name}</b><span class="mono t-mono-sm muted">${zoneSummary(item) || "пусто"}</span></a></li>`,
            )
            .join("")}</ul>
        </section>
        <form class="sheet sheet-body form" data-submit="save-zone" novalidate>
          <h2>${zone.name}</h2>
          ${field({ id: "zone-text", label: "Описание", model: "zoneForm.text", value: form.text, textarea: true, hint: "Одна-две фразы: что здесь и что с этим местом сейчас." })}
          <fieldset class="field"><legend class="label">Кто здесь живёт</legend><div class="grid-2">${residents}</div></fieldset>
          <div class="form-actions"><button type="submit" class="btn" id="save-zone">Сохранить</button><a class="btn btn-outline" href="#/map?zone=${zone.id}">Посмотреть на сайте</a></div>
        </form>
      </div>`,
  };
});

ACTIONS["save-zone"] = () => {
  const form = ui.zoneForm;
  zoneById(form.id).text = form.text.trim() || zoneById(form.id).text;
  for (const dog of state.dogs) {
    if (form.living[dog.id]) dog.zoneId = form.id;
    else if (dog.zoneId === form.id) dog.zoneId = null;
  }
  toast("Сохранено. Карта на сайте уже обновилась.");
  refresh("save-zone");
};

const ADMIN_MORE = [
  [
    "Пожертвования",
    "Все платежи, ручной ввод перевода и наличных, возвраты.",
    "mvp",
  ],
  ["Подписки", "Ежемесячные пожертвования: неудачные списания, отмена.", "mvp"],
  ["Контент", "Страницы «О приюте», «Контакты», новости.", "mvp"],
  ["Юридические документы", "Оферта и согласия с версиями.", "mvp"],
  ["Пользователи и роли", "Сотрудники, права, второй шаг входа.", "mvp"],
  ["Журнал действий", "Кто, что и когда сделал в админке.", "mvp"],
  ["Уведомления от банка", "Журнал вебхуков с повторной отправкой.", "mvp"],
  [
    "Отчёты",
    "Месячный отчёт: снимок цифр, комментарий, закрытие месяца.",
    "p2",
  ],
  ["Вещи", "Обещания и отметка «получено».", "p2"],
  ["Опека", "Опекуны, новости для них, стоимость содержания.", "p2"],
  ["Волонтёры, смены, задачи", "Анкеты, календарь смен, явка.", "p3"],
];

PAGES.adminMore = staffOnly(() => ({
  title: "Остальные разделы",
  html: `
    <h1>Остальные разделы</h1>
    <p class="muted">В прототипе они не нарисованы — устроены так же: таблица, карточка, форма.</p>
    <div class="sheet sheet-pad"><ul class="index">${ADMIN_MORE.map(
      ([title, text, code]) =>
        `<li><b>${title}</b>${stage(code)}<span class="hint">${text}</span></li>`,
    ).join("")}</ul></div>`,
}));
