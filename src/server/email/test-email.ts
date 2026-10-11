import "server-only";
import { isStaffRole } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type {
  OutboxContext,
  OutboxHandler,
} from "@/server/jobs/outbox/dispatcher";
import { emails, isEmailType } from "./registry";
import { sendEmail, type SendEmailOptions } from "./send";

/**
 * The «email.test» event: a sample of a letter to a staff member — how a real
 * mailbox shows it, and whether SMTP works at all. A user who is gone or is
 * not staff gets nothing, and the event is done: retrying won't change that.
 */
export async function sendTestEmail(
  { email: type, example, userId }: Parameters<OutboxHandler<"email.test">>[0],
  context: Pick<OutboxContext, "eventId" | "signal">,
  options: Pick<SendEmailOptions, "mailer"> = {},
): Promise<void> {
  // Names from the code, not from a person: safe in an error.
  if (!isEmailType(type)) throw new Error(`unknown email type "${type}"`);
  const { examples } = emails[type];
  // hasOwn: "toString" is not an example.
  const sample = Object.hasOwn(examples, example) ? examples[example] : null;
  if (!sample) throw new Error(`"${type}" has no example "${example}"`);

  const user = await getDb().user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || !isStaffRole(user.role)) return;

  await sendEmail(type, { to: user.email, props: sample.props }, context, {
    ...options,
    subjectPrefix: "Проверка: ",
  });
}
