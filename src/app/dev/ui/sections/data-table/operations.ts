import type { TableQueryConfig } from "@/components/admin/data-table/table-query";

// Demo rows for the DataTable specimen: invented operations, generated the
// same way on every render. Nothing here comes from the database.

export const OPERATION_KINDS = [
  { value: "income", label: "Поступление" },
  { value: "expense", label: "Расход" },
  { value: "transfer", label: "Перевод" },
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number]["value"];

export type Operation = {
  id: string;
  /** ISO time: the page passes rows to a client component. */
  date: string;
  kind: OperationKind;
  title: string;
  need: string;
  amountKop: number;
};

export const OPERATIONS_TABLE = {
  sortable: ["date", "title", "amountKop"],
  defaultSort: { id: "date", desc: true },
  pageSize: 10,
  filters: { kind: OPERATION_KINDS.map(({ value }) => value) },
} satisfies TableQueryConfig<"kind">;

const TEMPLATES: [OperationKind, title: string, need: string][] = [
  ["income", "Пожертвование на нужду", "Корм на октябрь"],
  ["expense", "Сухой корм, 12 мешков", "Корм на октябрь"],
  ["income", "Ежемесячная опека", "Общий фонд"],
  ["expense", "Доски 50 × 150 для настила", "Настил в двух вольерах"],
  ["transfer", "Остаток сбора в общий фонд", "Одеяла на зиму"],
  ["income", "Перевод на счёт приюта", "Общий фонд"],
  ["expense", "Противопаразитарная обработка", "Лекарства для Бурана"],
  ["income", "Пожертвование на нужду", "Ремонт забора"],
  ["expense", "Работа плотника", "Ремонт забора"],
  ["transfer", "Покрытие недостачи из общего фонда", "Настил в двух вольерах"],
  ["income", "Наличные из ящика на выставке", "Общий фонд"],
];

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 9, 8, 9, 30);

export const OPERATIONS: Operation[] = Array.from(
  { length: 57 },
  (_, index) => {
    const [kind, title, need] = TEMPLATES[index % TEMPLATES.length]!;
    return {
      id: `op-${String(index + 1).padStart(3, "0")}`,
      date: new Date(FIRST_DAY - index * DAY_MS * 0.7).toISOString(),
      kind,
      title,
      need,
      // 300 ₽ … 31 500 ₽ in uneven steps, so sorting by amount is visible.
      amountKop: (300 + ((index * 7919) % 313) * 100) * 100,
    };
  },
);

type Query = {
  sort: { id: string; desc: boolean };
  search: string;
  filters: { kind: string | null };
};

/** What a section's database query does: filter, then order. */
export function findOperations({ sort, search, filters }: Query): Operation[] {
  const text = search.toLowerCase();
  const found = OPERATIONS.filter(
    (operation) =>
      (!filters.kind || operation.kind === filters.kind) &&
      (!text ||
        operation.title.toLowerCase().includes(text) ||
        operation.need.toLowerCase().includes(text)),
  );
  const direction = sort.desc ? -1 : 1;
  return found.sort((a, b) => {
    const order =
      sort.id === "amountKop"
        ? a.amountKop - b.amountKop
        : sort.id === "title"
          ? a.title.localeCompare(b.title, "ru")
          : a.date.localeCompare(b.date);
    // The id breaks ties, so pages don't shuffle equal rows.
    return (order || a.id.localeCompare(b.id)) * direction;
  });
}
