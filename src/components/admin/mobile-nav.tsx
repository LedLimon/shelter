"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** The menu below the `lg` breakpoint: a drawer that slides in from the left. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="icon" className="lg:hidden" />}
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Меню</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(85%,20rem)]">
        <SheetHeader>
          <SheetTitle>Разделы</SheetTitle>
        </SheetHeader>
        <nav
          aria-label="Разделы админки"
          className="px-2 pb-sheet"
          // Following a link closes the drawer, the current page's link too.
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a")) {
              setOpen(false);
            }
          }}
        >
          {children}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
