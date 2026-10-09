"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useId, useSyncExternalStore } from "react";

import {
  readThemePreference,
  subscribeToThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Системная", icon: Monitor },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
];

/** System / light / dark. The header placement is DS-5's. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const name = useId();
  // The choice lives in localStorage, so nothing is checked until hydration.
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    readThemePreference,
    () => null,
  );

  return (
    <fieldset className={className}>
      <legend className="mb-1.5 font-mono text-mono-sm text-muted-foreground">
        Тема
      </legend>
      <div className="flex border-line border-toner bg-paper">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 font-display text-label text-toner uppercase select-none",
              "not-first:border-l-line not-first:border-toner",
              "hover:bg-board has-checked:bg-toner has-checked:text-paper",
              "has-focus-visible:z-10 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={preference === value}
              onChange={() => writeThemePreference(value)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4 shrink-0" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
