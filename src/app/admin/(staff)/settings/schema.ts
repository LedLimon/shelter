import { z } from "zod";
import { formatRub, validateRubInput, type RubInputError } from "@/lib/money";
import { isTimeZone } from "@/lib/time-zones";
import type { Settings } from "@/server/settings/schema";

// The settings form: what the owner types (strings) → what is stored
// (src/server/settings/schema.ts). The form and the server action parse with
// the same schema, so an error from the server lands on the same field.

export const MAX_PRESET_AMOUNTS = 6;

const text = (max: number) =>
  z.string().trim().max(max, `Не длиннее ${max} знаков.`);

/** Digits of one of the lengths, or empty; spaces from a pasted value go. */
const digits = (lengths: readonly number[], message: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .refine(
      (value) =>
        value === "" || (/^\d+$/.test(value) && lengths.includes(value.length)),
      message,
    );

const AMOUNT_ERRORS: Record<RubInputError, string> = {
  empty: "Введите сумму или удалите строку.",
  invalid: "Введите сумму цифрами, например 500 или 1 500.",
  negative: "Сумма не может быть отрицательной.",
  "too-many-decimals": "Копеек — не больше двух знаков после запятой.",
  "too-large": "Слишком большая сумма для кнопки.",
};

/** Rubles as typed → integer kopecks. */
const amount = z.string().transform((value, context) => {
  const result = validateRubInput(value);
  if (!result.ok) {
    context.addIssue({ code: "custom", message: AMOUNT_ERRORS[result.error] });
    return z.NEVER;
  }
  if (result.kop === 0) {
    context.addIssue({
      code: "custom",
      message: "Сумма должна быть больше нуля.",
    });
    return z.NEVER;
  }
  return result.kop;
});

const amounts = z
  .array(z.object({ amount }))
  .min(1, "Нужна хотя бы одна сумма.")
  .max(MAX_PRESET_AMOUNTS, `Не больше ${MAX_PRESET_AMOUNTS} сумм.`)
  .superRefine((rows, context) => {
    rows.forEach((row, index) => {
      if (rows.findIndex((other) => other.amount === row.amount) < index) {
        context.addIssue({
          code: "custom",
          path: [index, "amount"],
          message: "Такая сумма уже есть в списке.",
        });
      }
    });
  })
  .transform((rows) => rows.map((row) => row.amount));

const TELEGRAM = /^(?:https:\/\/t\.me\/|t\.me\/|@)([A-Za-z0-9_]{4,32})$/;
const VK = /^(?:https:\/\/)?(?:m\.)?vk\.(?:com|ru)\/([\w.-]{2,64})$/;

export const settingsFormSchema = z
  .object({
    requisites: z.object({
      legalName: text(200),
      inn: digits([10, 12], "ИНН — 10 цифр у организации или 12 у ИП."),
      kpp: z
        .string()
        .trim()
        .toUpperCase()
        .refine(
          (value) => value === "" || /^\d{4}[\dA-Z]{2}\d{3}$/.test(value),
          "КПП — 9 знаков, например 770101001.",
        ),
      ogrn: digits([13, 15], "ОГРН — 13 цифр, ОГРНИП — 15."),
      bankName: text(200),
      bik: digits([9], "БИК — 9 цифр."),
      account: digits([20], "Расчётный счёт — 20 цифр."),
      correspondentAccount: digits([20], "Корреспондентский счёт — 20 цифр."),
    }),
    contacts: z.object({
      address: text(300),
      phone: z
        .string()
        .trim()
        .refine((value) => {
          if (value === "") return true;
          const count = value.replace(/\D/g, "").length;
          return /^\+?[\d\s()-]+$/.test(value) && count >= 10 && count <= 15;
        }, "Телефон — цифрами, например +7 900 123-45-67."),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .refine(
          (value) => value === "" || z.email().safeParse(value).success,
          "Проверьте адрес: нужны «@» и домен, например info@priyut.ru.",
        ),
      // Stored as links, so the site can use them as they are.
      telegram: z
        .string()
        .trim()
        .refine(
          (value) => value === "" || TELEGRAM.test(value),
          "Укажите ник (@priyut) или ссылку https://t.me/priyut.",
        )
        .transform((value) => value.replace(TELEGRAM, "https://t.me/$1")),
      vk: z
        .string()
        .trim()
        .refine(
          (value) => value === "" || VK.test(value),
          "Укажите ссылку на страницу: https://vk.com/priyut.",
        )
        .transform((value) => value.replace(VK, "https://vk.com/$1")),
    }),
    presets: z.object({ oneTime: amounts, monthly: amounts }),
    timeZone: z.string().refine(isTimeZone, "Выберите часовой пояс из списка."),
  })
  .transform(({ requisites, contacts, presets, timeZone }): Settings => ({
    "shelter.requisites": requisites,
    "shelter.contacts": contacts,
    "donation.presetAmounts": {
      oneTimeKop: presets.oneTime,
      monthlyKop: presets.monthly,
    },
    "shelter.timezone": timeZone,
  }));

export type SettingsFormValues = z.input<typeof settingsFormSchema>;

const amountRows = (kop: readonly number[]) =>
  kop.map((value) => ({ amount: formatRub(value, { symbol: false }) }));

/** Stored settings as the form shows them; shares nothing with `settings`. */
export function settingsFormValues(settings: Settings): SettingsFormValues {
  const presets = settings["donation.presetAmounts"];
  return {
    requisites: { ...settings["shelter.requisites"] },
    contacts: { ...settings["shelter.contacts"] },
    presets: {
      oneTime: amountRows(presets.oneTimeKop),
      monthly: amountRows(presets.monthlyKop),
    },
    timeZone: settings["shelter.timezone"],
  };
}
