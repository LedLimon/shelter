import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

/**
 * A form box on paper: perforation frame, toner on hover, the global pen
 * outline on focus. An error doubles the frame in the danger ink; the message,
 * with an icon, comes from FieldError. 16 px text keeps iOS from zooming in.
 */
const fieldBoxClassName = cn(
  "w-full min-w-0 border border-input bg-background font-body text-body text-foreground transition-[border-color,box-shadow] duration-150 ease-out",
  "placeholder:text-muted-foreground hover:border-foreground",
  "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]",
  "disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground disabled:hover:border-input",
);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        fieldBoxClassName,
        "h-11 px-3 py-2",
        "file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-display file:text-label file:text-foreground file:uppercase",
        className,
      )}
      {...props}
    />
  );
}

export { Input, fieldBoxClassName };
