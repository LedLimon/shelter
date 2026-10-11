"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { attempt, authClient } from "./auth-client";
import { authErrorMessage, restartsSignIn } from "./auth-errors";
import { normalizeBackupCode } from "./backup-code";
import { FormAlert, formLinkClass } from "./form-alert";

type Step = "password" | "totp" | "backup";

const TOTP_LENGTH = 6;

/**
 * Staff sign-in: email and password, then the code from the authenticator
 * (or a backup code). Better Auth creates the session only after the code.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string>();
  // Kept across steps: shown at the code step, prefilled if sign-in restarts.
  const [email, setEmail] = useState("");

  function restart(message?: string) {
    setStep("password");
    setError(message);
  }

  function signedIn() {
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {step === "password" ? (
        <PasswordStep
          defaultEmail={email}
          error={error}
          setError={setError}
          onTwoFactor={(signedInEmail) => {
            setEmail(signedInEmail);
            setError(undefined);
            setStep("totp");
          }}
          onSignedIn={signedIn}
        />
      ) : (
        <CodeStep
          key={step}
          kind={step}
          email={email}
          error={error}
          setError={setError}
          onRestart={restart}
          onSignedIn={signedIn}
          onSwitch={() => {
            setError(undefined);
            setStep(step === "totp" ? "backup" : "totp");
          }}
          onBack={() => restart()}
        />
      )}
      <p className="border-t border-perforation pt-4 text-caption text-toner-muted">
        Забыли пароль или потеряли телефон вместе с резервными кодами? Напишите
        владельцу приюта.
      </p>
    </div>
  );
}

type StepProps = {
  error: string | undefined;
  setError: (message: string | undefined) => void;
  onSignedIn: () => void;
};

const passwordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите email.")
    .pipe(z.email("В email должны быть «@» и домен, например anna@priyut.ru.")),
  password: z.string().min(1, "Введите пароль."),
});

function PasswordStep({
  defaultEmail,
  error,
  setError,
  onTwoFactor,
  onSignedIn,
}: StepProps & {
  defaultEmail: string;
  onTwoFactor: (email: string) => void;
}) {
  const id = useId();
  // Set on success: the form keeps loading until the next screen replaces it.
  const [leaving, setLeaving] = useState(false);
  const form = useForm<
    z.input<typeof passwordSchema>,
    unknown,
    z.output<typeof passwordSchema>
  >({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: defaultEmail, password: "" },
  });

  async function onSubmit({
    email,
    password,
  }: z.output<typeof passwordSchema>) {
    setError(undefined);
    let needsCode = false;
    const failure = await attempt(async (fetchOptions) => {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions,
      });
      needsCode = Boolean(
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect,
      );
      return result;
    });

    if (!failure) {
      setLeaving(true);
      return needsCode ? onTwoFactor(email) : onSignedIn();
    }
    setError(authErrorMessage(failure));
    form.setFocus("password", { shouldSelect: true });
  }

  return (
    // method="post": a submit before hydration must not put the password
    // into the URL (GET is the default).
    <form
      method="post"
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-5"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Вход для сотрудников</h1>
        <p className="text-caption text-toner-muted">
          После пароля спросим код из приложения на телефоне.
        </p>
      </header>
      {error && <FormAlert>{error}</FormAlert>}
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
            <Input
              {...field}
              id={`${id}-email`}
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
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
        name="password"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-password`}>Пароль</FieldLabel>
            <Input
              {...field}
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? `${id}-password-error` : undefined
              }
            />
            <FieldError
              id={`${id}-password-error`}
              errors={[fieldState.error]}
            />
          </Field>
        )}
      />
      <Button
        type="submit"
        loading={form.formState.isSubmitting || leaving}
        className="w-full"
      >
        Дальше
      </Button>
    </form>
  );
}

const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Введите 6 цифр из приложения."),
});
const backupSchema = z.object({
  code: z.string().trim().min(1, "Введите резервный код."),
});

function CodeStep({
  kind,
  email,
  error,
  setError,
  onSignedIn,
  onRestart,
  onSwitch,
  onBack,
}: StepProps & {
  kind: "totp" | "backup";
  email: string;
  onRestart: (message: string) => void;
  onSwitch: () => void;
  onBack: () => void;
}) {
  const id = useId();
  const isTotp = kind === "totp";
  const [leaving, setLeaving] = useState(false);
  const form = useForm<{ code: string }>({
    resolver: zodResolver(isTotp ? totpSchema : backupSchema),
    defaultValues: { code: "" },
  });
  const pending = form.formState.isSubmitting || leaving;

  // The step replaces the password form: move focus to its only field.
  useEffect(() => form.setFocus("code"), [form]);

  async function onSubmit({ code }: { code: string }) {
    setError(undefined);
    const failure = await attempt((fetchOptions) =>
      isTotp
        ? authClient.twoFactor.verifyTotp({ code, fetchOptions })
        : authClient.twoFactor.verifyBackupCode({
            code: normalizeBackupCode(code),
            fetchOptions,
          }),
    );

    if (!failure) {
      setLeaving(true);
      return onSignedIn();
    }
    if (restartsSignIn(failure)) return onRestart(authErrorMessage(failure));
    setError(authErrorMessage(failure));
    // A new TOTP code is typed from scratch; a backup code copied from paper
    // is kept for fixing a typo.
    if (isTotp) form.setValue("code", "");
    form.setFocus("code", { shouldSelect: !isTotp });
  }

  const submit = form.handleSubmit(onSubmit);
  const describedBy = (invalid: boolean) =>
    [invalid && `${id}-code-error`, error && `${id}-alert`]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-title">
          {isTotp ? "Код из приложения" : "Резервный код"}
        </h1>
        <p className="text-caption text-toner-muted">
          {isTotp
            ? "Откройте приложение-аутентификатор и введите 6 цифр для "
            : "Введите один из кодов, которые вы сохранили при настройке входа для "}
          <span className="[overflow-wrap:anywhere] text-toner">{email}</span>
          {isTotp ? "." : ". Каждый код работает один раз."}
        </p>
      </header>
      {error && <FormAlert id={`${id}-alert`}>{error}</FormAlert>}
      <Controller
        name="code"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-code`}>
              {isTotp ? "Код" : "Резервный код"}
            </FieldLabel>
            {isTotp ? (
              <Input
                {...field}
                id={`${id}-code`}
                onChange={(event) => {
                  const digits = event.target.value
                    .replace(/\D/g, "")
                    .slice(0, TOTP_LENGTH);
                  field.onChange(digits);
                  // A full code submits itself: one less tap on the phone.
                  if (digits.length === TOTP_LENGTH && !pending) {
                    void submit();
                  }
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={TOTP_LENGTH}
                readOnly={pending}
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy(fieldState.invalid)}
                className="font-mono text-sum tracking-[0.3em] tabular-nums"
              />
            ) : (
              <Input
                {...field}
                id={`${id}-code`}
                placeholder="xxxxx-xxxxx"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={pending}
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy(fieldState.invalid)}
                className="font-mono"
              />
            )}
            <FieldError id={`${id}-code-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Button type="submit" loading={pending} className="w-full">
        Войти
      </Button>
      <div className="flex flex-col items-start">
        <Button
          type="button"
          variant="link"
          onClick={onSwitch}
          className={formLinkClass}
        >
          {isTotp
            ? "Нет телефона под рукой — войти резервным кодом"
            : "Ввести код из приложения"}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={onBack}
          className={cn(formLinkClass, "text-toner-muted hover:text-toner")}
        >
          Войти под другой учётной записью
        </Button>
      </div>
    </form>
  );
}
