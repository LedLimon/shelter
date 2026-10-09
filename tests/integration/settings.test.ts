import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { getSetting, setSetting } from "@/server/settings";

describe("settings", () => {
  it("returns undefined for a setting that was never saved", async () => {
    expect(await getSetting(getDb(), "shelter.contacts")).toBeUndefined();
  });

  it("saves a value and reads it back", async () => {
    const amounts = { oneTimeKop: [50_000, 150_000], monthlyKop: [30_000] };

    await setSetting(getDb(), "donation.presetAmounts", amounts);

    expect(await getSetting(getDb(), "donation.presetAmounts")).toEqual(
      amounts,
    );
    const row = await getDb().setting.findUniqueOrThrow({
      where: { key: "donation.presetAmounts" },
    });
    expect(row.value).toEqual(amounts);
  });

  it("overwrites the previous value", async () => {
    await setSetting(getDb(), "shelter.timezone", "Europe/Moscow");
    const before = await getDb().setting.findUniqueOrThrow({
      where: { key: "shelter.timezone" },
    });

    await setSetting(getDb(), "shelter.timezone", "Asia/Yekaterinburg");

    const after = await getDb().setting.findUniqueOrThrow({
      where: { key: "shelter.timezone" },
    });
    expect(after.value).toBe("Asia/Yekaterinburg");
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
  });

  it("rejects a value of the wrong shape and keeps the old one", async () => {
    const amounts = { oneTimeKop: [50_000], monthlyKop: [30_000] };
    await setSetting(getDb(), "donation.presetAmounts", amounts);

    // Money is whole kopecks: 500.5 ₽ as 50_050.5 is a bug, not a value.
    await expect(
      setSetting(getDb(), "donation.presetAmounts", {
        oneTimeKop: [50_050.5],
        monthlyKop: [30_000],
      }),
    ).rejects.toThrow();

    expect(await getSetting(getDb(), "donation.presetAmounts")).toEqual(
      amounts,
    );
  });

  it("takes a transaction client and rolls back with it", async () => {
    await expect(
      getDb().$transaction(async (tx) => {
        await setSetting(tx, "shelter.contacts", {
          address: "",
          phone: "+7 900 000-00-00",
          email: "",
          telegram: "",
          vk: "",
        });
        expect(await getSetting(tx, "shelter.contacts")).toBeDefined();
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await getSetting(getDb(), "shelter.contacts")).toBeUndefined();
  });
});
