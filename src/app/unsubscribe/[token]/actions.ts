"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db";
import { withdrawMarketingConsent } from "@/server/legal";

/**
 * Withdraws the newsletter consent behind an unsubscribe link. Open to
 * anyone: the token from the letter is the permission, and all it allows is
 * to stop the newsletter for its address. A repeated or unknown token
 * changes nothing; the page shows what is true now.
 */
export async function unsubscribe(token: string): Promise<void> {
  // The browser can send anything; a consent id is 24 characters.
  if (typeof token !== "string" || token.length > 64) return;
  await withdrawMarketingConsent(getDb(), token);
  refresh();
}
