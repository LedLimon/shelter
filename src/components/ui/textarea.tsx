import * as React from "react";

import { fieldBoxClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldBoxClassName,
        // Grows down with its text, never sideways: without the containment a
        // long unbroken line (a URL) widens the field and the page with it.
        "flex field-sizing-content min-h-28 px-3 py-2.5 contain-inline-size",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
