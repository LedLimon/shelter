import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A form-level error from the server (wrong password, expired step): framed
 * in the danger ink, with an icon, announced when it appears. Errors of a
 * single field go to FieldError instead.
 */
export function FormAlert({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="flex gap-2 border-line border-destructive px-3 py-2 text-caption text-destructive"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Link-like actions under a form: a full 44 px tap target, aligned left. */
export const formLinkClass = cn(
  "min-h-11 justify-start text-left text-caption",
);
