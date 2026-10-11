"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useTransition } from "react";
import type { TableQuery } from "./table-query";

export type TableUrl = {
  /** A navigation started by the table is still loading. */
  pending: boolean;
  /**
   * Changes the table's parameters in the URL and loads the page again; the
   * other parameters stay. `replace` is for typing (no history entry per
   * letter); `scroll: false` keeps the list in place after a sort or filter.
   */
  navigate: (
    change: (params: URLSearchParams) => void,
    options?: { replace?: boolean; scroll?: boolean },
  ) => void;
};

/** The table's link to the URL: one transition for every control of a table. */
export function useTableUrl(): TableUrl {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback<TableUrl["navigate"]>(
    (change, { replace = false, scroll = true } = {}) => {
      const params = new URLSearchParams(searchParams);
      change(params);
      const search = params.toString();
      const href = search ? `${pathname}?${search}` : pathname;
      startTransition(() => {
        if (replace) router.replace(href, { scroll });
        else router.push(href, { scroll });
      });
    },
    [pathname, router, searchParams],
  );

  return { pending, navigate };
}

export const TableNavigationContext = createContext<
  (TableUrl & { query: TableQuery<string> }) | null
>(null);

/** For the controls in a DataTable's toolbar. */
export function useTableNavigation() {
  const context = use(TableNavigationContext);
  if (!context) {
    throw new Error("Table controls go into the `toolbar` of a <DataTable>.");
  }
  return context;
}
