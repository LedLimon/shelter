"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { validateRubInput, type RubInputError } from "@/lib/money";
import { startTestPayment } from "./actions";

const AMOUNT_ERRORS: Record<RubInputError, string> = {
  empty: "Введите сумму, например 500.",
  invalid: "Введите сумму цифрами, например 500 или 1 500,50.",
  negative: "Сумма не может быть отрицательной.",
  "too-many-decimals": "Копеек — не больше двух знаков после запятой.",
  "too-large": "Слишком большая сумма: не больше 21 474 836,47 ₽.",
};

const schema = z.object({
  amount: z.string().superRefine((value, context) => {
    const result = validateRubInput(value);
    if (!result.ok) {
      context.addIssue({
        code: "custom",
        message: AMOUNT_ERRORS[result.error],
      });
    } else if (result.kop === 0) {
      context.addIssue({
        code: "custom",
        message: "Сумма должна быть больше нуля.",
      });
    }
  }),
  email: z
    .string()
    .trim()
    .min(1, "Укажите почту плательщика.")
    .pipe(z.email("В адресе нужны «@» и домен, например donor@example.ru.")),
  monthly: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** Starts a test payment and opens the emulated widget. */
export function TestPaymentForm() {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState<string>();
  // Set on success: the button keeps loading until the widget page opens.
  const [leaving, setLeaving] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: "500",
      email: "donor@shelter.localhost",
      monthly: false,
    },
  });

  async function onSubmit({ amount, email, monthly }: FormValues) {
    setError(undefined);
    const parsed = validateRubInput(amount);
    if (!parsed.ok) return;

    let result: Awaited<ReturnType<typeof startTestPayment>>;
    try {
      result = await startTestPayment({
        amountKop: parsed.kop,
        email,
        monthly,
      });
    } catch {
      setError(
        "Не получилось начать платёж. Проверьте, что сервер запущен, и попробуйте ещё раз.",
      );
      return;
    }
    if ("error" in result) {
      setError(
        "Сервер не принял сумму или почту. Проверьте поля и попробуйте ещё раз.",
      );
      return;
    }
    setLeaving(true);
    router.push(result.url);
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-5"
    >
      {error && <FormAlert>{error}</FormAlert>}
      <Controller
        name="amount"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-amount`}>Сумма, ₽</FieldLabel>
            <Input
              {...field}
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? `${id}-amount-error` : undefined
              }
              className="tabular-nums"
            />
            <FieldError id={`${id}-amount-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-email`}>Почта плательщика</FieldLabel>
            <Input
              {...field}
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? `${id}-email-error` : undefined
              }
            />
            <FieldError id={`${id}-email-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="monthly"
        control={form.control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-monthly`}
              name={field.name}
              checked={field.value}
              onCheckedChange={field.onChange}
              inputRef={field.ref}
              aria-describedby={`${id}-monthly-note`}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${id}-monthly`} variant="option">
                Ежемесячно
              </FieldLabel>
              <FieldDescription id={`${id}-monthly-note`}>
                Первый платёж создаст подписку: в&nbsp;уведомлении Pay придёт её
                номер.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
      <Button
        type="submit"
        loading={form.formState.isSubmitting || leaving}
        className="w-full"
      >
        Перейти к оплате
      </Button>
    </form>
  );
}
