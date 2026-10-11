// The state of a server-driven table lives in the URL, so a list can be
// bookmarked, shared and walked with Back: `?q=корм&status=DRAFT&sort=-date&page=2`.
// The page parses it here, queries the database and hands rows and the parsed
// query to <DataTable>, which only changes the URL. Pure: both sides import it.

export type TableSort = { id: string; desc: boolean };

export type TableQueryConfig<Filter extends string = never> = {
  /** Ids of the columns the server can order by. */
  sortable: readonly string[];
  /** The order when the URL names none, or one the server doesn't know. */
  defaultSort: TableSort;
  /** Rows on a page; DEFAULT_PAGE_SIZE if omitted. */
  pageSize?: number;
  /** Filters with a fixed set of values: `?status=DRAFT`. */
  filters?: Record<Filter, readonly string[]>;
};

export type TableQuery<Filter extends string = never> = {
  /** From 1. May point past the last page: pageOf() brings it back. */
  page: number;
  pageSize: number;
  sort: TableSort;
  /** Trimmed text of the search box; empty for none. */
  search: string;
  /** The chosen value of every filter; null for any. */
  filters: Record<Filter, string | null>;
  /** Copied from the config, so the table knows which headers are buttons. */
  sortable: readonly string[];
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_SEARCH_LENGTH = 100;

/** Names of the table's own URL parameters; filters must not reuse them. */
export const TABLE_PARAMS = {
  page: "page",
  sort: "sort",
  search: "q",
} as const;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Reads the table state from a page's `searchParams`. Whatever the URL holds,
 * the result is safe to query with: an unknown column or filter value falls
 * back to the default, a broken page number to 1.
 */
export function parseTableQuery<Filter extends string = never>(
  searchParams: SearchParams,
  config: TableQueryConfig<Filter>,
): TableQuery<Filter> {
  const sortValue = first(searchParams[TABLE_PARAMS.sort]);
  const desc = sortValue.startsWith("-");
  const id = desc ? sortValue.slice(1) : sortValue;

  const pageValue = first(searchParams[TABLE_PARAMS.page]);
  const page = /^\d{1,9}$/.test(pageValue) ? Number(pageValue) : 1;

  const allowed: Record<string, readonly string[]> = config.filters ?? {};
  const filters = Object.fromEntries(
    Object.entries(allowed).map(([name, values]) => {
      const value = first(searchParams[name]);
      return [name, values.includes(value) ? value : null];
    }),
  ) as Record<Filter, string | null>;

  return {
    page: Math.max(1, page),
    pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
    sort: config.sortable.includes(id) ? { id, desc } : config.defaultSort,
    search: first(searchParams[TABLE_PARAMS.search])
      .trim()
      .slice(0, MAX_SEARCH_LENGTH),
    filters,
    sortable: config.sortable,
  };
}

/** The `sort` parameter of an order: `date`, or `-date` for descending. */
export function sortParam({ id, desc }: TableSort): string {
  return desc ? `-${id}` : id;
}

export type TablePage = {
  /** The requested page, or the last one if the request went past it. */
  page: number;
  pageCount: number;
  /** For the database query: `skip` and `take` of Prisma. */
  skip: number;
  take: number;
  /** Positions of the first and the last row on the page, from 1; 0 if empty. */
  from: number;
  to: number;
};

/** Where the query's page sits among `total` rows. Count first, then fetch. */
export function pageOf(
  { page, pageSize }: Pick<TableQuery, "page" | "pageSize">,
  total: number,
): TablePage {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const skip = (current - 1) * pageSize;
  return {
    page: current,
    pageCount,
    skip,
    take: pageSize,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
  };
}

/** Whether the search box or any filter narrows the list. */
export function isFiltered({
  search,
  filters,
}: Pick<TableQuery<string>, "search" | "filters">): boolean {
  return search !== "" || Object.values(filters).some(Boolean);
}
