"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  );
}

/** A circle on a paper form, filled in with the pen when chosen. */
function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex size-5 shrink-0 items-center justify-center rounded-full border-line border-foreground bg-background transition-colors duration-150 ease-out",
        "after:absolute after:-inset-x-3 after:-inset-y-3",
        "hover:bg-accent",
        "aria-invalid:border-2 aria-invalid:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:border-input data-disabled:bg-transparent data-disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2.5 rounded-full bg-pen group-data-disabled/radio-group-item:bg-muted-foreground forced-colors:bg-[CanvasText] forced-colors:forced-color-adjust-none"
      />
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
