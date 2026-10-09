import { useId, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Minimal labelled input for the sign-in screens until DS-2 brings Input and
// Field to src/components/ui; then these screens switch to them.

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
          "h-11 w-full min-w-0 border-line border-toner bg-paper px-3 text-body text-toner",
          "placeholder:text-toner-muted disabled:border-dashed disabled:text-toner-muted",
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
        <p id={errorId} className="text-caption text-danger">
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
      className="border-line border-danger px-3 py-2 text-caption text-danger"
    >
      {children}
    </p>
  );
}

/** The primary action of a sign-in step: toner on paper, full width. */
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
      aria-busy={pending || undefined}
      className="h-11 w-full px-4 font-display text-label uppercase disabled:cursor-progress"
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
