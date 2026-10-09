"use client";

import { useMemo, useSyncExternalStore } from "react";

import { COLOR_TOKENS, type ColorToken } from "@/lib/design-tokens";

function subscribe(onChange: () => void) {
  // The theme switches by toggling the `dark` class on <html>.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  const style = getComputedStyle(document.documentElement);
  return COLOR_TOKENS.map((token) =>
    style.getPropertyValue(`--color-${token}`).trim(),
  ).join(" ");
}

/** Current values of the colour tokens as the browser resolves them. */
export function useTokenColors(): Record<ColorToken, string> | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return useMemo(() => {
    if (!snapshot) return null;
    const values = snapshot.split(" ");
    return Object.fromEntries(
      COLOR_TOKENS.map((token, index) => [token, values[index] ?? ""]),
    ) as Record<ColorToken, string>;
  }, [snapshot]);
}
