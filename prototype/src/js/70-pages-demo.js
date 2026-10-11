// Presentation layer for the client: the start page, the plan by stages,
// credits, and the «В прототипе не показано» stub.

const SCREENS_SITE = [
  [
    "#/home",
    "Главная",
    "Срочная нужда, «Сегодня помогли», собаки, отчёт",
    "mvp",
  ],
  ["#/needs", "Нужды", "Список с фильтрами по категории и статусу", "mvp"],
  [
    "#/needs/buran-surgery",
    "Страница нужды",
    "Прогресс, язычки сумм, доноры, история",
    "mvp",
  ],
  [
    "#/needs/feed-november",
    "Нужда в штуках",
    "Счётчик «13 из 20 мешков»",
    "mvp",
  ],
  [
    "#/needs/feed-october",
    "Нужда с отчётом",
    "Выполнена: чек, остаток ушёл в общий фонд",
    "mvp",
  ],
  ["#/needs/roof", "Отменённая нужда", "Собранное перешло в общий фонд", "mvp"],
  [
    "#/donate",
    "Общий фонд",
    "Форма пожертвования: разово и каждый месяц",
    "mvp",
  ],
  ["#/dogs", "Собаки", "Каталог с фильтрами", "mvp"],
  [
    "#/dogs/marta",
    "Профиль собаки",
    "Характер, здоровье и «Хочу забрать»",
    "mvp",
  ],
  ["#/transparency", "Прозрачность", "Сколько пришло, на что потрачено", "mvp"],
  [
    "#/transparency/ledger",
    "Книга операций",
    "Каждая строка: поступления, расходы, переводы",
    "mvp",
  ],
  [
    "#/transparency/expenses/exp-boards",
    "Расход с чеками",
    "Недостачу покрыл общий фонд",
    "mvp",
  ],
  [
    "#/transparency/reports/2026-09",
    "Отчёт за месяц",
    "Снимок цифр и комментарий приюта",
    "p2",
  ],
  ["#/map", "Карта приюта", "Условная схема: кто где живёт, что чиним", "p2"],
  ["#/guardianship", "Опека", "Ежемесячная помощь конкретной собаке", "p2"],
  ["#/things", "Помощь вещами", "Список со ссылками на маркетплейсы", "p2"],
  [
    "#/volunteers",
    "Волонтёрство",
    "Смены с лимитом мест и разовые задачи",
    "p3",
  ],
  ["#/stories", "Они дома", "Истории пристроенных собак", "p2"],
  ["#/help", "Как помочь", "Четыре способа на одном листе", "mvp"],
  ["#/about", "О приюте", "Текст-заглушка", "mvp"],
  ["#/documents", "Документы", "Устав, реквизиты, оферта", "mvp"],
  [
    "#/contacts",
    "Контакты и «Как добраться»",
    "Каналы куратора и адрес; схема проезда — на втором этапе",
    "mvp",
  ],
];

const SCREENS_ADMIN = [
  ["#/admin/login", "Вход", "Пароль и код из приложения", "mvp"],
  ["#/admin", "Дашборд", "Что требует внимания сегодня", "mvp"],
  ["#/admin/needs", "Нужды", "Таблица со статусами и срочностью", "mvp"],
  ["#/admin/needs/new", "Новая нужда", "Срочность, цель, счёт в штуках", "mvp"],
  [
    "#/admin/needs/boards-floor",
    "Нужда в работе",
    "Расход с чеком, закрытие, остаток в фонд",
    "mvp",
  ],
  ["#/admin/dogs", "Собаки", "Карточка, статус, фото", "mvp"],
  [
    "#/admin/ledger",
    "Книга операций",
    "С номерами и служебными действиями",
    "mvp",
  ],
  ["#/admin/map", "Зоны карты", "Кто где живёт", "p2"],
  ["#/admin/more", "Остальные разделы", "Список того, что будет ещё", "mvp"],
];

function screenIndex(list) {
  return `<ul class="index">${list
    .map(
      ([href, title, text, code]) =>
        `<li><a href="${href}">${title}</a>${stage(code)}<span class="t-caption muted">${text}</span></li>`,
    )
    .join("")}</ul>`;
}

const SCENARIOS = [
  {
    title: "Помочь нужде",
    href: "#/home",
    go: "Начать с главной",
    steps: [
      "На главной оторвите язычок с суммой у «Операции на лапе для Бурана».",
      "Отметьте согласие и нажмите «Помочь».",
      "Выберите, чем закончилась оплата: прошла, сбор успели закрыть или не прошла.",
      "Найдите свою строку в книге операций.",
    ],
  },
  {
    title: "Забрать собаку",
    href: "#/dogs",
    go: "Открыть каталог",
    steps: [
      "В каталоге включите фильтры — например, «девочки» и «ладит с детьми».",
      "Откройте профиль собаки.",
      "Оторвите язычок «Хочу забрать» и посмотрите контакты куратора.",
    ],
  },
  {
    title: "Отчитаться о расходе",
    href: "#/admin/login",
    go: "Войти в админку",
    steps: [
      "Войдите: пароль и код уже подставлены.",
      "Создайте нужду кнопкой «Заполнить примером» и опубликуйте её.",
      "Добавьте пожертвования, начните закупку, внесите расход с чеком.",
      "Закройте нужду и откройте её строки в публичной книге.",
    ],
  },
];

PAGES.hub = () => ({
  title: "Что внутри",
  bare: true,
  html: `
    <section class="sheet" aria-labelledby="hub-title">
      <div class="hub-lead">
        <div class="stack-sm">
          <div><span class="demo-tag">прототип · демо-данные</span></div>
          <h1 class="t-hero no-hyphens" id="hub-title">Сайт приюта «Островок Надежды»</h1>
          <p class="t-lead">Это макет, по которому можно ходить: так сайт будет выглядеть и работать. Собаки, суммы, имена и адреса выдуманы, деньги не списываются.</p>
          <p>Сайт делает три вещи. Собирает деньги на конкретные нужды: корм, лекарства, ремонт. Показывает, куда ушёл каждый рубль, вплоть до чека. И помогает собакам найти дом.</p>
          <div class="row"><a class="btn btn-lg" href="#/home">Открыть сайт</a><a class="btn btn-outline btn-lg" href="#/admin/login">Открыть админку</a><a href="#/plan">Что будет и когда</a></div>
        </div>
        <div class="stack-sm">
          <h2 class="t-title">Как смотреть</h2>
          <ul class="prose t-caption">
            <li>Включите <b>«Пояснения»</b> в синей полосе сверху. На каждом экране появятся синие заметки: что здесь будет работать и на каком этапе.</li>
            <li>Кнопка с луной переключает светлую и тёмную тему: она в шапке сайта, а на телефоне — в меню.</li>
            <li>Всё, что вы сделаете, — пожертвование, новая нужда, расход — живёт до обновления страницы. Обновите её, чтобы начать заново.</li>
            <li>Кнопки, которых в макете нет, честно говорят: «В прототипе не показано» — и объясняют, что там будет.</li>
          </ul>
          <ul class="stage-legend"><li>${stage("mvp")}к запуску</li><li>${stage("p2")}второй этап</li><li>${stage("p3")}третий этап</li></ul>
        </div>
      </div>
    </section>
    <section class="section" aria-labelledby="scen-title">
      ${sectionHead("Три сценария", "", "", "scen-title")}
      <div class="grid-3">${SCENARIOS.map(
        (item) => `<article class="sheet sheet-body">
          <h3 class="t-title">${item.title}</h3>
          <ol class="steps-list">${item.steps.map((text) => `<li>${text}</li>`).join("")}</ol>
          <div><a class="btn btn-outline" href="${item.href}">${item.go}</a></div>
        </article>`,
      ).join("")}</div>
    </section>
    <section class="section" aria-labelledby="all-title">
      ${sectionHead("Все экраны", "", "", "all-title")}
      <div class="split split-even">
        <div class="sheet sheet-body"><h3 class="t-title">Сайт</h3>${screenIndex(SCREENS_SITE)}</div>
        <div class="stack">
          <div class="sheet sheet-body"><h3 class="t-title">Админка</h3>${screenIndex(SCREENS_ADMIN)}</div>
          <div class="sheet sheet-body"><h3 class="t-title">О проекте</h3>
            <ul class="index">
              <li><a href="#/plan">Что будет и когда</a><span></span><span class="t-caption muted">Этапы, сроки и что нужно от приюта</span></li>
              <li><a href="#/credits">Демо-данные и фото</a><span></span><span class="t-caption muted">Что выдумано и откуда снимки</span></li>
            </ul>
          </div>
        </div>
      </div>
    </section>`,
});

const PLAN = [
  {
    code: null,
    tag: "идёт сейчас",
    title: "Фундамент",
    time: "1–1,5 недели",
    gets: [
      "Внешний вид сайта: листы-объявления, язычки, две темы.",
      "Вход сотрудников с кодом из приложения.",
      "Книга операций — основа всей отчётности.",
      "Этот прототип.",
    ],
    needs: [
      "Подтвердить юрлицо и расчётный счёт.",
      "Подать заявку на приём платежей.",
      "Название, логотип, фото и тексты о первых собаках и нуждах.",
      "Домен и хостинг в России.",
    ],
  },
  {
    code: "mvp",
    title: "Запуск: прозрачный сбор",
    time: "4–6 недель",
    gets: [
      "Собаки: каталог, профили, «Хочу забрать».",
      "Нужды со срочностью и отчётом.",
      "Пожертвования картой и через СБП: разово и каждый месяц в общий фонд.",
      "Книга операций, чеки, страница «Прозрачность».",
      "«О приюте», «Документы», «Контакты», новости.",
      "Админка для сотрудников.",
    ],
    needs: [
      "Один-два человека, которые ведут админку: 15–20 минут в день.",
      "Фото собак — с телефона подойдут.",
      "Чеки и фото результата по каждой покупке.",
    ],
  },
  {
    code: "p2",
    title: "Доноры и опека",
    time: "около 4 недель",
    gets: [
      "Личный кабинет донора: история, справка для налогового вычета.",
      "Опека над конкретной собакой.",
      "Помощь вещами через маркетплейсы.",
      "Месячные отчёты и письма о результате.",
      "Истории «Они дома».",
      "Карта приюта и схема проезда.",
    ],
    needs: [
      "Фото и план территории для карты.",
      "Сколько стоит содержание каждой собаки в месяц.",
      "Адрес пункта выдачи для посылок.",
    ],
  },
  {
    code: "p3",
    title: "Сообщество",
    time: "4–6 недель",
    gets: [
      "Анкета волонтёра, смены с лимитом мест, напоминания.",
      "Доска разовых задач: отвезти в клинику, передержка.",
      "Проверка доступности для людей с нарушениями зрения и работы сайта под нагрузкой.",
    ],
    needs: ["Координатор волонтёров."],
  },
];

const IDEAS = [
  "Telegram-бот и автопостинг в канал и VK",
  "Сборы «на мой день рождения»",
  "Удвоение пожертвований спонсором",
  "Подарочный сертификат на опеку",
  "QR-постеры и оплата по счёту для компаний",
  "Тест «Какая собака вам подходит»",
  "Письмо «Ваш вклад за год»",
];

const QUESTIONS = [
  "Понятно ли с первого экрана, как помочь?",
  "Нравится ли стиль — листы на доске и язычки?",
  "Каких нужд и разделов не хватает?",
  "Кто в приюте будет вести админку и сколько у него времени?",
  "Какими каналами вы на самом деле пользуетесь: Telegram, WhatsApp, MAX, телефон?",
  "Есть ли логотип, фото и тексты?",
  "Что важнее запустить первым?",
];

PAGES.plan = () => ({
  title: "Что будет и когда",
  bare: true,
  html: `
    <nav class="crumbs" aria-label="Вы здесь"><a href="#/">Что внутри</a></nav>
    ${pageHead("Что будет и когда", "Сайт запускаем по частям: сначала главное — сбор и отчёты, потом всё остальное. Сроки — оценка: они зависят и от того, как быстро приют пришлёт материалы.")}
    <ol class="stack">${PLAN.map(
      (item) => `<li class="sheet sheet-body">
        <div class="row">${item.code ? stage(item.code) : `<span class="demo-tag">${item.tag}</span>`}<span class="when">${item.time}</span></div>
        <h2 class="t-section">${item.title}</h2>
        <div class="grid-2">
          <div class="stack-sm"><h3 class="t-label">Что появится</h3><ul class="prose">${item.gets.map((text) => `<li>${text}</li>`).join("")}</ul></div>
          <div class="stack-sm"><h3 class="t-label">Что нужно от приюта</h3><ul class="prose">${item.needs.map((text) => `<li>${text}</li>`).join("")}</ul></div>
        </div>
      </li>`,
    ).join("")}</ol>
    <div class="split split-even">
      <section class="sheet sheet-body" aria-labelledby="ideas-title"><h2 class="t-title" id="ideas-title">Идеи на потом</h2>
        <p class="t-caption muted">Без срока. Возьмём те, что окажутся нужнее.</p>
        <ul class="prose">${IDEAS.map((text) => `<li>${text}</li>`).join("")}</ul></section>
      <section class="sheet sheet-body" aria-labelledby="ask-title"><h2 class="t-title" id="ask-title">О чём хотим спросить</h2>
        <ul class="prose">${QUESTIONS.map((text) => `<li>${text}</li>`).join("")}</ul></section>
    </div>`,
});

PAGES.credits = () => ({
  title: "Демо-данные и фото",
  bare: true,
  html: `
    <nav class="crumbs" aria-label="Вы здесь"><a href="#/">Что внутри</a></nav>
    ${pageHead("Демо-данные и фото", "Всё, что вы видите в прототипе, выдумано: собаки, нужды, суммы, имена, адрес, реквизиты и контакты. Настоящие появятся перед запуском.")}
    <section class="sheet sheet-body" aria-labelledby="photos-title">
      <h2 class="t-title" id="photos-title">Откуда фото</h2>
      <p>Снимки собак — заглушки с Wikimedia Commons: лицензии разрешают их использовать, для части нужно указать автора. Фото обрезаны и уменьшены. Настоящие снимки пришлёт приют.</p>
      <div class="table-wrap"><table class="dt">
        <thead><tr><th scope="col">В прототипе</th><th scope="col">Файл на Wikimedia Commons</th><th scope="col">Автор</th><th scope="col">Лицензия</th></tr></thead>
        <tbody>${PHOTO_CREDITS.map(
          ([, name, file, author, license, url]) =>
            `<tr><td><b>${name}</b></td><td><a href="${url}" target="_blank" rel="noopener noreferrer">${esc(file)}</a></td><td>${author}</td><td>${license}</td></tr>`,
        ).join("")}</tbody>
      </table></div>
    </section>
    <section class="sheet sheet-body" aria-labelledby="other-title">
      <h2 class="t-title" id="other-title">Остальное</h2>
      <ul class="prose">
        <li>Чеки и фото результата — нарисованные заглушки.</li>
        <li>Схема приюта и схема проезда условные.</li>
        <li>Шрифты Sofia Sans Extra Condensed, Sofia Sans, Literata, Martian Mono и знак ₽ из Fira Sans — открытая лицензия SIL OFL 1.1.</li>
        <li>Иконки — Lucide, лицензия ISC.</li>
      </ul>
    </section>`,
});

PAGES.notFound = () => ({
  title: "Страница не найдена",
  bare: true,
  html: `<div class="narrow"><div class="sheet empty">
    <h1 class="t-section">Такой страницы в прототипе нет</h1>
    <p>Возможно, ссылка устарела. Все экраны собраны на стартовой странице.</p>
    <a class="btn" href="#/">Что внутри</a>
  </div></div>`,
});

const STAGE_WHEN = {
  mvp: "Появится к запуску сайта.",
  p2: "Появится на втором этапе.",
  p3: "Появится на третьем этапе.",
};

LAYERS.stub = () =>
  layerShell(
    "В прототипе не показано",
    `<p>${esc(ui.layer.text)}</p>
    <p class="icon-line">${stage(ui.layer.stage)}<span class="t-caption muted">${STAGE_WHEN[ui.layer.stage]}</span></p>
    <div class="layer-foot">
      <button type="button" class="btn" id="stub-ok" data-action="close-layer">Понятно</button>
      <a class="btn btn-outline" href="#/plan">Что будет и когда</a>
    </div>`,
  );

ACTIONS.stub = (el) => {
  openLayer(
    { type: "stub", text: el.dataset.stub, stage: el.dataset.stage },
    el,
  );
};

const SITE_NAV = [
  ["#/needs", "Нужды", ["needs", "need", "fund", "donateStatus"]],
  ["#/dogs", "Собаки", ["dogs", "dog"]],
  ["#/transparency", "Отчёты", ["transparency", "ledger", "expense", "report"]],
  ["#/map", "Карта", ["map"]],
  ["#/help", "Как помочь", ["help", "guardianship", "things", "volunteers"]],
];

LAYERS.menu = () => {
  const dark = isDark();
  return layerShell(
    "Меню",
    `<nav class="menu-nav" aria-label="Основная">
      <a href="#/home">Главная</a>
      ${SITE_NAV.map(([href, title]) => `<a href="${href}">${title}</a>`).join("")}
      <a href="#/about">О приюте</a><a href="#/contacts">Контакты</a>
    </nav>
    <button type="button" class="btn btn-outline btn-block" id="menu-theme" data-action="theme">${icon(dark ? "sun" : "moon")}${dark ? "Светлая тема" : "Тёмная тема"}</button>`,
    { side: true },
  );
};

ACTIONS.menu = (el) => openLayer({ type: "menu" }, el);
