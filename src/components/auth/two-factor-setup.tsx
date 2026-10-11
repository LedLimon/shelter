"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { attempt, authClient } from "./auth-client";
import { authErrorMessage, restartsSignIn } from "./auth-errors";
import { FormAlert, formLinkClass } from "./form-alert";
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

const passwordSchema = z.object({
  password: z.string().min(1, "Введите пароль, с которым вы только что вошли."),
});

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
  const id = useId();
  const [error, setError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit({ password }: z.infer<typeof passwordSchema>) {
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
      setLeaving(true);
      return onStale();
    }
    if (!failure && enrollment) return onEnrolled(enrollment);
    setError(authErrorMessage(failure ?? { status: 500 }));
    form.setFocus("password", { shouldSelect: true });
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
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
      {error && <FormAlert>{error}</FormAlert>}
      {/* Lets password managers match the password to the account. */}
      <input
        type="email"
        name="email"
        value={email}
        autoComplete="username"
        readOnly
        hidden
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
        Продолжить
      </Button>
    </form>
  );
}

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Введите 6 цифр из приложения."),
});

function ScanStep({
  enrollment,
  onVerified,
}: {
  enrollment: Enrollment;
  onVerified: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string>();
  const [sessionEnded, setSessionEnded] = useState(false);
  const form = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const pending = form.formState.isSubmitting;
  const key = manualKey(enrollment.totpURI);

  async function onSubmit({ code }: z.infer<typeof codeSchema>) {
    setError(undefined);
    const failure = await attempt((fetchOptions) =>
      authClient.twoFactor.verifyTotp({ code, fetchOptions }),
    );

    if (!failure) return onVerified();
    if (restartsSignIn(failure) || failure.status === 403) {
      setSessionEnded(true);
      return;
    }
    setError(authErrorMessage(failure));
    form.setValue("code", "");
    form.setFocus("code");
  }

  const submit = form.handleSubmit(onSubmit);

  if (sessionEnded) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert>
          Сессия закончилась, пока шла настройка. Войдите заново — настройку
          придётся начать сначала.
        </FormAlert>
        <Link
          href="/admin/login"
          className={cn(buttonVariants({ variant: "link" }), formLinkClass)}
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
      onSubmit={(event) => void submit(event)}
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
          buttonVariants({ variant: "outline" }),
          "pointer-fine:hidden",
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
      {error && <FormAlert id={`${id}-alert`}>{error}</FormAlert>}
      <Controller
        name="code"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-code`}>Код из приложения</FieldLabel>
            <Input
              {...field}
              id={`${id}-code`}
              onChange={(event) => {
                const digits = event.target.value
                  .replace(/\D/g, "")
                  .slice(0, TOTP_LENGTH);
                field.onChange(digits);
                if (digits.length === TOTP_LENGTH && !pending) void submit();
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={TOTP_LENGTH}
              readOnly={pending}
              aria-invalid={fieldState.invalid}
              aria-describedby={
                [
                  fieldState.invalid && `${id}-code-error`,
                  error && `${id}-alert`,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              className="font-mono text-sum tracking-[0.3em] tabular-nums"
            />
            <FieldError id={`${id}-code-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Button type="submit" loading={pending} className="w-full">
        Подтвердить
      </Button>
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
        <Button type="button" variant="outline" onClick={copy}>
          {copyState === "copied" ? "Скопировано" : "Скопировать"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          Скачать файлом
        </Button>
      </div>
      <p aria-live="polite" className="text-caption text-toner-muted">
        {copyState === "copied" && "Коды скопированы."}
        {copyState === "failed" &&
          "Не получилось скопировать — выделите коды вручную или скачайте файлом."}
      </p>
      <Button
        type="button"
        loading={leaving}
        className="w-full"
        onClick={() => {
          setLeaving(true);
          onDone();
        }}
      >
        Коды сохранены — в админку
      </Button>
    </div>
  );
}
