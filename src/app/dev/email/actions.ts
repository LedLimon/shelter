"use server";

import { getDb } from "@/server/db";
import { emails, isEmailType } from "@/server/email/registry";
import { outbox } from "@/server/jobs";
import { assertDevelopment } from "../dev-only";

export type SendSampleState = { ok: boolean; message: string } | null;

/**
 * «Отправить образец»: queues the «email.test» event for the owner from the
 * seed. No staff permission to check — like the page, the action exists only
 * in `next dev` (assertDevelopment() answers 404 anywhere else) — and it
 * sends nothing itself: the worker does.
 */
export async function sendSample(
  _previous: SendSampleState,
  formData: FormData,
): Promise<SendSampleState> {
  assertDevelopment();
  const template = formData.get("template");
  const example = formData.get("example");
  if (
    typeof template !== "string" ||
    typeof example !== "string" ||
    !isEmailType(template) ||
    !Object.hasOwn(emails[template].examples, example)
  ) {
    return { ok: false, message: "Такого письма или примера нет." };
  }

  const db = getDb();
  const owner = await db.user.findFirst({
    where: { role: "OWNER", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!owner) {
    return {
      ok: false,
      message: "В базе нет владельца. Выполните pnpm db:seed и повторите.",
    };
  }

  await outbox.enqueue(db, "email.test", {
    template,
    example,
    userId: owner.id,
  });
  return {
    ok: true,
    message:
      "Образец в очереди. Его отправит воркер (pnpm worker), письмо придёт в Mailpit на адрес владельца.",
  };
}
