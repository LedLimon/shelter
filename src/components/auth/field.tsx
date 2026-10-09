import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Minimal labelled input for the sign-in screens until DS-2 brings Input and
// Field to src/components/ui; then these screens switch to them.

/**
 * Buttons of the sign-in screens over the stock shadcn Button: label type at
 * full weight, 44 px tall, the solid pen focus ring of docs/design.md (the
 * stock one is translucent until DS-2).
 */
export const AUTH_BUTTON_CLASS = cn(
  "h-11 bg-clip-border px-4 font-display text-label font-[800] uppercase",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

/** Link-styled controls under a form: a full 44 px tap target. */
export const AUTH_LINK_CLASS =
  "inline-flex min-h-11 items-center text-left underline decoration-[1.5px] underline-offset-[3px] hover:decoration-2";

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
};

export function Field({ label, hint, error, className, ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-label uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "h-11 w-full min-w-0 border-line border-perforation bg-paper px-3 text-body text-toner",
          "placeholder:text-toner-muted read-only:text-toner-muted",
          "aria-invalid:border-2 aria-invalid:border-danger",
          className,
        )}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-caption text-toner-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex gap-1.5 text-caption text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level message: announced by screen readers when it appears. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex gap-2 border-line border-danger px-3 py-2 text-caption text-danger"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The primary action of a sign-in step: toner on paper, full width. While
 * pending it stays focusable (aria-disabled), so focus doesn't fall to <body>.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      focusableWhenDisabled
      aria-busy={pending || undefined}
      className={cn(AUTH_BUTTON_CLASS, "w-full aria-disabled:cursor-progress")}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** A text field of a submitted form; "" when it's missing. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
