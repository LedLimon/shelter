import { MailCheck, MailQuestion } from "lucide-react";
import type { Metadata } from "next";
import { LegalSheet, LegalShell } from "@/components/legal/legal-shell";
import { maskEmail } from "@/lib/pii";
import { getDb } from "@/server/db";
import { marketingConsentState } from "@/server/legal";
import { getSettings } from "@/server/settings";
import { unsubscribe } from "./actions";
import { ResultHeading } from "./result-heading";
import { UnsubscribeButton } from "./unsubscribe-button";

// The link at the bottom of every newsletter (unsubscribeUrl()). Opening it
// withdraws nothing — mail scanners follow links — the button does.

export async function generateMetadata({
  params,
}: PageProps<"/unsubscribe/[token]">): Promise<Metadata> {
  const { status } = await marketingConsentState(getDb(), (await params).token);
  return {
    // The title changes with the page: it is what a screen reader and a
    // browser without JavaScript announce after the button.
    title: status === "withdrawn" ? "Вы отписаны" : "Отписка от рассылки",
    ...SHARED_METADATA,
  };
}

const SHARED_METADATA: Metadata = {
  robots: { index: false },
  // The address is a secret: don't hand it to other sites in the Referer.
  // Not "no-referrer": the form's own POST would then come with
  // `Origin: null`, which a server action refuses — and without JavaScript
  // (or before it loads) the button would answer 500.
  referrer: "same-origin",
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
          <ResultHeading>Вы&nbsp;отписаны</ResultHeading>
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
            продолжат приходить: это не&nbsp;рассылка.
          </p>
          <p className="max-w-prose text-caption text-toner-muted">
            Передумаете — отметьте «Хочу получать новости» при следующем
            пожертвовании.
          </p>
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
