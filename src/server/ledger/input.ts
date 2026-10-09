// Argument checks of the ledger API. Pure: unit-tested without a database.
import { z } from "zod";
import { LedgerTransactionKind } from "@/generated/prisma/enums";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { LedgerError } from "./errors";

/** Every kind except REVERSAL, which only reverse() posts. */
export type PostKind = Exclude<LedgerTransactionKind, "REVERSAL">;

export type LedgerEntryInput = {
  accountId: string;
  /**
   * Signed integer kopecks, never zero: "−" at the source account, "+" at the
   * receiver (docs/ledger.md#таблица-проводок).
   */
  amountKop: number;
};

export type PostInput = {
  kind: PostKind;
  /**
   * Deterministic per business event: "donation:{id}", "overflow:{id}",
   * "expense:{id}", "refund:{donationId}:{n}"… A repeated post with the same
   * key and the same entries is a no-op; with other entries it throws.
   */
  idempotencyKey: string;
  /** Two or more, summing to zero. */
  entries: readonly LedgerEntryInput[];
  /** Shown in the public ledger: no personal data. */
  publicMemo?: string;
  /**
   * When the event happened, e.g. paid at the provider (default: now). May
   * fall in a closed month; postedAt is always the database's now.
   */
  occurredAt?: Date;
  /** Records the transaction refers to. */
  links?: {
    /** The staff member who posted it; none for webhooks and jobs. */
    actorId?: string;
  };
};

export type ReverseInput = {
  transactionId: string;
  /** Why the transaction is undone; public, like publicMemo. */
  reason: string;
  actorId?: string;
};

const id = z.string().min(1).max(200);

const amountKop = z
  .int()
  .min(-MAX_AMOUNT_KOP)
  .max(MAX_AMOUNT_KOP)
  .refine((kop) => kop !== 0, "an entry can't be zero");

const publicText = z
  .string()
  .max(1000)
  .refine((text) => text.trim() !== "", "must not be blank");

const postInputSchema: z.ZodType<PostInput> = z.strictObject({
  kind: z.enum(LedgerTransactionKind).exclude(["REVERSAL"], {
    error: "a REVERSAL is posted by reverse(), with any other kind",
  }),
  // Printable ASCII without spaces: keys are built from ids, not typed.
  idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,200}$/),
  entries: z
    .array(z.strictObject({ accountId: id, amountKop }))
    .min(2)
    .max(100)
    .refine(
      (entries) => entries.reduce((sum, e) => sum + e.amountKop, 0) === 0,
      "entries must sum to zero",
    ),
  publicMemo: publicText.optional(),
  occurredAt: z.date().optional(),
  links: z.strictObject({ actorId: id.optional() }).optional(),
});

const reverseInputSchema: z.ZodType<ReverseInput> = z.strictObject({
  transactionId: id,
  reason: publicText,
  actorId: id.optional(),
});

const needIdSchema = id;

function parse<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new LedgerError(
      "INVALID_INPUT",
      `invalid ${what}:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function parsePostInput(input: unknown): PostInput {
  return parse(postInputSchema, input, "post() input");
}

export function parseReverseInput(input: unknown): ReverseInput {
  return parse(reverseInputSchema, input, "reverse() input");
}

export function parseNeedId(input: unknown): string {
  return parse(needIdSchema, input, "needId");
}
