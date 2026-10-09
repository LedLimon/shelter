import { LoaderCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Inline loading mark for buttons and small areas. Content loading uses
 * skeletons of the content's shape instead (docs/design.md). Without motion
 * (prefers-reduced-motion) it stands still, so pair it with a word.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label="Загрузка"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
