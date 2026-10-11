import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  createLegalDraft,
  currentLegalDocument,
  deleteLegalDraft,
  legalDocumentStates,
  legalDraft,
  LegalError,
  publishedLegalDocument,
  publishedLegalVersions,
  publishLegalDraft,
  saveLegalDraft,
  sha256Of,
} from "@/server/legal";
import { LEGAL_STUBS } from "@/server/legal/stubs";
import { publishVersion, uniqueBody } from "./helpers";

const PUBLISHED = /legal: version \d+ of \w+ is published/;

const refusal = (code: LegalError["code"]) =>
  expect.objectContaining({ name: "LegalError", code }) as unknown;

describe("a draft", () => {
  it("starts from the placeholder as version 1 when nothing was published", async () => {
    const db = getDb();

    const draft = await createLegalDraft(db, "OFFER");

    expect(draft).toMatchObject({
      type: "OFFER",
      version: 1,
      body: LEGAL_STUBS.OFFER,
      sha256: sha256Of(LEGAL_STUBS.OFFER),
      effectiveAt: null,
    });
    expect(await legalDraft(db, "OFFER")).toEqual(draft);
    // Not public yet.
    expect(await currentLegalDocument(db, "OFFER")).toBeNull();
    expect(await publishedLegalDocument(db, "OFFER", 1)).toBeNull();
  });

  it("is the only one of its type", async () => {
    const db = getDb();
    await createLegalDraft(db, "PRIVACY");

    await expect(createLegalDraft(db, "PRIVACY")).rejects.toEqual(
      refusal("DRAFT_EXISTS"),
    );
    // Also inside a transaction, which a failed INSERT would have aborted.
    await expect(
      db.$transaction(async (tx) => {
        await createLegalDraft(tx, "PRIVACY").catch(() => undefined);
        return tx.legalDocument.count({ where: { type: "PRIVACY" } });
      }),
    ).resolves.toBe(1);
    // The database keeps the rule on its own.
    const body = uniqueBody();
    await expect(
      db.legalDocument.create({
        data: { type: "PRIVACY", version: 2, body, sha256: sha256Of(body) },
      }),
    ).rejects.toThrow();
  });

  it("is saved normalized, with the hash of the stored text", async () => {
    const db = getDb();
    const draft = await createLegalDraft(db, "RECURRING");

    const { draft: saved, previousSha256 } = await saveLegalDraft(
      db,
      draft.id,
      "\r\n## Условия  \r\nСписание раз в месяц.\t\n\n",
      draft.sha256,
    );

    expect(saved.body).toBe("## Условия\nСписание раз в месяц.");
    expect(saved.sha256).toBe(sha256Of(saved.body));
    expect(previousSha256).toBe(draft.sha256);
    expect(saved).toMatchObject({
      id: draft.id,
      version: 1,
      effectiveAt: null,
    });
  });

  it("is not saved over a text that was saved meanwhile", async () => {
    const db = getDb();
    const opened = await legalDraft(db, "RECURRING");
    // Another tab — or this one before the browser's «Назад» brought the
    // old editor back — saves a clause.
    const { draft: theirs } = await saveLegalDraft(
      db,
      opened!.id,
      "Пункт, который нельзя потерять",
      opened!.sha256,
    );

    // The stale editor still holds the text it was opened with.
    await expect(
      saveLegalDraft(db, opened!.id, "Правка поверх старого", opened!.sha256),
    ).rejects.toEqual(refusal("STALE"));

    expect(await legalDraft(db, "RECURRING")).toEqual(theirs);
    // From the text as it is now, saving works again.
    await expect(
      saveLegalDraft(db, opened!.id, "Условия, версия три", theirs.sha256),
    ).resolves.toMatchObject({ previousSha256: theirs.sha256 });
  });

  it("can't be saved empty or with a hash of another text", async () => {
    const db = getDb();
    const draft = await legalDraft(db, "RECURRING");

    await expect(
      saveLegalDraft(db, draft!.id, " \n\t", draft!.sha256),
    ).rejects.toEqual(refusal("INVALID_BODY"));
    await expect(
      db.legalDocument.update({
        where: { id: draft!.id },
        data: { body: "Другой текст" },
      }),
    ).rejects.toThrow(/LegalDocument_sha256_of_body/);
    await expect(
      db.legalDocument.update({
        where: { id: draft!.id },
        data: { body: " ", sha256: sha256Of(" ") },
      }),
    ).rejects.toThrow(/LegalDocument_body_not_blank/);
  });

  it("can be dropped; the next one takes its number", async () => {
    const db = getDb();
    const first = await publishVersion("MARKETING");
    const draft = await createLegalDraft(db, "MARKETING");
    expect(draft).toMatchObject({ version: 2, body: first.body });

    await deleteLegalDraft(db, draft.id);

    expect(await legalDraft(db, "MARKETING")).toBeNull();
    expect(await createLegalDraft(db, "MARKETING")).toMatchObject({
      version: 2,
    });
    await expect(deleteLegalDraft(db, "no-such-id")).rejects.toEqual(
      refusal("NOT_FOUND"),
    );
  });
});

describe("publishing", () => {
  it("puts the version in force at the database's time", async () => {
    const db = getDb();
    const draft = await createLegalDraft(db, "PD_CONSENT");
    const [{ before }] = await db.$queryRaw<
      [{ before: Date }]
    >`SELECT clock_timestamp() AS before`;

    const published = await publishLegalDraft(db, draft.id, draft.sha256);

    expect(published).toMatchObject({
      id: draft.id,
      version: 1,
      body: draft.body,
      sha256: draft.sha256,
    });
    // Milliseconds are kept, microseconds rounded.
    expect(published.effectiveAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1,
    );
    expect(await currentLegalDocument(db, "PD_CONSENT")).toEqual(published);
    expect(await publishedLegalDocument(db, "PD_CONSENT", 1)).toEqual(
      published,
    );
    expect(await legalDraft(db, "PD_CONSENT")).toBeNull();
  });

  it("makes the next version from a copy of the one in force", async () => {
    const db = getDb();
    const first = await currentLegalDocument(db, "PD_CONSENT");

    const draft = await createLegalDraft(db, "PD_CONSENT");
    expect(draft).toMatchObject({ version: 2, body: first!.body });

    // The same text again is not a new version.
    await expect(publishLegalDraft(db, draft.id, draft.sha256)).rejects.toEqual(
      refusal("UNCHANGED"),
    );

    const { draft: edited } = await saveLegalDraft(
      db,
      draft.id,
      uniqueBody(),
      draft.sha256,
    );
    const second = await publishLegalDraft(db, edited.id, edited.sha256);

    expect(await currentLegalDocument(db, "PD_CONSENT")).toEqual(second);
    // The first one stays where it was, text and all.
    expect(await publishedLegalDocument(db, "PD_CONSENT", 1)).toEqual(first);
    expect(
      (await publishedLegalVersions(db, "PD_CONSENT")).map(
        ({ version, sha256, consents }) => ({ version, sha256, consents }),
      ),
    ).toEqual([
      { version: 2, sha256: second.sha256, consents: 0 },
      { version: 1, sha256: first!.sha256, consents: 0 },
    ]);
  });

  it("refuses a draft that was saved again since it was read", async () => {
    const db = getDb();
    const draft = await createLegalDraft(db, "PD_CONSENT");
    const { draft: shown } = await saveLegalDraft(
      db,
      draft.id,
      uniqueBody(),
      draft.sha256,
    );
    // Another tab saves a different text before «Опубликовать» is pressed.
    await saveLegalDraft(db, draft.id, uniqueBody(), shown.sha256);

    await expect(publishLegalDraft(db, draft.id, shown.sha256)).rejects.toEqual(
      refusal("STALE"),
    );

    expect(await legalDraft(db, "PD_CONSENT")).toMatchObject({
      effectiveAt: null,
    });
    expect(await currentLegalDocument(db, "PD_CONSENT")).toMatchObject({
      version: 2,
    });
  });

  it("lets one of two simultaneous publications through", async () => {
    const db = getDb();
    const draft = await legalDraft(db, "PD_CONSENT");

    const results = await Promise.allSettled([
      publishLegalDraft(db, draft!.id, draft!.sha256),
      publishLegalDraft(db, draft!.id, draft!.sha256),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      await db.legalDocument.count({
        where: { type: "PD_CONSENT", effectiveAt: { not: null } },
      }),
    ).toBe(3);
  });

  it("reports where every document stands", async () => {
    const db = getDb();

    const states = await legalDocumentStates(db, ["PD_CONSENT", "OFFER"]);

    expect(states).toEqual([
      {
        type: "PD_CONSENT",
        current: { version: 3, effectiveAt: expect.any(Date) as Date },
        draft: null,
      },
      {
        type: "OFFER",
        current: null,
        draft: { version: 1, updatedAt: expect.any(Date) as Date },
      },
    ]);
  });
});

describe("a published version", () => {
  it("can't be changed, deleted or published again through the module", async () => {
    const db = getDb();
    const published = await publishVersion("MARKETING");

    await expect(
      saveLegalDraft(db, published.id, "Исправленный текст", published.sha256),
    ).rejects.toEqual(refusal("PUBLISHED"));
    await expect(deleteLegalDraft(db, published.id)).rejects.toEqual(
      refusal("PUBLISHED"),
    );
    await expect(
      publishLegalDraft(db, published.id, published.sha256),
    ).rejects.toEqual(refusal("PUBLISHED"));

    expect(
      await db.legalDocument.findUniqueOrThrow({ where: { id: published.id } }),
    ).toEqual(published);
  });

  it("can't be changed or deleted in the database either", async () => {
    const db = getDb();
    const published = await publishVersion("MARKETING");
    const { id } = published;
    const body = "Исправленный текст";

    await expect(
      db.legalDocument.update({
        where: { id },
        data: { body, sha256: sha256Of(body) },
      }),
    ).rejects.toThrow(PUBLISHED);
    // Not even back to a draft, to be edited and published once more.
    await expect(
      db.legalDocument.update({ where: { id }, data: { effectiveAt: null } }),
    ).rejects.toThrow(PUBLISHED);
    await expect(
      db.legalDocument.update({ where: { id }, data: { version: 99 } }),
    ).rejects.toThrow(PUBLISHED);
    await expect(
      db.$executeRaw`UPDATE "LegalDocument" SET "effectiveAt" = now() WHERE "id" = ${id}`,
    ).rejects.toThrow(PUBLISHED);
    await expect(db.legalDocument.delete({ where: { id } })).rejects.toThrow(
      PUBLISHED,
    );
    await expect(
      db.legalDocument.deleteMany({ where: { type: "MARKETING" } }),
    ).rejects.toThrow(PUBLISHED);
    await expect(
      db.$executeRaw`TRUNCATE "LegalDocument" CASCADE`,
    ).rejects.toThrow(/legal: TRUNCATE on "LegalDocument" is forbidden/);

    expect(await db.legalDocument.findUniqueOrThrow({ where: { id } })).toEqual(
      published,
    );
  });

  it("is published at the moment of publication, never backdated", async () => {
    const db = getDb();
    const draft = await createLegalDraft(db, "MARKETING");
    const { draft: edited } = await saveLegalDraft(
      db,
      draft.id,
      uniqueBody(),
      draft.sha256,
    );

    await expect(
      db.legalDocument.update({
        where: { id: edited.id },
        data: { effectiveAt: new Date("2020-01-01T00:00:00Z") },
      }),
    ).rejects.toThrow(/legal: "effectiveAt" is the moment of publication/);
    // A time of the application's clock is not the database's either.
    await expect(
      db.legalDocument.update({
        where: { id: edited.id },
        data: { effectiveAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toThrow(/legal: "effectiveAt" is the moment of publication/);

    expect(await legalDraft(db, "MARKETING")).toMatchObject({
      effectiveAt: null,
    });
  });

  it("takes the next number in order", async () => {
    const db = getDb();
    const draft = await legalDraft(db, "MARKETING");

    // Written around the module: a draft numbered out of order.
    await db.legalDocument.update({
      where: { id: draft!.id },
      data: { version: draft!.version + 5 },
    });
    await expect(
      publishLegalDraft(db, draft!.id, draft!.sha256),
    ).rejects.toThrow(/legal: version \d+ of MARKETING can't be published/);

    await db.legalDocument.update({
      where: { id: draft!.id },
      data: { version: draft!.version },
    });
    await expect(
      publishLegalDraft(db, draft!.id, draft!.sha256),
    ).resolves.toMatchObject({ version: draft!.version });
  });
});
