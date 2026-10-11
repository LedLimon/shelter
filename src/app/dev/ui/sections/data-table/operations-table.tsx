"use client";

import {
  DataTable,
  dataTableColumns,
} from "@/components/admin/data-table/data-table";
import {
  DataTableFilter,
  DataTableSearch,
} from "@/components/admin/data-table/table-controls";
import type { TableQuery } from "@/components/admin/data-table/table-query";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { OPERATION_KINDS, type Operation } from "./operations";

const TIME_ZONE = "Europe/Moscow";
const KIND_LABELS = Object.fromEntries(
  OPERATION_KINDS.map(({ value, label }) => [value, label]),
);

const column = dataTableColumns<Operation>();

const columns = column.columns([
  column.accessor("date", {
    header: "Дата",
    cell: ({ getValue }) => {
      const date = new Date(getValue());
      return (
        <span className="font-mono text-mono-sm whitespace-nowrap text-toner-muted">
          {formatDate(date, { timeZone: TIME_ZONE, year: "always" })},{" "}
          {formatTime(date, { timeZone: TIME_ZONE })}
        </span>
      );
    },
  }),
  column.accessor("title", {
    header: "Операция",
    cell: ({ getValue, row }) => (
      <>
        <span className="block">{getValue()}</span>
        <span className="block text-toner-muted">{row.original.need}</span>
      </>
    ),
    meta: { className: "min-w-56 whitespace-normal" },
  }),
  column.accessor("kind", {
    header: "Тип",
    cell: ({ getValue }) => KIND_LABELS[getValue()],
  }),
  column.accessor("amountKop", {
    header: "Сумма",
    cell: ({ getValue, row }) => (
      <span
        className={
          row.original.kind === "income"
            ? "font-display text-button whitespace-nowrap text-pen"
            : "font-display text-button whitespace-nowrap"
        }
      >
        {row.original.kind === "expense" ? "−" : ""}
        {formatRub(getValue())}
      </span>
    ),
    meta: { align: "end" },
  }),
]);

/** A list page's table: columns here, rows and the query from the server. */
export function OperationsTable({
  rows,
  total,
  query,
}: {
  rows: Operation[];
  total: number;
  query: TableQuery<"kind">;
}) {
  return (
    <DataTable
      caption="Операции"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      getRowId={(row) => row.id}
      toolbar={
        <>
          <DataTableSearch
            label="Поиск"
            placeholder="Корм, забор, общий фонд"
          />
          <DataTableFilter
            name="kind"
            label="Тип"
            anyLabel="Все типы"
            options={OPERATION_KINDS}
          />
        </>
      }
      empty={{ title: "Операций пока нет" }}
    />
  );
}

/** The same table before the first record: what it says and offers. */
export function EmptyOperationsTable({ query }: { query: TableQuery<"kind"> }) {
  return (
    <DataTable
      caption="Расходы"
      columns={columns}
      rows={[]}
      total={0}
      query={query}
      getRowId={(row) => row.id}
      empty={{
        title: "Расходов пока нет",
        description:
          "Внесите первый расход с чеком — он появится здесь и в публичной книге операций.",
        action: <Button size="sm">Добавить расход</Button>,
      }}
    />
  );
}
