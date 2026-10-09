import type { LedgerTransactionKind, Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { LedgerError } from "./errors";
import {
  parsePostInput,
  parseReverseInput,
  type LedgerEntryInput,
  type PostInput,
  type ReverseInput,
} from "./input";

export type PostResult = {
  transactionId: string;
  postedAt: Date;
  /**
   * false: the idempotency key was already posted (a repeated webhook, a
   * retry) and nothing was written — don't apply side effects again.
   */
  created: boolean;
};

type NewTransaction = {
  kind: LedgerTransactionKind;
  idempotencyKey: string;
  entries: readonly LedgerEntryInput[];
  publicMemo?: string;
  occurredAt?: Date;
  actorId?: string;
  reversesId?: string;
};

/**
 * Posts a balanced transaction. Idempotent by idempotencyKey: a repeated call,
 * including a concurrent one, returns the existing transaction with
 * created: false. Must run inside the caller's db.$transaction, together with
 * the business change it records (lock rows first: Donation → Need →
 * Subscription).
 */
export async function post(tx: Db, input: PostInput): Promise<PostResult> {
  assertTransaction(tx, "post");
  const { links, ...data } = parsePostInput(input);
  return insertTransaction(tx, { ...data, actorId: links?.actorId });
}

/**
 * Undoes a transaction with a REVERSAL: the same entries with opposite signs,
 * posted now (the original stays, also in a closed month). A transaction is
 * reversed at most once: a repeated call returns the existing reversal with
 * created: false.
 */
export async function reverse(
  tx: Db,
  transactionId: string,
  reason: string,
  options: { actorId?: string } = {},
): Promise<PostResult> {
  assertTransaction(tx, "reverse");
  const input: ReverseInput = parseReverseInput({
    transactionId,
    reason,
    ...options,
  });

  const original = await tx.ledgerTransaction.findUnique({
    where: { id: input.transactionId },
    select: {
      kind: true,
      entries: { select: { accountId: true, amountKop: true } },
    },
  });
  if (!original) {
    throw new LedgerError(
      "UNKNOWN_TRANSACTION",
      `transaction ${input.transactionId} not found`,
    );
  }
  if (original.kind === "REVERSAL") {
    throw new LedgerError(
      "REVERSAL_OF_REVERSAL",
      `transaction ${input.transactionId} is a reversal itself; post the original again instead`,
    );
  }

  return insertTransaction(tx, {
    kind: "REVERSAL",
    idempotencyKey: `reversal:${input.transactionId}`,
    entries: original.entries.map((entry) => ({
      accountId: entry.accountId,
      amountKop: -entry.amountKop,
    })),
    publicMemo: input.reason,
    actorId: input.actorId,
    reversesId: input.transactionId,
  });
}

async function insertTransaction(
  tx: Prisma.TransactionClient,
  data: NewTransaction,
): Promise<PostResult> {
  await assertAccountsExist(tx, data.entries);

  // ON CONFLICT DO NOTHING instead of create() + catching P2002: a failed
  // statement would abort the caller's transaction. A concurrent post with
  // the same key waits here until the other transaction ends.
  const [created] = await tx.ledgerTransaction.createManyAndReturn({
    data: [
      {
        kind: data.kind,
        idempotencyKey: data.idempotencyKey,
        publicMemo: data.publicMemo,
        occurredAt: data.occurredAt,
        actorId: data.actorId,
        reversesId: data.reversesId,
      },
    ],
    skipDuplicates: true,
    select: { id: true, postedAt: true },
  });
  if (!created) return existingTransaction(tx, data);

  await tx.ledgerEntry.createMany({
    data: data.entries.map((entry) => ({
      transactionId: created.id,
      accountId: entry.accountId,
      amountKop: entry.amountKop,
      postedAt: created.postedAt,
    })),
  });
  return {
    transactionId: created.id,
    postedAt: created.postedAt,
    created: true,
  };
}

/** The transaction that took the key, if it's the same one; else throws. */
async function existingTransaction(
  tx: Prisma.TransactionClient,
  data: NewTransaction,
): Promise<PostResult> {
  const select = {
    id: true,
    kind: true,
    postedAt: true,
    reversesId: true,
    entries: { select: { accountId: true, amountKop: true } },
  } as const;
  const existing =
    (await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select,
    })) ??
    // The other unique column a new transaction can collide on.
    (data.reversesId
      ? await tx.ledgerTransaction.findUnique({
          where: { reversesId: data.reversesId },
          select,
        })
      : null);

  if (
    !existing ||
    existing.kind !== data.kind ||
    existing.reversesId !== (data.reversesId ?? null) ||
    !sameEntries(existing.entries, data.entries)
  ) {
    throw new LedgerError(
      "IDEMPOTENCY_CONFLICT",
      `idempotency key ${data.idempotencyKey} is taken by a different transaction` +
        (existing ? ` (${existing.id})` : ""),
    );
  }
  return {
    transactionId: existing.id,
    postedAt: existing.postedAt,
    created: false,
  };
}

/** Equal as multisets of (account, amount). */
function sameEntries(
  a: readonly LedgerEntryInput[],
  b: readonly LedgerEntryInput[],
): boolean {
  const key = (entries: readonly LedgerEntryInput[]) =>
    entries
      .map((entry) => `${entry.accountId} ${entry.amountKop}`)
      .sort()
      .join("\n");
  return a.length === b.length && key(a) === key(b);
}

async function assertAccountsExist(
  tx: Prisma.TransactionClient,
  entries: readonly LedgerEntryInput[],
): Promise<void> {
  const ids = [...new Set(entries.map((entry) => entry.accountId))];
  const found = await tx.ledgerAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    const known = new Set(found.map((account) => account.id));
    const missing = ids.filter((id) => !known.has(id));
    throw new LedgerError(
      "UNKNOWN_ACCOUNT",
      `unknown account ${missing.join(", ")}`,
    );
  }
}

/**
 * Db doesn't tell the client from a transaction. Outside a transaction each
 * statement would commit on its own: the transaction without its entries.
 * The transaction client has no $disconnect.
 */
function assertTransaction(
  db: Db,
  operation: string,
): asserts db is Prisma.TransactionClient {
  if ("$disconnect" in db) {
    throw new LedgerError(
      "NOT_IN_TRANSACTION",
      `${operation}() writes several rows and must run inside db.$transaction()`,
    );
  }
}
