// The shell around the pages: prototype bar, header and footer, hash router,
// layers, theme, and one set of delegated event handlers.

const ROUTES = [
  ["", "hub"],
  ["home", "home"],
  ["needs", "needs"],
  ["needs/:id", "need"],
  ["donate", "fund"],
  ["donate/status/:id", "donateStatus"],
  ["dogs", "dogs"],
  ["dogs/:id", "dog"],
  ["transparency", "transparency"],
  ["transparency/ledger", "ledger"],
  ["transparency/expenses/:id", "expense"],
  ["transparency/reports/:id", "report"],
  ["map", "map"],
  ["help", "help"],
  ["guardianship", "guardianship"],
  ["things", "things"],
  ["volunteers", "volunteers"],
  ["stories", "stories"],
  ["about", "about"],
  ["documents", "documents"],
  ["contacts", "contacts"],
  ["plan", "plan"],
  ["credits", "credits"],
  ["admin/login", "adminLogin"],
  ["admin", "admin"],
  ["admin/needs", "adminNeeds"],
  ["admin/needs/new", "adminNeedNew"],
  ["admin/needs/:id", "adminNeed"],
  ["admin/needs/:id/expense", "adminExpense"],
  ["admin/dogs", "adminDogs"],
  ["admin/dogs/:id", "adminDog"],
  ["admin/ledger", "adminLedger"],
  ["admin/map", "adminMap"],
  ["admin/more", "adminMore"],
];

/** «#/needs/buran?show=all» → { name, params, query, path }. */
function resolve(hash) {
  const [rawPath = "", rawQuery = ""] = hash.replace(/^#\/?/, "").split("?");
  const path = rawPath.replace(/\/+$/, "");
  const parts = path ? path.split("/") : [];
  const query = Object.fromEntries(new URLSearchParams(rawQuery));
  for (const [pattern, name] of ROUTES) {
    const want = pattern ? pattern.split("/") : [];
    if (want.length !== parts.length) continue;
    const params = {};
    const fits = want.every((piece, index) => {
      if (piece.startsWith(":")) {
        try {
          params[piece.slice(1)] = decodeURIComponent(parts[index]);
        } catch {
          return false; // a broken %-sequence typed by hand: no such page
        }
        return true;
      }
      return piece === parts[index];
    });
    if (fits) return { name, params, query, path };
  }
  return null;
}

// ——— Shell.

function protobar() {
  return `<div class="protobar"><div class="wrap protobar-in">
    <a href="#/" id="proto-home">${icon("list")}Что внутри</a>
    <span class="protobar-demo"><span class="protobar-long">прототип · демо-данные · деньги не списываются</span><span class="protobar-short">прототип</span></span>
    <label class="switch" for="notes-switch"><span>Пояснения</span>
      <input type="checkbox" role="switch" id="notes-switch" data-change="notes"${ui.notes ? " checked" : ""} /></label>
  </div></div>`;
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function siteHeader(page, route) {
  const nav = SITE_NAV.map(
    ([href, title, names]) =>
      `<a href="${href}"${names.includes(route?.name) ? ' aria-current="page"' : ""}>${title}</a>`,
  ).join("");
  const dark = isDark();
  return `<header class="site-header"><div class="wrap site-header-in">
    <a class="mark" href="#/home">Мыс доброй надежды</a>
    <nav class="site-nav" aria-label="Основная">${nav}</nav>
    <div class="site-tools">
      <button type="button" class="btn btn-outline btn-icon header-theme" id="theme-toggle" data-action="theme" aria-label="${dark ? "Включить светлую тему" : "Включить тёмную тему"}">${icon(dark ? "sun" : "moon")}</button>
      ${page.ownHelp ? "" : '<a class="btn btn-help header-help" href="#/donate">Помочь</a>'}
      <button type="button" class="btn btn-outline btn-icon site-menu" id="menu-toggle" data-action="menu" aria-haspopup="dialog" aria-label="Меню">${icon("menu")}</button>
    </div>
  </div></header>`;
}

function siteFooter() {
  return `<footer class="site-footer surface-footer"><div class="wrap">
    <a class="mark" href="#/home">Мыс доброй надежды</a>
    <div class="footer-cols">
      <p class="muted">${SHELTER.legal} · ИНН 0000000000 · реквизиты и устав — в разделе «Документы». Демо-данные.</p>
      <ul><li><a href="#/about">О приюте</a></li><li><a href="#/documents">Документы</a></li><li><a href="#/contacts">Контакты</a></li><li><a href="#/stories">Они дома</a></li></ul>
      <ul>
        <li><button type="button" class="btn-link" ${stub("Здесь откроется публичная оферта.")}>Оферта</button></li>
        <li><button type="button" class="btn-link" ${stub("Здесь откроется политика обработки персональных данных.")}>Политика ПДн</button></li>
        <li><button type="button" class="btn-link" ${stub("Ссылки на страницы приюта в VK и Telegram.")}>VK · Telegram</button></li>
        <li><a href="#/admin/login">Вход для сотрудников</a></li>
      </ul>
    </div>
  </div></footer>`;
}

const ADMIN_NAV = [
  ["#/admin", "Дашборд", "layout-dashboard", ["admin"]],
  [
    "#/admin/needs",
    "Нужды",
    "hand-coins",
    ["adminNeeds", "adminNeedNew", "adminNeed", "adminExpense"],
  ],
  ["#/admin/dogs", "Собаки", "dog", ["adminDogs", "adminDog"]],
  ["#/admin/ledger", "Книга операций", "book-open-text", ["adminLedger"]],
  ["#/admin/map", "Карта", "map", ["adminMap"]],
  ["#/admin/more", "Ещё", "ellipsis", ["adminMore"]],
];

function adminChrome(page, route) {
  const dark = isDark();
  const nav = ADMIN_NAV.map(
    ([href, title, name, names]) =>
      `<a href="${href}"${names.includes(route?.name) ? ' aria-current="page"' : ""}>${icon(name)}${title}</a>`,
  ).join("");
  return `<header class="admin-bar admin"><div class="wrap admin-bar-in">
      <a class="admin-mark" href="#/admin">Мыс доброй надежды · Админка</a>
      <div class="row">
        <span>${STAFF.name} <span class="muted">· ${STAFF.role}</span></span>
        <button type="button" class="btn btn-outline btn-icon btn-sm" id="theme-toggle" data-action="theme" aria-label="${dark ? "Включить светлую тему" : "Включить тёмную тему"}">${icon(dark ? "sun" : "moon")}</button>
        <a class="btn btn-outline btn-sm" href="#/home">На сайт</a>
        <button type="button" class="btn btn-outline btn-sm" id="logout" data-action="logout">Выйти</button>
      </div>
    </div></header>
    <div class="wrap admin admin-shell">
      <nav class="admin-nav" aria-label="Разделы админки">${nav}</nav>
      <main class="admin-main" id="main" tabindex="-1">${page.html}</main>
    </div>`;
}

function shell(page, route) {
  if (page.admin) return `${protobar()}${adminChrome(page, route)}`;
  const main = `<div class="wrap"><main id="main" tabindex="-1">${page.html}</main></div>`;
  if (page.bare) return `${protobar()}${main}`;
  return `${protobar()}${siteHeader(page, route)}${main}${siteFooter()}${
    page.sticky
      ? `<div class="sticky-cta" id="sticky-bar">${page.sticky}</div>`
      : ""
  }`;
}

// ——— Rendering.

const app = document.getElementById("app");
const layerRoot = document.getElementById("layer-root");
const toastRoot = document.getElementById("toast-root");
let currentHash = location.hash || "#/";
let renderedHash = null;
let lastPath = null;
let ctaObserver = null;
let toastTimer = null;
let toastAt = 0;

function focusById(id, reveal) {
  const el = id ? document.getElementById(id) : null;
  if (!el) return false;
  el.focus({ preventScroll: true });
  if (reveal) el.scrollIntoView({ block: "nearest" });
  return true;
}

/** Shows the sticky action on a phone once the main button is off screen. */
function watchMainCta() {
  ctaObserver?.disconnect();
  const bar = document.getElementById("sticky-bar");
  const main = document.querySelector("#main-cta, [data-main-cta]");
  document.documentElement.classList.toggle("has-sticky", Boolean(bar));
  if (!bar || !main || !("IntersectionObserver" in window)) return;
  ctaObserver = new IntersectionObserver(([entry]) => {
    bar.classList.toggle("is-on", !entry.isIntersecting);
  });
  ctaObserver.observe(main);
}

function render(options = {}) {
  const route = resolve(currentHash);
  let page = route ? PAGES[route.name](route.params, route.query) : null;
  if (page?.redirect) {
    if (page.redirect === "#/admin/login") ui.afterLogin = currentHash;
    go(page.redirect, true);
    return;
  }
  if (!page || page.html == null) page = { ...PAGES.notFound(), admin: false };
  const samePath = route?.path === lastPath;
  const keepScroll = options.keepScroll ?? samePath;
  const scrollY = window.scrollY;
  const focusId =
    options.focus ??
    ui.focusAfter ??
    (keepScroll ? document.activeElement?.id : null);
  ui.focusAfter = null;
  lastPath = route?.path ?? null;

  // The hatching is «drawn» once per visit, not on every redraw of the page.
  renderedHash = currentHash;
  app.classList.toggle("is-refresh", keepScroll);
  app.innerHTML = shell(page, route);
  document.title = `${page.title} — Мыс доброй надежды`;
  layerRoot.classList.toggle("admin", Boolean(page.admin));
  typograf(app);
  if (keepScroll) {
    window.scrollTo(0, scrollY);
    // The control that had focus may be gone (a need was closed): fall back to the page.
    if (!focusById(focusId, Boolean(options.focus)) && options.focus)
      document.getElementById("main")?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, 0);
    if (!focusById(focusId))
      document.getElementById("main")?.focus({ preventScroll: true });
  }
  watchMainCta();
  page.after?.();
}

function renderLayer(focusId) {
  if (!ui.layer) {
    layerRoot.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }
  const scrolled = layerRoot.querySelector(".layer-panel")?.scrollTop ?? 0;
  layerRoot.innerHTML = LAYERS[ui.layer.type]();
  document.body.style.overflow = "hidden";
  typograf(layerRoot);
  const panel = layerRoot.querySelector(".layer-panel");
  if (focusId) panel.scrollTop = scrolled;
  if (!focusById(focusId, true)) panel.focus({ preventScroll: true });
}

function openLayer(layer, opener) {
  const previous = ui.layer;
  ui.layer = {
    ...layer,
    opener:
      (typeof opener === "string" ? opener : opener?.id) ||
      previous?.opener ||
      null,
    openerEl:
      typeof opener === "object" && opener
        ? opener
        : (previous?.openerEl ?? null),
  };
  renderLayer();
}

/** Closes the layer and returns focus to the control that opened it. */
function closeLayer(rerender) {
  if (!ui.layer) return;
  const { opener, openerEl } = ui.layer;
  ui.layer = null;
  renderLayer();
  for (const el of document.querySelectorAll(".is-torn"))
    el.classList.remove("is-torn");
  if (rerender) {
    render({ keepScroll: true, focus: opener });
    return;
  }
  const target = openerEl?.isConnected
    ? openerEl
    : document.getElementById(opener);
  target?.focus?.({ preventScroll: true });
}

/** Redraws the open layer, or the page, keeping scroll and focus. */
function refresh(focusId) {
  const id = focusId ?? document.activeElement?.id;
  if (ui.layer) renderLayer(id);
  else render({ keepScroll: true, focus: id });
}

/**
 * Opens a route. The page is drawn from `currentHash` straight away; the
 * address bar is updated on a best-effort basis, because an embedded viewer
 * may not let a framed page change its own address.
 */
function go(hash, replace) {
  if (ui.layer) {
    ui.layer = null;
    renderLayer();
  }
  // A message about the previous screen should not hang over the next one.
  if (performance.now() - toastAt > 100) toastRoot.replaceChildren();
  currentHash = hash || "#/";
  try {
    if (replace) history.replaceState(null, "", currentHash);
    else if (location.hash !== currentHash) location.hash = currentHash;
  } catch {
    // The address stays as it was; the prototype still works.
  }
  render();
}

const NBSP_AFTER_SHORT =
  /(^|[\s(«„"])(в|во|на|и|с|со|к|ко|у|о|об|от|из|за|до|по|не|ни|а|но|да|для|при|над|под|про|без|что|как)\s+/giu;

/**
 * Russian typography for everything on screen: thousands, a number and its
 * unit, short prepositions and the dash stay on one line with their neighbour.
 */
function typograf(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue;
    if (text.trim() && !node.parentElement.closest("textarea, script, style")) {
      const glue = (match, before, word) => `${before}${word}${NBSP}`;
      const next = text
        .replace(/(\d)\s+(?=\d{3}(?!\d))/g, `$1${NBSP}`)
        .replace(/(\d)\s+(?=[₽%№а-яёa-z])/giu, `$1${NBSP}`)
        .replace(/\s+—/g, `${NBSP}—`)
        .replace(NBSP_AFTER_SHORT, glue)
        .replace(NBSP_AFTER_SHORT, glue);
      if (next !== text) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

/** A tab «tears off» before its sheet opens; no motion if the viewer asked for none. */
function tearThen(el, open) {
  const torn = el.classList.contains("tab") || el.classList.contains("tabs-v");
  if (!torn || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    open();
    return;
  }
  el.classList.add("is-torn");
  setTimeout(open, 230);
}

function toast(text) {
  const item = document.createElement("div");
  item.className = "toast";
  item.innerHTML = `${icon("circle-check")}<span>${esc(text)}</span>`;
  typograf(item);
  toastAt = performance.now();
  toastRoot.replaceChildren(item);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => item.remove(), 5000);
}

// ——— Theme and notes. The choice is remembered on this device only.

function remember(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage: the prototype works without it.
  }
}

function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function systemTheme() {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark" || stamped === "light") return stamped;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme() {
  document.documentElement.classList.toggle(
    "dark",
    (ui.theme ?? systemTheme()) === "dark",
  );
}

function syncThemeButton() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  const dark = isDark();
  button.setAttribute(
    "aria-label",
    dark ? "Включить светлую тему" : "Включить тёмную тему",
  );
  button.innerHTML = icon(dark ? "sun" : "moon");
}

ACTIONS.theme = (el) => {
  ui.theme = isDark() ? "light" : "dark";
  remember("mys-theme", ui.theme);
  applyTheme();
  syncThemeButton();
  if (ui.layer?.type === "menu") refresh(el.id);
};

ACTIONS.notes = (el) => {
  ui.notes = el.checked;
  remember("mys-notes", ui.notes ? "on" : null);
  document.documentElement.classList.toggle("notes-on", ui.notes);
  if (!ui.notes) return;
  // Say how many notes this screen has: the first one may be below the fold.
  const count = app.querySelectorAll(".note").length;
  toast(
    count
      ? `Пояснения включены: на этом экране ${formatCount(count, ["синяя заметка", "синие заметки", "синих заметок"])}.`
      : "Пояснения включены. На этом экране заметок нет.",
  );
};

ACTIONS["close-layer"] = () => closeLayer();

ACTIONS["ledger-need"] = (el) => {
  const route = resolve(currentHash);
  const parts = [];
  if (route.query.type) parts.push(`type=${route.query.type}`);
  if (el.value !== "all") parts.push(`need=${el.value}`);
  ui.focusAfter = el.id;
  go(`#/transparency/ledger${parts.length ? `?${parts.join("&")}` : ""}`);
};

// ——— Events: one listener of each kind for the whole prototype.

function updateLive() {
  for (const el of document.querySelectorAll("[data-live]")) {
    const html = LIVE[el.dataset.live]?.();
    if (html == null || el.dataset.shown === html) continue;
    el.dataset.shown = html;
    el.innerHTML = html;
    typograf(el);
  }
}

/** The visitor started fixing a field: its error goes away at once. */
function clearError(el) {
  if (!el.hasAttribute("aria-invalid")) return;
  el.removeAttribute("aria-invalid");
  document.getElementById(`${el.id}-error`)?.remove();
  const [root, key] = el.dataset.model.split(".");
  const errors = ui[root]?.errors;
  if (errors) {
    delete errors[key];
    if (key === "custom") delete errors.amount;
  }
  if (root === "volunteer") ui.volunteer.error = null;
}

// A layer closes on a click that both starts and ends on the dimmed board:
// selecting text in a field and letting go outside the sheet must not close it.
let pressedOnBackdrop = false;
document.addEventListener("pointerdown", (event) => {
  pressedOnBackdrop = Boolean(event.target.matches?.("[data-backdrop]"));
});

document.addEventListener("click", (event) => {
  if (event.target.matches?.("[data-backdrop]")) {
    if (pressedOnBackdrop) closeLayer();
    return;
  }
  // Links between screens are handled here, not by the browser: inside an
  // embedded viewer a «#/…» link may resolve against the viewer's address.
  const link = event.target.closest?.('a[href^="#"]');
  if (
    link &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    go(link.getAttribute("href"));
    return;
  }
  const el = event.target.closest?.("[data-action]");
  if (!el || el.disabled) return;
  const handler = ACTIONS[el.dataset.action];
  if (!handler) return;
  event.preventDefault();
  handler(el, event);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-submit]");
  if (!form) return;
  event.preventDefault();
  ACTIONS[form.dataset.submit]?.(form);
});

function onInput(event) {
  const el = event.target;
  if (!el.matches?.("[data-model]")) return;
  setPath(el.dataset.model, el.type === "checkbox" ? el.checked : el.value);
  clearError(el);
  if (el.hasAttribute("data-rerender")) refresh(el.id);
  else updateLive();
}

document.addEventListener("input", onInput);

document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.matches?.("[data-change]")) ACTIONS[el.dataset.change]?.(el);
  else if (el.matches?.("select[data-model]")) onInput(event);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.layer) {
    event.preventDefault();
    closeLayer();
    return;
  }
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches?.('g[role="button"]')
  ) {
    event.preventDefault();
    ACTIONS[event.target.dataset.action]?.(event.target, event);
    return;
  }
  if (event.key !== "Tab" || !ui.layer) return;
  const panel = layerRoot.querySelector(".layer-panel");
  const items = [
    ...panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]',
    ),
  ].filter((el) => el.getClientRects().length);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!panel.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Back and forward buttons, or an address typed by hand.
window.addEventListener("hashchange", () => {
  const hash = location.hash || "#/";
  if (hash !== renderedHash) go(hash, true);
});

/**
 * Self-check for dead ends: every route renders, every link leads to a page,
 * every control has a handler. Run in the console: protoCheck().
 */
function protoCheck() {
  const problems = [];
  const staff = state.staff;
  state.staff = STAFF;
  const samples = {
    need: state.needs.map((need) => need.id),
    dog: state.dogs.map((dog) => dog.id),
    expense: state.expenses.map((item) => item.id),
    report: [REPORT_SEPTEMBER.id],
    adminNeed: state.needs.map((need) => need.id),
    adminExpense: ["boards-floor"],
    adminDog: state.dogs.map((dog) => dog.id),
    donateStatus: Object.keys(state.donations),
  };
  const inspect = (where, html) => {
    for (const [, href] of html.matchAll(/href="(#[^"]*)"/g)) {
      const route = resolve(href.replaceAll("&amp;", "&"));
      const page = route && PAGES[route.name](route.params, route.query);
      if (!page || page.html == null)
        problems.push(`${where}: мёртвая ссылка ${href}`);
    }
    for (const [, name] of html.matchAll(
      /data-(?:action|submit|change)="([^"]+)"/g,
    ))
      if (!ACTIONS[name]) problems.push(`${where}: нет обработчика «${name}»`);
    for (const [, name] of html.matchAll(/data-live="([^"]+)"/g))
      if (!LIVE[name]) problems.push(`${where}: нет фрагмента «${name}»`);
  };
  let pages = 0;
  for (const [pattern, name] of ROUTES) {
    const ids = pattern.includes(":") ? (samples[name] ?? []) : [null];
    for (const id of ids) {
      const hash = `#/${pattern.replace(":id", id)}`;
      try {
        const page = PAGES[name]({ id }, {});
        if (!page || page.html == null)
          problems.push(`${hash}: страница не открылась`);
        else {
          inspect(hash, shell(page, resolve(hash)));
          pages += 1;
        }
      } catch (error) {
        problems.push(`${hash}: ошибка ${error.message}`);
      }
    }
  }
  inspect("меню", LAYERS.menu());
  state.staff = staff;
  return { pages, problems };
}

window.protoCheck = protoCheck;

// ——— Start.

document.documentElement.lang = "ru";
ui.theme = recall("mys-theme");
ui.notes = recall("mys-notes") === "on";
document.documentElement.classList.toggle("notes-on", ui.notes);
applyTheme();
new MutationObserver(() => {
  applyTheme();
  syncThemeButton();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    applyTheme();
    syncThemeButton();
  });
render();
