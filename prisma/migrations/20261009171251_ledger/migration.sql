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

-- 1. Append-only ---------------------------------------------------------------

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

-- 3. Closed months -------------------------------------------------------------

-- Fails if posted_at falls in a month with a published report. FOR SHARE on the
-- report row: a publication running concurrently either commits first (then
-- we see PUBLISHED and fail) or waits for our commit.
CREATE FUNCTION ledger_assert_period_open(posted_at timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  report record;
BEGIN
  SELECT "period", "status" INTO report
    FROM "MonthlyReport"
   WHERE "periodStart" <= posted_at AND posted_at < "periodEnd"
     FOR SHARE;
  IF FOUND AND report."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'ledger: the report for % is published, nothing can be posted in that month',
      report."period";
  END IF;
END
$$;

-- A published report is final: its month can't be reopened or moved.
CREATE FUNCTION monthly_report_keep_published() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' AND (
       TG_OP = 'DELETE'
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."period" IS DISTINCT FROM OLD."period"
       OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart"
       OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd"
     ) THEN
    RAISE EXCEPTION 'ledger: the report for % is published, its month stays closed',
      OLD."period";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "MonthlyReport_keep_published"
  BEFORE UPDATE OR DELETE ON "MonthlyReport"
  FOR EACH ROW EXECUTE FUNCTION monthly_report_keep_published();

CREATE TRIGGER "MonthlyReport_no_truncate"
  BEFORE TRUNCATE ON "MonthlyReport"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();

-- New transactions -------------------------------------------------------------

-- postedAt is the start time of the database transaction (the column default
-- transaction_timestamp(), same as now()): the application can't backdate a
-- posting into a closed month.
CREATE FUNCTION ledger_transaction_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."postedAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
    RAISE EXCEPTION 'ledger: "postedAt" is set by the database, don''t pass it';
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

-- Remembers the transactions inserted by the current database transaction in
-- a transaction-local setting (reset at commit or rollback, rolled back with a
-- savepoint). AFTER, so a row skipped by ON CONFLICT DO NOTHING isn't listed.
CREATE FUNCTION ledger_transaction_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'shelter.ledger_new_transactions',
    coalesce(nullif(current_setting('shelter.ledger_new_transactions', true), ''), ',')
      || NEW."id" || ',',
    true
  );
  RETURN NULL;
END
$$;

CREATE TRIGGER "LedgerTransaction_after_insert"
  AFTER INSERT ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION ledger_transaction_after_insert();

-- An entry joins only a transaction created in the same database transaction:
-- a committed transaction can't gain entries later. It carries its
-- transaction's postedAt.
CREATE FUNCTION ledger_entry_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  posted_at timestamptz;
BEGIN
  IF position(
    ',' || NEW."transactionId" || ','
    IN coalesce(current_setting('shelter.ledger_new_transactions', true), '')
  ) = 0 THEN
    RAISE EXCEPTION 'ledger: entries are added only together with their transaction, in the database transaction that created it (%)',
      NEW."transactionId";
  END IF;
  SELECT "postedAt" INTO posted_at
    FROM "LedgerTransaction" WHERE "id" = NEW."transactionId";
  IF NEW."postedAt" IS DISTINCT FROM posted_at THEN
    RAISE EXCEPTION 'ledger: an entry''s "postedAt" must equal its transaction''s (%)',
      NEW."transactionId";
  END IF;
  PERFORM ledger_assert_period_open(posted_at);
  RETURN NEW;
END
$$;

CREATE TRIGGER "LedgerEntry_before_insert"
  BEFORE INSERT ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_before_insert();

-- 2. Balance -------------------------------------------------------------------

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
