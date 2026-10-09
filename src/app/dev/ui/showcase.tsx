import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A showcase section: a short caps paper label on the board, then content. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-grid"
    >
      <div className="grid justify-items-start gap-3">
        <h2
          id={id}
          className="bg-paper px-3.5 pt-2 pb-1.5 text-section uppercase shadow-sheet"
        >
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-caption text-toner-muted">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** A sheet of paper holding specimens. Not a Card: cards go on the board. */
export function Paper({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-sheet bg-paper p-sheet shadow-sheet",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SpecLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("font-mono text-mono-sm text-toner-muted", className)}>
      {children}
    </p>
  );
}

/** A titled group of specimens inside a sheet, divided from the next by a rule. */
export function SpecimenGroup({
  title,
  note,
  children,
  className,
}: {
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 border-b border-input py-5 first:pt-0 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div className="grid gap-1">
        <h3 className="font-mono text-mono font-normal">{title}</h3>
        {note && (
          <p className="max-w-prose text-caption text-toner-muted">{note}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** A wrapping row of specimens, each with a caption under it. */
export function Specimens({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-start gap-x-6 gap-y-5", className)}
    >
      {children}
    </div>
  );
}

export function Specimen({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("grid min-w-0 justify-items-start gap-2", className)}>
      {children}
      <figcaption className="font-mono text-mono-sm text-toner-muted">
        {label}
      </figcaption>
    </figure>
  );
}
