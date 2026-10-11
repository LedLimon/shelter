import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  consentDocuments,
  ConsentError,
  consentEvidence,
  createLegalDraft,
  legalDraft,
  marketingConsentOf,
  marketingConsentState,
  publishedLegalVersions,
  recordConsents,
  withdrawMarketingConsent,
  type ConsentDocument,
  type PublishedLegalDocument,
} from "@/server/legal";
import { publishVersion } from "./helpers";

const refusal = (code: ConsentError["code"], type?: ConsentError["type"]) =>
  expect.objectContaining({ name: "ConsentError", code, type }) as unknown;

const evidence = consentEvidence(
  new Headers({
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    "user-agent": "Mozilla/5.0 (test)",
  }),
);

let emailCounter = 0;
/** A fresh address: tests of one file share the consent log. */
const newEmail = () => `donor-${(emailCounter += 1)}@example.ru`;

const recordsOf = (email: string) =>
  getDb().consentRecord.findMany({
    where: { email },
    orderBy: { document: { type: "asc" } },
    include: { document: { select: { type: true, version: true } } },
  });

let offer: PublishedLegalDocument;
let pdConsent: PublishedLegalDocument;
let marketing: PublishedLegalDocument;

beforeAll(async () => {
  offer = await publishVersion("OFFER");
  pdConsent = await publishVersion("PD_CONSENT");
  marketing = await publishVersion("MARKETING");
});

describe("consentDocuments", () => {
  it("gives the versions in force, in the order asked", async () => {
    // A draft of the next version is not something to consent to yet.
    await createLegalDraft(getDb(), "OFFER");

    const documents = await consentDocuments(getDb(), [
      "MARKETING",
      "OFFER",
      "PD_CONSENT",
    ]);

    expect(documents).toEqual<ConsentDocument[]>([
      { id: marketing.id, type: "MARKETING", version: marketing.version },
      { id: offer.id, type: "OFFER", version: offer.version },
      { id: pdConsent.id, type: "PD_CONSENT", version: pdConsent.version },
    ]);
  });

  it("leaves out a document that was never published", async () => {
    await createLegalDraft(getDb(), "RECURRING");

    expect(await consentDocuments(getDb(), ["RECURRING", "OFFER"])).toEqual([
      { id: offer.id, type: "OFFER", version: offer.version },
    ]);
  });
});

describe("recordConsents", () => {
  it("writes every consent with the version of its document, the context, IP and browser", async () => {
    const email = newEmail();

    const recorded = await recordConsents(getDb(), {
      consents: { OFFER: offer.id, PD_CONSENT: pdConsent.id, MARKETING: "" },
      required: ["OFFER", "PD_CONSENT"],
      subject: { email: ` ${email.toUpperCase()} ` },
      context: "donation:don_1",
      evidence,
    });

    const records = await recordsOf(email);
    expect(records).toHaveLength(2);
    expect(records).toMatchObject([
      {
        documentId: offer.id,
        document: { type: "OFFER", version: offer.version },
      },
      {
        documentId: pdConsent.id,
        document: { type: "PD_CONSENT", version: pdConsent.version },
      },
    ]);
    for (const record of records) {
      expect(record).toMatchObject({
        email,
        userId: null,
        context: "donation:don_1",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
        withdrawnAt: null,
      });
      // Given after the version came into force, by the same clock.
      expect(record.givenAt.getTime()).toBeGreaterThanOrEqual(
        offer.effectiveAt.getTime(),
      );
    }
    // The caller gets what to store with the donation (offerDocId).
    expect(recorded).toEqual([
      { ...versionOf(offer), consentId: records[0]!.id },
      { ...versionOf(pdConsent), consentId: records[1]!.id },
    ]);
    // Seen from the document: its version knows how many agreed to it.
    const [{ consents } = { consents: 0 }] = (
      await publishedLegalVersions(getDb(), "PD_CONSENT")
    ).filter(({ version }) => version === pdConsent.version);
    expect(consents).toBeGreaterThanOrEqual(1);
  });

  it("keeps a consent with the version it was given to after a new one is published", async () => {
    const email = newEmail();
    const before = await publishVersion("RECURRING");
    await recordConsents(getDb(), {
      consents: { RECURRING: before.id },
      required: ["RECURRING"],
      subject: { email },
      context: "donation:don_2",
      evidence,
    });

    const after = await publishVersion("RECURRING");
    await recordConsents(getDb(), {
      consents: { RECURRING: after.id },
      required: ["RECURRING"],
      subject: { email },
      context: "donation:don_3",
      evidence,
    });

    expect(
      (await recordsOf(email)).map(({ context, document }) => ({
        context,
        version: document.version,
      })),
    ).toEqual(
      expect.arrayContaining([
        { context: "donation:don_2", version: before.version },
        { context: "donation:don_3", version: after.version },
      ]),
    );
  });

  it("records a signed-in user's consent by the account", async () => {
    const user = await getDb().user.create({
      data: { email: newEmail(), name: "Донор" },
    });

    await recordConsents(getDb(), {
      consents: { PD_CONSENT: pdConsent.id },
      required: ["PD_CONSENT"],
      subject: { userId: user.id },
      context: "account",
      evidence: { ip: null, userAgent: null },
    });

    expect(
      await getDb().consentRecord.findMany({ where: { userId: user.id } }),
    ).toMatchObject([
      { documentId: pdConsent.id, email: null, ip: null, userAgent: null },
    ]);
  });

  it("refuses when a required box is not ticked, and writes nothing", async () => {
    const email = newEmail();

    for (const consents of [
      { OFFER: offer.id, PD_CONSENT: "" },
      { OFFER: offer.id },
    ]) {
      await expect(
        recordConsents(getDb(), {
          consents,
          required: ["OFFER", "PD_CONSENT"],
          subject: { email },
          context: "donation:don_4",
          evidence,
        }),
      ).rejects.toEqual(refusal("REQUIRED", "PD_CONSENT"));
    }

    expect(await recordsOf(email)).toEqual([]);
  });

  it("refuses a box ticked next to a version that is not in force", async () => {
    const email = newEmail();
    const shown = await publishVersion("PRIVACY");
    // The owner publishes the next version while the form is open.
    await publishVersion("PRIVACY");
    const draft = await createLegalDraft(getDb(), "PRIVACY");

    for (const id of [shown.id, draft.id, "no-such-document"]) {
      await expect(
        recordConsents(getDb(), {
          consents: { OFFER: offer.id, PRIVACY: id },
          required: ["OFFER"],
          subject: { email },
          context: "donation:don_5",
          evidence,
        }),
      ).rejects.toEqual(refusal("OUTDATED", "PRIVACY"));
    }

    // Not even the consent that was fine: the form is sent again as a whole.
    expect(await recordsOf(email)).toEqual([]);
  });

  it("needs someone to record the consent for", async () => {
    await expect(
      recordConsents(getDb(), {
        consents: { OFFER: offer.id },
        required: ["OFFER"],
        subject: { email: "  " },
        context: "donation:don_6",
        evidence,
      }),
    ).rejects.toEqual(refusal("NO_SUBJECT"));
  });

  it("writes nothing when no box is ticked and none is required", async () => {
    await expect(
      recordConsents(getDb(), {
        consents: { MARKETING: "" },
        required: [],
        subject: { email: newEmail() },
        context: "donation:don_7",
        evidence,
      }),
    ).resolves.toEqual([]);
  });
});

describe("the consent log in the database", () => {
  it("takes a consent only to a published version", async () => {
    const draft = await legalDraft(getDb(), "OFFER");

    await expect(
      getDb().consentRecord.create({
        data: { documentId: draft!.id, email: newEmail(), context: "test" },
      }),
    ).rejects.toThrow(/legal: a consent is given to a published version/);
  });

  it("needs an address or an account, and stores the address lowercased", async () => {
    const data = { documentId: offer.id, context: "test" };

    await expect(getDb().consentRecord.create({ data })).rejects.toThrow(
      /ConsentRecord_subject/,
    );
    await expect(
      getDb().consentRecord.create({
        data: { ...data, email: "Donor@Example.ru" },
      }),
    ).rejects.toThrow(/ConsentRecord_email_lowercase/);
  });

  it("keeps the version, context and time of a consent", async () => {
    const email = newEmail();
    const { id } = await getDb().consentRecord.create({
      data: { documentId: offer.id, email, context: "donation:don_8" },
    });
    const frozen = /legal: consent \w+ keeps the version, context and time/;

    await expect(
      getDb().consentRecord.update({
        where: { id },
        data: { documentId: pdConsent.id },
      }),
    ).rejects.toThrow(frozen);
    await expect(
      getDb().consentRecord.update({
        where: { id },
        data: { context: "donation:other" },
      }),
    ).rejects.toThrow(frozen);
    await expect(
      getDb().consentRecord.update({
        where: { id },
        data: { givenAt: new Date("2020-01-01T00:00:00Z") },
      }),
    ).rejects.toThrow(frozen);

    // Who gave it can be pseudonymized later (account deletion).
    await expect(
      getDb().consentRecord.update({
        where: { id },
        data: { ip: null, userAgent: null },
      }),
    ).resolves.toMatchObject({ documentId: offer.id });
  });
});

describe("withdrawing the newsletter consent", () => {
  async function subscribe(email: string, context: string) {
    const [recorded] = await recordConsents(getDb(), {
      consents: { MARKETING: marketing.id, PD_CONSENT: pdConsent.id },
      required: [],
      subject: { email },
      context,
      evidence,
    });
    return recorded!.consentId;
  }

  it("sets withdrawnAt on every newsletter consent of the address, and on nothing else", async () => {
    const email = newEmail();
    const other = newEmail();
    const first = await subscribe(email, "donation:don_9");
    await subscribe(email, "donation:don_10");
    const othersConsent = await subscribe(other, "donation:don_11");
    expect(await marketingConsentOf(getDb(), email)).not.toBeNull();
    expect(await marketingConsentState(getDb(), first)).toEqual({
      status: "given",
      email,
    });

    const withdrawn = await withdrawMarketingConsent(getDb(), first);

    expect(withdrawn).toBe(2);
    const records = await recordsOf(email);
    for (const record of records) {
      if (record.document.type === "MARKETING") {
        expect(record.withdrawnAt).toBeInstanceOf(Date);
        expect(record.withdrawnAt!.getTime()).toBeGreaterThanOrEqual(
          record.givenAt.getTime(),
        );
      } else {
        // The consent to personal data processing is another matter.
        expect(record.withdrawnAt).toBeNull();
      }
    }
    expect(
      records.filter(({ document }) => document.type === "MARKETING"),
    ).toHaveLength(2);
    // No more newsletters to this address; the other subscriber stays.
    expect(await marketingConsentOf(getDb(), email)).toBeNull();
    expect(await marketingConsentState(getDb(), first)).toEqual({
      status: "withdrawn",
      email,
    });
    expect(await marketingConsentOf(getDb(), other)).toEqual({
      id: othersConsent,
    });
  });

  it("changes nothing when the link is used again", async () => {
    const email = newEmail();
    const consentId = await subscribe(email, "donation:don_12");
    await withdrawMarketingConsent(getDb(), consentId);
    const [before] = await getDb().consentRecord.findMany({
      where: { id: consentId },
    });

    expect(await withdrawMarketingConsent(getDb(), consentId)).toBe(0);

    expect(
      await getDb().consentRecord.findUniqueOrThrow({
        where: { id: consentId },
      }),
    ).toEqual(before);
    // The database doesn't let a withdrawal be undone or re-dated either.
    for (const withdrawnAt of [null, new Date()]) {
      await expect(
        getDb().consentRecord.update({
          where: { id: consentId },
          data: { withdrawnAt },
        }),
      ).rejects.toThrow(/legal: consent \w+ is withdrawn for good/);
    }
  });

  it("consenting again after a withdrawal is a new consent", async () => {
    const email = newEmail();
    await withdrawMarketingConsent(
      getDb(),
      await subscribe(email, "donation:don_13"),
    );

    const again = await subscribe(email, "donation:don_14");

    expect(await marketingConsentOf(getDb(), email)).toEqual({ id: again });
  });

  it("does nothing for an unknown link or a consent of another kind", async () => {
    const email = newEmail();
    const [recorded] = await recordConsents(getDb(), {
      consents: { PD_CONSENT: pdConsent.id },
      required: [],
      subject: { email },
      context: "donation:don_15",
      evidence,
    });

    expect(await withdrawMarketingConsent(getDb(), "no-such-consent")).toBe(0);
    expect(await withdrawMarketingConsent(getDb(), recorded!.consentId)).toBe(
      0,
    );
    expect(await marketingConsentState(getDb(), recorded!.consentId)).toEqual({
      status: "unknown",
    });
    expect((await recordsOf(email))[0]).toMatchObject({ withdrawnAt: null });
  });
});

function versionOf({ id, type, version }: PublishedLegalDocument) {
  return { id, type, version };
}
