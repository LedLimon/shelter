// In-memory model of the shelter. Every screen is drawn from it, so a donation
// or an expense made in the prototype shows up everywhere: progress, feeds,
// the public ledger. A reload brings the demo data back.

const state = {
  needs: NEEDS,
  dogs: DOGS,
  expenses: EXPENSES,
  ledger: LEDGER,
  stats: STATS,
  things: THINGS,
  shifts: SHIFTS,
  tasks: TASKS,
  zones: ZONES,
  seq: 147,
  donations: {},
  adoptClicks: { telegram: 9, whatsapp: 3, max: 0, phone: 2 },
  staff: null,
};

const needById = (id) => state.needs.find((need) => need.id === id);
const dogById = (id) => state.dogs.find((dog) => dog.id === id);
const zoneById = (id) => state.zones.find((zone) => zone.id === id);
const expenseById = (id) => state.expenses.find((item) => item.id === id);

const remaining = (need) => Math.max(0, need.goal - need.collected);
const progress = (need) =>
  need.goal ? clamp(need.collected / need.goal, 0, 1) : 0;
/** Money a need still holds: collected plus what the fund added, minus spent. */
const balance = (need) => need.collected + (need.covered ?? 0) - need.spent;
const isPublic = (need) => need.status !== "draft";

/** Needs for the board: most urgent first, then the closest to the goal. */
function activeNeeds() {
  return state.needs
    .filter((need) => need.status === "open")
    .sort(
      (a, b) =>
        URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency) ||
        progress(b) - progress(a),
    );
}

function nextOpId() {
  state.seq += 1;
  return `2610-${String(state.seq).padStart(4, "0")}`;
}

/** Appends a ledger entry: the ledger is append-only, as in the app. */
function post(entry) {
  const id = nextOpId();
  const row = {
    id,
    when: new Date(NOW.getTime() + state.seq * 1000),
    isNew: true,
    ...entry,
  };
  state.ledger.push(row);
  return row;
}

function addEvent(need, title, text, by) {
  need.timeline.push({
    when: new Date(NOW.getTime() + state.seq * 1000),
    title,
    text,
    by,
  });
}

function markFunded(need, text) {
  if (need.status !== "open") return;
  need.status = "funded";
  addEvent(need, "Собрано", text);
}

/** Money comes in for a need; anything above the goal goes to the general fund. */
function receive(need, amount, who, extra = {}) {
  const toNeed = Math.min(amount, remaining(need));
  const toFund = amount - toNeed;
  const rows = [];
  if (toNeed > 0) {
    rows.push(
      post({
        kind: "donation",
        who,
        needId: need.id,
        amount: toNeed,
        ...extra,
      }),
    );
    need.collected += toNeed;
  }
  if (toFund > 0) {
    rows.push(post({ kind: "overpay", needId: need.id, amount: toFund }));
    state.stats.fund += toFund;
  }
  need.donors += 1;
  state.stats.monthIn += amount;
  state.stats.monthDonors += 1;
  if (remaining(need) === 0)
    markFunded(
      need,
      toFund > 0
        ? `Последнее пожертвование закрыло сбор; ${formatRub(toFund)} сверх цели ушли в общий фонд.`
        : undefined,
    );
  return { toNeed, toFund, rows };
}

function fee(amount) {
  return Math.round(amount * SHELTER.feeShare);
}

/**
 * Stand-in for a payment. outcome: "paid", "race" (the collection was almost
 * closed by someone else while the donor was paying) or "failed".
 */
function donate(form, outcome) {
  const id = `d${Object.keys(state.donations).length + 1}`;
  const who = form.anon || !form.name.trim() ? null : form.name.trim();
  const donation = {
    id,
    status: outcome === "failed" ? "failed" : "paid",
    target: form.target,
    amount: form.amount,
    monthly: form.mode === "monthly",
    who,
    feeKop: form.coverFee ? fee(form.amount) : 0,
    toNeed: 0,
    toFund: 0,
    rows: [],
    form: { ...form },
  };
  state.donations[id] = donation;
  if (donation.status === "failed") return donation;

  const need = form.target.type === "need" ? needById(form.target.id) : null;
  if (need && !donation.monthly && need.status === "open") {
    if (outcome === "race") {
      const left = Math.max(
        rub(50),
        Math.round((form.amount * 0.35) / 5000) * 5000,
      );
      const other = remaining(need) - Math.min(left, remaining(need));
      if (other > 0) receive(need, other, null);
      donation.raced = true;
    }
    const result = receive(need, form.amount, who);
    Object.assign(donation, result);
  } else if (form.target.type === "dog") {
    const dog = dogById(form.target.id);
    donation.rows.push(
      post({
        kind: "guardian",
        who,
        dogId: dog.id,
        needId: null,
        amount: form.amount,
        monthly: true,
      }),
    );
    dog.guardianKop = Math.min(dog.monthlyCost, dog.guardianKop + form.amount);
    dog.guardians += 1;
    donation.toFund = form.amount;
    state.stats.fund += form.amount;
    state.stats.monthIn += form.amount;
    state.stats.monthDonors += 1;
  } else {
    donation.rows.push(
      post({
        kind: "donation",
        who,
        needId: null,
        amount: form.amount,
        monthly: donation.monthly,
      }),
    );
    donation.toFund = form.amount;
    donation.redirected = Boolean(need);
    state.stats.fund += form.amount;
    state.stats.monthIn += form.amount;
    state.stats.monthDonors += 1;
  }
  if (donation.feeKop) {
    donation.rows.push(
      post({
        kind: "donation",
        who,
        needId: null,
        amount: donation.feeKop,
        text: "на комиссию банка",
      }),
    );
    state.stats.fund += donation.feeKop;
    state.stats.monthIn += donation.feeKop;
  }
  return donation;
}

// ——— Admin actions. In the app each of them checks permissions and is audited.

function slugId(prefix) {
  return `${prefix}-${state.seq + 1}-${state.needs.length + state.expenses.length}`;
}

function createNeed(form) {
  const goal = form.unit
    ? parseRubInput(form.unitPrice) * Number(form.unitCount)
    : parseRubInput(form.goal);
  const need = {
    id: slugId("need"),
    title: form.title.trim(),
    category: form.category,
    urgency: form.urgency,
    status: "draft",
    goal,
    collected: 0,
    spent: 0,
    deadline: form.deadline ? new Date(`${form.deadline}T12:00`) : null,
    dogId: form.dogId || null,
    zoneId: form.zoneId || null,
    photo: form.dogId ? dogById(form.dogId).photo : null,
    focus: form.dogId ? dogById(form.dogId).focus : undefined,
    lead: form.text.trim(),
    body: [],
    breakdown: [],
    donors: 0,
    isNew: true,
    timeline: [],
  };
  if (form.unit)
    need.unit = {
      price: parseRubInput(form.unitPrice),
      count: Number(form.unitCount),
      forms: ["штука", "штуки", "штук"],
      paid: ["штука оплачена", "штуки оплачено", "штук оплачено"],
      one: "за штуку",
    };
  state.needs.push(need);
  addEvent(need, "Черновик создан", undefined, "Ирина, админ");
  return need;
}

function publishNeed(need) {
  need.status = "open";
  addEvent(need, "Сбор открыт", undefined, "Ирина, админ");
}

const DEMO_DONORS = ["Наталья", null, "Павел", "Светлана", null, "Тимур"];

/** Prototype helper: a few donations arrive, as if a day has passed. */
function simulateDonations(need, fill) {
  if (need.status !== "open") return;
  if (fill) {
    receive(need, remaining(need), "Алексей");
    return;
  }
  [0.22, 0.14, 0.27].forEach((share, index) => {
    const amount = Math.min(
      remaining(need),
      Math.max(rub(100), Math.round((need.goal * share) / 10000) * 10000),
    );
    if (amount > 0)
      receive(
        need,
        amount,
        DEMO_DONORS[(need.donors + index) % DEMO_DONORS.length],
      );
  });
}

function closeCollection(need) {
  markFunded(need, "Сбор закрыт досрочно: остальное купим из общего фонда.");
  const last = need.timeline[need.timeline.length - 1];
  last.by = "Ирина, админ";
}

function startWork(need) {
  need.status = "working";
  addEvent(need, "Закупаем", undefined, "Ирина, админ");
}

/** Posts an expense. A shortfall is covered by the fund first, as a separate entry. */
function addExpense(need, form) {
  const amount = parseRubInput(form.amount);
  const expense = {
    id: slugId("exp"),
    title: form.title.trim(),
    amount,
    supplier: form.supplier.trim(),
    date: new Date(NOW.getTime() + state.seq * 1000),
    needId: need.id,
    docs: [],
    text: "",
    isNew: true,
  };
  if (form.receipt)
    expense.docs.push({
      kind: "receipt",
      label: "Кассовый чек",
      total: amount,
      lines: [[form.title.trim().slice(0, 28), amount]],
    });
  if (form.result)
    expense.docs.push({
      kind: "photo",
      label: "Фото результата (демо-заглушка)",
    });
  state.expenses.push(expense);

  const shortage = Math.max(0, amount - balance(need));
  if (shortage > 0) {
    post({ kind: "from_fund", needId: need.id, amount: shortage });
    need.covered = (need.covered ?? 0) + shortage;
    state.stats.fund -= shortage;
  }
  post({ kind: "expense", expenseId: expense.id, needId: need.id, amount });
  need.spent += amount;
  need.expenseIds = [...(need.expenseIds ?? []), expense.id];
  state.stats.monthOut += amount;
  state.stats.spentByCategory[need.category] =
    (state.stats.spentByCategory[need.category] ?? 0) + amount;
  addEvent(
    need,
    `Расход: ${formatRub(amount)}`,
    shortage > 0
      ? `${expense.title}. Не хватило ${formatRub(shortage)} — добавил общий фонд.`
      : expense.title,
    "Ирина, админ",
  );
  return { expense, shortage };
}

/** Closes a need: the report is published, the remainder goes to the fund. */
function completeNeed(need, reportText) {
  const rest = Math.max(0, balance(need));
  if (rest > 0) {
    post({ kind: "to_fund", needId: need.id, amount: rest });
    state.stats.fund += rest;
  }
  need.status = "done";
  need.report =
    reportText.trim() ||
    (rest > 0
      ? `Всё купили. Остаток ${formatRub(rest)} перешёл в общий фонд.`
      : "Всё купили, чеки и фото — ниже.");
  addEvent(
    need,
    "Выполнено",
    rest > 0
      ? `Остаток ${formatRub(rest)} → общий фонд.`
      : "Отчёт опубликован.",
    "Ирина, админ",
  );
  return rest;
}

function cancelNeed(need, reason) {
  const rest = Math.max(0, balance(need));
  if (rest > 0) {
    post({ kind: "cancel", needId: need.id, amount: rest });
    state.stats.fund += rest;
  }
  need.status = "cancelled";
  need.report =
    reason.trim() || "Сбор отменён. Собранное перешло в общий фонд приюта.";
  addEvent(
    need,
    "Отменено",
    rest > 0 ? `${formatRub(rest)} → общий фонд.` : undefined,
    "Ирина, админ",
  );
  return rest;
}
