import type { ReactNode } from "react";

/** The top of an admin page: its name, a line about it, the main actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="grid min-w-0 gap-2">
        <h1 className="text-sum-lg">{title}</h1>
        {description && (
          <p className="max-w-prose text-caption text-toner-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
