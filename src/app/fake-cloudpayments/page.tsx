import type { Metadata } from "next";
import { EmulatorMark } from "./emulator-mark";
import { requireFakeCloudPayments } from "./guard";
import { TestPaymentForm } from "./test-payment-form";

// Metadata is resolved alongside the page, so it needs the same guard.
export async function generateMetadata(): Promise<Metadata> {
  await requireFakeCloudPayments();
  return { title: "Тестовый платёж — эмулятор CloudPayments" };
}

/** Starts a test payment through the emulated widget, without a donation form. */
export default async function FakeCloudPaymentsPage() {
  await requireFakeCloudPayments();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <EmulatorMark />
        <h1 className="text-title">Тестовый платёж</h1>
        <p className="text-caption text-toner-muted">
          Платёж без банка и&nbsp;без сети: сайт получает такие&nbsp;же
          подписанные уведомления, какие присылает CloudPayments. Страница есть
          только в&nbsp;разработке и&nbsp;в&nbsp;CI, пока{" "}
          <code className="font-mono text-mono">PAYMENT_PROVIDER=fake</code>.
        </p>
      </header>
      <TestPaymentForm />
    </div>
  );
}
