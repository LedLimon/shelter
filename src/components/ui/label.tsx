"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * `field` names a box above it: a short caps label («Почта для чека»).
 * `option` is the text next to a checkbox, radio or switch: a sentence in the
 * body face, since long caps shout.
 */
const labelVariants = cva(
  "flex items-center gap-2 text-foreground select-none group-data-[disabled=true]/field:cursor-not-allowed group-data-[disabled=true]/field:text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground peer-data-disabled:cursor-not-allowed peer-data-disabled:text-muted-foreground",
  {
    variants: {
      variant: {
        field: "font-display text-label uppercase",
        option: "font-body text-body",
      },
    },
    defaultVariants: { variant: "field" },
  },
);

function Label({
  className,
  variant = "field",
  ...props
}: React.ComponentProps<"label"> & VariantProps<typeof labelVariants>) {
  return (
    <label
      data-slot="label"
      className={cn(labelVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Label, labelVariants };
