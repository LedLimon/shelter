import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom theme keys from src/app/globals.css. Without them tailwind-merge takes
// e.g. `text-label` for a colour and drops it next to `text-toner`.
// utils.test.ts checks that these lists match globals.css.
export const MERGE_THEME = {
  text: [
    "hero",
    "section",
    "title",
    "name",
    "sum",
    "sum-lg",
    "button",
    "label",
    "body",
    "caption",
    "mono",
    "mono-sm",
  ],
  font: ["display", "body", "mono", "heading"],
  "font-weight": ["ultra"],
  spacing: ["gutter", "grid", "sheet", "card", "section", "tab", "cta"],
  radius: ["sheet", "stamp"],
  shadow: ["sheet"],
} as const;

const borderWidths = ["line"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...MERGE_THEME.text],
      font: [...MERGE_THEME.font],
      "font-weight": [...MERGE_THEME["font-weight"]],
      spacing: [...MERGE_THEME.spacing],
      radius: [...MERGE_THEME.radius],
      shadow: [...MERGE_THEME.shadow],
    },
    classGroups: {
      "border-w": [{ border: borderWidths }],
      "border-w-x": [{ "border-x": borderWidths }],
      "border-w-y": [{ "border-y": borderWidths }],
      "border-w-s": [{ "border-s": borderWidths }],
      "border-w-e": [{ "border-e": borderWidths }],
      "border-w-t": [{ "border-t": borderWidths }],
      "border-w-r": [{ "border-r": borderWidths }],
      "border-w-b": [{ "border-b": borderWidths }],
      "border-w-l": [{ "border-l": borderWidths }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
