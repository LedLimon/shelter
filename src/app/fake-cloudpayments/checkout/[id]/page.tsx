import {
  Ban,
  CircleCheck,
  CircleX,
  Hourglass,
  ShieldQuestion,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatRub } from "@/lib/money";
import { formatCount, plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { FakeCheckout } from "@/server/payments/fake";
import {
  PayForm,
  ResultHeading,
  RetryForm,
  ThreeDsForm,
} from "../../checkout-forms";
import { DeliveryLog } from "../../delivery-log";
import { EmulatorMark } from "../../emulator-mark";
import { requireFakeCloudPayments } from "../../guard";
import { outcomeOf, type CheckoutOutcome } from "../../outcome";

type Props = PageProps<"/fake-cloudpayments/checkout/[id]">;

const SUFFIX = "эмулятор CloudPayments";

// Metadata is resolved alongside the page, so it needs the same guard.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fake = await requireFakeCloudPayments();
  const checkout = fake.getCheckout((await params).id);
  if (!checkout) return { title: `Платёж не найден — ${SUFFIX}` };
  if (checkout.status === "awaiting-3ds") {
    return { title: `3-D Secure — ${SUFFIX}` };
  }
  const title = outcomeOf(checkout)?.title ?? "Тестовая оплата";
  return { title: `${title} — ${SUFFIX}` };
}

const TONE_ICON: Record<CheckoutOutcome["tone"], LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  failure: CircleX,
  neutral: Ban,
};

function scheduleOf(period: number): string {
  if (period === 1) return "каждый месяц";
  const every = plural(period, ["каждый", "каждые", "каждые"]);
  return `${every} ${formatCount(period, ["месяц", "месяца", "месяцев"])}`;
}

function Summary({ checkout }: { checkout: FakeCheckout }) {
  const { intent } = checkout;

  return (
    <div className="flex flex-col gap-3 border-b border-perforation pb-5">
      <p className="[overflow-wrap:anywhere]">{intent.description}</p>
      <p className="font-display text-sum-lg tabular-nums">
        {formatRub(intent.amountKop)}
      </p>
      {intent.recurrent && (
        <p className="text-caption">
          Подписка: дальше{" "}
          {formatRub(intent.recurrent.amountKop ?? intent.amountKop)}{" "}
          {scheduleOf(intent.recurrent.period)}.
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-3 text-caption sm:grid-cols-[auto_minmax(0,1fr)] sm:items-baseline sm:gap-y-1.5">
        <div className="grid gap-0.5 sm:contents">
          <dt className="text-toner-muted">Плательщик</dt>
          <dd className="[overflow-wrap:anywhere]">{intent.email}</dd>
        </div>
        <div className="grid gap-0.5 sm:contents">
          <dt className="text-toner-muted">Номер заказа</dt>
          <dd className="font-mono text-mono [overflow-wrap:anywhere]">
            {intent.invoiceId}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function MissingCheckout() {
  return (
    <div className="flex flex-col gap-5">
      <EmulatorMark />
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Платёж не найден</h1>
        <p className="text-caption text-toner-muted">
          Эмулятор хранит платежи в&nbsp;памяти сервера и&nbsp;забывает их
          при&nbsp;перезапуске. Начните оплату заново.
        </p>
      </header>
      <Link
        href="/fake-cloudpayments"
        className={cn(buttonVariants(), "w-full")}
      >
        Начать тестовый платёж
      </Link>
    </div>
  );
}

/** The emulated widget: one payment, from the choice of an outcome to its result. */
export default async function FakeCheckoutPage({ params }: Props) {
  const fake = await requireFakeCloudPayments();
  const checkout = fake.getCheckout((await params).id);
  if (!checkout) return <MissingCheckout />;

  const outcome = outcomeOf(checkout);
  const OutcomeIcon =
    checkout.status === "processing"
      ? Hourglass
      : TONE_ICON[outcome?.tone ?? "neutral"];
  const path = `/fake-cloudpayments/checkout/${checkout.id}`;

  return (
    <div className="flex flex-col gap-5">
      <EmulatorMark />

      {checkout.status === "open" && (
        <>
          {checkout.deliveries.length > 0 ? (
            // Back here after «Повторить платёж»: the screen has changed.
            <ResultHeading>Тестовая оплата</ResultHeading>
          ) : (
            <h1 className="text-title">Тестовая оплата</h1>
          )}
          <Summary checkout={checkout} />
          <PayForm checkoutId={checkout.id} sendsCheck={checkout.sendsCheck} />
        </>
      )}

      {checkout.status === "awaiting-3ds" && (
        <>
          <header className="flex flex-col gap-2">
            <ResultHeading>
              <ShieldQuestion aria-hidden className="mt-0.5 size-6 shrink-0" />
              Банк просит код из&nbsp;СМС
            </ResultHeading>
            <p className="text-caption text-toner-muted">
              Это страница 3-D Secure. Настоящая открывается у&nbsp;банка; здесь
              выберите, чем проверка закончится.
            </p>
          </header>
          <Summary checkout={checkout} />
          <ThreeDsForm checkoutId={checkout.id} />
        </>
      )}

      {outcome && (
        <>
          <header className="flex flex-col gap-2">
            <ResultHeading>
              <OutcomeIcon aria-hidden className="mt-0.5 size-6 shrink-0" />
              {outcome.title}
            </ResultHeading>
            <p className="text-caption [overflow-wrap:anywhere]">
              {outcome.text}
            </p>
          </header>
          <Summary checkout={checkout} />
        </>
      )}

      <DeliveryLog deliveries={checkout.deliveries} />

      {checkout.status === "processing" && (
        <Link
          href={path}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Обновить страницу
        </Link>
      )}
      {outcome && checkout.status !== "processing" && (
        <div className="flex flex-col gap-3">
          {checkout.status === "declined" && (
            <RetryForm checkoutId={checkout.id} />
          )}
          <a
            href={checkout.intent.returnUrl}
            className={cn(buttonVariants(), "w-full")}
          >
            Вернуться на сайт
          </a>
        </div>
      )}
    </div>
  );
}
