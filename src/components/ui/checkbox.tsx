"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A box on a paper form, ticked with the ballpoint pen (the Pen Rule in
 * DESIGN.md: whatever a person marks is pen-blue). The box stays unfilled.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-5 shrink-0 items-center justify-center border-line border-foreground bg-background text-pen transition-colors duration-150 ease-out",
        // A larger hit area without a larger box.
        "after:absolute after:-inset-x-3 after:-inset-y-3",
        "hover:bg-accent",
        "aria-invalid:border-2 aria-invalid:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:border-input data-disabled:bg-transparent data-disabled:text-muted-foreground data-disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-4"
      >
        <CheckIcon
          aria-hidden
          strokeWidth={3}
          className="group-data-indeterminate/checkbox:hidden"
        />
        <MinusIcon
          aria-hidden
          strokeWidth={3}
          className="hidden group-data-indeterminate/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
