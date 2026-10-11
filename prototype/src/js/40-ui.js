// Interface state and the building blocks shared by the pages.

const ui = {
  notes: false,
  theme: null,
  layer: null,
  donate: null,
  gallery: {},
  zone: null,
  phoneShown: false,
  channelNote: null,
  joined: {},
  taken: {},
  promised: {},
  login: {
    step: 1,
    email: "irina@ostrovok.example",
    password: "demo-demo",
    code: "",
    error: null,
  },
  needForm: null,
  expenseForm: null,
  closeForm: null,
  dogForm: null,
  zoneForm: null,
  ledgerFilter: { type: "all", need: "all" },
};

/** Click handlers by name: <button data-action="name">. */
const ACTIONS = {};
/** Fragments recomputed while the viewer types: <span data-live="name">. */
const LIVE = {};

const STAGES = { mvp: "MVP", p2: "Фаза 2", p3: "Фаза 3" };

function stage(code) {
  return `<span class="stage stage-${code}">${STAGES[code]}</span>`;
}

/** A note for the client: visible only with «Пояснения» switched on. */
function note(code, text) {
  return `<aside class="note">${stage(code)}<p>${text}</p></aside>`;
}

/** Attributes of a control that leads to «В прототипе не показано». */
function stub(text, code = "mvp") {
  return `data-action="stub" data-stub="${esc(text)}" data-stage="${code}"`;
}

function urgencyBadge(key) {
  const item = URGENCY[key];
  return `<span class="urg urg-${key}">${icon(item.icon)}${item.label}</span>`;
}

const NEED_STATUS_CLASS = {
  draft: "status-quiet",
  open: "status",
  funded: "status",
  working: "status",
  done: "status-solid",
  cancelled: "status-quiet",
};

function needStatusBadge(status) {
  const item = NEED_STATUS[status];
  return `<span class="urg ${NEED_STATUS_CLASS[status]}">${icon(item.icon)}${item.label}</span>`;
}

function dogStatusBadge(status) {
  const item = DOG_STATUS[status];
  const cls = status === "looking" ? "status" : "status-quiet";
  return `<span class="urg ${cls}">${icon(item.icon)}${item.label}</span>`;
}

function photo(key, options = {}) {
  const { ratio = "43", alt = "", focus, href, stamp } = options;
  const src = key ? PHOTOS[key] : null;
  const position = focus ? ` style="object-position: ${focus}"` : "";
  const inner = src
    ? `<img src="${src}" alt="${esc(alt)}" decoding="async"${position} />`
    : `${icon("camera")}<span>${options.empty ?? "Фото добавит приют"}</span>`;
  const cls = `ph ph-${ratio}${src ? "" : " ph-empty"}`;
  const mark = stamp ? `<span class="stamp">${stamp}</span>` : "";
  return href
    ? `<a class="${cls}" href="${href}" tabindex="-1" aria-hidden="true">${inner}${mark}</a>`
    : `<figure class="${cls}">${inner}${mark}</figure>`;
}

function progressBar(share, label, still) {
  const value = Number(clamp(share, 0, 1).toFixed(4));
  return `<div class="hatch${still ? " hatch-static" : ""}" role="img" aria-label="${esc(label)}" style="--p: ${value};"></div>`;
}

function needProgress(need, still) {
  return progressBar(
    progress(need),
    `Собрано ${formatRub(need.collected)} из ${formatRub(need.goal)}`,
    still,
  );
}

function unitsPaid(need) {
  return Math.min(
    need.unit.count,
    Math.floor(need.collected / need.unit.price),
  );
}

function tally(need) {
  const paid = unitsPaid(need);
  const boxes = Array.from(
    { length: need.unit.count },
    (_, index) => `<i${index < paid ? ' class="on"' : ""}></i>`,
  ).join("");
  return `<div class="tally" role="img" aria-label="${paid} из ${need.unit.count}">${boxes}</div>`;
}

/** Ready sums for the tabs: never equal to or above what is left. */
function sumPresets(need, wide) {
  const left = remaining(need);
  if (need.status !== "open" || left < SHELTER.minDonation) return [];
  const base = need.unit
    ? [need.unit.price, need.unit.price * 2]
    : wide
      ? [rub(500), rub(1000), rub(2500)]
      : [rub(500), rub(1000)];
  return [
    ...base.filter((amount) => amount < left).map((amount) => ({ amount })),
    { amount: left, rest: true },
  ];
}

function sumTabs(need, wide) {
  const presets = sumPresets(need, wide);
  if (!presets.length) return "";
  const tabs = presets
    .map(
      (preset) =>
        `<button type="button" class="tab" id="tab-${need.id}-${preset.rest ? "rest" : preset.amount}${wide ? "-hero" : ""}" data-action="donate" data-need="${need.id}" data-amount="${preset.amount}" aria-label="${
          preset.rest
            ? `Закрыть сбор — ${formatRub(preset.amount)}`
            : `Помочь на ${formatRub(preset.amount)}`
        }"><span class="nowrap">${formatRub(preset.amount)}</span>${preset.rest ? "<small>весь остаток</small>" : ""}</button>`,
    )
    .join("");
  return `<div class="tabs" role="group" aria-label="Помочь: выберите сумму">${tabs}</div>`;
}

function needVisual(need, options = {}) {
  if (need.unit) {
    const paid = unitsPaid(need);
    return `<p class="big-count">${paid} из ${need.unit.count}<small>${plural(paid, need.unit.paid)}</small></p>${tally(need)}
      <div class="row-baseline"><b class="t-sum">${formatRub(need.unit.price)}</b><span class="muted t-caption">${need.unit.one}${
        need.status === "open" && paid < need.unit.count
          ? ` · ещё ${need.unit.count - paid}`
          : ""
      }</span></div>`;
  }
  const picture = need.photo
    ? photo(need.photo, {
        alt: options.link ? "" : need.alt,
        focus: need.focus,
        href: options.link ? `#/needs/${need.id}` : undefined,
      })
    : "";
  return `${picture}${needProgress(need)}
    <div class="row-baseline"><b class="t-sum">${formatRub(need.collected)}</b><span class="muted t-caption">из ${formatRub(need.goal)}</span></div>`;
}

function needFoot(need) {
  if (need.status === "open") {
    return (
      sumTabs(need) ||
      `<div class="need-foot"><span class="t-caption muted">Осталось ${formatRub(remaining(need))}</span><button type="button" class="btn" id="help-${need.id}" data-action="donate" data-need="${need.id}">Помочь</button></div>`
    );
  }
  const link = {
    funded: "Что дальше",
    working: "Как идёт",
    done: "Отчёт с чеками",
    cancelled: "Что случилось",
    draft: "Черновик",
  }[need.status];
  const mark =
    need.status === "funded"
      ? '<span class="stamp">Собрано</span>'
      : needStatusBadge(need.status);
  return `<div class="need-foot">${mark}<a href="#/needs/${need.id}">${link}</a></div>`;
}

/** level: 2 on a list page under its h1, 3 inside a section with its own h2. */
function needCard(need, level = 3) {
  return `<article class="sheet need">
    <div class="need-body">
      <div class="need-meta"><span class="cat">${CATEGORIES[need.category].label}</span>${
        need.status === "open" ? urgencyBadge(need.urgency) : ""
      }</div>
      <h${level} class="t-title"><a href="#/needs/${need.id}">${esc(need.title)}</a></h${level}>
      ${needVisual(need, { link: true })}
      ${need.status === "open" ? `<p class="when">${describeDeadline(need.deadline)}</p>` : ""}
    </div>
    ${needFoot(need)}
  </article>`;
}

const HAS_TABS = ["looking", "treatment", "foster"];

function dogLine(dog) {
  const waited = formatDuration(monthsBetween(dog.since, NOW));
  return {
    looking: `Ждёт дом ${waited}`,
    treatment: `В приюте ${waited}, сейчас лечится`,
    reserved: "Дом нашёлся, ждёт переезда",
    foster: "На передержке у волонтёра",
    home: `Дома ${dog.homeSince}`,
    rainbow: "",
  }[dog.status];
}

function adoptTabs(dog, suffix = "", main = false) {
  const tab = `<span class="tab" aria-hidden="true">${icon("paw-print")}Хочу забрать</span>`;
  return `<button type="button" class="tabs tabs-v" id="adopt-${dog.id}${suffix}" data-action="adopt" data-dog="${dog.id}"${main ? " data-main-cta" : ""} aria-label="Хочу забрать ${dog.acc}">${tab.repeat(5)}</button>`;
}

function dogStatusLabel(status) {
  const item = DOG_STATUS[status];
  return `<span class="t-label icon-label">${icon(item.icon)}${item.label}</span>`;
}

function dogCard(dog, level = 3) {
  const facts = dogFacts(dog);
  return `<article class="sheet dog">
    <div class="dog-body">
      <div class="row-between">${dogStatusLabel(dog.status)}</div>
      ${photo(dog.photo, { ratio: "45", focus: dog.focus, href: `#/dogs/${dog.id}` })}
      <h${level} class="t-name"><a href="#/dogs/${dog.id}">${dog.name}</a></h${level}>
      <p class="when dog-meta">${facts.sex.toLowerCase()} · ${facts.age} · ${facts.size}</p>
      <p class="t-caption dog-short">${dog.short}</p>
      <p class="when">${dogLine(dog)}</p>
    </div>
    ${HAS_TABS.includes(dog.status) ? adoptTabs(dog) : ""}
  </article>`;
}

function dogFacts(dog) {
  const sex = dog.sex === "f" ? "Девочка" : "Мальчик";
  const size = (dog.sex === "f" ? SIZES : SIZES_M)[dog.size];
  const years = Math.floor(dog.ageMonths / 12);
  const age =
    dog.ageMonths % 12 === 6 && years === 1
      ? "полтора года"
      : formatDuration(dog.ageMonths);
  return { sex, size, age };
}

// ——— Ledger.

const LEDGER_GROUP = {
  donation: "in",
  guardian: "in",
  expense: "out",
  fee: "out",
  overpay: "move",
  to_fund: "move",
  from_fund: "move",
  cancel: "move",
};

/** Entries that bring money into the general fund (the rest take it out). */
const FUND_IN = ["donation", "guardian", "overpay", "to_fund", "cancel"];

function ledgerView(row) {
  const need = row.needId ? needById(row.needId) : null;
  const needLink = need
    ? `<a href="#/needs/${need.id}">${esc(need.title)}</a>`
    : "";
  const who = row.who ? esc(row.who) : "Аноним";
  switch (row.kind) {
    case "donation":
      return {
        title: `Пожертвование · ${who}`,
        sub: need
          ? `→ ${needLink}`
          : `→ общий фонд${row.monthly ? ", каждый месяц" : ""}${row.text ? ` · ${row.text}` : ""}`,
        amount: formatRub(row.amount, { sign: true }),
        cls: "is-in",
      };
    case "guardian":
      return {
        title: `Опека · ${who}`,
        sub: `→ общий фонд, с пометкой «${dogById(row.dogId).name}», каждый месяц`,
        amount: formatRub(row.amount, { sign: true }),
        cls: "is-in",
      };
    case "expense": {
      const expense = expenseById(row.expenseId);
      return {
        title: esc(expense.title),
        sub: `${esc(expense.supplier)} · ${need ? needLink : "из общего фонда"} · <a href="#/transparency/expenses/${expense.id}">${expense.docs.length ? "чек и фото" : "подробнее"}</a>`,
        amount: formatRub(-row.amount),
        cls: "",
      };
    }
    case "fee":
      return {
        title: "Комиссия банка за приём платежей",
        sub: `из общего фонда · ${row.text}`,
        amount: formatRub(-row.amount),
        cls: "",
      };
    case "overpay":
      return {
        title: "Переплата → общий фонд",
        sub: `сверх цели сбора «${needLink}»`,
        amount: formatRub(row.amount),
        cls: "",
      };
    case "to_fund":
      return {
        title: "Остаток сбора → общий фонд",
        sub: needLink,
        amount: formatRub(row.amount),
        cls: "",
      };
    case "from_fund":
      return {
        title: "Общий фонд покрыл недостачу",
        sub: `→ ${needLink}`,
        amount: formatRub(row.amount),
        cls: "",
      };
    default:
      return {
        title: "Сбор отменён: собранное → общий фонд",
        sub: needLink,
        amount: formatRub(row.amount),
        cls: "",
      };
  }
}

function ledgerList(rows, options = {}) {
  if (!rows.length)
    return '<p class="muted t-caption">По этим условиям операций нет.</p>';
  const items = rows
    .map((row) => {
      const view = ledgerView(row);
      if (options.fund) {
        const into = FUND_IN.includes(row.kind);
        view.amount = formatRub(into ? row.amount : -row.amount, {
          sign: into,
        });
        view.cls = into ? "is-in" : "";
      }
      const fresh = row.isNew ? '<span class="ledger-new">новое</span>' : "";
      const number = options.numbers
        ? `<span class="when">№ ${row.id} · ${formatTime(row.when)}</span>`
        : "";
      return `<li class="ledger-row">
        <span class="ledger-date">${formatDay(row.when)}</span>
        <div class="ledger-what"><span>${view.title}${fresh}</span><span class="sub">${view.sub}</span>${number}</div>
        <b class="ledger-amt ${view.cls}">${view.amount}</b>
      </li>`;
    })
    .join("");
  return `<ul class="ledger">${items}</ul>`;
}

const latest = (rows) =>
  [...rows].sort((a, b) => b.when - a.when || (a.id < b.id ? 1 : -1));

function timeline(items) {
  const list = items
    .map(
      (item) => `<li class="is-done"><div class="stack-xs">
        <b>${esc(item.title)}</b>
        <span class="when">${formatDate(item.when)}${item.by ? ` · ${item.by}` : ""}</span>
        ${item.text ? `<p class="t-caption">${esc(item.text)}${item.href ? ` <a href="${item.href}">Чек</a>` : ""}</p>` : ""}
      </div></li>`,
    )
    .join("");
  return `<ol class="timeline">${list}</ol>`;
}

/** A drawn receipt: the prototype has no real documents. */
function receipt(doc, expense) {
  const lines = doc.lines
    .map(
      ([name, sum]) =>
        `<div class="receipt-line"><span>${esc(name)}</span><span>${formatRub(sum)}</span></div>`,
    )
    .join("");
  return `<figure class="doc">
    <div class="receipt" role="img" aria-label="${doc.label}: ${formatRub(doc.total)}, персональные данные закрашены">
      <b>${esc(expense.supplier.replace(" (демо)", "")).toUpperCase()}</b>
      <span>${formatDay(expense.date)}.2026 ${formatTime(expense.date)}</span>
      <hr />${lines}<hr />
      <div class="receipt-line"><b>ИТОГ</b><b>${formatRub(doc.total)}</b></div>
      <div class="receipt-line"><span>Карта</span><span class="redacted"></span></div>
      <div class="receipt-line"><span>Покупатель</span><span class="redacted"></span></div>
    </div>
    <figcaption class="when">${doc.label} · ПДн закрашены · демо</figcaption>
  </figure>`;
}

function expenseDocs(expense) {
  if (!expense.docs.length)
    return '<p class="muted t-caption">Документы появятся после покупки.</p>';
  const items = expense.docs
    .map((doc) =>
      doc.kind === "receipt"
        ? receipt(doc, expense)
        : `<figure class="doc">${photo(null, { empty: doc.label })}<figcaption class="when">Фото · демо-заглушка</figcaption></figure>`,
    )
    .join("");
  return `<div class="docs">${items}</div>`;
}

// ——— Page furniture and form controls.

function sectionHead(title, linkText, href, id) {
  return `<div class="section-head"><div class="slip"><h2${id ? ` id="${id}"` : ""}>${title}</h2></div>${
    linkText ? `<a href="${href}">${linkText}</a>` : ""
  }</div>`;
}

function pageHead(title, lead, crumbs) {
  const trail = crumbs
    ? `<nav class="crumbs" aria-label="Вы здесь">${crumbs
        .map(([text, href]) => `<a href="${href}">${text}</a>`)
        .join(" / ")}</nav>`
    : "";
  return `<header class="page-head">${trail}<div class="slip"><h1>${title}</h1></div>${
    lead ? `<p>${lead}</p>` : ""
  }</header>`;
}

/** An icon and a sentence side by side: hints, statuses, small notices. */
function iconLine(name, text, cls = "hint") {
  return `<p class="icon-line ${cls}">${icon(name)}<span>${text}</span></p>`;
}

function errorLine(id, text) {
  return `<p class="error" id="${id}-error">${icon("circle-x")}<span>${text}</span></p>`;
}

function describedBy(id, hint, error) {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ` aria-describedby="${ids.join(" ")}"` : "";
}

function field(options) {
  const { id, label, model, value = "", hint, error, type = "text" } = options;
  const common = `id="${id}" data-model="${model}"${error ? ' aria-invalid="true"' : ""}${describedBy(id, hint, error)}${
    options.placeholder ? ` placeholder="${esc(options.placeholder)}"` : ""
  } ${options.attrs ?? ""}`;
  const control = options.textarea
    ? `<textarea class="textarea" ${common}>${esc(value)}</textarea>`
    : `<input class="input" type="${type}" value="${esc(value)}" ${common} />`;
  return `<div class="field"><label class="label" for="${id}">${label}</label>${control}${
    hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ""
  }${error ? errorLine(id, error) : ""}</div>`;
}

function selectField(options) {
  const { id, label, model, value, hint, error } = options;
  const items = options.options
    .map(
      ([key, text]) =>
        `<option value="${key}"${key === value ? " selected" : ""}>${esc(text)}</option>`,
    )
    .join("");
  return `<div class="field"><label class="label" for="${id}">${label}</label>
    <div class="select-wrap"><select class="select" id="${id}" data-model="${model}"${options.rerender ? " data-rerender" : ""}${
      options.change ? ` data-change="${options.change}"` : ""
    }${error ? ' aria-invalid="true"' : ""}${describedBy(id, hint, error)}>${items}</select>${icon("chevron-down")}</div>${
      hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ""
    }${error ? errorLine(id, error) : ""}</div>`;
}

function checkField(options) {
  const { id, label, model, checked, hint, error } = options;
  return `<label class="check" for="${id}">
    <input type="checkbox" id="${id}" data-model="${model}"${options.rerender ? " data-rerender" : ""}${checked ? " checked" : ""}${
      error ? ' aria-invalid="true"' : ""
    }${describedBy(id, hint, error)} />
    <span>${label}</span>
    ${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ""}
    ${error ? errorLine(id, error) : ""}
  </label>`;
}

function layerShell(title, body, options = {}) {
  return `<div class="layer${options.side ? " layer-side" : ""}" data-backdrop>
    <section class="layer-panel" role="dialog" aria-modal="true" aria-labelledby="layer-title" tabindex="-1">
      <div class="layer-head"><h2 id="layer-title">${title}</h2>
        <button type="button" class="btn btn-ghost btn-icon" id="layer-close" data-action="close-layer" aria-label="Закрыть">${icon("x")}</button>
      </div>
      ${body}
    </section>
  </div>`;
}

function emptyState(text, linkText, href) {
  return `<div class="sheet empty"><p>${text}</p>${
    linkText ? `<a class="btn btn-outline" href="${href}">${linkText}</a>` : ""
  }</div>`;
}

/** Writes a value to an «a.b.c» path of the ui object: data-model fields. */
function setPath(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const node = keys.reduce((item, key) => item[key], ui);
  node[last] = value;
}
