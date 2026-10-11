"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { useFieldArray, type Control } from "react-hook-form";
import {
  ActionFailureAlert,
  useActionForm,
} from "@/components/admin/action-form";
import { FormActions } from "@/components/admin/form-actions";
import { Panel } from "@/components/admin/panel";
import {
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { Settings } from "@/server/settings/schema";
import { saveSettings } from "./actions";
import {
  MAX_PRESET_AMOUNTS,
  settingsFormSchema,
  type SettingsFormValues,
} from "./schema";

type SettingsControl = Control<SettingsFormValues, unknown, Partial<Settings>>;

/**
 * The reference admin form: fields from src/components/form, a zod schema
 * shared with the server action, useActionForm() for everything that can come
 * back from it.
 */
export function SettingsForm({
  defaultValues,
  timeZones,
}: {
  defaultValues: SettingsFormValues;
  timeZones: { value: string; label: string }[];
}) {
  const { form, submit, failure } = useActionForm({
    schema: settingsFormSchema,
    defaultValues,
    action: saveSettings,
    // Four settings in one form: only the changed ones are sent.
    changedOnly: true,
    success: "Настройки сохранены",
    savedValues: (saved) => saved,
  });
  const { control } = form;
  const { isSubmitting, isDirty } = form.formState;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid max-w-3xl gap-grid"
    >
      <Panel
        title="Реквизиты"
        description="Для пожертвований переводом на счёт и для документов. Сверьте с карточкой организации из банка: по этим цифрам люди переводят деньги."
      >
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-6">
          <TextField
            control={control}
            name="requisites.legalName"
            label="Название организации"
            description="Полностью, как в уставе."
            autoComplete="off"
            className="md:col-span-6"
          />
          <TextField
            control={control}
            name="requisites.inn"
            label="ИНН"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="tabular-nums"
            className="md:col-span-2"
          />
          <TextField
            control={control}
            name="requisites.kpp"
            label="КПП"
            autoComplete="off"
            spellCheck={false}
            inputClassName="tabular-nums"
            className="md:col-span-2"
          />
          <TextField
            control={control}
            name="requisites.ogrn"
            label="ОГРН"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="tabular-nums"
            className="md:col-span-2"
          />
          <TextField
            control={control}
            name="requisites.bankName"
            label="Банк"
            autoComplete="off"
            className="md:col-span-4"
          />
          <TextField
            control={control}
            name="requisites.bik"
            label="БИК"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="tabular-nums"
            className="md:col-span-2"
          />
          <TextField
            control={control}
            name="requisites.account"
            label="Расчётный счёт"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="tabular-nums"
            className="md:col-span-3"
          />
          <TextField
            control={control}
            name="requisites.correspondentAccount"
            label="Корреспондентский счёт"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="tabular-nums"
            className="md:col-span-3"
          />
        </div>
      </Panel>

      <Panel
        title="Контакты приюта"
        description="Их видят все посетители сайта."
      >
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          <TextareaField
            control={control}
            name="contacts.address"
            label="Адрес"
            description="Как доехать — тоже сюда: ориентир, остановка."
            autoComplete="off"
            inputClassName="min-h-20"
            className="md:col-span-2"
          />
          <TextField
            control={control}
            name="contacts.phone"
            label="Телефон"
            description="С кодом страны: +7 900 123-45-67."
            type="tel"
            inputMode="tel"
            autoComplete="off"
          />
          <TextField
            control={control}
            name="contacts.email"
            label="Почта"
            description="На неё пишут посетители сайта."
            type="email"
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            control={control}
            name="contacts.telegram"
            label="Telegram"
            description="Ник с @ или ссылка на канал."
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            control={control}
            name="contacts.vk"
            label="ВКонтакте"
            description="Ссылка на страницу приюта: vk.com/…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Panel>

      <Panel
        title="Готовые суммы пожертвования"
        // «Шести» is MAX_PRESET_AMOUNTS in words.
        description="Кнопки с этими суммами видит донор в форме пожертвования. В каждом списке — от одной до шести сумм, в том же порядке, что и здесь."
      >
        <div className="grid gap-x-4 gap-y-6 md:grid-cols-2">
          <AmountList
            control={control}
            name="presets.oneTime"
            legend="Разово, ₽"
          />
          <AmountList
            control={control}
            name="presets.monthly"
            legend="Каждый месяц, ₽"
          />
        </div>
      </Panel>

      <Panel title="Дата и время">
        <SelectField
          control={control}
          name="timeZone"
          label="Часовой пояс"
          description="В этом поясе сайт показывает даты и время и считает сроки нужд. Уже закрытые месяцы отчётности от смены пояса не сдвигаются."
          options={timeZones}
          className="md:max-w-sm"
        />
      </Panel>

      <FormActions>
        <ActionFailureAlert failure={failure} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Сохраняем…" : "Сохранить"}
          </Button>
          {isDirty && !isSubmitting && (
            <p className="text-caption text-toner-muted">
              Есть несохранённые изменения.
            </p>
          )}
        </div>
      </FormActions>
    </form>
  );
}

/** Amounts of one donation kind: a row per amount, added and removed. */
function AmountList({
  control,
  name,
  legend,
}: {
  control: SettingsControl;
  name: "presets.oneTime" | "presets.monthly";
  legend: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const addButton = useRef<HTMLButtonElement>(null);

  return (
    <FieldSet className="gap-2">
      <FieldLegend>{legend}</FieldLegend>
      <ul className="grid gap-2">
        {fields.map((row, index) => (
          <li key={row.id} className="flex items-start gap-2">
            <TextField
              control={control}
              name={`${name}.${index}.amount`}
              label={`${legend}: сумма ${index + 1}`}
              labelHidden
              inputMode="decimal"
              autoComplete="off"
              inputClassName="tabular-nums"
              className="min-w-0 flex-1"
            />
            {/* The last amount stays: a list can't be empty. */}
            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  remove(index);
                  // The row's button is gone: keep focus inside the list.
                  // After the render: a full list had «Добавить» disabled.
                  setTimeout(() => addButton.current?.focus());
                }}
              >
                <Trash2 aria-hidden />
                <span className="sr-only">Удалить сумму {index + 1}</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        ref={addButton}
        type="button"
        variant="outline"
        size="sm"
        className="self-start justify-self-start"
        disabled={fields.length >= MAX_PRESET_AMOUNTS}
        onClick={() => append({ amount: "" })}
      >
        <Plus aria-hidden />
        Добавить сумму
      </Button>
    </FieldSet>
  );
}
