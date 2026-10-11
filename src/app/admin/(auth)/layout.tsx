import Link from "next/link";
import { formLinkClass } from "@/components/auth/form-alert";
import { buttonVariants } from "@/components/ui/button";
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
          buttonVariants({ variant: "link" }),
          formLinkClass,
          "mt-4 text-toner-muted hover:text-toner",
        )}
      >
        На сайт приюта
      </Link>
    </main>
  );
}
