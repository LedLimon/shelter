import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { saveSettings as saveSettingsAction } from "@/app/admin/(staff)/settings/actions";
import { settingsFormValues } from "@/app/admin/(staff)/settings/schema";
import { adminAction } from "@/server/admin/action";
import { ActionError } from "@/server/admin/result";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  getSetting,
  getSettings,
  saveSettings,
  setSetting,
} from "@/server/settings";
import { defaultSettings } from "@/server/settings/schema";

// The settings page end to end below the browser: the form's values go
// through the real server action into Postgres. Only the session is faked.
const mocks = vi.hoisted(() => ({
  getStaffUser: vi.fn<() => Promise<StaffUser | null>>(),
  updateTag: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({
  getStaffUser: mocks.getStaffUser,
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));

const owner: StaffUser = {
  id: "user-owner",
  email: "owner@shelter.localhost",
  name: "Ирина",
  role: "OWNER",
};

/** SHELTER_TIMEZONE of .env.example, which the test setup loads. */
const defaults = defaultSettings("Europe/Moscow");

const storedKeys = async () =>
  (await getDb().setting.findMany({ orderBy: { key: "asc" } })).map(
    ({ key }) => key,
  );

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.getStaffUser.mockResolvedValue(owner);
  await getDb().setting.deleteMany();
});

describe("getSettings", () => {
  it("fills in defaults for settings that were never saved", async () => {
    expect(await getSettings(getDb())).toEqual(defaults);

    await setSetting(getDb(), "shelter.timezone", "Asia/Omsk");

    expect(await getSettings(getDb())).toEqual({
      ...defaults,
      "shelter.timezone": "Asia/Omsk",
    });
  });

  it("leaves alone a row whose key the code doesn't know", async () => {
    await getDb().setting.create({
      data: { key: "legacy.banner", value: { text: "old" } },
    });

    expect(await getSettings(getDb())).toEqual(defaults);
  });
});

describe("saveSettings", () => {
  it("writes only what differs and reports the change", async () => {
    const contacts = { ...defaults["shelter.contacts"], phone: "+7 900 1" };

    const changes = await saveSettings(getDb(), {
      ...defaults,
      "shelter.contacts": contacts,
    });

    expect(changes).toEqual([
      {
        key: "shelter.contacts",
        before: defaults["shelter.contacts"],
        after: contacts,
      },
    ]);
    expect(await storedKeys()).toEqual(["shelter.contacts"]);
  });

  it("changes nothing when the values are the stored ones", async () => {
    await setSetting(getDb(), "shelter.timezone", "Asia/Omsk");
    const before = await getDb().setting.findUniqueOrThrow({
      where: { key: "shelter.timezone" },
    });

    const changes = await saveSettings(getDb(), {
      "shelter.timezone": "Asia/Omsk",
    });

    expect(changes).toEqual([]);
    expect(
      await getDb().setting.findUniqueOrThrow({
        where: { key: "shelter.timezone" },
      }),
    ).toEqual(before);
  });
});

describe("the settings form's action", () => {
  const typed = () => {
    const values = settingsFormValues(defaults);
    values.requisites.inn = "7707 083 893";
    values.contacts.telegram = "@priyut";
    values.presets.monthly = [{ amount: "250" }, { amount: "1 500" }];
    values.timeZone = "Asia/Yekaterinburg";
    return values;
  };

  it("saves what the owner typed and returns it as stored", async () => {
    const result = await saveSettingsAction(typed());

    expect(result).toMatchObject({
      ok: true,
      data: {
        requisites: { inn: "7707083893" },
        contacts: { telegram: "https://t.me/priyut" },
        // Thousands are separated by a non-breaking space, as formatRub does.
        presets: { monthly: [{ amount: "250" }, { amount: "1\u00A0500" }] },
        timeZone: "Asia/Yekaterinburg",
      },
    });
    expect(await getSettings(getDb())).toEqual({
      "shelter.requisites": {
        ...defaults["shelter.requisites"],
        inn: "7707083893",
      },
      "shelter.contacts": {
        ...defaults["shelter.contacts"],
        telegram: "https://t.me/priyut",
      },
      "donation.presetAmounts": {
        oneTimeKop: defaults["donation.presetAmounts"].oneTimeKop,
        monthlyKop: [25_000, 150_000],
      },
      "shelter.timezone": "Asia/Yekaterinburg",
    });
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith("settings");
  });

  it("writes only the groups it was sent: an old tab keeps off the rest", async () => {
    // Another tab saved new bank details after this one had loaded the form.
    const requisites = {
      ...defaults["shelter.requisites"],
      account: "40703810938000001234",
    };
    await setSetting(getDb(), "shelter.requisites", requisites);

    // This tab changed the phone only, so it sends the contacts only.
    const { contacts } = typed();
    contacts.phone = "+7 900 123-45-67";
    const result = await saveSettingsAction({ contacts });

    expect(await getSetting(getDb(), "shelter.requisites")).toEqual(requisites);
    expect(await getSetting(getDb(), "shelter.contacts")).toMatchObject({
      phone: "+7 900 123-45-67",
    });
    // The answer is the whole form as stored: the other tab's change shows up.
    expect(result).toMatchObject({
      ok: true,
      data: { requisites: { account: "40703810938000001234" } },
    });
  });

  it("doesn't touch the cache when nothing changed", async () => {
    const result = await saveSettingsAction(settingsFormValues(defaults));

    expect(result.ok).toBe(true);
    expect(await storedKeys()).toEqual([]);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "EDITOR", "COORDINATOR"] as const)(
    "refuses %s: settings are the owner's",
    async (role) => {
      mocks.getStaffUser.mockResolvedValue({ ...owner, role });

      const result = await saveSettingsAction(typed());

      expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await storedKeys()).toEqual([]);
    },
  );

  it("refuses without a session", async () => {
    mocks.getStaffUser.mockResolvedValue(null);

    const result = await saveSettingsAction(typed());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    expect(await storedKeys()).toEqual([]);
  });

  it("saves nothing if one field is invalid", async () => {
    const values = typed();
    values.requisites.bik = "123";

    const result = await saveSettingsAction(values);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation",
        fieldErrors: { "requisites.bik": "БИК — 9 цифр." },
      },
    });
    expect(await storedKeys()).toEqual([]);
  });
});

describe("adminAction's transaction", () => {
  it("rolls back what the handler wrote before it refused", async () => {
    const action = adminAction(
      z.object({ timeZone: z.string() }),
      "settings.edit",
      async ({ timeZone }, { db }) => {
        await setSetting(db, "shelter.timezone", timeZone);
        throw new ActionError("Передумали.");
      },
    );

    const result = await action({ timeZone: "Asia/Omsk" });

    expect(result).toMatchObject({ ok: false, error: { code: "failed" } });
    expect(await getSetting(getDb(), "shelter.timezone")).toBeUndefined();
  });

  it("commits what the handler wrote when it succeeds", async () => {
    const action = adminAction(
      z.object({ timeZone: z.string() }),
      "settings.edit",
      ({ timeZone }, { db }) => setSetting(db, "shelter.timezone", timeZone),
    );

    expect(await action({ timeZone: "Asia/Omsk" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await getSetting(getDb(), "shelter.timezone")).toBe("Asia/Omsk");
  });
});
