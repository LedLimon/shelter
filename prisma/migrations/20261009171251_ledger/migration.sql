-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('GENERAL_FUND', 'NEED', 'DONATIONS_IN', 'EXPENSES_OUT', 'REFUNDS_OUT', 'FEES_OUT', 'IN_KIND_IN', 'IN_KIND_USED');

-- CreateEnum
CREATE TYPE "LedgerTransactionKind" AS ENUM ('DONATION', 'OVERFLOW', 'ALLOCATE_FROM_GENERAL', 'EXPENSE', 'LEFTOVER_TO_GENERAL', 'SHORTFALL_COVER', 'REFUND', 'FEE', 'IN_KIND', 'CANCEL_TO_GENERAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "MonthlyReportStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "needId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "kind" "LedgerTransactionKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),
    "publicMemo" TEXT,
    "reversesId" TEXT,
    "actorId" TEXT,
    "createdXid" xid8 NOT NULL DEFAULT pg_current_xact_id(),

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountKop" INTEGER NOT NULL,
    "postedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "MonthlyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_needId_key" ON "LedgerAccount"("needId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_seq_key" ON "LedgerTransaction"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reversesId_key" ON "LedgerTransaction"("reversesId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_actorId_idx" ON "LedgerTransaction"("actorId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_postedAt_idx" ON "LedgerTransaction"("postedAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_postedAt_idx" ON "LedgerEntry"("accountId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_period_key" ON "MonthlyReport"("period");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- =============================================================================
-- Ledger invariants (docs/ledger.md#инварианты). Prisma can't express CHECKs,
-- triggers or exclusion constraints, so they live here. Messages start with
-- "ledger:"; the module and the tests rely on that.
-- =============================================================================

-- Shape -----------------------------------------------------------------------

-- System accounts: one per kind, id = code = kind, so code names them by a
-- constant. NEED accounts: one per need (needId is unique), code "need:{needId}".
-- coalesce: a CHECK that evaluates to NULL passes.
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_shape" CHECK (
  coalesce(
    CASE WHEN "kind" = 'NEED'
      THEN "needId" IS NOT NULL AND "needId" <> '' AND "code" = 'need:' || "needId"
      ELSE "needId" IS NULL AND "id" = "kind"::text AND "code" = "kind"::text
    END,
    false
  )
);

ALTER TABLE "LedgerTransaction"
  ADD CONSTRAINT "LedgerTransaction_idempotencyKey_not_blank"
    CHECK (btrim("idempotencyKey") <> ''),
  -- Only a REVERSAL points at a transaction, and it always does.
  ADD CONSTRAINT "LedgerTransaction_reversal_shape"
    CHECK (("kind" = 'REVERSAL') = ("reversesId" IS NOT NULL)),
  ADD CONSTRAINT "LedgerTransaction_not_self_reversal"
    CHECK ("reversesId" <> "id");

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_not_zero"
  CHECK ("amountKop" <> 0);

ALTER TABLE "MonthlyReport"
  ADD CONSTRAINT "MonthlyReport_period_format"
    CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "MonthlyReport_period_bounds"
    CHECK ("periodStart" < "periodEnd"),
  -- An instant belongs to at most one report.
  ADD CONSTRAINT "MonthlyReport_no_overlap"
    EXCLUDE USING gist (tstzrange("periodStart", "periodEnd") WITH &&);

-- System accounts ---------------------------------------------------------------

-- Created here, not by the seed: every database with the ledger has them.
INSERT INTO "LedgerAccount" ("id", "code", "kind")
SELECT kind, kind, kind::"LedgerAccountKind"
FROM unnest(ARRAY[
  'GENERAL_FUND', 'DONATIONS_IN', 'EXPENSES_OUT', 'REFUNDS_OUT', 'FEES_OUT',
  'IN_KIND_IN', 'IN_KIND_USED'
]) AS kind;

-- Append-only -------------------------------------------------------------------

-- Statement-level, so even an UPDATE or DELETE that matches no rows fails, and
-- TRUNCATE (which skips row triggers) is covered too.
CREATE FUNCTION ledger_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger: % on "%" is forbidden: the ledger is append-only, a mistake is corrected with a reversal',
    TG_OP, TG_TABLE_NAME;
END
$$;

CREATE TRIGGER "LedgerAccount_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "LedgerAccount"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();

CREATE TRIGGER "LedgerTransaction_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "LedgerTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();

CREATE TRIGGER "LedgerEntry_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();

-- Closed months -----------------------------------------------------------------

-- The period lock (an advisory lock, so no table privileges are needed): every
-- posting holds it shared until its commit, a publication takes it
-- exclusively. A publication thus waits for the postings in flight, and new
-- postings wait for it, then see the month closed. The number is arbitrary;
-- the keys in use are listed in docs/architecture.md («Доступ к БД»).
CREATE FUNCTION ledger_period_lock_key() RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$ SELECT 3700000001::bigint $$;

-- Fails if posted_at falls in a month with a published report.
CREATE FUNCTION ledger_assert_period_open(posted_at timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  closed_period text;
BEGIN
  -- REPEATABLE READ and SERIALIZABLE keep the snapshot of the transaction's
  -- first query, which may predate a publication: the check would miss it.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'ledger: post in a READ COMMITTED transaction, not %',
      current_setting('transaction_isolation');
  END IF;
  PERFORM pg_advisory_xact_lock_shared(ledger_period_lock_key());
  -- A new query, a new snapshot: it sees a publication that committed while
  -- we waited for the lock.
  SELECT "period" INTO closed_period
    FROM "MonthlyReport"
   WHERE "status" = 'PUBLISHED'
     AND "periodStart" <= posted_at AND posted_at < "periodEnd";
  IF FOUND THEN
    RAISE EXCEPTION 'ledger: the report for % is published, nothing can be posted in that month',
      closed_period;
  END IF;
END
$$;

-- Publishing closes a month that is over; a published report is final.
CREATE FUNCTION monthly_report_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."status" = 'PUBLISHED' THEN
    -- Every column is frozen but updatedAt. Columns that may change after
    -- publication (REP-1: commentary?) are listed here explicitly.
    IF TG_OP = 'DELETE'
       OR (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt') THEN
      RAISE EXCEPTION 'ledger: the report for % is published, its month stays closed',
        OLD."period";
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW."status" = 'PUBLISHED'
     AND (TG_OP = 'INSERT' OR OLD."status" <> 'PUBLISHED') THEN
    -- A month published early would reject every posting until it ends,
    -- webhooks included, and can't be reopened.
    IF NEW."periodEnd" > transaction_timestamp() THEN
      RAISE EXCEPTION 'ledger: % lasts until %, it can''t be published before',
        NEW."period", NEW."periodEnd";
    END IF;
    -- The report's figures must include every posting of the month: the
    -- publishing transaction takes the period lock before computing them
    -- (it waits for postings in flight), and in READ COMMITTED, whose
    -- queries see what committed while it waited.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'ledger: publish in a READ COMMITTED transaction, not %',
        current_setting('transaction_isolation');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_locks
       WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted
         AND mode = 'ExclusiveLock' AND objsubid = 1
         AND (classid::bigint << 32 | objid::bigint) = ledger_period_lock_key()
    ) THEN
      RAISE EXCEPTION 'ledger: take the period lock first (SELECT pg_advisory_xact_lock(ledger_period_lock_key())), then compute the report and publish it';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "MonthlyReport_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "MonthlyReport"
  FOR EACH ROW EXECUTE FUNCTION monthly_report_guard();

CREATE TRIGGER "MonthlyReport_no_truncate"
  BEFORE TRUNCATE ON "MonthlyReport"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();

-- New transactions and entries --------------------------------------------------

-- Both columns come from the database's defaults, any other value is refused:
-- - postedAt is the start time of the database transaction
--   (transaction_timestamp(), same as now()), so nothing is backdated;
-- - createdXid is the database transaction's id (top-level, also inside a
--   savepoint), so only that transaction can add entries.
CREATE FUNCTION ledger_transaction_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."postedAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
    RAISE EXCEPTION 'ledger: "postedAt" is set by the database, don''t pass it';
  END IF;
  IF NEW."createdXid" IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'ledger: "createdXid" is set by the database, don''t pass it';
  END IF;
  PERFORM ledger_assert_period_open(NEW."postedAt");
  IF NEW."reversesId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "LedgerTransaction"
     WHERE "id" = NEW."reversesId" AND "kind" = 'REVERSAL'
  ) THEN
    RAISE EXCEPTION 'ledger: a reversal can''t be reversed (%)', NEW."reversesId";
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "LedgerTransaction_before_insert"
  BEFORE INSERT ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION ledger_transaction_before_insert();

-- An entry joins only a transaction created by the same database transaction:
-- a committed transaction can't gain entries later. It carries its
-- transaction's postedAt.
CREATE FUNCTION ledger_entry_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx record;
BEGIN
  SELECT "postedAt", "createdXid" INTO tx
    FROM "LedgerTransaction" WHERE "id" = NEW."transactionId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger: transaction % not found', NEW."transactionId";
  END IF;
  -- postedAt too: after a logical restore into a new cluster, transaction ids
  -- start over and an old createdXid may come up again.
  IF tx."createdXid" IS DISTINCT FROM pg_current_xact_id()
     OR tx."postedAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
    RAISE EXCEPTION 'ledger: entries are added only together with their transaction, in the database transaction that created it (%)',
      NEW."transactionId";
  END IF;
  IF NEW."postedAt" IS DISTINCT FROM tx."postedAt" THEN
    RAISE EXCEPTION 'ledger: an entry''s "postedAt" must equal its transaction''s (%)',
      NEW."transactionId";
  END IF;
  PERFORM ledger_assert_period_open(tx."postedAt");
  RETURN NEW;
END
$$;

CREATE TRIGGER "LedgerEntry_before_insert"
  BEFORE INSERT ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_before_insert();

-- Balance -----------------------------------------------------------------------

-- At commit, for every new transaction and every new entry's transaction: at
-- least two entries, summing to zero; a REVERSAL mirrors exactly the entries
-- of the transaction it reverses. Deferred: entries are inserted after their
-- transaction, one statement at a time.
CREATE FUNCTION ledger_check_transaction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id text;
  reverses_id text;
  entry_count bigint;
  total_kop bigint;
BEGIN
  IF TG_TABLE_NAME = 'LedgerTransaction' THEN
    tx_id := NEW."id";
  ELSE
    tx_id := NEW."transactionId";
  END IF;

  SELECT t."reversesId", count(e."id"), coalesce(sum(e."amountKop"), 0)
    INTO reverses_id, entry_count, total_kop
    FROM "LedgerTransaction" t
    LEFT JOIN "LedgerEntry" e ON e."transactionId" = t."id"
   WHERE t."id" = tx_id
   GROUP BY t."id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger: transaction % not found', tx_id;
  END IF;

  IF entry_count < 2 THEN
    RAISE EXCEPTION 'ledger: transaction % has % entries, at least 2 are needed',
      tx_id, entry_count;
  END IF;
  IF total_kop <> 0 THEN
    RAISE EXCEPTION 'ledger: transaction % is unbalanced, its entries sum to % kop',
      tx_id, total_kop;
  END IF;

  IF reverses_id IS NOT NULL AND EXISTS (
    (SELECT "accountId", -("amountKop"::bigint) FROM "LedgerEntry"
      WHERE "transactionId" = reverses_id
     EXCEPT ALL
     SELECT "accountId", "amountKop"::bigint FROM "LedgerEntry"
      WHERE "transactionId" = tx_id)
    UNION ALL
    (SELECT "accountId", "amountKop"::bigint FROM "LedgerEntry"
      WHERE "transactionId" = tx_id
     EXCEPT ALL
     SELECT "accountId", -("amountKop"::bigint) FROM "LedgerEntry"
      WHERE "transactionId" = reverses_id)
  ) THEN
    RAISE EXCEPTION 'ledger: reversal % doesn''t mirror the entries of %',
      tx_id, reverses_id;
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "LedgerTransaction_balanced"
  AFTER INSERT ON "LedgerTransaction"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_transaction();

CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced"
  AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_transaction();
