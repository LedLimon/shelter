import { z } from "zod";
import { isEmailAddress } from "@/lib/mailbox";
import { formatRub, validateRubInput, type RubInputError } from "@/lib/money";
import { isTimeZone } from "@/lib/time-zones";
import { MIN_DONATION_KOP, type Settings } from "@/server/settings/schema";

// The settings form: what the owner types (strings) → what is stored
// (src/server/settings/schema.ts). The form and the server action parse with
// the same fields, so an error from the server lands on the same field.

export const MAX_PRESET_AMOUNTS = 6;

const text = (max: number) =>
  z.string().trim().max(max, `Не длиннее ${max} знаков.`);

/**
 * Digits of one of the lengths, or empty. Separators of a pasted value go:
 * spaces, dots and dashes, as in «40703.810.9.3800.0001234».
 */
const digits = (lengths: readonly number[], message: string) =>
  z
    .string()
    .transform((value) => value.replace(/[\s.\-\u2010-\u2015]/g, ""))
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
  if (result.kop < MIN_DONATION_KOP) {
    context.addIssue({
      code: "custom",
      message: `Не меньше ${formatRub(MIN_DONATION_KOP)}: это минимальное пожертвование.`,
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

// z.email() takes only Latin domains; a shelter may well live on .рф.
const EMAIL = /^[^\s@"]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;
const TELEGRAM = /^(?:https:\/\/t\.me\/|t\.me\/|@)([A-Za-z0-9_]{4,32})$/;
const VK = /^(?:https:\/\/)?(?:m\.)?vk\.(?:com|ru)\/([\w.-]{2,64})$/;

const fields = {
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
        // isEmailAddress: letters use this address (the footer, Reply-To)
        // and take only one that passes it.
        (value) => value === "" || (EMAIL.test(value) && isEmailAddress(value)),
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
};

type Parsed = Partial<z.output<z.ZodObject<typeof fields>>>;

/** The groups of the form that are present → the settings they are stored as. */
function toSettings({
  requisites,
  contacts,
  presets,
  timeZone,
}: Parsed): Partial<Settings> {
  return {
    ...(requisites && { "shelter.requisites": requisites }),
    ...(contacts && { "shelter.contacts": contacts }),
    ...(presets && {
      "donation.presetAmounts": {
        oneTimeKop: presets.oneTime,
        monthlyKop: presets.monthly,
      },
    }),
    ...(timeZone !== undefined && { "shelter.timezone": timeZone }),
  };
}

/** The whole form, as the browser checks it before sending. */
export const settingsFormSchema = z.object(fields).transform(toSettings);

/**
 * What the action accepts: the groups the owner changed (useActionForm's
 * `changedOnly`). A tab opened before someone else's change then can't write
 * its old copy of the bank details over the new one.
 */
export const settingsChangesSchema = z
  .object(fields)
  .partial()
  .transform(toSettings);

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
