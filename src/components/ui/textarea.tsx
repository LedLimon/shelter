import * as React from "react";

import { fieldBoxClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldBoxClassName,
        "flex field-sizing-content min-h-28 px-3 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
