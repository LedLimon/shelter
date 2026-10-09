"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
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

const schema = z.object({
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
  email: z.email(
    "Проверьте адрес: нужны «@» и домен, например name@example.ru.",
  ),
  frequency: z.enum(["once", "monthly"], {
    error: "Выберите, как часто помогать.",
  }),
  comment: z
    .string()
    .max(COMMENT_MAX, `Не больше ${COMMENT_MAX} знаков.`)
    .optional(),
  consent: z.boolean().refine(Boolean, {
    message: "Без согласия мы не сможем принять пожертвование.",
  }),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const DEFAULT_VALUES: Partial<FormInput> = {
  amount: "",
  email: "",
  comment: "",
  consent: false,
};

/** react-hook-form + zod with Field components: the pattern for every form. */
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
                placeholder="500"
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={
                  fieldState.invalid
                    ? "donate-amount-error"
                    : "donate-amount-hint"
                }
                className="tabular-nums"
              />
              {fieldState.invalid ? (
                <FieldError
                  id="donate-amount-error"
                  errors={[fieldState.error]}
                />
              ) : (
                <FieldDescription id="donate-amount-hint">
                  От&nbsp;{formatRub(MIN_AMOUNT_KOP)}. Можно с&nbsp;копейками:
                  1&nbsp;500,50.
                </FieldDescription>
              )}
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

        <Controller
          name="consent"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field
              orientation="horizontal"
              data-invalid={fieldState.invalid || undefined}
            >
              <Checkbox
                id="donate-consent"
                name={field.name}
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                inputRef={field.ref}
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={
                  fieldState.invalid ? "donate-consent-error" : undefined
                }
              />
              <FieldContent>
                <FieldLabel htmlFor="donate-consent" variant="option">
                  Принимаю оферту и&nbsp;политику обработки персональных данных
                </FieldLabel>
                <FieldError
                  id="donate-consent-error"
                  errors={[fieldState.error]}
                />
              </FieldContent>
            </Field>
          )}
        />
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
