import Link from "next/link";
import { AUTH_LINK_CLASS } from "@/components/auth/field";
import { cn } from "@/lib/utils";

/** Sign-in screens: one sheet on the board, nothing else to look at. */
export default function AuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-gutter py-section sm:justify-center">
      <div className="w-full max-w-md rounded-sheet bg-paper p-sheet shadow-sheet">
        {children}
      </div>
      <Link
        href="/"
        className={cn(
          AUTH_LINK_CLASS,
          "mt-4 text-caption text-toner-muted hover:text-toner",
        )}
      >
        На сайт приюта
      </Link>
    </main>
  );
}
