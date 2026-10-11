import "server-only";
import { getEnv } from "@/lib/env";
import { isEmailAddress } from "@/lib/mailbox";
import { SHELTER_NAME } from "@/lib/shelter";
import { getDb, type Db } from "@/server/db";
import type { OutboxContext } from "@/server/jobs/outbox/dispatcher";
import { getSettings } from "@/server/settings";
import type { EmailContext } from "./context";
import type { EmailProps, EmailType } from "./registry";
import { renderEmail } from "./render";
import { createMailer, type Mailer } from "./transport";

let mailer: Mailer | undefined;

/** The SMTP client of this process, made from the environment on first use. */
export function getMailer(): Mailer {
  mailer ??= createMailer(getEnv());
  return mailer;
}

/** Whose letter it is and where its links lead, as set right now. */
export async function loadEmailContext(db: Db): Promise<EmailContext> {
  const settings = await getSettings(db);
  const email = settings["shelter.contacts"].email.trim();
  return {
    siteUrl: getEnv().APP_URL,
    timeZone: settings["shelter.timezone"],
    shelter: {
      name: SHELTER_NAME,
      legalName: settings["shelter.requisites"].legalName.trim() || undefined,
      // Shown in the letter and used as Reply-To: a mistyped setting must
      // not break either.
      email: isEmailAddress(email) ? email : undefined,
    },
  };
}

export type SendEmailOptions = {
  /** For tests: a mailer other than the process's. */
  mailer?: Mailer;
  /** Goes before the letter's subject: «Проверка: ». */
  subjectPrefix?: string;
};

/**
 * Sends a letter of the registry — from an outbox handler only: letters go
 * out after the commit of what they are about, and the outbox retries a
 * failed send (docs/architecture.md#письма).
 *
 * One letter per outbox event: the first successful send is recorded in
 * EmailDelivery under the event's id, and a later run of the same event
 * returns "already-sent" without sending. A worker killed between the SMTP
 * server's «accepted» and that record sends a second copy on the retry; it
 * carries the same Message-ID, which is what mail systems deduplicate by.
 *
 * `to` and the props are the handler's to load; neither is logged or stored.
 * Throws EmailSendError (safe to log) if the server didn't take the letter.
 */
export async function sendEmail<T extends EmailType>(
  type: T,
  message: { to: string; props: EmailProps<T> },
  { eventId, signal }: Pick<OutboxContext, "eventId" | "signal">,
  options: SendEmailOptions = {},
): Promise<"sent" | "already-sent"> {
  const db = getDb();
  const sent = await db.emailDelivery.findUnique({ where: { key: eventId } });
  if (sent) return "already-sent";

  const context = await loadEmailContext(db);
  const letter = await renderEmail(type, message.props, context);
  const messageId = await (options.mailer ?? getMailer()).send(
    {
      to: message.to,
      subject: `${options.subjectPrefix ?? ""}${letter.subject}`,
      html: letter.html,
      text: letter.text,
      id: eventId,
      replyTo: context.shelter.email,
      unsubscribeUrl: letter.unsubscribeUrl,
    },
    signal,
  );

  // skipDuplicates: an attempt that outlived its lease may have raced us.
  await db.emailDelivery.createMany({
    data: [{ key: eventId, type, messageId }],
    skipDuplicates: true,
  });
  return "sent";
}
