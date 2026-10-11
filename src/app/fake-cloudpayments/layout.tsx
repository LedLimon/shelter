import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The CloudPayments emulator of dev and CI (docs/payments.md#эмулятор). Only
 * a frame here: with a real provider the pages answer 404 inside it, so it
 * must not say what would have been here.
 */
export default function FakeCloudPaymentsLayout({
  children,
}: LayoutProps<"/fake-cloudpayments">) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-gutter py-section sm:justify-center">
      <div className="w-full max-w-xl rounded-sheet bg-paper p-sheet shadow-sheet">
        {children}
      </div>
    </main>
  );
}
