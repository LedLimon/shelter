import type { ReactElement } from "react";
import type { z } from "zod";
import type { EmailContext } from "./context";
import type { EmailLinks } from "./layout";

export type EmailTemplateProps<Props> = {
  props: Props;
  context: EmailContext;
  links: EmailLinks;
};

/**
 * A kind of letter: what it is written from and how it reads. Pure — no
 * database, no environment: the outbox handler that sends the letter loads
 * its data (src/server/jobs/handlers.ts).
 */
export type EmailDefinition<Schema extends z.ZodType = z.ZodType> = {
  /**
   * Shape of the data. Checked before every render, so a handler's mistake
   * (a fractional amount, a missing title) fails the send instead of
   * reaching a reader.
   */
  props: Schema;
  subject: (props: z.output<Schema>, context: EmailContext) => string;
  Template: (args: EmailTemplateProps<z.output<Schema>>) => ReactElement;
  /**
   * Links to manage a subscription or leave a mailing list, for letters that
   * have them: shown under the sheet, `unsubscribe` also goes out as the
   * List-Unsubscribe header. Letters about a payment have none.
   */
  links?: (props: z.output<Schema>, context: EmailContext) => EmailLinks;
  /**
   * Sample data by name, the first one the default: the dev preview
   * (/dev/email), the tests and the «email.test» event send these. Made-up
   * values only.
   */
  examples: Record<string, { label: string; props: z.input<Schema> }>;
};

// Keeps each letter's own props type, where `satisfies` alone would do too:
// the call reads as a declaration and checks the examples.
export function defineEmail<Schema extends z.ZodType>(
  definition: EmailDefinition<Schema>,
): EmailDefinition<Schema> {
  return definition;
}
