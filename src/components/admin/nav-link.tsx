"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isSectionPath } from "./nav-path";

/** A menu item; the section the current page belongs to is a toner plate. */
export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const current = isSectionPath(usePathname(), href);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        // 44 px rows for a finger in the drawer, 32 px in the desktop sidebar:
        // the owner's eighteen sections fit a laptop screen without scrolling.
        "flex min-h-11 items-center gap-2.5 px-2.5 py-1.5 font-display text-label text-toner uppercase lg:min-h-8 lg:py-1",
        "not-aria-[current=page]:hover:bg-board aria-[current=page]:bg-toner aria-[current=page]:text-paper",
        // Windows contrast themes drop backgrounds: mark the page with system colours.
        "forced-colors:aria-[current=page]:bg-[Highlight] forced-colors:aria-[current=page]:text-[HighlightText] forced-colors:aria-[current=page]:forced-color-adjust-none",
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </Link>
  );
}
