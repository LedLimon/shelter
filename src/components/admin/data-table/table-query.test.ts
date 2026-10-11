import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  isFiltered,
  MAX_SEARCH_LENGTH,
  pageOf,
  parseTableQuery,
  sortParam,
  type TableQueryConfig,
} from "./table-query";

const config = {
  sortable: ["date", "amountKop"],
  defaultSort: { id: "date", desc: true },
  filters: { status: ["DRAFT", "COLLECTING"], urgency: ["HIGH", "LOW"] },
} satisfies TableQueryConfig<"status" | "urgency">;

describe("parseTableQuery", () => {
  it("falls back to the defaults for an empty URL", () => {
    expect(parseTableQuery({}, config)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: { id: "date", desc: true },
      search: "",
      filters: { status: null, urgency: null },
      sortable: ["date", "amountKop"],
    });
  });

  it("reads the sort, its direction, the page, the search and the filters", () => {
    const query = parseTableQuery(
      { sort: "amountKop", page: "3", q: "  корм ", status: "DRAFT" },
      config,
    );

    expect(query).toMatchObject({
      page: 3,
      sort: { id: "amountKop", desc: false },
      search: "корм",
      filters: { status: "DRAFT", urgency: null },
    });
    expect(parseTableQuery({ sort: "-amountKop" }, config).sort).toEqual({
      id: "amountKop",
      desc: true,
    });
  });

  it("never orders by a column the server didn't offer", () => {
    for (const sort of ["passwordHash", "-email", "", "-", "date;drop"]) {
      expect(parseTableQuery({ sort }, config).sort).toEqual(
        config.defaultSort,
      );
    }
  });

  it("ignores a filter value outside the allowed set", () => {
    const query = parseTableQuery(
      { status: "DELETED", urgency: "high", other: "x" },
      config,
    );

    expect(query.filters).toEqual({ status: null, urgency: null });
  });

  it.each(["0", "-2", "1.5", "abc", "1e3", "", "99999999999999999999"])(
    "treats the page %j as the first one",
    (page) => {
      expect(parseTableQuery({ page }, config).page).toBe(1);
    },
  );

  it("takes the first of repeated parameters", () => {
    const query = parseTableQuery(
      { page: ["2", "9"], q: ["корм", "забор"] },
      config,
    );

    expect(query).toMatchObject({ page: 2, search: "корм" });
  });

  it("cuts a search text that is too long", () => {
    const query = parseTableQuery({ q: "я".repeat(500) }, config);

    expect(query.search).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("uses the configured page size and works without filters", () => {
    const query = parseTableQuery(
      { status: "DRAFT" },
      { sortable: ["date"], defaultSort: config.defaultSort, pageSize: 10 },
    );

    expect(query).toMatchObject({ pageSize: 10, filters: {} });
  });
});

describe("sortParam", () => {
  it("round-trips through parseTableQuery", () => {
    for (const sort of [
      { id: "amountKop", desc: false },
      { id: "amountKop", desc: true },
    ]) {
      expect(parseTableQuery({ sort: sortParam(sort) }, config).sort).toEqual(
        sort,
      );
    }
  });
});

describe("pageOf", () => {
  it("places a page among the rows", () => {
    expect(pageOf({ page: 2, pageSize: 25 }, 132)).toEqual({
      page: 2,
      pageCount: 6,
      skip: 25,
      take: 25,
      from: 26,
      to: 50,
    });
  });

  it("ends the last page at the total", () => {
    expect(pageOf({ page: 6, pageSize: 25 }, 132)).toMatchObject({
      from: 126,
      to: 132,
    });
  });

  it("brings a page past the end back to the last one", () => {
    expect(pageOf({ page: 40, pageSize: 25 }, 132)).toMatchObject({
      page: 6,
      skip: 125,
    });
  });

  it("is one empty page when there are no rows", () => {
    expect(pageOf({ page: 3, pageSize: 25 }, 0)).toEqual({
      page: 1,
      pageCount: 1,
      skip: 0,
      take: 25,
      from: 0,
      to: 0,
    });
  });

  it("doesn't add an empty page when the rows fill the last one", () => {
    expect(pageOf({ page: 1, pageSize: 25 }, 50).pageCount).toBe(2);
  });
});

describe("isFiltered", () => {
  it("tells a narrowed list from the whole one", () => {
    expect(isFiltered({ search: "", filters: { status: null } })).toBe(false);
    expect(isFiltered({ search: "корм", filters: {} })).toBe(true);
    expect(isFiltered({ search: "", filters: { status: "DRAFT" } })).toBe(true);
  });
});
