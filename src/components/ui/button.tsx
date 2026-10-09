import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/*
 * Buttons of the «Объявление» direction (docs/design.md#формы-и-материал):
 * square, display font in caps, toner for actions and yellow paper only for
 * «Помочь». Focus is the global 3 px pen outline from globals.css. A disabled
 * button loses its fill and gets a dashed frame; a loading one keeps its look.
 */
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2 border-line border-transparent text-center font-display text-label uppercase select-none",
    "transition-[translate,box-shadow,background-color,border-color,color] duration-150 ease-out",
    "active:not-aria-[haspopup]:not-data-disabled:translate-y-px",
    "aria-busy:cursor-progress data-disabled:cursor-not-allowed",
    "data-disabled:not-aria-busy:border-dashed data-disabled:not-aria-busy:border-perforation data-disabled:not-aria-busy:bg-transparent data-disabled:not-aria-busy:text-toner-muted data-disabled:not-aria-busy:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:border-[color-mix(in_oklab,var(--primary),var(--background)_18%)] hover:bg-[color-mix(in_oklab,var(--primary),var(--background)_18%)]",
        // «Помочь»: yellow paper in a 2 px frame, lifts like a sheet on hover.
        help: "border-2 border-notice-foreground bg-notice text-notice-foreground not-data-disabled:hover:-translate-y-px not-data-disabled:hover:shadow-sheet active:shadow-none",
        outline:
          "border-foreground bg-background text-foreground hover:bg-accent aria-expanded:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_10%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_10%)]",
        ghost: "text-foreground hover:bg-accent aria-expanded:bg-accent",
        destructive:
          "border-destructive bg-background text-destructive hover:bg-[color-mix(in_oklab,var(--destructive),var(--background)_88%)]",
        link: "border-0 font-body text-body text-pen normal-case underline decoration-[1.5px] underline-offset-[3px] hover:decoration-[3px] data-disabled:not-aria-busy:no-underline",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-9 px-3 py-1.5",
        // The «Помочь» size: 52 px, the button type step.
        lg: "min-h-cta px-6 py-2.5 text-button [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    compoundVariants: [{ variant: "link", class: "min-h-0 px-0 py-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /**
     * Shows a spinner and blocks clicks but keeps the button focusable and
     * styled, so focus stays put while a form is being sent.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  focusableWhenDisabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      focusableWhenDisabled={focusableWhenDisabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner aria-hidden />}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants, type ButtonProps };
