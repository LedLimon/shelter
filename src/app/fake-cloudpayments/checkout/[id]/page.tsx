import {
  Ban,
  CircleCheck,
  CircleX,
  Hourglass,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { formatRub } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { FakeCheckout } from "@/server/payments/fake";
import { PayForm, ThreeDsForm } from "../../checkout-forms";
import { DeliveryLog } from "../../delivery-log";
import { requireFakeCloudPayments } from "../../guard";

// Metadata is resolved alongside the page, so it needs the same guard.
export async function generateMetadata(): Promise<Metadata> {
  await requireFakeCloudPayments();
  return { title: "Оплата — эмулятор CloudPayments" };
}

type Outcome = { icon: LucideIcon; title: string; text: ReactNode };

function outcomeOf(checkout: FakeCheckout): Outcome | null {
  switch (checkout.status) {
    case "paid":
      return {
        icon: CircleCheck,
        title: "Оплата прошла",
        text: "Эмулятор отправил сайту уведомление Pay. Деньги не списывались.",
      };
    case "cancelled":
      return {
        icon: Ban,
        title: "Виджет закрыт без оплаты",
        text: "Уведомления сайту не отправлялись.",
      };
    case "processing":
      return {
        icon: Hourglass,
        title: "Платёж обрабатывается",
        text: "Эмулятор ждёт ответа сайта на уведомление. Обновите страницу через несколько секунд.",
      };
    case "declined":
      switch (checkout.declineReason) {
        case "check":
          return {
            icon: CircleX,
            title: "Сайт не подтвердил платёж",
            text: (
              <>
                На уведомление Check сайт не ответил{" "}
                <code className="font-mono text-mono">{'{"code":0}'}</code>.
                Такой платёж CloudPayments отклоняет, эмулятор — тоже.
              </>
            ),
          };
        case "3ds":
          return {
            icon: CircleX,
            title: "3-D Secure не пройден",
            text: "Эмулятор отправил сайту уведомление Fail с кодом 5206.",
          };
        default:
          return {
            icon: CircleX,
            title: "Банк отклонил платёж",
            text: "Эмулятор отправил сайту уведомление Fail с кодом 5051: на карте не хватило денег.",
          };
      }
    default:
      return null;
  }
}

function Summary({ checkout }: { checkout: FakeCheckout }) {
  const { intent } = checkout;
  const monthlyKop = intent.recurrent?.amountKop ?? intent.amountKop;

  return (
    <div className="flex flex-col gap-3 border-b border-perforation pb-5">
      <p className="[overflow-wrap:anywhere]">{intent.description}</p>
      <p className="font-display text-sum-lg tabular-nums">
        {formatRub(intent.amountKop)}
      </p>
      {intent.recurrent && (
        <p className="text-caption">
          Подписка: дальше {formatRub(monthlyKop)} каждый месяц.
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-1 text-caption text-toner-muted sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt>Плательщик</dt>
        <dd className="[overflow-wrap:anywhere] text-toner">{intent.email}</dd>
        <dt>Номер заказа</dt>
        <dd className="font-mono text-mono [overflow-wrap:anywhere] text-toner">
          {intent.invoiceId}
        </dd>
      </dl>
    </div>
  );
}

function MissingCheckout() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Платёж не найден</h1>
        <p className="text-caption text-toner-muted">
          Эмулятор хранит платежи в&nbsp;памяти сервера и&nbsp;забывает их
          при&nbsp;перезапуске. Начните оплату заново.
        </p>
      </header>
      <Link
        href="/fake-cloudpayments"
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        Новый тестовый платёж
      </Link>
    </div>
  );
}

/** The emulated widget: one payment, from the choice of an outcome to its result. */
export default async function FakeCheckoutPage({
  params,
}: PageProps<"/fake-cloudpayments/checkout/[id]">) {
  const fake = await requireFakeCloudPayments();
  const checkout = fake.getCheckout((await params).id);
  if (!checkout) return <MissingCheckout />;

  const outcome = outcomeOf(checkout);
  const Icon = outcome?.icon ?? ShieldQuestion;

  return (
    <div className="flex flex-col gap-5">
      <p className="font-mono text-mono-sm text-toner-muted">
        Эмулятор CloudPayments · деньги не списываются
      </p>

      {checkout.status === "open" && (
        <>
          <h1 className="text-title">Оплата</h1>
          <Summary checkout={checkout} />
          <PayForm checkoutId={checkout.id} />
        </>
      )}

      {checkout.status === "awaiting-3ds" && (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="flex items-start gap-2 text-title">
              <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
              Банк просит код из&nbsp;СМС
            </h1>
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
            <h1 className="flex items-start gap-2 text-title">
              <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
              {outcome.title}
            </h1>
            <p className="text-caption text-toner-muted">{outcome.text}</p>
          </header>
          <Summary checkout={checkout} />
        </>
      )}

      <DeliveryLog deliveries={checkout.deliveries} />

      {outcome && checkout.status !== "processing" && (
        <a
          href={checkout.intent.returnUrl}
          className={cn(buttonVariants(), "w-full")}
        >
          Вернуться на сайт
        </a>
      )}
    </div>
  );
}
