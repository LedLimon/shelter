"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attempt, authClient } from "./auth-client";
import { authErrorMessage, restartsSignIn } from "./auth-errors";
import {
  AUTH_BUTTON_CLASS,
  AUTH_LINK_CLASS,
  Field,
  FormError,
  formText,
  SubmitButton,
} from "./field";
import { SignOutButton } from "./sign-out-button";
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

  let step: ReactNode;
  if (!enrollment) {
    step = (
      <PasswordStep
        email={email}
        onEnrolled={setEnrollment}
        onStale={() => router.refresh()}
      />
    );
  } else if (!verified) {
    step = (
      <ScanStep enrollment={enrollment} onVerified={() => setVerified(true)} />
    );
  } else {
    step = (
      <BackupCodesStep
        email={email}
        codes={enrollment.backupCodes}
        onDone={() => {
          router.replace("/admin");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {step}
      {/* Signing out at the last step would lose the backup codes. */}
      {!verified && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-perforation pt-5 text-caption text-toner-muted">
          <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
          <SignOutButton />
        </div>
      )}
    </div>
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
      <div className="flex flex-col gap-2">{children}</div>
    </header>
  );
}

function PasswordStep({
  email,
  onEnrolled,
  onStale,
}: {
  email: string;
  onEnrolled: (enrollment: Enrollment) => void;
  /** The page no longer fits the session: let the server send us on. */
  onStale: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const passwordInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const password = formText(new FormData(event.currentTarget), "password");
    if (!password) {
      setFieldError("Введите пароль, с которым вы только что вошли.");
      passwordInput.current?.focus();
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

    // Set up meanwhile on another device (which ended this session), or the
    // session expired: the page itself redirects to sign-in or the admin.
    if (
      failure?.code === "TOTP_ALREADY_ENABLED" ||
      failure?.code === "TWO_FACTOR_REQUIRED" ||
      failure?.status === 401
    ) {
      return onStale();
    }
    if (!failure && enrollment) return onEnrolled(enrollment);
    setPending(false);
    setError(authErrorMessage(failure ?? { status: 500 }));
    passwordInput.current?.focus();
    passwordInput.current?.select();
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5"
    >
      <StepHeader step={1} title="Защитите вход кодом">
        <p>
          В админке — деньги приюта и данные доноров, поэтому после пароля здесь
          всегда спрашивают код из приложения на телефоне.
        </p>
        <p className="text-caption text-toner-muted">
          Подойдёт Яндекс Ключ, Google Authenticator, «Пароли» на iPhone или
          любое другое приложение для одноразовых кодов. Настройка займёт пару
          минут.
        </p>
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
        ref={passwordInput}
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        error={fieldError}
        onChange={() => setFieldError(undefined)}
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
  const [sessionEnded, setSessionEnded] = useState(false);
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

    if (!failure) return onVerified();
    setPending(false);
    if (restartsSignIn(failure)) {
      setSessionEnded(true);
      return;
    }
    setError(authErrorMessage(failure));
    setCode("");
    input.current?.focus();
  }

  if (sessionEnded) {
    return (
      <div className="flex flex-col gap-5">
        <FormError>
          Сессия закончилась, пока шла настройка. Войдите заново — настройку
          придётся начать сначала.
        </FormError>
        <Link
          href="/admin/login"
          className={cn(AUTH_LINK_CLASS, "text-caption text-pen")}
        >
          Войти заново
        </Link>
      </div>
    );
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
      <StepHeader step={2} title="Добавьте сайт в приложение">
        <p>
          Отсканируйте QR-код приложением-аутентификатором и введите код,
          который оно покажет.
        </p>
      </StepHeader>
      {/* On a phone the QR can't be scanned by the phone itself. */}
      <a
        href={enrollment.totpURI}
        className={cn(
          AUTH_BUTTON_CLASS,
          "inline-flex items-center justify-center border border-toner text-center pointer-fine:hidden",
        )}
      >
        Открыть в приложении на этом телефоне
      </a>
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
  email,
  codes,
  onDone,
}: {
  email: string;
  codes: string[];
  onDone: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [leaving, setLeaving] = useState(false);
  const text = codes.join("\n");

  // Reloading or closing the tab now would lose the codes for good.
  useEffect(() => {
    if (leaving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [leaving]);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  }

  function download() {
    const file = [
      `Резервные коды для входа в админку ${window.location.host}`,
      `Учётная запись: ${email}`,
      "Каждый код работает один раз.",
      "",
      text,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([file], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rezervnye-kody.txt";
    link.click();
    // Revoking right away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step={3} title="Сохраните резервные коды">
        <p>
          Вход защищён. Если телефон потеряется, войти можно одним из этих кодов
          — каждый работает один раз.
        </p>
        <p className="text-caption text-toner-muted">
          Сохраните их в менеджер паролей или распечатайте. Больше мы их не
          покажем.
        </p>
      </StepHeader>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 border border-perforation p-card font-mono text-mono tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className={AUTH_BUTTON_CLASS} onClick={copy}>
          {copyState === "copied" ? "Скопировано" : "Скопировать"}
        </Button>
        <Button
          variant="outline"
          className={AUTH_BUTTON_CLASS}
          onClick={download}
        >
          Скачать файлом
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-toner-muted">
        {copyState === "copied" && "Коды скопированы."}
        {copyState === "failed" &&
          "Не получилось скопировать — выделите коды вручную или скачайте файлом."}
      </p>
      <Button
        disabled={leaving}
        focusableWhenDisabled
        className={cn(AUTH_BUTTON_CLASS, "w-full")}
        onClick={() => {
          setLeaving(true);
          onDone();
        }}
      >
        {leaving ? "Открываем админку…" : "Коды сохранены — в админку"}
      </Button>
    </div>
  );
}
