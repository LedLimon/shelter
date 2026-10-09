"use client";

import { Check, X } from "lucide-react";

import { contrastRatio, formatRatio } from "@/lib/contrast";
import {
  CONTRAST_PAIRS,
  KNOWN_LOW_CONTRAST_PAIRS,
  type ColorToken,
} from "@/lib/design-tokens";

import { useTokenColors } from "./use-token-colors";

type Row = {
  label: string;
  foreground: ColorToken;
  background: ColorToken;
  min?: number;
  note?: string;
};

const ROWS: Row[] = [...CONTRAST_PAIRS, ...KNOWN_LOW_CONTRAST_PAIRS];

function ratioOf(colors: Record<ColorToken, string>, row: Row) {
  try {
    return contrastRatio(colors[row.foreground], colors[row.background]);
  } catch {
    return null;
  }
}

/** Contrast of every documented pair, computed from the current theme. */
export function ContrastTable() {
  const colors = useTokenColors();

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-caption">
        <thead className="font-mono text-mono-sm text-toner-muted">
          <tr className="border-b border-toner">
            <th scope="col" className="py-2 pr-3 font-normal">
              Пара
            </th>
            <th scope="col" className="py-2 pr-3 font-normal">
              Образец
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              Сейчас
            </th>
            <th scope="col" className="py-2 font-normal">
              Порог
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const ratio = colors ? ratioOf(colors, row) : null;
            const passes =
              row.min !== undefined && ratio !== null && ratio >= row.min;
            return (
              <tr
                key={row.label}
                className="border-b border-dashed last:border-b-0"
              >
                <th scope="row" className="py-2 pr-3 font-normal">
                  {row.label}
                </th>
                <td className="py-2 pr-3">
                  <span
                    className="inline-block border border-toner px-2 py-1 font-display text-label whitespace-nowrap"
                    style={{
                      color: `var(--color-${row.foreground})`,
                      backgroundColor: `var(--color-${row.background})`,
                    }}
                  >
                    Аа Ёё 1&nbsp;000&nbsp;₽
                  </span>
                </td>
                <td className="py-2 pr-3 text-right font-mono text-mono whitespace-nowrap tabular-nums">
                  {ratio === null ? "…" : formatRatio(ratio)}
                </td>
                <td className="py-2 whitespace-nowrap">
                  {row.min === undefined ? (
                    <span className="text-toner-muted">{row.note}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {passes ? (
                        <Check aria-hidden className="size-4 text-success" />
                      ) : (
                        <X aria-hidden className="size-4 text-danger" />
                      )}
                      {formatRatio(row.min)}
                      <span className="sr-only">
                        {passes ? "— проходит" : "— не проходит"}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
