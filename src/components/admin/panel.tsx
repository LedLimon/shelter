import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A sheet of paper on the board holding one part of a page — a group of
 * fields, a table, a summary. Sheets lie side by side, never inside another.
 */
export function Panel({
  title,
  description,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 content-start gap-4 rounded-sheet bg-paper p-sheet shadow-sheet",
        className,
      )}
    >
      {(title || description) && (
        <div className="grid gap-1.5">
          {title && <h2 className="text-button">{title}</h2>}
          {description && (
            <p className="max-w-prose text-caption text-toner-muted">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
