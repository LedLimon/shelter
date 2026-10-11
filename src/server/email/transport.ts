// eslint-disable-next-line no-restricted-imports -- the one module that talks SMTP
import { createTransport } from "nodemailer";
import { isLocalHost, type ServerEnv } from "@/lib/env/schema";
import { isEmailAddress, parseMailbox } from "@/lib/mailbox";
import { maskPii } from "@/lib/pii";
import { SHELTER_NAME } from "@/lib/shelter";

// A slow or silent server fails the attempt long before the outbox takes the
// event away from its handler (2 minutes); the outbox retries it later.
const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

export type SmtpConfig = Pick<
  ServerEnv,
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_SECURE"
  | "SMTP_USER"
  | "SMTP_PASSWORD"
  | "SMTP_FROM"
>;

export type OutgoingEmail = {
  /** A bare address. */
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Identifies the letter, the same on every attempt to send it: mail systems
   * drop a second copy with a Message-ID they have seen.
   */
  id: string;
  replyTo?: string;
  unsubscribeUrl?: string;
};

export type Mailer = {
  /** The domain letters are sent from: the host part of their Message-ID. */
  domain: string;
  /**
   * Resolves once the SMTP server has accepted the message and returns its
   * Message-ID. Rejects with an EmailSendError, never with nodemailer's own.
   */
  send(email: OutgoingEmail, signal?: AbortSignal): Promise<string>;
};

/**
 * Why a letter didn't go out, as one line that may be logged and stored in
 * Outbox.lastError: the SMTP stage, code and reply, with every address
 * masked. nodemailer's own error names the recipient.
 */
export class EmailSendError extends Error {
  override name = "EmailSendError";
}

/** nodemailer's options for the server in the environment. */
export function transportOptions(config: SmtpConfig) {
  const auth =
    config.SMTP_USER && config.SMTP_PASSWORD
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined;
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth,
    // A provider's server is reached over TLS or not at all: without this a
    // server that doesn't offer STARTTLS (or a network that strips the offer)
    // gets the password and the donors' addresses in the clear. Mailpit on
    // this machine and a relay that takes no password are left alone.
    requireTLS:
      !config.SMTP_SECURE && Boolean(auth) && !isLocalHost(config.SMTP_HOST),
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    dnsTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: IDLE_TIMEOUT_MS,
    // A letter is text we rendered: nothing in it may make the worker read a
    // file or fetch a URL.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function createMailer(config: SmtpConfig): Mailer {
  const from = parseMailbox(config.SMTP_FROM);
  if (!from) {
    throw new Error('SMTP_FROM must be an address or "Name <address>"');
  }
  const sender = { name: from.name ?? SHELTER_NAME, address: from.address };
  const domain = from.address.slice(from.address.lastIndexOf("@") + 1);
  const transport = createTransport(transportOptions(config));

  return {
    domain,
    async send(email, signal) {
      if (!isEmailAddress(email.to)) {
        throw new EmailSendError("the recipient is not an email address");
      }
      signal?.throwIfAborted();
      const messageId = `<${email.id}@${domain}>`;
      try {
        await transport.sendMail({
          from: sender,
          // An object, not a string: nodemailer would parse a string as a
          // list, and `a@x, b@y` in a donor's field would be two recipients.
          to: { name: "", address: email.to },
          replyTo: email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          messageId,
          headers: {
            // No out-of-office replies to a letter nobody reads replies to.
            "Auto-Submitted": "auto-generated",
            "X-Auto-Response-Suppress": "All",
            ...(email.unsubscribeUrl && {
              "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }),
          },
        });
      } catch (error) {
        throw sendError(error, email.to);
      }
      return messageId;
    },
  };
}

type SmtpFailure = {
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
  response?: unknown;
  message?: unknown;
};

function sendError(error: unknown, recipient: string): EmailSendError {
  const failure = (
    typeof error === "object" && error ? error : {}
  ) as SmtpFailure;
  const reply =
    typeof failure.response === "string"
      ? failure.response
      : typeof failure.message === "string"
        ? failure.message
        : "";
  const parts = [
    typeof failure.code === "string" ? failure.code : "SMTP",
    typeof failure.command === "string" ? `at ${failure.command}` : "",
    typeof failure.responseCode === "number" ? `(${failure.responseCode})` : "",
  ].filter(Boolean);
  // The recipient first, whatever form the server quoted it in; then
  // anything else that looks like an address or a phone number.
  const detail = maskPii(reply.replaceAll(recipient, "[email]"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return new EmailSendError(
    detail ? `${parts.join(" ")}: ${detail}` : parts.join(" "),
  );
}
