import { z } from "zod";
import { isTimeZone } from "@/lib/env/schema";

const amountKop = z.number().int().positive();

/** Every setting key and the shape of its JSON value. */
export const settingSchemas = {
  /** Shown dates use this zone; the database stores UTC. */
  "shelter.timezone": z
    .string()
    .refine(isTimeZone, "must be an IANA time zone, e.g. Europe/Moscow"),
  /** Bank details for donations by transfer. */
  "shelter.requisites": z.object({
    legalName: z.string(),
    inn: z.string(),
    kpp: z.string(),
    ogrn: z.string(),
    bankName: z.string(),
    bik: z.string(),
    account: z.string(),
    correspondentAccount: z.string(),
  }),
  /** Public contacts of the shelter. */
  "shelter.contacts": z.object({
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    telegram: z.string(),
    vk: z.string(),
  }),
  /** Ready-made amounts in the donation form. */
  "donation.presetAmounts": z.object({
    oneTimeKop: z.array(amountKop).min(1),
    monthlyKop: z.array(amountKop).min(1),
  }),
} satisfies Record<string, z.ZodType>;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.output<
  (typeof settingSchemas)[K]
>;

/** Values the seed writes to a new database; admins fill in the rest. */
export function defaultSettings(timeZone: string): {
  [K in SettingKey]: SettingValue<K>;
} {
  return {
    "shelter.timezone": timeZone,
    "shelter.requisites": {
      legalName: "",
      inn: "",
      kpp: "",
      ogrn: "",
      bankName: "",
      bik: "",
      account: "",
      correspondentAccount: "",
    },
    "shelter.contacts": {
      address: "",
      phone: "",
      email: "",
      telegram: "",
      vk: "",
    },
    "donation.presetAmounts": {
      oneTimeKop: [30_000, 50_000, 100_000, 300_000],
      monthlyKop: [30_000, 50_000, 100_000],
    },
  };
}
