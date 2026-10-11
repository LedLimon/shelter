-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('OFFER', 'PRIVACY', 'PD_CONSENT', 'RECURRING', 'MARKETING');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "documentId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "givenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),
    "withdrawnAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_type_version_key" ON "LegalDocument"("type", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE INDEX "ConsentRecord_documentId_idx" ON "ConsentRecord"("documentId");

-- CreateIndex
CREATE INDEX "ConsentRecord_email_idx" ON "ConsentRecord"("email");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Legal invariants (docs/legal.md). Prisma can't express CHECKs, partial
-- indexes or triggers, so they live here. Messages start with "legal:"; the
-- tests rely on that. To roll back:
--   DROP TABLE "ConsentRecord", "LegalDocument";
--   DROP TYPE "LegalDocumentType";
--   DROP FUNCTION legal_document_guard(), legal_document_forbid_truncate(),
--     consent_record_guard(), consent_record_forbid_truncate();
-- =============================================================================

-- Documents ---------------------------------------------------------------------

ALTER TABLE "LegalDocument"
  ADD CONSTRAINT "LegalDocument_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "LegalDocument_body_not_blank" CHECK ("body" ~ '\S'),
  -- The hash is of the stored text, whoever wrote the row.
  ADD CONSTRAINT "LegalDocument_sha256_of_body"
    CHECK ("sha256" = encode(sha256(convert_to("body", 'UTF8')), 'hex'));

-- One draft per type: the next version is prepared in one place.
CREATE UNIQUE INDEX "LegalDocument_one_draft_per_type"
  ON "LegalDocument" ("type") WHERE "effectiveAt" IS NULL;

-- A published version is final: consents and donations point at its text.
CREATE FUNCTION legal_document_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."effectiveAt" IS NOT NULL THEN
    RAISE EXCEPTION 'legal: version % of % is published, it can''t be changed or deleted; publish a new version instead',
      OLD."version", OLD."type";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."effectiveAt" IS NOT NULL THEN
    -- In force from the moment of publication by this database's clock:
    -- nothing is backdated, so «which version was in force then» has one answer.
    IF NEW."effectiveAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
      RAISE EXCEPTION 'legal: "effectiveAt" is the moment of publication, set it to transaction_timestamp()';
    END IF;
    -- Versions are published in order, without gaps. Two drafts of a type
    -- never exist at once, so two publications can't race here.
    IF NEW."version" <> 1 + (
      SELECT coalesce(max("version"), 0)
        FROM "LegalDocument"
       WHERE "type" = NEW."type" AND "effectiveAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'legal: version % of % can''t be published, the next one in order is expected',
        NEW."version", NEW."type";
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "LegalDocument_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "LegalDocument"
  FOR EACH ROW EXECUTE FUNCTION legal_document_guard();

-- TRUNCATE skips row triggers.
CREATE FUNCTION legal_document_forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legal: TRUNCATE on "LegalDocument" is forbidden: published versions are kept for good';
END
$$;

CREATE TRIGGER "LegalDocument_no_truncate"
  BEFORE TRUNCATE ON "LegalDocument"
  FOR EACH STATEMENT EXECUTE FUNCTION legal_document_forbid_truncate();

-- Consents ----------------------------------------------------------------------

ALTER TABLE "ConsentRecord"
  -- Someone gave it: an address, an account, or both.
  ADD CONSTRAINT "ConsentRecord_subject"
    CHECK ("email" IS NOT NULL OR "userId" IS NOT NULL),
  -- Compared as stored, like "User"."email".
  ADD CONSTRAINT "ConsentRecord_email_lowercase"
    CHECK ("email" = lower("email")),
  ADD CONSTRAINT "ConsentRecord_context_not_blank" CHECK ("context" ~ '\S'),
  ADD CONSTRAINT "ConsentRecord_withdrawn_after_given"
    CHECK ("withdrawnAt" >= "givenAt");

-- A consent is evidence of what was agreed to and when: it is given to a
-- published version at the database's time, stays with it, and is never
-- deleted. Withdrawing it sets "withdrawnAt", once. What identifies the
-- person (email, userId, ip, userAgent) may still be updated.
CREATE FUNCTION consent_record_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal: consent % can''t be deleted: the log of consents is kept as evidence',
      OLD."id";
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
       OR NEW."context" IS DISTINCT FROM OLD."context"
       OR NEW."givenAt" IS DISTINCT FROM OLD."givenAt" THEN
      RAISE EXCEPTION 'legal: consent % keeps the version, context and time it was given with',
        OLD."id";
    END IF;
    IF NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt" THEN
      IF OLD."withdrawnAt" IS NOT NULL THEN
        RAISE EXCEPTION 'legal: consent % is withdrawn for good; consenting again is a new record',
          OLD."id";
      END IF;
      IF NEW."withdrawnAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
        RAISE EXCEPTION 'legal: "withdrawnAt" is the moment of withdrawal, set it to transaction_timestamp()';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Given now, by this database's clock: the same one that dates the
  -- publication of the version, so the two can be compared.
  IF NEW."givenAt" IS DISTINCT FROM transaction_timestamp()::timestamptz(3) THEN
    RAISE EXCEPTION 'legal: "givenAt" is set by the database, don''t pass it';
  END IF;
  IF NEW."withdrawnAt" IS NOT NULL THEN
    RAISE EXCEPTION 'legal: a consent is recorded as given; withdrawing it is a separate step';
  END IF;
  -- A draft can still change, so there is nothing to consent to yet. A
  -- published version never goes back to a draft: no lock is needed.
  IF NOT EXISTS (
    SELECT 1 FROM "LegalDocument"
     WHERE "id" = NEW."documentId" AND "effectiveAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'legal: a consent is given to a published version, % is not one',
      NEW."documentId";
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ConsentRecord_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ConsentRecord"
  FOR EACH ROW EXECUTE FUNCTION consent_record_guard();

-- TRUNCATE skips row triggers.
CREATE FUNCTION consent_record_forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legal: TRUNCATE on "ConsentRecord" is forbidden: the log of consents is kept as evidence';
END
$$;

CREATE TRIGGER "ConsentRecord_no_truncate"
  BEFORE TRUNCATE ON "ConsentRecord"
  FOR EACH STATEMENT EXECUTE FUNCTION consent_record_forbid_truncate();
