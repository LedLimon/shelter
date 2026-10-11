import { cva, type VariantProps } from "class-variance-authority";
import { CircleXIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/*
 * Form layout: Field, label, description and error. Forms are react-hook-form
 * + zod (AGENTS.md): wrap controls in <Controller>, set `data-invalid` on Field
 * and `aria-invalid` on the control, and pass the error to FieldError. The
 * /dev/ui showcase has a complete example.
 */

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex min-w-0 flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-1.5 font-display text-label text-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-6 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva("group/field flex w-full gap-2", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center gap-3 has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-0.5",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-0.5",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex min-w-0 flex-1 flex-col gap-1",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Label of a field. `variant="option"` for the sentence next to a checkbox,
 * radio or switch. Wrapping a whole Field turns it into a choice card.
 */
function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label w-fit",
        // Choice card: a framed option that thickens its frame when chosen.
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:border has-[>[data-slot=field]]:border-input has-[>[data-slot=field]]:bg-background *:data-[slot=field]:p-3",
        "has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:border-foreground",
        "has-[>[data-slot=field]]:has-data-checked:border-foreground has-[>[data-slot=field]]:has-data-checked:shadow-[inset_0_0_0_1px_var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 font-display text-label uppercase group-data-[disabled=true]/field:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-left text-caption text-muted-foreground group-has-data-horizontal/field:text-balance",
        "[&>a]:text-pen [&>a]:underline",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn("relative -my-2 h-6 text-caption", className)}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function errorContent(errors?: Array<{ message?: string } | undefined>) {
  const messages = [
    ...new Set(errors?.map((error) => error?.message).filter(Boolean)),
  ];
  if (messages.length <= 1) return messages[0];
  return (
    <ul className="ml-4 flex list-disc flex-col gap-1">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/**
 * The message under a field with an error: what happened and what to do,
 * always with an icon (colour is never the only signal). No live region by
 * default: the field points to it with aria-describedby and the form focuses
 * the first invalid field. Pass role="alert" for errors that arrive later
 * (from the server, on blur).
 */
function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = children ?? errorContent(errors);

  if (!content) {
    return null;
  }

  return (
    <div
      data-slot="field-error"
      className={cn(
        "flex items-start gap-1.5 text-caption text-destructive",
        className,
      )}
      {...props}
    >
      <CircleXIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{content}</div>
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
