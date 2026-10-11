// Dogs: the catalogue with filters in the address, a profile, the «Хочу забрать» sheet.

const DOG_FILTERS = {
  status: {
    label: "Статус",
    options: {
      all: "Все в приюте",
      looking: "Ищет дом",
      treatment: "На лечении",
      reserved: "Забронирована",
      foster: "На передержке",
      home: "Дома",
      rainbow: "На радуге",
    },
  },
  sex: {
    label: "Пол",
    options: { all: "Любой", f: "Девочки", m: "Мальчики" },
  },
  size: {
    label: "Размер",
    options: {
      all: "Любой",
      small: "Небольшие",
      medium: "Средние",
      large: "Крупные",
    },
  },
  age: {
    label: "Возраст",
    options: {
      all: "Любой",
      young: "До 3 лет",
      adult: "3–7 лет",
      senior: "Старше 7",
    },
  },
  with: {
    label: "Ладит",
    options: {
      all: "Не важно",
      kids: "С детьми",
      cats: "С кошками",
      dogs: "С собаками",
    },
  },
};

function dogMatches(dog, filter) {
  const age =
    dog.ageMonths < 36 ? "young" : dog.ageMonths <= 84 ? "adult" : "senior";
  return (
    (filter.status === "all"
      ? !["home", "rainbow"].includes(dog.status)
      : dog.status === filter.status) &&
    (filter.sex === "all" || dog.sex === filter.sex) &&
    (filter.size === "all" || dog.size === filter.size) &&
    (filter.age === "all" || age === filter.age) &&
    (filter.with === "all" || dog.traits[filter.with] === "yes")
  );
}

PAGES.dogs = (params, query) => {
  const filter = {};
  for (const [key, group] of Object.entries(DOG_FILTERS))
    filter[key] = group.options[query[key]] ? query[key] : "all";
  const link = (next) => {
    const merged = { ...filter, ...next };
    const parts = Object.entries(merged)
      .filter(([, value]) => value !== "all")
      .map(([key, value]) => `${key}=${value}`);
    return `#/dogs${parts.length ? `?${parts.join("&")}` : ""}`;
  };
  const chosen = Object.values(filter).filter(
    (value) => value !== "all",
  ).length;
  const list = state.dogs
    .filter((dog) => dogMatches(dog, filter))
    .sort((a, b) => a.since - b.since);
  const groups = Object.entries(DOG_FILTERS)
    .map(
      ([
        key,
        group,
      ]) => `<div class="filter-group"><span class="label" id="df-${key}">${group.label}</span>
        <div class="chips" role="group" aria-labelledby="df-${key}">${Object.entries(
          group.options,
        )
          .map(([value, label]) =>
            chipLink(link({ [key]: value }), label, filter[key] === value),
          )
          .join("")}</div></div>`,
    )
    .join("");
  const empty =
    filter.status === "rainbow"
      ? emptyState(
          "Здесь приют будет вспоминать тех, кого не стало. Слова для этой страницы напишут сами сотрудники — в прототипе она пустая.",
          "Все собаки",
          "#/dogs",
        )
      : emptyState(
          "Таких собак сейчас нет. Уберите часть фильтров — или загляните позже: новые жильцы появляются каждый месяц.",
          "Сбросить фильтры",
          "#/dogs",
        );
  return {
    title: "Собаки",
    html: `
      ${pageHead("Собаки", "У каждой собаки свой характер и своя история. Найдёте свою — оторвите язычок «Хочу забрать»: он открывает контакты куратора.")}
      ${note("mvp", "Фильтры живут в адресе: ссылку «небольшие девочки, ладят с детьми» можно отправить знакомым. Собак с сайта не удаляем — меняется только статус.")}
      <div class="sheet filters">
        <div class="row-between">
          <button type="button" class="btn btn-outline btn-sm filters-toggle" id="filters-toggle" data-action="toggle-filters" aria-expanded="${Boolean(ui.filtersOpen)}" aria-controls="dog-filters">${icon("sliders-horizontal")}Фильтры${chosen ? ` · ${chosen}` : ""}</button>
          <span class="when">${list.length ? `${formatCount(list.length, ["собака", "собаки", "собак"])} · сначала те, кто ждёт дольше` : "никого не нашлось"}</span>
          ${chosen ? `<a href="#/dogs">Сбросить</a>` : ""}
        </div>
        <div class="filters-body filters-inline${ui.filtersOpen ? " is-open" : ""}" id="dog-filters">${groups}</div>
      </div>
      ${list.length ? `<div class="grid-dogs">${list.map(dogCard).join("")}</div>` : empty}`,
  };
};

ACTIONS["toggle-filters"] = (el) => {
  ui.filtersOpen = !ui.filtersOpen;
  refresh(el.id);
};

const TRAIT_TEXT = {
  kids: [
    "Ладит с детьми",
    "С маленькими детьми не советуем",
    "С детьми не проверяли",
  ],
  cats: ["Ладит с кошками", "Кошек гоняет", "С кошками не проверяли"],
  dogs: [
    "Ладит с собаками",
    "Хочет быть единственной собакой",
    "С собаками не проверяли",
  ],
};

function traitLine(key, value) {
  const index = value === "yes" ? 0 : value === "no" ? 1 : 2;
  const cls = value === "yes" ? "fact-yes" : "fact-no";
  const mark = value === "yes" ? "check" : value === "no" ? "x" : "minus";
  return `<li class="fact ${cls}">${icon(mark)}<span>${TRAIT_TEXT[key][index]}</span></li>`;
}

function healthLine(ok, yes, no) {
  return `<li class="fact ${ok ? "fact-yes" : "fact-no"}">${icon(ok ? "check" : "minus")}<span>${ok ? yes : no}</span></li>`;
}

function guardianship(dog) {
  if (!dog.monthlyCost) return "";
  const share = dog.guardianKop / dog.monthlyCost;
  const full = dog.guardianKop >= dog.monthlyCost;
  return `<section class="sheet sheet-body" aria-labelledby="guard-title">
    <h2 class="t-title" id="guard-title">Опека</h2>
    <p class="t-caption">На ${dog.acc} уходит ${formatRub(dog.monthlyCost)} в месяц: корм, прививки, обработка.</p>
    ${progressBar(share, `Опекуны закрывают ${formatRub(dog.guardianKop)} из ${formatRub(dog.monthlyCost)}`)}
    <p class="t-caption muted">${
      dog.guardians
        ? `${formatCount(dog.guardians, ["опекун", "опекуна", "опекунов"])} — ${formatRub(dog.guardianKop)} в месяц${full ? ". Содержание закрыто полностью." : ""}`
        : "Пока опекунов нет."
    }</p>
    <div><button type="button" class="btn btn-outline" id="guard-${dog.id}" data-action="donate" data-dog="${dog.id}">Стать опекуном</button></div>
    ${note("p2", "Опека — ежемесячная подписка на конкретную собаку. Деньги идут в общий фонд с пометкой собаки; опекун получает фото и новости.")}
  </section>`;
}

PAGES.dog = ({ id }) => {
  const dog = dogById(id);
  if (!dog) return null;
  const facts = dogFacts(dog);
  const zone = dog.zoneId ? zoneById(dog.zoneId) : null;
  const needs = state.needs.filter(
    (need) => need.dogId === dog.id && isPublic(need),
  );
  const canAdopt = HAS_TABS.includes(dog.status);
  const action = canAdopt
    ? `<div><button type="button" class="btn btn-lg" id="main-cta" data-action="adopt" data-dog="${dog.id}">Хочу забрать</button></div>`
    : dog.status === "home"
      ? `<div><span class="stamp">Дома</span></div>`
      : `<p class="t-caption muted">Семья уже нашлась: ждём переезда.</p>`;
  return {
    title: dog.name,
    sticky: canAdopt
      ? `<button type="button" class="btn btn-lg btn-block" id="sticky-cta" data-action="adopt" data-dog="${dog.id}">Хочу забрать ${dog.acc}</button>`
      : null,
    html: `
      <nav class="crumbs" aria-label="Вы здесь"><a href="#/dogs">Собаки</a> / ${DOG_STATUS[dog.status].label}</nav>
      <div class="split split-narrow-first">
        <div class="stack">
          <div class="sheet dog">
            <div class="gallery">${photo(dog.photo, { ratio: "45", alt: `${dog.name}, ${facts.sex.toLowerCase()}, ${facts.age}`, focus: dog.focus })}</div>
            ${canAdopt ? adoptTabs(dog, "-profile") : ""}
          </div>
          ${note("mvp", "В настоящем профиле — галерея до десяти фото с точкой фокуса на морде, которую задаёт админ. У каждой собаки своя картинка для репоста в соцсетях.")}
        </div>
        <div class="stack">
          <article class="sheet sheet-body">
            <div class="row-between">${dogStatusBadge(dog.status)}<span class="when">${dogLine(dog)}</span></div>
            <h1 class="t-name dog-h1">${dog.name}</h1>
            <p class="t-lead">${facts.sex}, ${facts.age}, ${facts.size}. Окрас: ${dog.color}.</p>
            <div class="prose">${dog.story.map((text) => `<p>${text}</p>`).join("")}</div>
            ${action}
          </article>
          <div class="grid-2">
            <section class="sheet sheet-body" aria-labelledby="traits-title">
              <h2 class="t-title" id="traits-title">Характер</h2>
              <ul class="facts">
                ${traitLine("kids", dog.traits.kids)}${traitLine("cats", dog.traits.cats)}${traitLine("dogs", dog.traits.dogs)}
                <li class="fact">${icon("activity")}<span>Темперамент: ${dog.traits.activity}</span></li>
              </ul>
            </section>
            <section class="sheet sheet-body" aria-labelledby="health-title">
              <h2 class="t-title" id="health-title">Здоровье</h2>
              <ul class="facts">
                ${healthLine(dog.health.vaccinated, dog.sex === "f" ? "Привита по возрасту" : "Привит по возрасту", "Прививки впереди")}
                ${healthLine(dog.health.sterilized, dog.sex === "f" ? "Стерилизована" : "Кастрирован", dog.sex === "f" ? "Не стерилизована" : "Не кастрирован")}
                ${healthLine(dog.health.chipped, "Есть чип", "Чипа пока нет")}
              </ul>
              ${dog.health.note ? `<p class="t-caption">${dog.health.note}</p>` : ""}
            </section>
          </div>
          ${
            needs.length
              ? `<section class="sheet sheet-body" aria-labelledby="dog-needs"><h2 class="t-title" id="dog-needs">Сейчас собираем</h2>
                  <div class="mini-list">${needs
                    .map(
                      (need) =>
                        `<div class="stack-xs"><a href="#/needs/${need.id}"><b>${esc(need.title)}</b></a>${needProgress(need, true)}<span class="t-caption muted">${formatRub(need.collected)} из ${formatRub(need.goal)} · ${NEED_STATUS[need.status].label.toLowerCase()}</span></div>`,
                    )
                    .join("")}</div></section>`
              : ""
          }
          ${guardianship(dog)}
          ${
            zone
              ? `<section class="sheet sheet-body" aria-labelledby="dog-zone"><h2 class="t-title" id="dog-zone">Где живёт</h2>
                  <p>${zone.name}. <a href="#/map?zone=${zone.id}">Показать на карте</a></p>${note("p2", "Ссылка на место на карте появится вместе с картой приюта.")}</section>`
              : ""
          }
        </div>
      </div>`,
  };
};

LAYERS.adopt = () => {
  const dog = dogById(ui.layer.dogId);
  const channels = CURATOR.channels
    .map((channel) => {
      const shown = channel.reveal && ui.phoneShown;
      return `<button type="button" class="channel" id="channel-${channel.id}" data-action="channel" data-channel="${channel.id}">
        ${icon(channel.icon)}
        <span><b>${shown ? channel.reveal : channel.label}</b><small>${shown ? "демо-номер · звоните с 10 до 20" : channel.hint}</small></span>
        ${icon("chevron-right")}
      </button>`;
    })
    .join("");
  return layerShell(
    `Хочу забрать ${dog.acc}`,
    `<p>Напишите или позвоните куратору ${CURATOR.dat}. Она расскажет про ${dog.acc} и договорится о знакомстве. Анкету заполнять не нужно.</p>
    <div class="channels">${channels}</div>
    <div role="status">${ui.channelNote ? iconLine("info", ui.channelNote) : ""}</div>
    <div class="stack-sm">
      <h3 class="t-label">Что дальше</h3>
      <ol class="steps-list">
        <li>Куратор ответит в тот же день.</li>
        <li>Приедете познакомиться и погулять вместе.</li>
        <li>Подпишете договор — и ${dog.name} поедет домой.</li>
      </ol>
    </div>
    <p class="t-caption muted">Мы считаем только нажатия по каналам, без ваших данных.</p>
    ${note("mvp", "Набор каналов настраивается в админке: Telegram, WhatsApp, MAX, VK, телефон. Номер открывается по нажатию — так его не соберут роботы. Счётчик нажатий виден сотрудникам в карточке собаки.")}`,
  );
};

ACTIONS.adopt = (el) => {
  ui.phoneShown = false;
  ui.channelNote = null;
  tearThen(el, () => openLayer({ type: "adopt", dogId: el.dataset.dog }, el));
};

ACTIONS.channel = (el) => {
  const channel = CURATOR.channels.find(
    (item) => item.id === el.dataset.channel,
  );
  state.adoptClicks[channel.id] += 1;
  if (channel.reveal) {
    ui.phoneShown = true;
    ui.channelNote = "На сайте здесь будет настоящий номер куратора.";
  } else {
    ui.channelNote = `В прототипе чат не откроется. На сайте это нажатие сразу откроет ${channel.label} с куратором.`;
  }
  refresh(el.id);
};
