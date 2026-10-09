"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { attempt, authClient } from "./auth-client";
import { authErrorMessage, restartsSignIn } from "./auth-errors";
import { normalizeBackupCode } from "./backup-code";
import {
  AUTH_LINK_CLASS,
  Field,
  FormError,
  formText,
  SubmitButton,
} from "./field";

type Step = "password" | "totp" | "backup";

type FieldName = "email" | "password";

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
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formElement = event.currentTarget;
    const focus = (name: FieldName, select = false) => {
      const input = formElement.querySelector<HTMLInputElement>(
        `[name=${name}]`,
      );
      input?.focus();
      if (select) input?.select();
    };
    const form = new FormData(formElement);
    const email = formText(form, "email").trim();
    const password = formText(form, "password");

    const errors = {
      email: !email
        ? "Введите email."
        : !/^[^\s@]+@[^\s@]+$/.test(email)
          ? "В email должны быть «@» и домен, например anna@priyut.ru."
          : undefined,
      password: password ? undefined : "Введите пароль.",
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      focus(errors.email ? "email" : "password");
      return;
    }

    setPending(true);
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

    // On success the form stays pending until the next screen replaces it.
    if (needsCode) return onTwoFactor(email);
    if (!failure) return onSignedIn();
    setPending(false);
    setError(authErrorMessage(failure));
    focus("password", true);
  }

  return (
    // method="post": a submit before hydration must not put the password
    // into the URL (GET is the default).
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      onChange={(event) => {
        // A field's error goes once the user starts fixing it.
        const target: EventTarget = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const { name } = target;
        if (name === "email" || name === "password") {
          setFieldErrors((errors) => ({ ...errors, [name]: undefined }));
        }
      }}
      className="flex flex-col gap-5"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Вход для сотрудников</h1>
        <p className="text-caption text-toner-muted">
          После пароля спросим код из приложения на телефоне.
        </p>
      </header>
      {error && <FormError>{error}</FormError>}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        defaultValue={defaultEmail}
        error={fieldErrors.email}
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.password}
      />
      <SubmitButton pending={pending} pendingLabel="Проверяем…">
        Дальше
      </SubmitButton>
    </form>
  );
}

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
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const isTotp = kind === "totp";

  // The step replaces the password form: move focus to its only field.
  useEffect(() => input.current?.focus(), []);

  async function verify(value: string) {
    if (pending) return;
    if (!value.trim()) {
      setError(
        isTotp ? "Введите код из приложения." : "Введите резервный код.",
      );
      input.current?.focus();
      return;
    }

    setPending(true);
    setError(undefined);
    const failure = await attempt((fetchOptions) =>
      isTotp
        ? authClient.twoFactor.verifyTotp({ code: value, fetchOptions })
        : authClient.twoFactor.verifyBackupCode({
            code: normalizeBackupCode(value),
            fetchOptions,
          }),
    );

    // On success the form stays pending until the admin replaces it.
    if (!failure) return onSignedIn();
    setPending(false);
    if (restartsSignIn(failure)) return onRestart(authErrorMessage(failure));
    setError(authErrorMessage(failure));
    // A new TOTP code is typed from scratch; a backup code copied from paper
    // is kept for fixing a typo.
    if (isTotp) setCode("");
    input.current?.focus();
    if (!isTotp) input.current?.select();
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
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
      {error && (
        <div id={errorId}>
          <FormError>{error}</FormError>
        </div>
      )}
      {isTotp ? (
        <Field
          ref={input}
          label="Код"
          name="code"
          value={code}
          onChange={(event) => {
            const digits = event.target.value
              .replace(/\D/g, "")
              .slice(0, TOTP_LENGTH);
            setCode(digits);
            // A full code submits itself: one less tap on the phone.
            if (digits.length === TOTP_LENGTH) void verify(digits);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={TOTP_LENGTH}
          readOnly={pending}
          aria-describedby={error ? errorId : undefined}
          className="font-mono text-sum tracking-[0.3em] tabular-nums"
        />
      ) : (
        <Field
          ref={input}
          label="Резервный код"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="xxxxx-xxxxx"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={pending}
          aria-describedby={error ? errorId : undefined}
          className="font-mono"
        />
      )}
      <SubmitButton pending={pending} pendingLabel="Проверяем…">
        Войти
      </SubmitButton>
      <div className="flex flex-col items-start text-caption">
        <button
          type="button"
          onClick={onSwitch}
          className={cn(AUTH_LINK_CLASS, "text-pen")}
        >
          {isTotp
            ? "Нет телефона под рукой — войти резервным кодом"
            : "Ввести код из приложения"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className={cn(AUTH_LINK_CLASS, "text-toner-muted hover:text-toner")}
        >
          Войти под другой учётной записью
        </button>
      </div>
    </form>
  );
}
