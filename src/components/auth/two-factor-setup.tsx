"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { attempt, authClient } from "./auth-client";
import { authErrorMessage } from "./auth-errors";
import { Field, FormError, formText, SubmitButton } from "./field";
import { manualKey, TotpQr } from "./totp-qr";

type Enrollment = { totpURI: string; backupCodes: string[] };

const TOTP_LENGTH = 6;

/**
 * First sign-in of a staff member: confirm the password, add the site to an
 * authenticator app, prove it with a code, save the backup codes. Until the
 * code is accepted, the admin stays closed.
 */
export function TwoFactorSetup({ email }: { email: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [verified, setVerified] = useState(false);

  if (!enrollment) {
    return (
      <PasswordStep
        email={email}
        onEnrolled={setEnrollment}
        onAlreadyEnabled={() => router.refresh()}
      />
    );
  }
  if (!verified) {
    return (
      <ScanStep enrollment={enrollment} onVerified={() => setVerified(true)} />
    );
  }
  return (
    <BackupCodesStep
      codes={enrollment.backupCodes}
      onDone={() => {
        router.replace("/admin");
        router.refresh();
      }}
    />
  );
}

function StepHeader({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  // A later step replaces the form the focus was in: start reading here.
  useEffect(() => {
    if (step > 1) heading.current?.focus();
  }, [step]);

  return (
    <header className="flex flex-col gap-2">
      <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
        {title}
      </h1>
      <p className="font-mono text-mono-sm text-toner-muted uppercase">
        Шаг {step} из 3
      </p>
      <div className="flex flex-col gap-2 text-caption text-toner-muted">
        {children}
      </div>
    </header>
  );
}

function PasswordStep({
  email,
  onEnrolled,
  onAlreadyEnabled,
}: {
  email: string;
  onEnrolled: (enrollment: Enrollment) => void;
  onAlreadyEnabled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formText(new FormData(event.currentTarget), "password");
    if (!password) {
      setError("Введите пароль, с которым вы только что вошли.");
      return;
    }

    setPending(true);
    setError(undefined);
    let enrollment: Enrollment | undefined;
    const failure = await attempt(async (fetchOptions) => {
      const result = await authClient.twoFactor.enable({
        password,
        fetchOptions,
      });
      if (result.data && "totpURI" in result.data && result.data.totpURI) {
        enrollment = {
          totpURI: result.data.totpURI,
          backupCodes: result.data.backupCodes ?? [],
        };
      }
      return result;
    });
    setPending(false);

    if (failure?.code === "TOTP_ALREADY_ENABLED") return onAlreadyEnabled();
    if (failure || !enrollment) {
      setError(authErrorMessage(failure ?? { status: 500 }));
      return;
    }
    onEnrolled(enrollment);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      <StepHeader step={1} title="Защитите вход кодом">
        <p>
          В админке — деньги приюта и данные доноров, поэтому после пароля здесь
          всегда спрашивают код из приложения на телефоне. Подойдёт Яндекс Ключ,
          Google Authenticator, «Пароли» на iPhone или любое другое приложение
          для одноразовых кодов.
        </p>
        <p>Настройка займёт пару минут. Для начала подтвердите пароль.</p>
      </StepHeader>
      {error && <FormError>{error}</FormError>}
      {/* Lets password managers match the password to the account. */}
      <input
        type="email"
        name="email"
        value={email}
        autoComplete="username"
        readOnly
        hidden
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
      />
      <SubmitButton pending={pending} pendingLabel="Проверяем…">
        Продолжить
      </SubmitButton>
    </form>
  );
}

function ScanStep({
  enrollment,
  onVerified,
}: {
  enrollment: Enrollment;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const key = manualKey(enrollment.totpURI);

  async function verify(value: string) {
    if (pending) return;
    if (value.length !== TOTP_LENGTH) {
      setError("Введите 6 цифр из приложения.");
      input.current?.focus();
      return;
    }

    setPending(true);
    setError(undefined);
    const failure = await attempt((fetchOptions) =>
      authClient.twoFactor.verifyTotp({ code: value, fetchOptions }),
    );
    setPending(false);

    if (!failure) return onVerified();
    setError(authErrorMessage(failure));
    setCode("");
    input.current?.focus();
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
      className="flex flex-col gap-5"
    >
      <StepHeader step={2} title="Добавьте сайт в приложение">
        <p>
          Отсканируйте QR-код приложением-аутентификатором и введите код,
          который оно покажет.
        </p>
      </StepHeader>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <TotpQr
          uri={enrollment.totpURI}
          className="size-44 shrink-0 border border-toner"
        />
        <div className="flex min-w-0 flex-col gap-2 text-caption">
          <p className="text-toner-muted">
            Не сканируется? Введите ключ вручную:
          </p>
          <code className="font-mono text-mono select-all">{key}</code>
          <a href={enrollment.totpURI} className="text-pen underline">
            Открыть в приложении на этом телефоне
          </a>
        </div>
      </div>
      {error && <FormError>{error}</FormError>}
      <Field
        ref={input}
        label="Код из приложения"
        name="code"
        value={code}
        onChange={(event) => {
          const digits = event.target.value
            .replace(/\D/g, "")
            .slice(0, TOTP_LENGTH);
          setCode(digits);
          if (digits.length === TOTP_LENGTH) void verify(digits);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TOTP_LENGTH}
        readOnly={pending}
        className="font-mono text-sum tracking-[0.3em] tabular-nums"
      />
      <SubmitButton pending={pending} pendingLabel="Проверяем…">
        Подтвердить
      </SubmitButton>
    </form>
  );
}

function BackupCodesStep({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  function download() {
    const url = URL.createObjectURL(
      new Blob([`${text}\n`], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "rezervnye-kody.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step={3} title="Сохраните резервные коды">
        <p>
          Вход защищён. Если телефон потеряется, войти можно одним из этих кодов
          — каждый работает один раз. Сохраните их в менеджер паролей или
          распечатайте. Больше мы их не покажем.
        </p>
      </StepHeader>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 border-line border-dashed border-perforation p-card font-mono text-mono tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11 px-4 font-display text-label uppercase"
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Коды скопированы" : ""}
        </span>
        <Button
          variant="outline"
          className="h-11 px-4 font-display text-label uppercase"
          onClick={download}
        >
          Скачать файлом
        </Button>
      </div>
      <Button
        className="h-11 w-full px-4 font-display text-label uppercase"
        onClick={onDone}
      >
        Коды сохранены — в админку
      </Button>
    </div>
  );
}
