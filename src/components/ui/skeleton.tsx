import { cn } from "@/lib/utils";

/**
 * A board-grey block in the shape of the content it stands for. Decorative:
 * mark the loading region with `aria-busy` and a visually hidden «Загрузка…».
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-pulse bg-muted forced-colors:border forced-colors:border-dashed",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
