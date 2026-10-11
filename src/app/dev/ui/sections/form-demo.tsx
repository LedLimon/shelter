"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ConsentCheckboxes } from "@/components/legal/consent-checkboxes";
import { Button } from "@/components/ui/button";
import {
  Field,
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
import {
  consentsSchema,
  noConsents,
  NOT_GIVEN,
  type ConsentDocument,
} from "@/server/legal/consent-input";

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

// Stand-ins for consentDocuments(): the real form gets the versions in force
// from the server.
const CONSENT_DOCUMENTS: ConsentDocument[] = [
  { id: "demo-offer-v3", type: "OFFER", version: 3 },
  { id: "demo-pd-consent-v2", type: "PD_CONSENT", version: 2 },
  { id: "demo-recurring-v1", type: "RECURRING", version: 1 },
  { id: "demo-marketing-v1", type: "MARKETING", version: 1 },
];

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
    consents: consentsSchema({
      required: {
        OFFER: "Чтобы помочь, примите условия оферты.",
        PD_CONSENT:
          "Без согласия на обработку персональных данных мы не сможем принять пожертвование.",
      },
      optional: ["RECURRING", "MARKETING"],
    }),
  })
  .refine(
    (values) =>
      values.frequency !== "monthly" || values.consents.RECURRING !== NOT_GIVEN,
    {
      path: ["consents", "RECURRING"],
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
  consents: noConsents(["OFFER", "PD_CONSENT", "RECURRING", "MARKETING"]),
};

/**
 * The mechanics every form follows: react-hook-form + zod + Field, and the
 * consent boxes of ConsentCheckboxes. Not the donation form itself — that one
 * (DS-3, DON) sends the consents to recordConsents().
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

  // The real form gets a new version from the server (router.refresh()).
  const [offerVersion, setOfferVersion] = useState(3);
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

        <ConsentCheckboxes
          control={form.control}
          name="consents"
          documents={CONSENT_DOCUMENTS.filter(
            ({ type }) => type !== "RECURRING" || frequency === "monthly",
          ).map((document) =>
            document.type === "OFFER"
              ? {
                  ...document,
                  id: `demo-offer-v${offerVersion}`,
                  version: offerVersion,
                }
              : document,
          )}
          recurringTerms={`${monthlySum} каждый месяц`}
        />
        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setOfferVersion((version) => version + 1)}
          >
            Пример: вышла новая версия оферты
          </Button>
          <p className="text-caption text-muted-foreground">
            Сейчас форма показывает версию {offerVersion}. Отметка оферты при
            этом снимается: согласие давали с&nbsp;прежним текстом.
          </p>
        </div>
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
