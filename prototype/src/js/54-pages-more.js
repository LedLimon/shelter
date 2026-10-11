// The rest of the public site: shelter plan, ways to help, guardianship, things,
// volunteering, stories, about, documents, contacts.

// A schematic plan. The real one will be drawn from the shelter's photos and plan.
const MAP_ZONES = {
  fence: { x: 150, y: 10, w: 200, h: 30, size: 13 },
  a: { x: 24, y: 58, w: 150, h: 106, cells: true },
  yard: { x: 190, y: 58, w: 146, h: 168 },
  b: { x: 24, y: 180, w: 150, h: 106, cells: true },
  vet: { x: 190, y: 242, w: 146, h: 78 },
  store: { x: 24, y: 302, w: 150, h: 70 },
  gate: { x: 190, y: 336, w: 146, h: 80 },
};

function zoneCounts(zone) {
  const dogs = state.dogs.filter((dog) => dog.zoneId === zone.id);
  const needs = state.needs.filter(
    (need) =>
      need.zoneId === zone.id &&
      ["open", "funded", "working"].includes(need.status),
  );
  const done = state.needs.filter(
    (need) => need.zoneId === zone.id && need.status === "done",
  );
  return { dogs, needs, done };
}

function zoneSummary(zone) {
  const { dogs, needs } = zoneCounts(zone);
  const parts = [];
  if (dogs.length)
    parts.push(formatCount(dogs.length, ["собака", "собаки", "собак"]));
  if (needs.length)
    parts.push(formatCount(needs.length, ["нужда", "нужды", "нужд"]));
  return parts.join(" · ");
}

function shelterMap(selected, mini) {
  const zones = state.zones
    .map((zone) => {
      const box = MAP_ZONES[zone.id];
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const summary = mini ? "" : zoneSummary(zone);
      const size = box.size ?? 16;
      const name = zone.name.toUpperCase();
      const width = name.length * size * 0.47 + 10;
      const cells = box.cells
        ? `<path class="map-detail" d="M${box.x + 50} ${box.y}v${box.h}M${box.x + 100} ${box.y}v${box.h}M${box.x} ${cy}h${box.w}"/>`
        : "";
      const trees =
        zone.id === "yard"
          ? `<circle class="map-detail" cx="${box.x + 26}" cy="${box.y + 28}" r="9"/><circle class="map-detail" cx="${box.x + 118}" cy="${box.y + 44}" r="12"/><circle class="map-detail" cx="${box.x + 40}" cy="${box.y + 140}" r="11"/>`
          : "";
      const label = `<rect class="zone-label-bg" x="${cx - width / 2}" y="${cy - size * 0.75 - (summary ? 5 : 0)}" width="${width}" height="${size * 1.3 + (summary ? 12 : 0)}"/>
        <text x="${cx}" y="${cy + size * 0.32 - (summary ? 5 : 0)}" font-size="${size}" text-anchor="middle">${name}</text>
        ${summary ? `<text class="map-sub" x="${cx}" y="${cy + size * 0.32 + 8}" text-anchor="middle">${summary}</text>` : ""}`;
      const shape = `<rect class="zone-shape" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>${cells}${trees}${label}`;
      return mini
        ? `<g class="zone">${shape}</g>`
        : `<g class="zone" id="zone-${zone.id}" role="button" tabindex="0" aria-pressed="${selected === zone.id}" aria-label="${zone.name}${summary ? `: ${summary}` : ""}" data-action="zone" data-zone="${zone.id}">${shape}</g>`;
    })
    .join("");
  return `<svg class="map" viewBox="0 0 360 440" ${mini ? 'aria-hidden="true"' : 'role="group" aria-label="Схема приюта"'}>
    <defs><pattern id="zone-hatch${mini ? "-mini" : ""}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-55)">
      <rect class="zone-label-bg" width="6" height="6"/><line class="zone-hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>
    <path class="map-outline" d="M236 430H10V10H350V430H290"/>
    ${zones}
    <path class="map-outline" d="M236 424v12M290 424v12"/>
  </svg>`;
}

function zonePanel(zone) {
  const { dogs, needs, done } = zoneCounts(zone);
  const dogList = dogs.length
    ? `<div class="mini-list">${dogs
        .map(
          (dog) =>
            `<a class="mini" href="#/dogs/${dog.id}">${photo(dog.photo, { ratio: "11", focus: dog.focus })}<span><b>${dog.name}</b><span class="t-caption muted">${DOG_STATUS[dog.status].label}</span></span></a>`,
        )
        .join("")}</div>`
    : '<p class="t-caption muted">Здесь никто не живёт.</p>';
  const needList = needs.length
    ? `<div class="mini-list">${needs
        .map(
          (need) =>
            `<div class="stack-xs"><a href="#/needs/${need.id}"><b>${esc(need.title)}</b></a>${needProgress(need, true)}<span class="t-caption muted">${formatRub(need.collected)} из ${formatRub(need.goal)} · ${NEED_STATUS[need.status].label.toLowerCase()}</span></div>`,
        )
        .join("")}</div>`
    : '<p class="t-caption muted">Сейчас здесь ничего не нужно.</p>';
  const doneList = done.length
    ? `<div class="stack-sm"><h3 class="t-label">Уже сделано</h3>${done
        .map(
          (
            need,
          ) => `<div class="stack-xs"><a href="#/needs/${need.id}"><b>${esc(need.title)}</b></a>
            <div class="before-after">${photo(null, { ratio: "11", empty: "До: фото из отчёта" })}${photo(null, { ratio: "11", empty: "После: фото из отчёта" })}</div></div>`,
        )
        .join("")}</div>`
    : "";
  return `<p>${esc(zone.text)}</p>
    <div class="stack-sm"><h3 class="t-label">Кто здесь живёт</h3>${dogList}</div>
    <div class="stack-sm"><h3 class="t-label">Что нужно этому месту</h3>${needList}</div>
    ${doneList}`;
}

PAGES.map = (params, query) => {
  const zone = zoneById(query.zone);
  ui.zone = zone?.id ?? null;
  return {
    title: "Карта приюта",
    html: `
      ${pageHead("Карта приюта", "Нажмите на место — увидите, кто там живёт и что ему сейчас нужно.")}
      ${note("p2", "Карта — второй этап. Схему нарисуем по фото и плану приюта; эта условная. Места на схеме описывает и наполняет админ: кто где живёт, какая нужда к чему относится. На телефоне панель места выезжает снизу.")}
      <div class="split">
        <div class="stack">
          <div class="sheet map-sheet">${shelterMap(ui.zone)}</div>
          <p class="when">Схема условная · настоящую нарисуем по фото приюта</p>
        </div>
        <div class="stack">
          <section class="sheet sheet-body" id="zone-panel" aria-live="polite" aria-labelledby="zone-title">
            <h2 class="t-title" id="zone-title">${zone ? zone.name : "Выберите место"}</h2>
            ${zone ? zonePanel(zone) : '<p class="muted">На схеме семь мест: вольеры, выгул, ветпункт, склад, вход и северный забор. То же самое — списком ниже.</p>'}
          </section>
          <section class="sheet sheet-body" aria-labelledby="zones-title">
            <h2 class="t-title" id="zones-title">Все места списком</h2>
            <ul class="zone-list">${state.zones
              .map(
                (item) =>
                  `<li><button type="button" id="zone-row-${item.id}" data-action="zone" data-zone="${item.id}" aria-pressed="${ui.zone === item.id}"><b>${item.name}</b><span class="when">${zoneSummary(item) || "—"}</span></button></li>`,
              )
              .join("")}</ul>
          </section>
        </div>
      </div>`,
  };
};

LAYERS.zone = () => {
  const zone = zoneById(ui.layer.zoneId);
  return layerShell(zone.name, zonePanel(zone));
};

ACTIONS.zone = (el) => {
  const id = el.dataset.zone;
  if (window.matchMedia("(min-width: 64rem)").matches) {
    ui.focusAfter = el.id;
    go(`#/map?zone=${id}`);
    return;
  }
  openLayer({ type: "zone", zoneId: id }, el);
};

PAGES.help = () => ({
  title: "Как помочь",
  html: `
    ${pageHead("Как помочь", "Четыре способа — выберите тот, что удобен вам. Любой из них виден в отчётах.")}
    ${waysSheet(false)}
    ${note("mvp", "Деньги — с запуска (MVP). Помощь вещами и опека — второй этап, волонтёрские смены — третий.")}
    <div class="grid-2">
      <section class="sheet sheet-body"><h2 class="t-title">Не знаете, с чего начать?</h2>
        <p>Посмотрите, что нужно приюту прямо сейчас: у каждой нужды есть сумма, срок и отчёт.</p>
        <div><a class="btn btn-outline" href="#/needs">Срочные нужды</a></div></section>
      <section class="sheet sheet-body"><h2 class="t-title">Хотите забрать собаку?</h2>
        <p>Это тоже помощь, и самая большая. В каталоге — те, кто ждёт дом.</p>
        <div><a class="btn btn-outline" href="#/dogs">Собаки</a></div></section>
    </div>`,
});

PAGES.guardianship = () => {
  const dogs = state.dogs
    .filter(
      (dog) => dog.monthlyCost && !["home", "rainbow"].includes(dog.status),
    )
    .sort(
      (a, b) => a.guardianKop / a.monthlyCost - b.guardianKop / b.monthlyCost,
    );
  return {
    title: "Опека",
    html: `
      ${pageHead("Опека", "Не можете забрать собаку — станьте её опекуном: помогайте каждый месяц и получайте фото и новости.")}
      ${note("p2", "Опека — второй этап. Это ежемесячная подписка на конкретную собаку: деньги идут в общий фонд с её пометкой, а шкала показывает, на сколько опекуны закрывают содержание. Если собаку заберут домой, опекунам придёт бережное письмо.")}
      <div class="split split-narrow-first">
        <section class="sheet sheet-body" aria-labelledby="guard-how">
          <h2 class="t-title" id="guard-how">Как это работает</h2>
          <ol class="steps-list">
            <li>Выберите собаку и сумму — от 300 ₽ в месяц.</li>
            <li>Раз в месяц присылаем фото и новости о подопечном.</li>
            <li>Изменить сумму или отменить можно по ссылке из любого письма.</li>
          </ol>
          <p class="t-caption muted">Шкала у каждой собаки показывает, какую часть её содержания уже закрывают опекуны.</p>
        </section>
        <section class="sheet sheet-body" aria-labelledby="guard-list">
          <h2 class="t-title" id="guard-list">Кому нужен опекун</h2>
          <ul class="doc-list">${dogs
            .map(
              (dog) => `<li class="guard-row">
                ${photo(dog.photo, { ratio: "11", focus: dog.focus })}
                <div class="stack-xs">
                  <a href="#/dogs/${dog.id}"><b>${dog.name}</b></a>
                  ${progressBar(dog.guardianKop / dog.monthlyCost, `Опекуны закрывают ${formatRub(dog.guardianKop)} из ${formatRub(dog.monthlyCost)}`, true)}
                  <span class="t-caption muted">${formatRub(dog.guardianKop)} из ${formatRub(dog.monthlyCost)} в месяц${dog.guardianKop >= dog.monthlyCost ? " · закрыто" : ""}</span>
                </div>
                <button type="button" class="btn btn-outline" id="guard-row-${dog.id}" data-action="donate" data-dog="${dog.id}" aria-label="Стать опекуном: ${dog.name}">Опекать</button>
              </li>`,
            )
            .join("")}</ul>
        </section>
      </div>`,
  };
};

PAGES.things = () => ({
  title: "Помощь вещами",
  html: `
    ${pageHead("Помощь вещами", "Корм, утеплитель, миски можно не оплачивать, а прислать. Закажите на маркетплейсе в пункт выдачи приюта — заберём сами.")}
    ${note("p2", "Помощь вещами — второй этап. Обещание «я закажу» нужно, чтобы двое не купили одно и то же; оно истекает, если посылка не пришла. В прогресс нужды вещь попадает только после отметки «получено» в админке.")}
    <div class="split split-narrow-first">
      <section class="sheet sheet-body" aria-labelledby="things-how">
        <h2 class="t-title" id="things-how">Как это работает</h2>
        <ol class="steps-list">
          <li>Выберите вещь и закажите её в наш пункт выдачи.</li>
          <li>Нажмите «Я закажу» — мы придержим эту позицию за вами.</li>
          <li>Когда получим посылку, отметим это, и вещь зачтётся в сбор.</li>
        </ol>
        <dl class="kv"><dt>Пункт выдачи</dt><dd>Ozon и Wildberries, ${SHELTER.pickup} <span class="demo-tag">демо-адрес</span></dd>
          <dt>Получатель</dt><dd>Приют «${SHELTER.name}»</dd></dl>
      </section>
      <section class="sheet sheet-body" aria-labelledby="things-list">
        <h2 class="t-title" id="things-list">Что нужно сейчас</h2>
        <ul class="doc-list">${state.things
          .map((thing) => {
            const need = thing.needId ? needById(thing.needId) : null;
            const mine = ui.promised[thing.id];
            return `<li class="thing-row">
              <div class="stack-xs">
                <b>${thing.title}</b>
                <span class="t-caption muted">${thing.shop} · около ${formatRub(thing.price)}${need ? ` · для нужды «<a href="#/needs/${need.id}">${esc(need.title)}</a>»` : ""}</span>
                <span class="when">нужно ${thing.need} · получено ${thing.got} · обещано ${thing.promised}</span>
                ${mine ? `<p class="ok">${icon("circle-check")}<span>Записали за вами. Ждём посылку до 25 октября.</span></p>` : ""}
              </div>
              <div class="row">
                <button type="button" class="btn btn-outline" ${stub(`Кнопка откроет карточку товара на ${thing.shop} с адресом пункта выдачи приюта.`, "p2")}>${icon("external-link")}${thing.shop}</button>
                ${mine ? "" : `<button type="button" class="btn" id="promise-${thing.id}" data-action="promise" data-thing="${thing.id}">Я закажу</button>`}
              </div>
            </li>`;
          })
          .join("")}</ul>
      </section>
    </div>`,
});

ACTIONS.promise = (el) => {
  const thing = state.things.find((item) => item.id === el.dataset.thing);
  thing.promised += 1;
  ui.promised[thing.id] = true;
  toast("Обещание записано. Номер заказа можно добавить позже.");
  refresh();
};

function shiftRow(shift) {
  const taken = shift.taken + (ui.joined[shift.id] ? 1 : 0);
  const full = taken >= shift.seats && !ui.joined[shift.id];
  const seats = Array.from(
    { length: shift.seats },
    (_, index) => `<i${index < taken ? ' class="on"' : ""}></i>`,
  ).join("");
  const button = ui.joined[shift.id]
    ? `<button type="button" class="btn btn-outline" id="shift-${shift.id}" data-action="leave-shift" data-shift="${shift.id}">Отменить запись</button>`
    : full
      ? `<button type="button" class="btn" disabled>Мест нет</button>`
      : `<button type="button" class="btn" id="shift-${shift.id}" data-action="join-shift" data-shift="${shift.id}">Записаться</button>`;
  return `<li class="slot">
    <div class="stack-xs">
      <span class="when">${WEEKDAYS[shift.when.getDay()]}, ${formatDate(shift.when)} · ${formatTime(shift.when)}–${shift.until}</span>
      <b>${shift.title}</b><span class="t-caption muted">${shift.text}</span>
      <div class="row"><div class="seats" role="img" aria-label="Занято ${taken} из ${shift.seats} мест">${seats}</div><span class="t-caption muted">${taken} из ${shift.seats} мест</span></div>
      ${ui.joined[shift.id] ? `<p class="ok">${icon("circle-check")}<span>Вы записаны. Напомним за день.</span></p>` : ""}
    </div>
    ${button}
  </li>`;
}

PAGES.volunteers = () => ({
  title: "Волонтёрство",
  html: `
    ${pageHead("Волонтёрство", "Собакам нужны прогулки, а приюту — руки. Запишитесь на смену или возьмите разовую задачу.")}
    ${note("p3", "Волонтёрство — третий этап. У волонтёра есть короткая анкета с подтверждением «мне есть 18 лет», сменами управляет координатор: лимит мест, напоминания, отметка «пришёл / не пришёл».")}
    <div class="split split-even">
      <section class="sheet sheet-body" aria-labelledby="shifts-title">
        <h2 class="t-title" id="shifts-title">Смены на этой неделе</h2>
        <ul class="slots">${state.shifts.map(shiftRow).join("")}</ul>
      </section>
      <section class="sheet sheet-body" aria-labelledby="tasks-title">
        <h2 class="t-title" id="tasks-title">Разовые задачи</h2>
        <ul class="slots">${state.tasks
          .map(
            (task) => `<li class="slot">
              <div class="stack-xs"><b class="row">${icon(task.icon)}<span class="grow">${task.title}</span></b><span class="t-caption muted">${task.text}</span>
                ${ui.taken[task.id] ? `<p class="ok">${icon("circle-check")}<span>Задача за вами. Координатор напишет сегодня.</span></p>` : ""}</div>
              ${ui.taken[task.id] ? "" : `<button type="button" class="btn btn-outline" id="task-${task.id}" data-action="take-task" data-task="${task.id}">Возьму</button>`}
            </li>`,
          )
          .join("")}</ul>
      </section>
    </div>`,
});

LAYERS.volunteer = () => {
  const form = ui.volunteer;
  return layerShell(
    "Анкета волонтёра",
    `<p class="muted">Один раз, перед первой сменой. Потом записываться можно в одно нажатие.</p>
    <form class="stack-sm" data-submit="volunteer-submit" novalidate>
      ${field({ id: "vol-name", label: "Как к вам обращаться", model: "volunteer.name", value: form.name })}
      ${checkField({ id: "vol-adult", label: "Мне есть 18 лет", model: "volunteer.adult", checked: form.adult, error: form.error })}
      ${checkField({ id: "vol-car", label: "Есть машина", model: "volunteer.car", checked: form.car, hint: "Пригодится, чтобы отвезти собаку в клинику." })}
      ${checkField({ id: "vol-foster", label: "Могу взять собаку на передержку", model: "volunteer.foster", checked: form.foster })}
      <button type="submit" class="btn btn-block" id="vol-submit">Записаться на смену</button>
    </form>`,
  );
};

ACTIONS["join-shift"] = (el) => {
  if (ui.volunteer?.done) {
    ui.joined[el.dataset.shift] = true;
    toast("Вы записаны на смену.");
    refresh(el.id);
    return;
  }
  ui.volunteer = {
    name: "Анна",
    adult: false,
    car: false,
    foster: false,
    error: null,
    shift: el.dataset.shift,
  };
  openLayer({ type: "volunteer" }, el);
};

ACTIONS["volunteer-submit"] = () => {
  const form = ui.volunteer;
  if (!form.adult) {
    form.error =
      "Волонтёрами становятся с 18 лет. Отметьте, если вам уже есть 18.";
    refresh("vol-adult");
    return;
  }
  form.done = true;
  ui.joined[form.shift] = true;
  closeLayer(true);
  toast("Анкета сохранена, вы записаны на смену.");
};

ACTIONS["leave-shift"] = (el) => {
  ui.joined[el.dataset.shift] = false;
  refresh(el.id);
};

ACTIONS["take-task"] = (el) => {
  ui.taken[el.dataset.task] = true;
  toast("Задача за вами.");
  refresh();
};

PAGES.stories = () => {
  const home = state.dogs.filter((dog) => dog.status === "home");
  return {
    title: "Они дома",
    html: `
      ${pageHead("Они дома", "Собаки, которые уехали из приюта домой. Лучшее доказательство, что всё не зря.")}
      ${note("p2", "Истории «Они дома» — второй этап. Историю пишет куратор, новые хозяева могут прислать фото. Собака остаётся на сайте со статусом «Дома».")}
      <div class="grid-2">${home
        .map(
          (dog) => `<article class="sheet story">
            ${photo(dog.photo, { ratio: "11", alt: `${dog.name} дома`, focus: dog.focus, stamp: "Дома" })}
            <div class="stack-sm"><h2 class="t-title">${dog.name}</h2><p>${esc(dog.short)}</p><p class="t-caption muted">${dog.story[0]}</p></div>
          </article>`,
        )
        .join("")}</div>
      <section class="sheet sheet-body"><h2 class="t-title">Ваша собака тоже отсюда?</h2>
        <p>Пришлите пару фото и несколько слов — добавим её историю.</p>
        <div><button type="button" class="btn btn-outline" ${stub("Здесь откроется короткая форма: фото и текст уйдут куратору на проверку.", "p2")}>Рассказать историю</button></div></section>`,
  };
};

PAGES.about = () => {
  const inShelter = state.dogs.filter(
    (dog) => !["home", "rainbow"].includes(dog.status),
  );
  const looking = inShelter.filter((dog) => dog.status === "looking");
  return {
    title: "О приюте",
    html: `
      ${pageHead("О приюте", "«Островок Надежды» — небольшой частный приют для собак. Живём на пожертвования и отчитываемся за каждый рубль.")}
      ${note("mvp", "Тексты этой страницы — заглушка: настоящие напишет приют. Страницу можно править в админке без программиста.")}
      <div class="split">
        <article class="sheet sheet-body">
          <span class="demo-tag">демо-текст</span>
          <div class="prose">
            <p class="t-lead">Сейчас у нас ${formatCount(inShelter.length, ["собака", "собаки", "собак"])}, ${looking.length} из них ищут дом.</p>
            <p>Мы берём собак с улицы, лечим, прививаем, стерилизуем и ищем им семью. Кого-то забирают через месяц, кто-то живёт у нас годами — им мы стараемся дать тёплый вольер, прогулки и своего человека среди волонтёров.</p>
            <p>У приюта нет спонсора. Корм, лекарства и ремонт оплачивают обычные люди, поэтому мы показываем всё: сколько пришло, что купили, чек и фото.</p>
            <h2 class="t-title">Чего мы не делаем</h2>
            <ul><li>Не давим на жалость и не показываем страшных фото.</li><li>Не собираем «на приют вообще»: у каждого сбора есть предмет, сумма и отчёт.</li><li>Не отдаём собаку без знакомства и договора.</li></ul>
          </div>
        </article>
        <div class="stack">
          <section class="sheet sheet-body"><h2 class="t-title">Как устроен приют</h2>
            <p class="t-caption">Вольеры, выгул, ветпункт и склад — на схеме.</p>
            <div><a class="btn btn-outline" href="#/map">Карта приюта</a></div></section>
          <section class="sheet sheet-body"><h2 class="t-title">Документы и контакты</h2>
            <p class="t-caption">Устав, реквизиты, отчёты в Минюст — всё открыто.</p>
            <div class="row"><a href="#/documents">Документы</a><a href="#/contacts">Контакты</a></div></section>
        </div>
      </div>`,
  };
};

PAGES.documents = () => ({
  title: "Документы",
  html: `
    ${pageHead("Документы", "Устав, реквизиты, отчёты и правила, по которым мы принимаем пожертвования.")}
    ${note("mvp", "Юридические тексты готовит юрист. У оферты и согласий есть версии: сайт помнит, с какой именно согласился человек.")}
    <div class="split split-even">
      <section class="sheet sheet-body" aria-labelledby="docs-list">
        <h2 class="t-title" id="docs-list">Документы</h2>
        <ul class="doc-list">${DOCUMENTS.map(
          ([title, kind]) =>
            `<li>${icon("file-text")}<button type="button" class="btn-link" ${stub(`Откроется документ «${title}». Тексты появятся после проверки юристом.`)}>${title}</button><span class="when">${kind}</span></li>`,
        ).join("")}</ul>
      </section>
      <section class="sheet sheet-body" aria-labelledby="req-title">
        <h2 class="t-title" id="req-title">Реквизиты</h2>
        <span class="demo-tag">демо-данные</span>
        <dl class="kv">
          <dt>Организация</dt><dd>${SHELTER.legal}</dd>
          <dt>ИНН</dt><dd class="num">0000000000</dd>
          <dt>Расчётный счёт</dt><dd class="num">00000 000 0 0000 0000000</dd>
          <dt>Банк</dt><dd>указан в оферте</dd>
        </dl>
        <p class="t-caption muted">Перевод по реквизитам тоже попадает в книгу операций: его вносит админ.</p>
      </section>
    </div>`,
});

function areaMap() {
  const point = (x, y, n) =>
    `<circle class="map-point" cx="${x}" cy="${y}" r="9"/><text class="map-point-text" x="${x}" y="${y + 3.2}" text-anchor="middle">${n}</text>`;
  return `<svg class="map" viewBox="0 0 360 220" role="img" aria-label="Схема проезда: остановка, пункт выдачи, парковка и вход в приют">
    <path class="map-road" d="M0 186H360"/>
    <path class="map-road map-road-thin" d="M84 186V76H262"/>
    <rect class="map-site" x="232" y="24" width="96" height="74"/>
    <text x="280" y="58" font-size="15" text-anchor="middle">ПРИЮТ</text>
    <text class="map-sub" x="12" y="206">трасса · демо</text>
    <text class="map-sub" x="96" y="66">ул. Полевая</text>
    ${point(52, 186, 1)}${point(150, 76, 2)}${point(214, 76, 3)}${point(262, 98, 4)}
  </svg>`;
}

PAGES.contacts = () => ({
  title: "Контакты",
  html: `
    ${pageHead("Контакты", "Напишите куратору или приезжайте знакомиться — только предупредите заранее.")}
    <div class="split split-even">
      <div class="stack">
        <section class="sheet sheet-body" aria-labelledby="contact-title">
          <h2 class="t-title" id="contact-title">Куратор ${CURATOR.name}</h2>
          <span class="demo-tag">демо-контакты</span>
          <div class="channels">${CURATOR.channels
            .map(
              (channel) =>
                `<button type="button" class="channel" ${stub(
                  channel.reveal
                    ? "Номер телефона открывается по нажатию — так его не соберут роботы."
                    : `На сайте это нажатие откроет ${channel.label} с куратором.`,
                )}>${icon(channel.icon)}<span><b>${channel.label}</b><small>${channel.hint}</small></span>${icon("chevron-right")}</button>`,
            )
            .join("")}</div>
          <dl class="kv"><dt>Адрес</dt><dd>${SHELTER.address} <span class="demo-tag">демо</span></dd><dt>Когда</dt><dd>${SHELTER.hours}</dd></dl>
        </section>
        ${note("mvp", "Контакты и набор каналов приют меняет сам в админке.")}
      </div>
      <section class="sheet sheet-body" id="route" aria-labelledby="route-title">
        <h2 class="t-title" id="route-title">Как добраться</h2>
        ${areaMap()}
        <ol class="steps-list">
          <li>Остановка «Берёзовка»: отсюда 12 минут пешком по Полевой.</li>
          <li>Пункт выдачи Ozon и Wildberries — сюда присылают вещи для приюта.</li>
          <li>Парковка у ворот, шесть мест.</li>
          <li>Вход. Позвоните у калитки — собаки услышат раньше нас.</li>
        </ol>
        <div class="row">
          <button type="button" class="btn btn-outline" ${stub("Карта Яндекса загрузится только после нажатия и согласия на сторонние cookie. Без согласия останутся ссылки ниже.", "p2")}>${icon("map")}Показать на Яндекс Картах</button>
          <button type="button" class="btn-link" ${stub("Ссылка откроет точку приюта в приложении 2ГИС.", "p2")}>2ГИС</button>
          <button type="button" class="btn-link" ${stub("Ссылка построит маршрут в навигаторе телефона.", "p2")}>Навигатор</button>
        </div>
        ${note("p2", "Стилизованная схема проезда и карта Яндекса по нажатию — второй этап, вместе с картой приюта. Адрес и текстовый маршрут — с запуска.")}
      </section>
    </div>`,
});
