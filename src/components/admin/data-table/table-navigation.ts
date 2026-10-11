"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from "react";
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
  const current = useSearchParams().toString();
  const [pending, startTransition] = useTransition();
  // Where the table is heading while a navigation loads. The next change
  // builds on it: built on the URL still on screen, a sort clicked during a
  // slow search would drop the search.
  const heading = useRef<string | null>(null);
  useEffect(() => {
    // Settled (or the user went Back): the URL is the truth again.
    if (!pending) heading.current = null;
  }, [pending, current]);

  const navigate = useCallback<TableUrl["navigate"]>(
    (change, { replace = false, scroll = true } = {}) => {
      const params = new URLSearchParams(heading.current ?? current);
      change(params);
      const search = params.toString();
      heading.current = search;
      const href = search ? `${pathname}?${search}` : pathname;
      startTransition(() => {
        if (replace) router.replace(href, { scroll });
        else router.push(href, { scroll });
      });
    },
    [pathname, router, current],
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
