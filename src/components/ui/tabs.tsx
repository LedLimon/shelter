"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className,
      )}
      {...props}
    />
  );
}

/*
 * `default` is the theme switcher's segmented strip: a toner frame, the active
 * tab filled with toner. `line` is a row of words underlined in toner.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full items-stretch group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "border-line border-foreground bg-background",
        line: "gap-4 border-b border-input group-data-vertical/tabs:gap-0 group-data-vertical/tabs:border-b-0 group-data-vertical/tabs:border-l",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 font-display text-label text-foreground uppercase transition-colors duration-150 ease-out select-none group-data-vertical/tabs:justify-start focus-visible:z-10",
        "data-disabled:cursor-not-allowed data-disabled:text-muted-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // default: segments divided by toner lines; the active one is filled.
        "group-data-[variant=default]/tabs-list:not-first:border-l-line group-data-[variant=default]/tabs-list:not-first:border-foreground group-data-vertical/tabs:group-data-[variant=default]/tabs-list:not-first:border-t-line group-data-vertical/tabs:group-data-[variant=default]/tabs-list:not-first:border-l-0",
        "group-data-[variant=default]/tabs-list:not-data-disabled:not-data-active:hover:bg-accent",
        "group-data-[variant=default]/tabs-list:data-active:bg-foreground group-data-[variant=default]/tabs-list:data-active:text-background",
        "forced-colors:group-data-[variant=default]/tabs-list:data-active:bg-[Highlight] forced-colors:group-data-[variant=default]/tabs-list:data-active:text-[HighlightText] forced-colors:group-data-[variant=default]/tabs-list:data-active:forced-color-adjust-none",
        // line: muted words, the active one in toner with a 3 px underline.
        "group-data-[variant=line]/tabs-list:px-0 group-data-[variant=line]/tabs-list:text-muted-foreground group-data-vertical/tabs:group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:not-data-disabled:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-[3px] group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-left-px group-data-vertical/tabs:after:w-[3px] forced-colors:after:bg-[CanvasText] forced-colors:after:forced-color-adjust-none group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-body", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
