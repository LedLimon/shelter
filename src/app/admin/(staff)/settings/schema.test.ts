import { describe, expect, it } from "vitest";
import { defaultSettings, settingSchemas } from "@/server/settings/schema";
import {
  MAX_PRESET_AMOUNTS,
  settingsChangesSchema,
  settingsFormSchema,
  settingsFormValues,
  type SettingsFormValues,
} from "./schema";

const defaults = defaultSettings("Europe/Moscow");

function form(change: (values: SettingsFormValues) => void) {
  const values = structuredClone(settingsFormValues(defaults));
  change(values);
  return values;
}

/** Messages of a failed parse by field path. */
function errorsOf(values: SettingsFormValues): Record<string, string> {
  const result = settingsFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map(({ path, message }) => [path.join("."), message]),
  );
}

describe("settings form", () => {
  it("round-trips the stored settings unchanged", () => {
    expect(settingsFormSchema.parse(settingsFormValues(defaults))).toEqual(
      defaults,
    );
  });

  it("shows amounts in rubles and stores them in kopecks", () => {
    const values = settingsFormValues(defaults);
    expect(values.presets.oneTime.map(({ amount }) => amount)).toEqual([
      "300",
      "500",
      "1\u00A0000",
      "3\u00A0000",
    ]);

    values.presets.monthly = [{ amount: "250" }, { amount: "1 500,50" }];
    expect(
      settingsFormSchema.parse(values)["donation.presetAmounts"]?.monthlyKop,
    ).toEqual([25_000, 150_050]);
  });

  it("produces values the settings store accepts", () => {
    const settings = settingsFormSchema.parse(
      form((values) => {
        values.requisites.inn = "7707083893";
        values.contacts.telegram = "@priyut";
      }),
    );

    for (const key of Object.keys(
      settingSchemas,
    ) as (keyof typeof settings)[]) {
      expect(settingSchemas[key].parse(settings[key])).toEqual(settings[key]);
    }
  });

  it("as the action's input, turns only the groups it was given into settings", () => {
    const { contacts, timeZone } = form((values) => {
      values.contacts.telegram = "@priyut";
      values.timeZone = "Asia/Omsk";
    });

    expect(settingsChangesSchema.parse({ contacts, timeZone })).toEqual({
      "shelter.contacts": {
        ...defaults["shelter.contacts"],
        telegram: "https://t.me/priyut",
      },
      "shelter.timezone": "Asia/Omsk",
    });
    expect(settingsChangesSchema.parse({})).toEqual({});
    // The browser checks the whole form: there every group is required.
    expect(settingsFormSchema.safeParse({ contacts, timeZone }).success).toBe(
      false,
    );
  });

  it.each(["info@приют.рф", "info@xn--h1alffa9f.xn--p1ai", "a.b+c@mail.ru"])(
    "accepts the email %j",
    (email) => {
      expect(
        errorsOf(
          form((values) => {
            values.contacts.email = email;
          }),
        ),
      ).toEqual({});
    },
  );

  it.each(["info@", "@priyut.ru", "info@priyut", "in fo@priyut.ru"])(
    "rejects the email %j",
    (email) => {
      expect(
        errorsOf(
          form((values) => {
            values.contacts.email = email;
          }),
        ),
      ).toHaveProperty(["contacts.email"]);
    },
  );

  it("normalises what was typed", () => {
    const settings = settingsFormSchema.parse(
      form((values) => {
        values.requisites.legalName = "  АНО «Островок»  ";
        values.requisites.account = "4070 3810 9380 0000 1234";
        values.requisites.kpp = "7701ab001";
        values.contacts.email = " Info@Priyut.RU ";
        values.contacts.telegram = "@priyut_dogs";
        values.contacts.vk = "vk.com/priyut";
      }),
    );

    expect(settings["shelter.requisites"]).toMatchObject({
      legalName: "АНО «Островок»",
      account: "40703810938000001234",
      kpp: "7701AB001",
    });
    expect(settings["shelter.contacts"]).toMatchObject({
      email: "info@priyut.ru",
      telegram: "https://t.me/priyut_dogs",
      vk: "https://vk.com/priyut",
    });
  });

  it.each([
    ["https://t.me/priyut", "https://t.me/priyut"],
    ["t.me/priyut", "https://t.me/priyut"],
    ["", ""],
  ])("stores the Telegram contact %j as %j", (typed, stored) => {
    const settings = settingsFormSchema.parse(
      form((values) => {
        values.contacts.telegram = typed;
      }),
    );

    expect(settings["shelter.contacts"]?.telegram).toBe(stored);
  });

  it("says what is wrong with each field", () => {
    const errors = errorsOf(
      form((values) => {
        values.requisites.inn = "12345";
        values.requisites.kpp = "77010100";
        values.requisites.ogrn = "abc";
        values.requisites.bik = "04452522";
        values.requisites.account = "4070381093800000123";
        values.contacts.phone = "позвоните нам";
        values.contacts.email = "info@";
        values.contacts.telegram = "priyut";
        values.contacts.vk = "javascript:alert(1)";
        values.timeZone = "Moscow";
      }),
    );

    expect(errors).toEqual({
      "requisites.inn": "ИНН — 10 цифр у организации или 12 у ИП.",
      "requisites.kpp": "КПП — 9 знаков, например 770101001.",
      "requisites.ogrn": "ОГРН — 13 цифр, ОГРНИП — 15.",
      "requisites.bik": "БИК — 9 цифр.",
      "requisites.account": "Расчётный счёт — 20 цифр.",
      "contacts.phone": "Телефон — цифрами, например +7 900 123-45-67.",
      "contacts.email":
        "Проверьте адрес: нужны «@» и домен, например info@priyut.ru.",
      "contacts.telegram":
        "Укажите ник (@priyut) или ссылку https://t.me/priyut.",
      "contacts.vk": "Укажите ссылку на страницу: https://vk.com/priyut.",
      timeZone: "Выберите часовой пояс из списка.",
    });
  });

  it.each(["+7 900 123-45-67", "8 (900) 123 45 67", "+79001234567"])(
    "accepts the phone %j",
    (phone) => {
      expect(
        errorsOf(
          form((values) => {
            values.contacts.phone = phone;
          }),
        ),
      ).toEqual({});
    },
  );

  it("rejects amounts that are empty, too small, not numbers or repeated", () => {
    const errors = errorsOf(
      form((values) => {
        values.presets.oneTime = [
          { amount: "" },
          { amount: "99,99" },
          { amount: "пятьсот" },
          { amount: "100" },
        ];
        values.presets.monthly = [
          { amount: "500" },
          { amount: "1000" },
          { amount: "500,00" },
        ];
      }),
    );

    expect(errors).toEqual({
      "presets.oneTime.0.amount": "Введите сумму или удалите строку.",
      "presets.oneTime.1.amount":
        "Не меньше 100\u00A0₽: это минимальное пожертвование.",
      "presets.oneTime.2.amount":
        "Введите сумму цифрами, например 500 или 1 500.",
      "presets.monthly.2.amount": "Такая сумма уже есть в списке.",
    });
  });

  it("needs between one and the maximum number of amounts", () => {
    const errors = errorsOf(
      form((values) => {
        values.presets.oneTime = [];
        values.presets.monthly = Array.from(
          { length: MAX_PRESET_AMOUNTS + 1 },
          (_, index) => ({ amount: String(100 * (index + 1)) }),
        );
      }),
    );

    expect(errors).toEqual({
      "presets.oneTime": "Нужна хотя бы одна сумма.",
      "presets.monthly": `Не больше ${MAX_PRESET_AMOUNTS} сумм.`,
    });
  });
});
