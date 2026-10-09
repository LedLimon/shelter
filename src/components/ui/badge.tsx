import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Short caps marks on paper: a toner plate, a frame or a quiet frame — never
 * a grey pill. Status and urgency are never carried by colour alone: add an
 * icon and a word. Urgency itself is UrgencyBadge (DS-3, `urgency-*` utilities).
 */
const badgeVariants = cva(
  "group/badge inline-flex min-h-6 w-fit max-w-full shrink-0 items-center justify-center gap-1 border border-transparent px-2 py-0.5 font-display text-label uppercase transition-colors has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground [a]:hover:border-[color-mix(in_oklab,var(--primary),var(--background)_18%)] [a]:hover:bg-[color-mix(in_oklab,var(--primary),var(--background)_18%)]",
        outline: "border-foreground text-foreground [a]:hover:bg-accent",
        secondary: "border-input text-muted-foreground [a]:hover:bg-accent",
        destructive: "border-destructive text-destructive [a]:hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent",
        link: "px-0 font-body text-caption text-pen normal-case underline decoration-[1.5px] underline-offset-[3px] hover:decoration-[3px]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
