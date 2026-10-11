// Donation: the sheet with sums, the stand-in for payment, the status page, the general fund.

/** Layers by type: each returns the markup of a dialog or a bottom sheet. */
const LAYERS = {};

function donateTarget(form) {
  const { type, id } = form.target;
  return {
    need: type === "need" ? needById(id) : null,
    dog: type === "dog" ? dogById(id) : null,
  };
}

function startDonate(options = {}) {
  const previous = ui.donate;
  const need = options.needId ? needById(options.needId) : null;
  const monthly = Boolean(options.dogId || options.monthly);
  let amount = options.amount ?? rub(monthly ? 500 : 1000);
  if (need && !options.amount) {
    const presets = sumPresets(need, true);
    const preferred = need.unit ? need.unit.price : rub(1000);
    amount = (
      presets.find((item) => item.amount === preferred) ??
      presets[0] ?? { amount: preferred }
    ).amount;
  }
  ui.donate = {
    target: need
      ? { type: "need", id: need.id }
      : options.dogId
        ? { type: "dog", id: options.dogId }
        : { type: "fund" },
    amount,
    custom: "",
    mode: monthly ? "monthly" : "once",
    email: previous?.email ?? "anna@example.com",
    name: previous?.name ?? "Анна",
    anon: previous?.anon ?? false,
    comment: "",
    coverFee: false,
    offer: false,
    recurring: false,
    news: false,
    errors: {},
  };
}

function donateAmount(form) {
  return form.custom.trim() ? parseRubInput(form.custom) : form.amount;
}

function donateTiles(form) {
  const { need } = donateTarget(form);
  const monthly = form.mode === "monthly";
  const presets =
    need && !monthly
      ? sumPresets(need, true)
      : (monthly ? [300, 500, 1000] : [500, 1000, 2500]).map((value) => ({
          amount: rub(value),
        }));
  return presets
    .map((preset) => {
      const on = !form.custom.trim() && form.amount === preset.amount;
      return preset.rest
        ? `<button type="button" class="amount amount-wide" id="amount-rest" data-action="amount" data-amount="${preset.amount}" aria-pressed="${on}"><span><b>${formatRub(preset.amount)}</b> <small>весь остаток — закрыть сбор</small></span></button>`
        : `<button type="button" class="amount" id="amount-${preset.amount}" data-action="amount" data-amount="${preset.amount}" aria-pressed="${on}"><b>${formatRub(preset.amount)}</b></button>`;
    })
    .join("");
}

LIVE.donateCta = () => {
  const form = ui.donate;
  const amount = donateAmount(form);
  const sum = amount ? ` — ${formatRub(amount)}` : "";
  if (form.target.type === "dog")
    return `Стать опекуном${sum}${amount ? " в месяц" : ""}`;
  return form.mode === "monthly"
    ? `Помогать${sum}${amount ? " в месяц" : ""}`
    : `Помочь${sum}`;
};

LIVE.donateFee = () => {
  const amount = donateAmount(ui.donate);
  return `Покрыть комиссию банка${amount ? ` — ${formatRub(fee(amount))}` : ""}`;
};

LIVE.donateSummary = () => {
  const form = ui.donate;
  const { need } = donateTarget(form);
  const amount = donateAmount(form);
  const lines = [];
  if (need && form.mode === "monthly")
    lines.push(
      "Ежемесячные пожертвования идут в общий фонд: из него закрываем самое срочное. На эту нужду можно помочь разово.",
    );
  if (need && form.mode === "once" && amount && amount > remaining(need))
    lines.push(
      `Это больше остатка. ${formatRub(remaining(need))} пойдут на эту нужду, ${formatRub(amount - remaining(need))} — в общий фонд приюта.`,
    );
  return lines.map((text) => iconLine("info", text)).join("");
};

function donateForm(inline) {
  const form = ui.donate;
  const { need, dog } = donateTarget(form);
  const errors = form.errors;
  const modes = dog
    ? ""
    : `<div class="seg" role="group" aria-label="Как часто">
        <button type="button" class="seg-item" id="mode-once" data-action="mode" data-mode="once" aria-pressed="${form.mode === "once"}">Разово</button>
        <button type="button" class="seg-item" id="mode-monthly" data-action="mode" data-mode="monthly" aria-pressed="${form.mode === "monthly"}">${icon("repeat")}Каждый месяц</button>
      </div>`;
  const emailHint =
    form.mode === "monthly"
      ? "Пришлём чек после каждого списания."
      : need
        ? "Пришлём чек и отчёт, когда всё купим."
        : "Пришлём чек.";
  const more = form.more
    ? `<div class="stack-sm" id="donate-more">
        ${field({
          id: "donate-name",
          label: "Имя",
          model: "donate.name",
          value: form.name,
          attrs: 'autocomplete="given-name"',
        })}
        ${checkField({
          id: "donate-anon",
          label: "Не показывать имя",
          model: "donate.anon",
          checked: form.anon,
          hint: "В ленте и книге операций будет «Аноним».",
        })}
        <label class="check" for="donate-fee">
          <input type="checkbox" id="donate-fee" data-model="donate.coverFee"${form.coverFee ? " checked" : ""} aria-describedby="donate-fee-hint" />
          <span data-live="donateFee">${LIVE.donateFee()}</span>
          <span class="hint" id="donate-fee-hint">Тогда до приюта дойдёт вся сумма.</span>
        </label>
        ${checkField({
          id: "donate-news",
          label: "Присылать новости приюта раз в месяц",
          model: "donate.news",
          checked: form.news,
        })}
      </div>`
    : "";
  return `<form class="stack-sm" id="donate-form" data-submit="donate-submit" novalidate>
    ${modes}
    <fieldset class="stack-sm">
      <legend class="label">Сумма</legend>
      <div class="amounts">${donateTiles(form)}</div>
      ${field({
        id: "donate-custom",
        label: "Другая сумма, ₽",
        model: "donate.custom",
        value: form.custom,
        error: errors.amount,
        placeholder: "Например, 750",
        attrs: 'inputmode="decimal" autocomplete="off"',
      })}
      <div data-live="donateSummary">${LIVE.donateSummary()}</div>
    </fieldset>
    ${field({
      id: "donate-email",
      label: "Почта для чека",
      model: "donate.email",
      value: form.email,
      type: "email",
      error: errors.email,
      hint: inline ? `${emailHint} В прототипе почта уже вписана.` : emailHint,
      attrs: 'autocomplete="email"',
    })}
    <div><button type="button" class="btn-link" id="donate-more-toggle" data-action="donate-more" aria-expanded="${Boolean(form.more)}" aria-controls="donate-more">${form.more ? "Скрыть имя, комиссию и новости" : `Имя, комиссия банка и новости — сейчас от имени «${form.anon || !form.name.trim() ? "Аноним" : esc(form.name.trim())}»`}</button></div>
    ${more}
    ${note("mvp", "Галочки согласий не отмечены заранее — так требует закон. Пожертвовать можно без регистрации: нужна только почта, для гостя попросим ввести её дважды. Ежемесячные платежи в общий фонд — с запуска.")}
    <div class="${inline ? "form-foot" : "layer-sticky"}">
      ${checkField({
        id: "donate-offer",
        label: `Принимаю <button type="button" class="btn-link" ${stub("Здесь откроется публичная оферта. Текст готовит юрист, у каждого согласия хранится версия документа.")}>оферту</button> и согласен на <button type="button" class="btn-link" ${stub("Здесь откроется политика обработки персональных данных по 152-ФЗ.")}>обработку персональных данных</button>`,
        model: "donate.offer",
        checked: form.offer,
        error: errors.offer,
      })}
      ${
        form.mode === "monthly"
          ? checkField({
              id: "donate-recurring",
              label: "Согласен на списание каждый месяц, пока не отменю",
              model: "donate.recurring",
              checked: form.recurring,
              error: errors.recurring,
              hint: "Отменить можно по ссылке из любого письма, без регистрации.",
            })
          : ""
      }
      <button type="submit" class="btn ${dog ? "btn-lg" : "btn-help"} btn-block" id="${inline ? "main-cta" : "donate-submit"}"><span data-live="donateCta">${LIVE.donateCta()}</span></button>
    </div>
  </form>`;
}

ACTIONS["donate-more"] = (el) => {
  ui.donate.more = !ui.donate.more;
  refresh(el.id);
};

LAYERS.donate = () => {
  const form = ui.donate;
  const { need, dog } = donateTarget(form);
  const title = dog
    ? `Опека: ${dog.name}`
    : need?.dogId
      ? `Помочь ${dogById(need.dogId).dat}`
      : need
        ? "Помочь"
        : "В общий фонд";
  const about = dog
    ? `На ${dog.acc} уходит ${formatRub(dog.monthlyCost)} в месяц. Опекуны уже закрывают ${formatRub(dog.guardianKop)}.`
    : need
      ? `${esc(need.title)}. Собрано ${formatRub(need.collected)} из ${formatRub(need.goal)}.`
      : "Из общего фонда закрываем комиссии банка, недостачи по сборам и срочное.";
  return layerShell(title, `<p class="muted">${about}</p>${donateForm(false)}`);
};

LAYERS.pay = () => {
  const form = ui.donate;
  const { need, dog } = donateTarget(form);
  const amount = donateAmount(form);
  const total = amount + (form.coverFee ? fee(amount) : 0);
  const where = dog
    ? `опека, ${dog.name}`
    : need
      ? esc(need.title)
      : "общий фонд";
  const race =
    need && form.mode === "once" && need.status === "open"
      ? `<button type="button" class="btn btn-outline" id="pay-race" data-action="pay" data-outcome="race">Прошла, но сбор успели закрыть</button>`
      : "";
  return layerShell(
    "Оплата",
    `<p class="muted">${formatRub(total)}${form.mode === "monthly" ? " каждый месяц" : ""} · ${where}</p>
    <div class="paybox">
      <p>Здесь откроется окно оплаты CloudPayments. Страница приюта данных карты не видит.</p>
      <div class="paybox-methods" aria-label="Способы оплаты"><span>Карта</span><span>СБП</span><span>SberPay</span><span>T-Pay</span></div>
    </div>
    <div class="demo-box">
      <p class="t-label">Прототип: деньги не списываются</p>
      <p class="t-caption">Выберите, чем закончилась оплата, — и посмотрите, что увидит человек.</p>
      <div class="layer-foot">
        <button type="button" class="btn" id="pay-ok" data-action="pay" data-outcome="paid">Оплата прошла</button>
        ${race}
        <button type="button" class="btn btn-outline" id="pay-fail" data-action="pay" data-outcome="failed">Не прошла</button>
      </div>
    </div>
    <div><button type="button" class="btn-link" id="pay-back" data-action="pay-back">Изменить сумму</button></div>`,
  );
};

function validateDonate() {
  const form = ui.donate;
  const errors = {};
  const amount = donateAmount(form);
  if (amount == null) errors.amount = "Введите сумму цифрами, например 750.";
  else if (amount < SHELTER.minDonation)
    errors.amount = `Минимальная сумма — ${formatRub(SHELTER.minDonation)}: меньше банк не проводит.`;
  else if (amount > SHELTER.maxDonation)
    errors.amount = `Больше ${formatRub(SHELTER.maxDonation)} одним платежом не провести. Для крупной суммы напишите нам — пришлём реквизиты.`;
  if (!/^\S+@\S+\.\S{2,}$/.test(form.email.trim()))
    errors.email =
      "Проверьте адрес: после «@» нужен домен целиком, например example.ru.";
  if (!form.offer)
    errors.offer =
      "Без согласия с офертой и обработкой данных мы не можем принять пожертвование.";
  if (form.mode === "monthly" && !form.recurring)
    errors.recurring =
      "Отметьте согласие на ежемесячное списание — без него подписку не оформить.";
  form.errors = errors;
  return ["amount", "email", "offer", "recurring"].find((key) => errors[key]);
}

const DONATE_FIELD = {
  amount: "donate-custom",
  email: "donate-email",
  offer: "donate-offer",
  recurring: "donate-recurring",
};

ACTIONS.donate = (el) => {
  startDonate({
    needId: el.dataset.need,
    dogId: el.dataset.dog,
    amount: el.dataset.amount ? Number(el.dataset.amount) : undefined,
    monthly: el.dataset.monthly === "true",
  });
  tearThen(el, () => openLayer({ type: "donate" }, el));
};

ACTIONS.amount = (el) => {
  ui.donate.amount = Number(el.dataset.amount);
  ui.donate.custom = "";
  ui.donate.errors.amount = null;
  refresh(el.id);
};

ACTIONS.mode = (el) => {
  ui.donate.mode = el.dataset.mode;
  const { need } = donateTarget(ui.donate);
  const allowed =
    need && ui.donate.mode === "once"
      ? sumPresets(need, true).map((item) => item.amount)
      : ui.donate.mode === "monthly"
        ? [300, 500, 1000].map(rub)
        : [500, 1000, 2500].map(rub);
  if (!allowed.includes(ui.donate.amount))
    ui.donate.amount = allowed.includes(rub(1000)) ? rub(1000) : allowed[0];
  refresh(el.id);
};

ACTIONS["donate-submit"] = () => {
  const invalid = validateDonate();
  if (invalid) {
    refresh(DONATE_FIELD[invalid]);
    return;
  }
  openLayer({ type: "pay" }, ui.layer?.opener);
};

ACTIONS["pay-back"] = () => {
  if (currentHash.startsWith("#/donate") && ui.donate.target.type === "fund") {
    closeLayer();
    return;
  }
  openLayer({ type: "donate" }, ui.layer?.opener);
};

ACTIONS.pay = (el) => {
  const form = ui.donate;
  form.amount = donateAmount(form);
  form.custom = "";
  const donation = donate(form, el.dataset.outcome);
  closeLayer();
  go(`#/donate/status/${donation.id}`);
};

ACTIONS["retry-donate"] = (el) => {
  const donation = state.donations[el.dataset.donation];
  ui.donate = { ...donation.form, errors: {} };
  openLayer({ type: "donate" }, el);
};

function statusBody(donation) {
  const { form } = donation;
  const need = form.target.type === "need" ? needById(form.target.id) : null;
  const dog = form.target.type === "dog" ? dogById(form.target.id) : null;
  if (donation.status === "failed") {
    return `<p class="error">${icon("circle-x")}<span>Платёж не прошёл</span></p>
      <h1 class="t-section">Деньги не списаны</h1>
      <p>Банк отклонил платёж. Попробуйте другую карту или СБП — всё, что вы ввели, сохранилось.</p>
      <div class="row">
        <button type="button" class="btn" id="retry" data-action="retry-donate" data-donation="${donation.id}">Попробовать ещё раз</button>
        <a href="${need ? `#/needs/${need.id}` : "#/home"}">${need ? "Вернуться к нужде" : "На главную"}</a>
      </div>`;
  }
  const lines = [];
  if (dog) {
    lines.push(
      `Теперь вы опекаете ${dog.acc}: ${formatRub(donation.amount)} в месяц. Раз в месяц будем присылать фото и новости.`,
      "Следующее списание — 11 ноября. Отменить можно по ссылке из любого письма, без регистрации.",
    );
  } else if (need && donation.toNeed > 0 && donation.toFund === 0) {
    lines.push(
      `${formatRub(donation.toNeed)} записаны на сбор «${esc(need.title)}». Чек придёт на почту.`,
      need.status === "funded"
        ? "Вы закрыли этот сбор. Когда всё купим, пришлём отчёт с чеком и фото."
        : "Когда сбор закроется и всё купим, пришлём отчёт с чеком и фото.",
    );
  } else if (need && donation.toNeed > 0) {
    lines.push(
      `${donation.raced ? "Пока вы платили, сбор почти закрыли другие. " : ""}${formatRub(donation.toNeed)} записаны на сбор «${esc(need.title)}» и закрыли его, а ${formatRub(donation.toFund)} ушли в общий фонд приюта.`,
      "Из общего фонда оплачивают комиссии банка, недостачи и срочное. Обе строки видны в книге операций — ничего не потерялось.",
    );
  } else if (need && donation.monthly) {
    lines.push(
      `${formatRub(donation.amount)} в месяц — в общий фонд приюта: из него закрываем самое срочное, в том числе такие сборы, как «${esc(need.title)}».`,
      "Следующее списание — 11 ноября. Отменить можно по ссылке из любого письма, без регистрации.",
    );
  } else if (need) {
    lines.push(
      `Этот сбор закрылся, пока вы заполняли форму. ${formatRub(donation.amount)} записаны в общий фонд приюта — это видно в книге операций.`,
    );
  } else {
    lines.push(
      `${formatRub(donation.amount)}${donation.monthly ? " в месяц" : ""} — в общем фонде приюта. Чек придёт на почту.`,
    );
    if (donation.monthly)
      lines.push(
        "Следующее списание — 11 ноября. Отменить можно по ссылке из любого письма, без регистрации.",
      );
  }
  if (donation.feeKop)
    lines.push(
      `Комиссию банка, ${formatRub(donation.feeKop)}, вы взяли на себя — спасибо.`,
    );
  const progressBlock =
    need && !need.unit && donation.toNeed > 0
      ? `<div class="stack-sm"><b>${esc(need.title)}</b>${needProgress(need)}<span class="t-caption muted">${formatRub(need.collected)} из ${formatRub(need.goal)}</span></div>`
      : "";
  return `<p class="ok">${icon("circle-check")}<span>Платёж прошёл</span></p>
    <h1 class="t-section">Спасибо${donation.who ? `, ${esc(donation.who)}` : ""}!</h1>
    <div class="prose">${lines.map((text) => `<p>${text}</p>`).join("")}</div>
    ${progressBlock}
    <div class="stack-sm"><h2 class="t-title">Ваши строки в книге операций</h2>${ledgerList(latest(donation.rows), { numbers: true })}</div>
    <div class="row">
      <a class="btn" href="#/transparency/ledger">Открыть книгу операций</a>
      <a href="${need ? `#/needs/${need.id}` : "#/needs"}">${need ? "Вернуться к нужде" : "Посмотреть нужды"}</a>
    </div>`;
}

PAGES.donateStatus = ({ id }) => {
  const donation = state.donations[id];
  if (!donation) return null;
  const pending = `<p class="icon-line muted"><span class="spinner"></span><span>Ждём подтверждения от банка…</span></p>
    <h1 class="t-section">Проверяем платёж</h1>
    <div class="status-lines" aria-hidden="true"><div class="skeleton" style="width: 92%"></div><div class="skeleton" style="width: 78%"></div><div class="skeleton" style="width: 60%"></div></div>`;
  return {
    title: donation.revealed ? "Статус платежа" : "Проверяем платёж",
    html: `<div class="narrow stack">
      <article class="sheet sheet-body" aria-busy="${!donation.revealed}">${donation.revealed ? statusBody(donation) : pending}</article>
      ${note("mvp", "Сайт не верит возврату со страницы оплаты: он ждёт подтверждения от банка и только потом показывает «Спасибо» и пишет строку в книгу. Человеку приходит письмо с чеком, а после закрытия нужды — отчёт.")}
    </div>`,
    after: () => {
      if (donation.revealed) return;
      setTimeout(() => {
        donation.revealed = true;
        if (currentHash === `#/donate/status/${id}`)
          render({ keepScroll: true });
      }, 1400);
    },
  };
};

PAGES.fund = () => {
  if (!ui.donate || ui.donate.target.type !== "fund") startDonate({});
  const moves = latest(
    state.ledger.filter(
      (row) => !row.needId || LEDGER_GROUP[row.kind] === "move",
    ),
  ).slice(0, 5);
  return {
    title: "Общий фонд",
    ownHelp: true,
    html: `
      ${pageHead("Общий фонд", "Общий фонд — запас приюта на то, что не ждёт сбора. Сейчас в нём " + formatRub(state.stats.fund) + ".")}
      ${note("mvp", "Общий фонд — отдельный счёт в книге операций. Сюда приходят пожертвования «без адреса», переплаты, остатки закрытых сборов и ежемесячные платежи; отсюда оплачивают срочное и комиссии банка.")}
      <div class="split split-even">
        <section class="sheet sheet-body" aria-labelledby="fund-form">
          <h2 class="t-title" id="fund-form">Пожертвовать</h2>
          ${donateForm(true)}
        </section>
        <div class="stack">
          <section class="sheet sheet-body" aria-labelledby="fund-what">
            <h2 class="t-title" id="fund-what">На что он идёт</h2>
            <ul class="prose">
              <li>Срочный врач: рентген Бурана оплатили из фонда, не дожидаясь сбора.</li>
              <li>Недостачи: если покупка вышла дороже, чем собрали, разницу добавляет фонд.</li>
              <li>Комиссии банка за приём платежей — отдельной строкой раз в неделю.</li>
            </ul>
            <p class="muted t-caption">Сюда же попадает всё лишнее: переплаты, остатки закрытых сборов и деньги отменённых нужд.</p>
          </section>
          <section class="sheet sheet-body" aria-labelledby="fund-moves">
            <h2 class="t-title" id="fund-moves">Последние движения фонда</h2>
            <p class="t-caption muted">Плюс — пришло в фонд, минус — ушло из него.</p>
            ${ledgerList(moves, { fund: true })}
            <a href="#/transparency/ledger">Вся книга операций</a>
          </section>
        </div>
      </div>`,
  };
};
