import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraft,
  deleteDraft,
  publishDraft,
  saveDraft,
} from "@/app/admin/(staff)/legal/actions";
import { unsubscribe } from "@/app/unsubscribe/[token]/actions";
import type { AuditEntry } from "@/server/audit";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  currentLegalDocument,
  legalDraft,
  marketingConsentOf,
  recordConsents,
} from "@/server/legal";
import { publishVersion, uniqueBody } from "./helpers";

// The admin section and the unsubscribe page below the browser: the real
// server actions write to Postgres. Only the session and the cache are faked.
const mocks = vi.hoisted(() => ({
  getStaffUser: vi.fn<() => Promise<StaffUser | null>>(),
  updateTag: vi.fn(),
  refresh: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({
  getStaffUser: mocks.getStaffUser,
}));
vi.mock("next/cache", () => ({
  updateTag: mocks.updateTag,
  refresh: mocks.refresh,
}));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));

const owner: StaffUser = {
  id: "user-owner",
  email: "owner@shelter.localhost",
  name: "Ирина",
  role: "OWNER",
};

/** What the actions of this test passed to the audit log so far. */
const audited = () =>
  mocks.recordAudit.mock.calls.flatMap(
    ([, , entries]) => entries as AuditEntry[],
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStaffUser.mockResolvedValue(owner);
});

describe("the owner's actions", () => {
  it("drafts, saves and publishes a new version; only publishing touches the public cache", async () => {
    const created = await createDraft({ type: "OFFER" });
    if (!created.ok) throw new Error(created.error.message);
    const { id, version } = created.data;
    expect(version).toBe(1);

    const opened = await legalDraft(getDb(), "OFFER");
    const body = uniqueBody("Оферта");
    const saved = await saveDraft({
      id,
      sha256: opened!.sha256,
      body: `${body}  \r\n`,
    });
    if (!saved.ok) throw new Error(saved.error.message);
    // As stored: the form shows the normalized text.
    expect(saved.data.body).toBe(body);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(await currentLegalDocument(getDb(), "OFFER")).toBeNull();

    const published = await publishDraft({ id, sha256: saved.data.sha256 });

    expect(published).toEqual({ ok: true, data: { version: 1 } });
    expect(await currentLegalDocument(getDb(), "OFFER")).toMatchObject({
      id,
      version: 1,
      body,
      sha256: saved.data.sha256,
    });
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith("legal");
    expect(
      audited().map(({ action, entityId }) => ({ action, entityId })),
    ).toEqual([
      { action: "legal.draft.create", entityId: id },
      { action: "legal.draft.update", entityId: id },
      { action: "legal.publish", entityId: id },
    ]);
    // The log tells versions apart by hash; the texts stay out of it.
    expect(JSON.stringify(audited())).not.toContain(body);
  });

  it("can't change or delete what is published", async () => {
    const published = await publishVersion("PRIVACY");

    for (const result of [
      await saveDraft({
        id: published.id,
        sha256: published.sha256,
        body: "Исправленный текст",
      }),
      await deleteDraft({ id: published.id }),
      await publishDraft({ id: published.id, sha256: published.sha256 }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "failed",
          message: expect.stringContaining("уже опубликована") as string,
        },
      });
    }

    expect(await currentLegalDocument(getDb(), "PRIVACY")).toEqual(published);
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(audited()).toEqual([]);
  });

  it("explains why a draft can't be published as it is", async () => {
    await publishVersion("RECURRING");
    const created = await createDraft({ type: "RECURRING" });
    if (!created.ok) throw new Error(created.error.message);
    const { id } = created.data;
    const draft = await legalDraft(getDb(), "RECURRING");

    // A copy of the version in force: nothing new to publish.
    expect(await publishDraft({ id, sha256: draft!.sha256 })).toMatchObject({
      ok: false,
      error: {
        code: "failed",
        message: expect.stringContaining("не отличается") as string,
      },
    });

    // Saved again in another tab after this one showed the text.
    const theirs = uniqueBody();
    await saveDraft({ id, sha256: draft!.sha256, body: theirs });
    expect(await publishDraft({ id, sha256: draft!.sha256 })).toMatchObject({
      ok: false,
      error: {
        code: "failed",
        message: expect.stringContaining("Черновик изменился") as string,
      },
    });
    // Nor does this tab's editor, still on the old text, save over it: the
    // other tab's clause would be gone without a word.
    expect(
      await saveDraft({
        id,
        sha256: draft!.sha256,
        body: "Правка из старой вкладки",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "failed",
        message: expect.stringContaining("скопируйте свой текст") as string,
      },
    });
    expect(await legalDraft(getDb(), "RECURRING")).toMatchObject({
      body: theirs,
    });
    expect(await currentLegalDocument(getDb(), "RECURRING")).toMatchObject({
      version: 1,
    });
  });

  it("drops a draft and refuses a second one", async () => {
    await publishVersion("MARKETING");
    const created = await createDraft({ type: "MARKETING" });
    if (!created.ok) throw new Error(created.error.message);

    expect(await createDraft({ type: "MARKETING" })).toMatchObject({
      ok: false,
      error: { code: "failed" },
    });
    expect(await deleteDraft({ id: created.data.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await legalDraft(getDb(), "MARKETING")).toBeNull();
  });

  it("validates what the browser sends", async () => {
    const created = await createDraft({ type: "PD_CONSENT" });
    if (!created.ok) throw new Error(created.error.message);
    const { id } = created.data;

    const draft = await legalDraft(getDb(), "PD_CONSENT");
    expect(
      await saveDraft({ id, sha256: draft!.sha256, body: "  \n " }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "validation",
        fieldErrors: { body: "Введите текст документа." },
      },
    });
    expect(await publishDraft({ id, sha256: "not-a-hash" })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(
      await createDraft({ type: "TERMS" as unknown as "OFFER" }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});

describe("everyone else", () => {
  it.each(["ADMIN", "EDITOR", "COORDINATOR"] as const)(
    "refuses %s: legal documents are the owner's",
    async (role) => {
      mocks.getStaffUser.mockResolvedValue({ ...owner, role });
      const draft = await legalDraft(getDb(), "PD_CONSENT");

      for (const result of [
        await createDraft({ type: "OFFER" }),
        await saveDraft({
          id: draft!.id,
          sha256: draft!.sha256,
          body: "Чужая правка",
        }),
        await publishDraft({ id: draft!.id, sha256: draft!.sha256 }),
        await deleteDraft({ id: draft!.id }),
      ]) {
        expect(result).toMatchObject({
          ok: false,
          error: { code: "forbidden" },
        });
      }

      expect(await legalDraft(getDb(), "PD_CONSENT")).toEqual(draft);
      expect(await currentLegalDocument(getDb(), "PD_CONSENT")).toBeNull();
    },
  );

  it("refuses without a session", async () => {
    mocks.getStaffUser.mockResolvedValue(null);
    const draft = await legalDraft(getDb(), "PD_CONSENT");

    expect(
      await publishDraft({ id: draft!.id, sha256: draft!.sha256 }),
    ).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(await currentLegalDocument(getDb(), "PD_CONSENT")).toBeNull();
  });
});

describe("the unsubscribe link's action", () => {
  it("withdraws the newsletter consent and shows the page anew", async () => {
    // No session at all: the link's token is the permission.
    mocks.getStaffUser.mockResolvedValue(null);
    const email = "subscriber@example.ru";
    const marketing = await currentLegalDocument(getDb(), "MARKETING");
    const [consent] = await recordConsents(getDb(), {
      consents: { MARKETING: marketing!.id },
      required: ["MARKETING"],
      subject: { email },
      context: "donation:don_1",
      evidence: { ip: null, userAgent: null },
    });

    await unsubscribe(consent!.consentId);

    expect(await marketingConsentOf(getDb(), { email })).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    // Pressed again, an unknown token, not a token at all: nothing happens.
    await unsubscribe(consent!.consentId);
    await unsubscribe("no-such-consent");
    await unsubscribe("x".repeat(500));
    await unsubscribe({ id: consent!.consentId } as unknown as string);
    expect(
      await getDb().consentRecord.count({
        where: { email, withdrawnAt: { not: null } },
      }),
    ).toBe(1);
  });
});
