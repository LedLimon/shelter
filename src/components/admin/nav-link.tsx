"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { isSectionPath } from "./nav-path";

/** Marks the element that scrolls the menu: the sidebar, the drawer. */
export const MENU_SCROLLER = "data-menu-scroller";
/** Kept between the current item and the edge of the menu, in px. */
const EDGE_GAP = 12;

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
  const link = useRef<HTMLAnchorElement>(null);

  // The owner's menu is taller than a low window and than the drawer: a
  // menu that scrolls must not open with the current section out of sight.
  useEffect(() => {
    const item = link.current;
    const menu = item?.closest<HTMLElement>(`[${MENU_SCROLLER}]`);
    if (!current || !item || !menu) return;
    // By hand: scrollIntoView() would scroll the page along with the menu.
    const { top, bottom } = item.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    if (top < box.top) menu.scrollTop -= box.top - top + EDGE_GAP;
    else if (bottom > box.bottom)
      menu.scrollTop += bottom - box.bottom + EDGE_GAP;
  }, [current]);

  return (
    <Link
      ref={link}
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        // 44 px rows for a finger in the drawer, 32 px in the desktop sidebar.
        "flex min-h-11 items-center gap-2.5 px-2.5 py-1.5 font-display text-label text-toner uppercase lg:min-h-8 lg:py-1",
        "not-aria-[current=page]:hover:bg-board aria-[current=page]:bg-toner aria-[current=page]:text-paper",
        // Windows contrast themes drop backgrounds: mark the page with system colours.
        "forced-colors:aria-[current=page]:bg-[Highlight] forced-colors:aria-[current=page]:text-[HighlightText] forced-colors:aria-[current=page]:forced-color-adjust-none",
      )}
    >
      <NavIcon>{icon}</NavIcon>
      <span className="min-w-0">{children}</span>
    </Link>
  );
}

/**
 * The item's icon; a spinner while its page loads. Admin pages have no
 * loading.tsx (a 403 must stay a 403), so on a slow connection this is the
 * sign that the click was taken.
 */
function NavIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Spinner aria-hidden className="size-4 shrink-0" />
  ) : (
    children
  );
}
