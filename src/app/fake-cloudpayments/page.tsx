import type { Metadata } from "next";
import { requireFakeCloudPayments } from "./guard";
import { TestPaymentForm } from "./test-payment-form";

// Metadata is resolved alongside the page, so it needs the same guard.
export async function generateMetadata(): Promise<Metadata> {
  await requireFakeCloudPayments();
  return { title: "Эмулятор CloudPayments" };
}

/** Starts a test payment through the emulated widget, without a donation form. */
export default async function FakeCloudPaymentsPage() {
  await requireFakeCloudPayments();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-mono-sm text-toner-muted">
          PAYMENT_PROVIDER=fake
        </p>
        <h1 className="text-title">Эмулятор CloudPayments</h1>
        <p className="text-caption text-toner-muted">
          Тестовый платёж без банка и&nbsp;без сети: деньги не&nbsp;списываются,
          а&nbsp;сайт получает такие&nbsp;же подписанные уведомления, какие
          присылает CloudPayments. Страница есть только в&nbsp;разработке
          и&nbsp;в&nbsp;CI.
        </p>
      </header>
      <TestPaymentForm />
    </div>
  );
}
