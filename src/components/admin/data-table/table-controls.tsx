"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableNavigation } from "./table-navigation";
import { MAX_SEARCH_LENGTH, TABLE_PARAMS } from "./table-query";

const SEARCH_DELAY_MS = 300;

/**
 * The search box of a DataTable: writes `?q=` a moment after typing stops, or
 * at once on Enter. What it searches is up to the page's query.
 */
export function DataTableSearch({
  label,
  placeholder,
}: {
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  const { query, navigate } = useTableNavigation();
  const [value, setValue] = useState(query.search);
  // What this box last put into the URL, and the URL's value last rendered.
  const [sent, setSent] = useState(query.search);
  const [seen, setSeen] = useState(query.search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL changed. If the box didn't do it (Back, «Сбросить фильтры»),
  // show the URL's text; if it did, keep what has been typed since.
  if (seen !== query.search) {
    setSeen(query.search);
    if (query.search !== sent) {
      setValue(query.search);
      setSent(query.search);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(text: string) {
    clearTimeout(timer.current);
    const next = text.trim();
    if (next === sent) return;
    setSent(next);
    navigate(
      (params) => {
        if (next) params.set(TABLE_PARAMS.search, next);
        else params.delete(TABLE_PARAMS.search);
        params.delete(TABLE_PARAMS.page);
      },
      { replace: true, scroll: false },
    );
  }

  return (
    <form
      role="search"
      className="grid min-w-0 flex-1 basis-56 gap-2 sm:max-w-xs"
      onSubmit={(event) => {
        event.preventDefault();
        search(value);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-toner-muted"
        />
        <Input
          id={id}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={MAX_SEARCH_LENGTH}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            const text = event.target.value;
            setValue(text);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => search(text), SEARCH_DELAY_MS);
          }}
          className="h-9 pl-9"
        />
      </div>
    </form>
  );
}

/**
 * A filter of a DataTable with a fixed set of values: writes `?<name>=`.
 * `name` and the values are those of the page's TableQueryConfig.
 */
export function DataTableFilter({
  name,
  label,
  options,
  anyLabel = "Все",
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  /** The option that switches the filter off: «Все статусы». */
  anyLabel?: string;
}) {
  const id = useId();
  const { query, navigate } = useTableNavigation();
  const items = [{ value: null, label: anyLabel }, ...options];

  return (
    <div className="grid min-w-40 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={query.filters[name] ?? null}
        onValueChange={(value: string | null) =>
          navigate(
            (params) => {
              if (value) params.set(name, value);
              else params.delete(name);
              params.delete(TABLE_PARAMS.page);
            },
            { scroll: false },
          )
        }
      >
        <SelectTrigger id={id} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value ?? ""} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
