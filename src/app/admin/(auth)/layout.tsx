import Link from "next/link";

/** Sign-in screens: one sheet on the board, nothing else to look at. */
export default function AuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-gutter py-section sm:justify-center">
      <div className="w-full max-w-md rounded-sheet bg-paper p-sheet shadow-sheet">
        {children}
      </div>
      <Link
        href="/"
        className="mt-6 text-caption text-toner-muted underline decoration-[1.5px] underline-offset-[3px]"
      >
        На сайт приюта
      </Link>
    </main>
  );
}
