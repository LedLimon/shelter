"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * A square toggle in a toner frame, filled with toner when on — like the
 * checked option of the theme switcher. The thumb moves; colour is not the
 * only signal.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center border-line border-foreground bg-background p-[2.5px] transition-colors duration-150 ease-out",
        "after:absolute after:-inset-x-2 after:-inset-y-3",
        "data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-5 data-[size=sm]:w-9",
        "hover:bg-accent data-checked:bg-foreground data-checked:hover:bg-foreground",
        "aria-invalid:border-2 aria-invalid:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:border-input data-disabled:bg-transparent data-disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block bg-foreground transition-transform duration-150 ease-out",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "data-checked:bg-background group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-4",
          "group-data-disabled/switch:bg-input forced-colors:bg-[CanvasText]! forced-colors:forced-color-adjust-none group-data-disabled/switch:data-checked:bg-input",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
