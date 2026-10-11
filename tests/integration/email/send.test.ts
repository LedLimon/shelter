// Letters end to end: an outbox event, its handler, SMTP, a mailbox. The
// mailbox is the run's Mailpit (tests/helpers/mailpit.ts); a server that says
// no is tests/helpers/fake-smtp.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SHELTER_NAME } from "@/lib/shelter";
import type { UserRole } from "@/generated/prisma/enums";
import { getDb } from "@/server/db";
import { createMailer } from "@/server/email/transport";
import { outbox } from "@/server/jobs";
import { outboxHandlers } from "@/server/jobs/handlers";
import { drainOutbox } from "@/server/jobs/outbox/dispatcher";
import { defaultSettings } from "@/server/settings/schema";
import { setSetting } from "@/server/settings";
import { startFakeSmtp, type FakeSmtp } from "../../helpers/fake-smtp";
import { inboxOf, uniqueAddress, waitForInbox } from "../../helpers/mailpit";
import { plain } from "../../helpers/text";
import {
  clearOutbox,
  logged,
  outboxRow,
  skipBackoff,
  testLogger,
  type TestLogger,
} from "../jobs/helpers";

const sendJob = () => Promise.reject(new Error("no pg-boss in this test"));
/** The worker's handlers: letters go to the SMTP server of the environment. */
const handlers = outboxHandlers({ sendJob });

let logger: TestLogger;
let fake: FakeSmtp | undefined;

beforeEach(async () => {
  await clearOutbox();
  logger = testLogger();
});
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function userWith(address: string, role: UserRole = "OWNER") {
  return getDb().user.create({
    data: { email: address, name: "Ирина Тестовая", role },
    select: { id: true },
  });
}

/** Queues a sample of the thanks letter for a new staff member. */
async function queueSample(
  address = uniqueAddress(),
  payload: { email?: string; example?: string } = {},
) {
  const user = await userWith(address);
  const eventId = await outbox.enqueue(getDb(), "email.test", {
    email: "donation.thanks",
    example: "split",
    userId: user.id,
    ...payload,
  });
  return { address, userId: user.id, eventId: eventId! };
}

const drain = (options: Partial<Parameters<typeof drainOutbox>[1]> = {}) =>
  drainOutbox(getDb(), { handlers, logger, ...options });

/** Makes a settled event due again, as if its outcome had never been saved. */
async function runAgain(eventId: string) {
  await getDb().$executeRaw`
    UPDATE "Outbox" SET "status" = 'PENDING', "processedAt" = NULL
    WHERE "id" = ${eventId}`;
  await skipBackoff();
}

const allLogged = () =>
  (["info", "warn", "error"] as const).flatMap((level) =>
    logged(logger, level),
  );

describe("a letter sent by an outbox event", () => {
  it("arrives once, in Russian, from the shelter", async () => {
    const { address, eventId } = await queueSample();

    await drain();

    const [letter, ...rest] = await waitForInbox(address);
    expect(rest).toEqual([]);
    expect(plain(letter!.subject)).toBe(
      "Проверка: Спасибо! Мы получили ваше пожертвование — 3 000 ₽",
    );
    expect(letter).toMatchObject({
      from: { name: SHELTER_NAME, address: "no-reply@shelter.localhost" },
      to: [address],
      replyTo: [],
    });
    expect(letter!.html).toContain(">Спасибо за помощь!<");
    expect(plain(letter!.html)).toContain("2 124,50 ₽");
    expect(plain(letter!.text)).toContain("В общий фонд   875,50 ₽");
    expect(letter!.text).toContain(
      "Это письмо — подтверждение пожертвования, а не кассовый чек.",
    );
    expect(letter!.headers["Message-Id"]).toEqual([
      `<${eventId}@shelter.localhost>`,
    ]);
    expect(letter!.headers["Auto-Submitted"]).toEqual(["auto-generated"]);

    expect(await outboxRow(eventId)).toMatchObject({
      status: "PROCESSED",
      attempts: 1,
    });
    expect(
      await getDb().emailDelivery.findMany({ where: { key: eventId } }),
    ).toEqual([
      expect.objectContaining({
        key: eventId,
        type: "donation.thanks",
        messageId: `<${eventId}@shelter.localhost>`,
      }),
    ]);
  });

  it("is not sent again when the event runs again", async () => {
    const { address, eventId } = await queueSample();
    await drain();
    await waitForInbox(address);

    // The worker died after the send, before it saved «PROCESSED» — five times.
    for (let run = 0; run < 5; run++) {
      await runAgain(eventId);
      await drain();
    }

    expect(await outboxRow(eventId)).toMatchObject({
      status: "PROCESSED",
      attempts: 6,
    });
    expect(await inboxOf(address)).toHaveLength(1);
    expect(await getDb().emailDelivery.count({ where: { key: eventId } })).toBe(
      1,
    );
  });

  it("is one letter per dedupeKey, however many times it is queued", async () => {
    const address = uniqueAddress();
    const user = await userWith(address);
    const payload = {
      email: "donation.thanks",
      example: "need",
      userId: user.id,
    };
    // A payment webhook delivered five times queues its thanks five times.
    const key = `test.thanks:${user.id}`;
    const ids = [];
    for (let delivery = 0; delivery < 5; delivery++) {
      ids.push(
        await outbox.enqueue(getDb(), "email.test", payload, {
          dedupeKey: key,
        }),
      );
    }

    await drain();

    expect(ids.filter(Boolean)).toHaveLength(1);
    expect(await waitForInbox(address)).toHaveLength(1);
  });

  it("is a letter of its own for every event", async () => {
    const address = uniqueAddress();
    const user = await userWith(address);
    for (const example of ["need", "general"]) {
      await outbox.enqueue(getDb(), "email.test", {
        email: "donation.thanks",
        example,
        userId: user.id,
      });
    }

    await drain();

    const letters = await waitForInbox(address, 2);
    expect(letters.map((letter) => plain(letter.subject)).sort()).toEqual([
      "Проверка: Спасибо! Мы получили ваше пожертвование — 1 000 ₽",
      "Проверка: Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
    ]);
    expect(new Set(letters.map((l) => l.headers["Message-Id"]![0])).size).toBe(
      2,
    );
  });

  it("asks for replies at the shelter's public address", async () => {
    await setSetting(getDb(), "shelter.contacts", {
      ...defaultSettings("Europe/Moscow")["shelter.contacts"],
      email: "priyut@shelter.localhost",
    });
    try {
      const { address } = await queueSample();

      await drain();

      const [letter] = await waitForInbox(address);
      expect(letter!.replyTo).toEqual(["priyut@shelter.localhost"]);
      expect(letter!.text).toContain(
        "Если это были не вы, ответьте на это письмо.",
      );
    } finally {
      await getDb().setting.delete({ where: { key: "shelter.contacts" } });
    }
  });

  it("puts no address into the worker's log", async () => {
    const { address } = await queueSample();

    await drain();
    await waitForInbox(address);

    const lines = allLogged();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[outbox\] email\.test \w+: done \(attempt 1\)$/,
    );
    expect(lines.join("\n")).not.toContain("@");
  });
});

describe("a letter the server refused", () => {
  it("is retried and then sent once; neither the log nor lastError names the reader", async () => {
    const { address, eventId } = await queueSample();
    fake = await startFakeSmtp({
      rcptReply: `550 5.1.1 <${address}>: Recipient address rejected: over quota`,
    });
    const refusing = outboxHandlers({
      sendJob,
      mailer: createMailer({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: fake.port,
        SMTP_SECURE: false,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SMTP_FROM: "no-reply@shelter.localhost",
      }),
    });

    // The retry is an hour away: one attempt, and the drain is over.
    await drain({ handlers: refusing, retryDelayMs: () => 3_600_000 });

    const failed = await outboxRow(eventId);
    expect(failed).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(failed.lastError).toMatch(
      /^EmailSendError: EENVELOPE .*\(550\).*\[email\].*Recipient address rejected: over quota/,
    );
    const local = address.slice(0, address.indexOf("@"));
    for (const text of [failed.lastError!, ...allLogged()]) {
      expect(text).not.toContain(address);
      expect(text).not.toContain(local);
    }
    expect(logged(logger, "warn")).toEqual([
      expect.stringContaining("attempt 1 of 10 failed"),
    ]);
    expect(await inboxOf(address)).toEqual([]);
    expect(await getDb().emailDelivery.count({ where: { key: eventId } })).toBe(
      0,
    );

    // The server is back.
    await skipBackoff();
    await drain();

    expect(await waitForInbox(address)).toHaveLength(1);
    expect(await outboxRow(eventId)).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
    });
  });
});

describe("the «email.test» event", () => {
  it.each<[string, UserRole, boolean]>([
    ["a donor", "DONOR", false],
    ["a staff member who is gone", "ADMIN", true],
  ])("sends nothing to %s and is done", async (_who, role, deleted) => {
    const address = uniqueAddress();
    const user = await getDb().user.create({
      data: {
        email: address,
        name: "Не сотрудник",
        role,
        deletedAt: deleted ? new Date() : null,
      },
    });
    const eventId = (await outbox.enqueue(getDb(), "email.test", {
      email: "donation.thanks",
      example: "need",
      userId: user.id,
    }))!;

    await drain();

    expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
    expect(await inboxOf(address)).toEqual([]);
    expect(await getDb().emailDelivery.count({ where: { key: eventId } })).toBe(
      0,
    );
  });

  it.each([
    [{ email: "no.such.letter" }, 'unknown email type "no.such.letter"'],
    [{ example: "toString" }, '"donation.thanks" has no example "toString"'],
  ])("fails on %j without sending", async (payload, reason) => {
    const { address, eventId } = await queueSample(uniqueAddress(), payload);

    await drain({ retryDelayMs: () => 3_600_000 });

    expect(await outboxRow(eventId)).toMatchObject({
      status: "PENDING",
      lastError: `Error: ${reason}`,
    });
    expect(await inboxOf(address)).toEqual([]);
  });
});
