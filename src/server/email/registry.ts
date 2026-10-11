import type { z } from "zod";
import { donationThanks } from "./emails/donation-thanks";

/**
 * Every kind of letter the site sends, by name. A new one: a file in
 * ./emails, an entry here, and an outbox event whose handler loads the data
 * and calls sendEmail() (docs/architecture.md#письма).
 */
export const emails = {
  "donation.thanks": donationThanks,
};

export type EmailType = keyof typeof emails;
/** What sendEmail() and renderEmail() take for a letter of this type. */
export type EmailProps<T extends EmailType> = z.input<
  (typeof emails)[T]["props"]
>;

export function isEmailType(type: string): type is EmailType {
  return Object.hasOwn(emails, type);
}
