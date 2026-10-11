"use client";

import {
  createColumnHelper,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isFiltered,
  pageOf,
  sortParam,
  TABLE_PARAMS,
  type TableQuery,
} from "./table-query";
import { TableNavigationContext, useTableUrl } from "./table-navigation";

/** Per-column presentation: `meta` of a column definition. */
export type DataTableColumnMeta = {
  /** `end` for numbers and sums: right-aligned, tabular figures. */
  align?: "start" | "end";
  /** Classes of the column's header and cells: a width, `whitespace-nowrap`. */
  className?: string;
};

// Only its type matters: it becomes the type of every column's `meta`.
const columnMeta: DataTableColumnMeta = {};

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnMeta,
});

export type DataTableColumn<Row extends RowData> = ColumnDef<
  typeof dataTableFeatures,
  Row,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- every column has its own value type
  any
>;

/** Column helper for a DataTable: `const column = dataTableColumns<Need>()`. */
export function dataTableColumns<Row extends RowData>() {
  return createColumnHelper<typeof dataTableFeatures, Row>();
}

export type DataTableEmpty = {
  title: string;
  /** What to do about it, in a sentence. */
  description?: ReactNode;
  /** The way out: a button or a link. */
  action?: ReactNode;
};

/**
 * A table whose sorting, filters and pages are done by the server
 * (docs/architecture.md#админка): the page reads the state from the URL with
 * parseTableQuery(), queries the database and passes one page of rows here;
 * the table changes the URL, and the page renders again.
 *
 * Define `columns` outside the component, with dataTableColumns(): TanStack
 * Table needs them stable. A header is a sort button if the column's id is in
 * the query's `sortable` list.
 */
export function DataTable<Row extends RowData>({
  caption,
  columns,
  rows,
  total,
  query,
  getRowId,
  toolbar,
  empty,
}: {
  /** Names the table for assistive tech: «Нужды». */
  caption: string;
  columns: DataTableColumn<Row>[];
  /** The rows of the current page, already sorted and filtered. */
  rows: Row[];
  /** How many rows match the filters on all pages. */
  total: number;
  query: TableQuery<string>;
  getRowId: (row: Row) => string;
  /** <DataTableSearch> and <DataTableFilter> controls. */
  toolbar?: ReactNode;
  /** Shown when there is nothing to list at all (no filters set). */
  empty: DataTableEmpty;
}) {
  const url = useTableUrl();
  const { page, pageCount, from, to } = pageOf(query, total);
  const sorting = useMemo(
    () => [{ id: query.sort.id, desc: query.sort.desc }],
    [query.sort.id, query.sort.desc],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId,
    manualSorting: true,
    enableMultiSort: false,
    // The server always has an order: a third click must not clear it.
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const [next] = functionalUpdate(updater, sorting);
      if (!next) return;
      url.navigate(
        (params) => {
          params.set(TABLE_PARAMS.sort, sortParam(next));
          params.delete(TABLE_PARAMS.page);
        },
        { scroll: false },
      );
    },
  });

  function goToPage(target: number) {
    url.navigate((params) => {
      if (target === 1) params.delete(TABLE_PARAMS.page);
      else params.set(TABLE_PARAMS.page, String(target));
    });
  }

  function resetFilters() {
    url.navigate(
      (params) => {
        params.delete(TABLE_PARAMS.search);
        params.delete(TABLE_PARAMS.page);
        for (const name of Object.keys(query.filters)) params.delete(name);
      },
      { scroll: false },
    );
  }

  const filtered = isFiltered(query);

  return (
    <TableNavigationContext value={{ ...url, query }}>
      <div className="grid min-w-0 gap-4">
        {/* Filters stay while a search finds nothing; an empty list has none. */}
        {toolbar && (total > 0 || filtered) && (
          <div className="flex flex-wrap items-end gap-3">{toolbar}</div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            {...(filtered
              ? {
                  title: "Ничего не нашлось",
                  description:
                    "Измените поиск или фильтры — или сбросьте их, чтобы увидеть весь список.",
                  action: (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  ),
                }
              : empty)}
          />
        ) : (
          <>
            <div
              role="region"
              aria-label={caption}
              // Scrolls sideways on a phone: reachable from the keyboard.
              tabIndex={0}
              className="relative overflow-x-auto"
            >
              <table
                aria-busy={url.pending || undefined}
                className="w-full min-w-xl border-collapse text-caption"
              >
                <caption className="sr-only">{caption}</caption>
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => {
                        const { column } = header;
                        const meta = column.columnDef.meta;
                        const sorted = column.getIsSorted();
                        const canSort =
                          column.getCanSort() &&
                          query.sortable.includes(column.id);
                        const label = header.isPlaceholder ? null : (
                          <table.FlexRender header={header} />
                        );
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={
                              sorted === "asc"
                                ? "ascending"
                                : sorted === "desc"
                                  ? "descending"
                                  : undefined
                            }
                            className={cn(
                              "border-b-line border-toner px-2.5 py-2 text-left align-bottom font-display text-label whitespace-nowrap uppercase",
                              meta?.align === "end" && "text-right",
                              meta?.className,
                            )}
                          >
                            {canSort ? (
                              <button
                                type="button"
                                onClick={column.getToggleSortingHandler()}
                                className={cn(
                                  // Not on the baseline: reversed, the icon would set it.
                                  "inline-flex items-center gap-1 align-bottom uppercase hover:underline",
                                  meta?.align === "end" && "flex-row-reverse",
                                )}
                              >
                                {label}
                                <SortMark sorted={sorted} />
                              </button>
                            ) : (
                              label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody
                  className={cn(
                    "transition-opacity delay-100 duration-150",
                    url.pending && "opacity-60",
                  )}
                >
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-perforation/45 last:border-b-0 hover:bg-board/35"
                    >
                      {row.getAllCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-2.5 py-2 align-top",
                              meta?.align === "end" &&
                                "text-right tabular-nums",
                              meta?.className,
                            )}
                          >
                            <table.FlexRender cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              aria-label={`${caption}: страницы`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            >
              <p
                role="status"
                className="font-mono text-mono-sm text-toner-muted tabular-nums"
              >
                Показаны {from}–{to} из {total}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <ChevronLeft aria-hidden />
                    Назад
                  </Button>
                  <span className="font-mono text-mono-sm tabular-nums">
                    {page} из {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === pageCount}
                    onClick={() => goToPage(page + 1)}
                  >
                    Вперёд
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              )}
            </nav>
          </>
        )}
      </div>
    </TableNavigationContext>
  );
}

/** The order of a sortable column; the active one is marked with the pen. */
function SortMark({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") {
    return <ArrowUp aria-hidden className="size-3.5 shrink-0 text-pen" />;
  }
  if (sorted === "desc") {
    return <ArrowDown aria-hidden className="size-3.5 shrink-0 text-pen" />;
  }
  return (
    <ArrowUpDown aria-hidden className="size-3.5 shrink-0 text-toner-muted" />
  );
}

function EmptyState({ title, description, action }: DataTableEmpty) {
  return (
    <div className="grid justify-items-start gap-3 py-4">
      <div className="grid gap-1.5">
        <p className="font-display text-button">{title}</p>
        {description && (
          <p className="max-w-prose text-toner-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
