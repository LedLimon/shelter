import type { ReactNode } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { PreviewState } from "../pseudo-states";
import { Paper, Section, SpecimenGroup } from "../showcase";

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

const INPUT_STATES: {
  id: string;
  caption: string;
  preview?: PreviewState;
  value?: string;
}[] = [
  { id: "input-empty", caption: "Обычное, с подсказкой" },
  { id: "input-filled", caption: "Заполнено", value: "anna@example.ru" },
  {
    id: "input-hover",
    caption: "Наведение",
    preview: "hover",
    value: "anna@example.ru",
  },
  {
    id: "input-focus",
    caption: "Фокус",
    preview: "focus-visible",
    value: "anna@example.ru",
  },
];

const CATEGORIES = [
  { value: "food", label: "Корм" },
  { value: "vet", label: "Лекарства и ветеринария" },
  { value: "repair", label: "Ремонт и стройка" },
  { value: "work", label: "Работа мастеров: плотник, сварщик, электрик" },
];

function CategorySelect({
  id,
  invalid,
  disabled,
  defaultValue,
  preview,
}: {
  id: string;
  invalid?: boolean;
  disabled?: boolean;
  defaultValue?: string;
  preview?: PreviewState;
}) {
  return (
    <Select items={CATEGORIES} defaultValue={defaultValue} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        data-preview={preview}
      >
        <SelectValue placeholder="Выберите категорию" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Категория нужды</SelectLabel>
          {CATEGORIES.slice(0, 2).map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Хозяйство</SelectLabel>
          {CATEGORIES.slice(2).map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function FieldsSection() {
  return (
    <Section
      id="fields"
      title="Поля"
      description={
        <>
          <code className="font-mono text-mono">Input</code>,{" "}
          <code className="font-mono text-mono">Textarea</code>,{" "}
          <code className="font-mono text-mono">Select</code> — графы бланка:
          бумага, рамка перфорацией, текст Literata 16&nbsp;px. Метка —
          акцидентным капсом над полем. Ошибка удваивает рамку и&nbsp;объясняет
          под полем, что сделать.
        </>
      }
    >
      <Paper>
        <SpecimenGroup title="Input">
          <FieldGrid>
            {INPUT_STATES.map(({ id, caption, preview, value }) => (
              <Field key={id}>
                <FieldLabel htmlFor={id}>Почта для чека</FieldLabel>
                <Input
                  id={id}
                  type="email"
                  autoComplete="off"
                  placeholder="name@example.ru"
                  defaultValue={value}
                  data-preview={preview}
                  aria-describedby={`${id}-caption`}
                />
                <FieldDescription id={`${id}-caption`}>
                  {caption}
                </FieldDescription>
              </Field>
            ))}
            <Field data-invalid>
              <FieldLabel htmlFor="input-error">Почта для чека</FieldLabel>
              <Input
                id="input-error"
                type="email"
                autoComplete="off"
                defaultValue="anna@gmial.com"
                aria-invalid
                aria-describedby="input-error-message"
              />
              <FieldError id="input-error-message">
                Похоже на опечатку в&nbsp;домене: проверьте «gmial.com».
              </FieldError>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="input-disabled">Почта для чека</FieldLabel>
              <Input
                id="input-disabled"
                type="email"
                defaultValue="anna@example.ru"
                disabled
                aria-describedby="input-disabled-caption"
              />
              <FieldDescription id="input-disabled-caption">
                Недоступно: почту меняют в&nbsp;личном кабинете.
              </FieldDescription>
            </Field>
          </FieldGrid>
        </SpecimenGroup>

        <SpecimenGroup title="Textarea">
          <FieldGrid>
            <Field>
              <FieldLabel htmlFor="textarea-normal">Комментарий</FieldLabel>
              <Textarea
                id="textarea-normal"
                placeholder="Например: на корм для Бурана"
                aria-describedby="textarea-normal-caption"
              />
              <FieldDescription id="textarea-normal-caption">
                Необязательно. Увидят только сотрудники приюта.
              </FieldDescription>
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="textarea-error">Что купили</FieldLabel>
              <Textarea
                id="textarea-error"
                defaultValue="Корм"
                aria-invalid
                aria-describedby="textarea-error-message"
              />
              <FieldError id="textarea-error-message">
                Опишите подробнее: что, сколько и&nbsp;для кого — это увидят
                доноры в&nbsp;отчёте.
              </FieldError>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="textarea-disabled">Комментарий</FieldLabel>
              <Textarea
                id="textarea-disabled"
                defaultValue="Сбор закрыт, комментарий не изменить."
                disabled
              />
            </Field>
          </FieldGrid>
        </SpecimenGroup>

        <SpecimenGroup
          title="Select"
          note="Список открывается мышью, Enter, пробелом и стрелками; Esc закрывает. Выделенный пункт — заливка тонером."
        >
          <FieldGrid>
            <Field>
              <FieldLabel htmlFor="select-placeholder">Категория</FieldLabel>
              <CategorySelect id="select-placeholder" />
            </Field>
            <Field>
              <FieldLabel htmlFor="select-value">Категория</FieldLabel>
              <CategorySelect id="select-value" defaultValue="vet" />
            </Field>
            <Field>
              <FieldLabel htmlFor="select-focus">Категория · фокус</FieldLabel>
              <CategorySelect
                id="select-focus"
                defaultValue="food"
                preview="focus-visible"
              />
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="select-error">Категория</FieldLabel>
              <CategorySelect id="select-error" invalid />
              <FieldError id="select-error-error">
                Выберите категорию — по ней нужду найдут в&nbsp;фильтрах.
              </FieldError>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="select-disabled">Категория</FieldLabel>
              <CategorySelect
                id="select-disabled"
                defaultValue="repair"
                disabled
              />
            </Field>
          </FieldGrid>
        </SpecimenGroup>
      </Paper>
    </Section>
  );
}
