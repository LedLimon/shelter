import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_LABELS } from "@/components/auth/role-label";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StaffUser } from "@/server/auth/access";
import { AdminNav } from "./admin-nav";
import { MobileNav } from "./mobile-nav";
import { adminNavFor } from "./nav-config";
import { UserMenu } from "./user-menu";

/**
 * The frame of every admin page: a paper bar with the user's menu, the
 * sections the user's role may open (a sidebar from `lg`, a drawer below it)
 * and the page itself. Hiding a section here is a convenience, not the
 * access check: pages and server actions check permissions themselves.
 */
export function AdminShell({
  user,
  children,
}: {
  user: StaffUser;
  children: ReactNode;
}) {
  const nav = <AdminNav groups={adminNavFor(user)} />;

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#admin-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:bg-paper focus-visible:px-3 focus-visible:py-2 focus-visible:text-pen focus-visible:underline"
        >
          К содержимому
        </a>
        <header className="sticky top-0 z-30 bg-paper shadow-sheet">
          <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-3 px-gutter">
            <MobileNav>{nav}</MobileNav>
            <Link
              href="/admin"
              className="font-display text-label text-toner uppercase"
            >
              Сайт приюта · админка
            </Link>
            <div className="ml-auto flex min-w-0 items-center">
              <UserMenu name={user.name} role={ROLE_LABELS[user.role]} />
            </div>
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-[90rem] flex-1 grid-cols-[minmax(0,1fr)] gap-grid px-gutter py-grid lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav
            aria-label="Разделы админки"
            className="sticky top-[calc(3.5rem+var(--spacing-grid))] hidden max-h-[calc(100dvh-3.5rem-2*var(--spacing-grid))] self-start overflow-y-auto overscroll-contain rounded-sheet bg-paper p-1.5 shadow-sheet lg:block"
          >
            {nav}
          </nav>
          <main
            id="admin-content"
            className="grid min-w-0 content-start gap-grid pb-section"
          >
            {children}
          </main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
