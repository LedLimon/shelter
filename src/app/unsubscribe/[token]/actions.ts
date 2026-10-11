"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { withdrawMarketingConsent } from "@/server/legal";

// The browser can send anything; a consent id is 24 characters.
const tokenSchema = z.string().min(1).max(64);

/**
 * Withdraws the newsletter consent behind an unsubscribe link. The one kind
 * of action without can(): there is no user, the token from the letter is
 * the permission, and all it allows is to stop the newsletter for its
 * address. A repeated or unknown token changes nothing; the page shows what
 * is true now.
 */
export async function unsubscribe(token: string): Promise<void> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return;
  await withdrawMarketingConsent(getDb(), parsed.data);
  refresh();
}
