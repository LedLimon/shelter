"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatRub, validateRubInput, type RubInputError } from "@/lib/money";

const MIN_AMOUNT_KOP = 100_00;
const COMMENT_MAX = 200;

const AMOUNT_ERRORS: Record<RubInputError, string> = {
  empty: "Введите сумму, например 500.",
  invalid: "Введите сумму цифрами, например 500 или 1 500,50.",
  negative: "Сумма не может быть отрицательной.",
  "too-many-decimals": "Копеек — не больше двух знаков после запятой.",
  "too-large": "Слишком большая сумма. Для крупного перевода напишите нам.",
};

const FREQUENCIES = [
  { value: "once", label: "Один раз" },
  { value: "monthly", label: "Каждый месяц" },
] as const;

const schema = z
  .object({
    amount: z.string().superRefine((value, context) => {
      const result = validateRubInput(value);
      if (!result.ok) {
        context.addIssue({
          code: "custom",
          message: AMOUNT_ERRORS[result.error],
        });
      } else if (result.kop < MIN_AMOUNT_KOP) {
        context.addIssue({
          code: "custom",
          message: `Минимальная сумма — ${formatRub(MIN_AMOUNT_KOP)}.`,
        });
      }
    }),
    email: z
      .string()
      .trim()
      .min(1, "Укажите почту — на неё придёт подтверждение.")
      .pipe(
        z.email(
          "Проверьте адрес: нужны «@» и домен, например name@example.ru.",
        ),
      ),
    frequency: z.enum(["once", "monthly"], {
      error: "Выберите, как часто помогать.",
    }),
    comment: z
      .string()
      .max(COMMENT_MAX, `Не больше ${COMMENT_MAX} знаков.`)
      .optional(),
    // docs/legal.md: every consent is its own unchecked box.
    offer: z.boolean().refine(Boolean, {
      message: "Чтобы помочь, примите условия оферты.",
    }),
    personalData: z.boolean().refine(Boolean, {
      message:
        "Без согласия на обработку персональных данных мы не сможем принять пожертвование.",
    }),
    recurring: z.boolean().optional(),
  })
  .refine(
    (values) => values.frequency !== "monthly" || values.recurring === true,
    {
      path: ["recurring"],
      message: "Подтвердите ежемесячное списание или выберите «Один раз».",
      // Report it together with the other errors, not after they are fixed.
      when: () => true,
    },
  );

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const DEFAULT_VALUES: Partial<FormInput> = {
  amount: "",
  email: "",
  comment: "",
  offer: false,
  personalData: false,
  recurring: false,
};

/**
 * The mechanics every form follows: react-hook-form + zod + Field. Not the
 * donation form itself — that one (DS-3, DON) also records consent versions.
 */
export function FormDemo() {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  });

  async function onSubmit(values: FormOutput) {
    // A stand-in for a server action.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const kop = validateRubInput(values.amount);
    toast.success("Спасибо! Это пример", {
      description: `${kop.ok ? formatRub(kop.kop) : values.amount} ${
        values.frequency === "monthly" ? "каждый месяц" : "один раз"
      }. Деньги не списаны: форма ничего не отправляет.`,
    });
    form.reset(DEFAULT_VALUES);
  }

  const comment = useWatch({ control: form.control, name: "comment" }) ?? "";
  const frequency = useWatch({ control: form.control, name: "frequency" });
  const amount = useWatch({ control: form.control, name: "amount" }) ?? "";
  const amountKop = validateRubInput(amount);
  const monthlySum = amountKop.ok
    ? formatRub(amountKop.kop)
    : "выбранную сумму";

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="grid max-w-xl gap-6"
    >
      <FieldGroup>
        <Controller
          name="amount"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="donate-amount">Сумма, ₽</FieldLabel>
              <Input
                {...field}
                id="donate-amount"
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={
                  fieldState.invalid
                    ? "donate-amount-hint donate-amount-error"
                    : "donate-amount-hint"
                }
                className="tabular-nums"
              />
              {/* The rule stays visible next to the error. */}
              <FieldDescription id="donate-amount-hint">
                От&nbsp;{formatRub(MIN_AMOUNT_KOP)}. Можно с&nbsp;копейками:
                1&nbsp;500,50.
              </FieldDescription>
              <FieldError
                id="donate-amount-error"
                errors={[fieldState.error]}
              />
            </Field>
          )}
        />

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="donate-email">Почта для чека</FieldLabel>
              <Input
                {...field}
                id="donate-email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                placeholder="name@example.ru"
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={
                  fieldState.invalid ? "donate-email-error" : undefined
                }
              />
              <FieldError id="donate-email-error" errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          name="frequency"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend>Как часто</FieldLegend>
              <RadioGroup
                name={field.name}
                value={field.value ?? null}
                onValueChange={field.onChange}
                inputRef={field.ref}
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={
                  fieldState.invalid ? "donate-frequency-error" : undefined
                }
              >
                {FREQUENCIES.map(({ value, label }) => (
                  <Field key={value} orientation="horizontal">
                    <RadioGroupItem
                      value={value}
                      id={`donate-frequency-${value}`}
                      aria-invalid={fieldState.invalid || undefined}
                    />
                    <FieldLabel
                      htmlFor={`donate-frequency-${value}`}
                      variant="option"
                    >
                      {label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <FieldError
                id="donate-frequency-error"
                errors={[fieldState.error]}
              />
            </FieldSet>
          )}
        />

        <Controller
          name="comment"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="donate-comment">Комментарий</FieldLabel>
              <Textarea
                {...field}
                id="donate-comment"
                placeholder="Например: на корм для Бурана"
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby="donate-comment-count donate-comment-error"
              />
              <FieldDescription
                id="donate-comment-count"
                className="tabular-nums"
              >
                Необязательно. {comment.length} из {COMMENT_MAX} знаков.
              </FieldDescription>
              <FieldError
                id="donate-comment-error"
                errors={[fieldState.error]}
              />
            </Field>
          )}
        />

        <FieldSet>
          <FieldLegend className="sr-only">Согласия</FieldLegend>
          <ConsentField
            control={form.control}
            name="offer"
            label="Принимаю условия оферты на пожертвование"
          />
          <ConsentField
            control={form.control}
            name="personalData"
            label="Даю согласие на обработку персональных данных"
          />
          {frequency === "monthly" && (
            <ConsentField
              control={form.control}
              name="recurring"
              label={`Разрешаю списывать ${monthlySum} каждый месяц, пока не отменю подписку`}
            />
          )}
        </FieldSet>
      </FieldGroup>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Отправляем…" : "Отправить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => form.reset(DEFAULT_VALUES)}
        >
          Очистить
        </Button>
      </div>
    </form>
  );
}

/** One consent: its own unchecked box, label and error. */
function ConsentField({
  control,
  name,
  label,
}: {
  control: Control<FormInput, unknown, FormOutput>;
  name: "offer" | "personalData" | "recurring";
  label: string;
}) {
  const id = `donate-${name}`;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field
          orientation="horizontal"
          data-invalid={fieldState.invalid || undefined}
        >
          <Checkbox
            id={id}
            name={field.name}
            checked={field.value ?? false}
            onCheckedChange={field.onChange}
            inputRef={field.ref}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
          />
          <FieldContent>
            <FieldLabel htmlFor={id} variant="option">
              {label}
            </FieldLabel>
            <FieldError id={`${id}-error`} errors={[fieldState.error]} />
          </FieldContent>
        </Field>
      )}
    />
  );
}
