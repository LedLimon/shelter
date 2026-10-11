// «Отправить образец» of the /dev/email preview: a server action that exists
// only in `next dev` and only queues an event — the worker sends.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSample } from "@/app/dev/email/actions";
import { getDb } from "@/server/db";
import { clearOutbox } from "../jobs/helpers";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const sample = { template: "donation.thanks", example: "split" };
const queued = () =>
  getDb().outbox.findMany({ select: { type: true, payload: true } });

beforeEach(clearOutbox);
afterEach(() => vi.unstubAllEnvs());

describe("sendSample", () => {
  it.each(["production", "test"])(
    "answers 404 and queues nothing under NODE_ENV=%s",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);

      await expect(sendSample(null, form(sample))).rejects.toMatchObject({
        digest: expect.stringContaining("404") as string,
      });
      expect(await queued()).toEqual([]);
    },
  );

  describe("in development", () => {
    beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

    it("asks for the seed when there is no owner to write to", async () => {
      expect(await sendSample(null, form(sample))).toEqual({
        ok: false,
        message: "В базе нет владельца. Выполните pnpm db:seed и повторите.",
      });
      expect(await queued()).toEqual([]);
    });

    it("queues the shown example for the owner", async () => {
      const owner = await getDb().user.create({
        data: {
          email: "owner@shelter.localhost",
          name: "Владелец",
          role: "OWNER",
        },
      });

      const state = await sendSample(null, form(sample));

      expect(state).toMatchObject({ ok: true });
      expect(await queued()).toEqual([
        { type: "email.test", payload: { ...sample, userId: owner.id } },
      ]);
    });

    it.each([
      { ...sample, template: "no.such.letter" },
      { ...sample, example: "toString" },
      { example: "split" },
    ])("refuses %j", async (fields) => {
      expect(await sendSample(null, form(fields))).toEqual({
        ok: false,
        message: "Такого письма или примера нет.",
      });
      expect(await queued()).toEqual([]);
    });
  });
});
