import { MailCheck, MailQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalSheet, LegalShell } from "@/components/legal/legal-shell";
import { buttonVariants } from "@/components/ui/button";
import { maskEmail } from "@/lib/pii";
import { getDb } from "@/server/db";
import { marketingConsentState } from "@/server/legal";
import { getSettings } from "@/server/settings";
import { unsubscribe } from "./actions";
import { UnsubscribeButton } from "./unsubscribe-button";

// The link at the bottom of every newsletter (unsubscribeUrl()). Opening it
// withdraws nothing — mail scanners follow links — the button does.

export const metadata: Metadata = {
  title: "Отписка от рассылки",
  robots: { index: false },
  // The address is a secret: don't hand it to the sites this page links to.
  referrer: "no-referrer",
};

// The answer depends on the consent's state right now.
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
}: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const state = await marketingConsentState(getDb(), token);

  if (state.status === "unknown") {
    const { email } = (await getSettings(getDb()))["shelter.contacts"];
    return (
      <LegalShell>
        <LegalSheet className="grid max-w-xl gap-4">
          <MailQuestion aria-hidden className="size-8" />
          <h1 className="text-section">Ссылка не&nbsp;подошла</h1>
          <p className="max-w-prose">
            Мы&nbsp;не&nbsp;нашли подписку по&nbsp;этой ссылке: возможно, она
            скопирована не&nbsp;целиком. Откройте её&nbsp;прямо из&nbsp;письма
            {email ? (
              <>
                {" "}
                или напишите нам на&nbsp;
                <a href={`mailto:${email}`} className="text-pen underline">
                  {email}
                </a>{" "}
                — отпишем вручную.
              </>
            ) : (
              "."
            )}
          </p>
        </LegalSheet>
      </LegalShell>
    );
  }

  const address = state.email ? maskEmail(state.email) : null;

  if (state.status === "withdrawn") {
    return (
      <LegalShell>
        <LegalSheet className="grid max-w-xl gap-4">
          <MailCheck aria-hidden className="size-8 text-success" />
          <h1 className="text-section">Вы&nbsp;отписаны</h1>
          <p className="max-w-prose">
            Новости приюта больше не&nbsp;придут
            {address && (
              <>
                {" "}
                на&nbsp;
                <span className="font-mono text-mono">{address}</span>
              </>
            )}
            . Письма о&nbsp;ваших пожертвованиях и&nbsp;ежемесячной помощи
            приходить продолжат: это не&nbsp;рассылка.
          </p>
          <p className="max-w-prose text-caption text-toner-muted">
            Передумаете — отметьте «Хочу получать новости» при следующем
            пожертвовании.
          </p>
          <div>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              На сайт приюта
            </Link>
          </div>
        </LegalSheet>
      </LegalShell>
    );
  }

  return (
    <LegalShell>
      <LegalSheet className="grid max-w-xl gap-4">
        <h1 className="text-section">Отписаться от&nbsp;новостей приюта?</h1>
        <p className="max-w-prose">
          Письма с&nbsp;новостями перестанут приходить
          {address && (
            <>
              {" "}
              на&nbsp;<span className="font-mono text-mono">{address}</span>
            </>
          )}
          . Письма о&nbsp;ваших пожертвованиях и&nbsp;ежемесячной помощи
          останутся: это не&nbsp;рассылка.
        </p>
        <form action={unsubscribe.bind(null, token)}>
          <UnsubscribeButton />
        </form>
      </LegalSheet>
    </LegalShell>
  );
}
