import { afterEach, describe, expect, it } from "vitest";
import { startFakeSmtp, type FakeSmtp } from "../../../tests/helpers/fake-smtp";
import {
  createMailer,
  EmailSendError,
  transportOptions,
  type OutgoingEmail,
  type SmtpConfig,
} from "./transport";

const config = (overrides: Partial<SmtpConfig> = {}): SmtpConfig => ({
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_FROM: "no-reply@mys.example",
  ...overrides,
});

const letter = (overrides: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  to: "donor@example.ru",
  subject: "Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
  html: "<p>Спасибо за помощь!</p>",
  text: "Спасибо за помощь!",
  id: "evt123",
  ...overrides,
});

let smtp: FakeSmtp | undefined;
afterEach(async () => {
  await smtp?.close();
  smtp = undefined;
});

async function mailerFor(
  server: Parameters<typeof startFakeSmtp>[0] = {},
  overrides: Partial<SmtpConfig> = {},
) {
  smtp = await startFakeSmtp(server);
  return createMailer(config({ SMTP_PORT: smtp.port, ...overrides }));
}

/** Decodes the RFC 2047 words of a header: `=?UTF-8?B?…?=`. */
function decodeWords(header: string): string {
  return header
    .replace(/\?=\s+=\?UTF-8\?B\?/gi, "?==?UTF-8?B?")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, base64: string) =>
      Buffer.from(base64, "base64").toString("utf8"),
    );
}

function header(message: string, name: string): string {
  const head = message.slice(0, message.indexOf("\r\n\r\n"));
  const unfolded = head.replace(/\r\n[ \t]+/g, " ");
  const line = unfolded
    .split("\r\n")
    .find((candidate) =>
      candidate.toLowerCase().startsWith(`${name.toLowerCase()}:`),
    );
  return decodeWords(line?.slice(name.length + 1).trim() ?? "");
}

describe("transportOptions", () => {
  it("talks to Mailpit without a password or TLS", () => {
    expect(transportOptions(config())).toMatchObject({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      auth: undefined,
      requireTLS: false,
    });
  });

  it("logs in when a user and a password are set", () => {
    expect(
      transportOptions(
        config({ SMTP_USER: "shelter", SMTP_PASSWORD: "secret" }),
      ).auth,
    ).toEqual({ user: "shelter", pass: "secret" });
  });

  it.each([
    // host, secure, with a password → STARTTLS required
    ["smtp.provider.example", false, true, true],
    // TLS from the first byte: nothing to upgrade.
    ["smtp.provider.example", true, true, false],
    // A relay that takes no password: Mailpit in a compose network.
    ["mailpit", false, false, false],
    // This machine, whatever the credentials (Mailpit accepts any).
    ["localhost", false, true, false],
    ["127.0.0.1", false, true, false],
  ])(
    "host %s, secure %s, password %s → requireTLS %s",
    (host, secure, password, requireTLS) => {
      const options = transportOptions(
        config({
          SMTP_HOST: host,
          SMTP_SECURE: secure,
          ...(password && { SMTP_USER: "u", SMTP_PASSWORD: "p" }),
        }),
      );

      expect(options.requireTLS).toBe(requireTLS);
    },
  );

  it("gives up on a silent server well within the outbox's two minutes", () => {
    const { connectionTimeout, greetingTimeout, dnsTimeout, socketTimeout } =
      transportOptions(config());

    expect(
      connectionTimeout + greetingTimeout + dnsTimeout + socketTimeout,
    ).toBeLessThan(120_000);
  });

  it("lets a letter read no file and fetch no URL", () => {
    expect(transportOptions(config())).toMatchObject({
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  });
});

describe("createMailer", () => {
  it("refuses an SMTP_FROM that is not a mailbox", () => {
    expect(() => createMailer(config({ SMTP_FROM: "Приют" }))).toThrow(
      'SMTP_FROM must be an address or "Name <address>"',
    );
  });

  it("names the domain letters come from", () => {
    expect(createMailer(config()).domain).toBe("mys.example");
  });

  it("sends a letter from the shelter, with both parts and its headers", async () => {
    const mailer = await mailerFor();

    const messageId = await mailer.send(
      letter({ replyTo: "priyut@mys.example" }),
    );

    expect(messageId).toBe("<evt123@mys.example>");
    expect(smtp!.messages).toHaveLength(1);
    const message = smtp!.messages[0]!;
    expect(header(message, "From")).toBe(
      "Мыс доброй надежды <no-reply@mys.example>",
    );
    expect(header(message, "To")).toBe("donor@example.ru");
    expect(header(message, "Reply-To")).toBe("priyut@mys.example");
    expect(header(message, "Subject")).toBe(
      "Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
    );
    expect(header(message, "Message-ID")).toBe("<evt123@mys.example>");
    expect(header(message, "Auto-Submitted")).toBe("auto-generated");
    expect(header(message, "Content-Type")).toMatch(/^multipart\/alternative/);
    expect(message).toContain("Content-Type: text/plain; charset=utf-8");
    expect(message).toContain("Content-Type: text/html; charset=utf-8");
    expect(header(message, "List-Unsubscribe")).toBe("");
  });

  it("signs with the name of SMTP_FROM when it has one", async () => {
    const mailer = await mailerFor(
      {},
      { SMTP_FROM: "Приют на мысе <no-reply@mys.example>" },
    );

    await mailer.send(letter());

    expect(header(smtp!.messages[0]!, "From")).toBe(
      "Приют на мысе <no-reply@mys.example>",
    );
  });

  it("keeps the Message-ID of a letter the same on every attempt", async () => {
    const mailer = await mailerFor();

    const first = await mailer.send(letter());
    const second = await mailer.send(letter());

    expect(second).toBe(first);
    expect(
      smtp!.messages.map((message) => header(message, "Message-ID")),
    ).toEqual([first, first]);
  });

  it("adds one-click unsubscribe headers to a letter that has the link", async () => {
    const mailer = await mailerFor();

    await mailer.send(
      letter({ unsubscribeUrl: "https://mys.example/unsubscribe?token=t" }),
    );

    const message = smtp!.messages[0]!;
    expect(header(message, "List-Unsubscribe")).toBe(
      "<https://mys.example/unsubscribe?token=t>",
    );
    expect(header(message, "List-Unsubscribe-Post")).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it.each([
    "donor@example.ru, thief@example.com",
    "Donor <donor@example.ru>",
    "donor@example.ru\r\nBcc: thief@example.com",
    "not an address",
    "",
  ])("sends nothing to %j", async (to) => {
    const mailer = await mailerFor();

    const error: unknown = await mailer
      .send(letter({ to }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as Error).message).toBe(
      "the recipient is not an email address",
    );
    expect(smtp!.messages).toEqual([]);
  });

  it("does not start a send that is already aborted", async () => {
    const mailer = await mailerFor();
    const aborted = AbortSignal.abort(new Error("timed out after 120 s"));

    await expect(mailer.send(letter(), aborted)).rejects.toThrow(
      "timed out after 120 s",
    );
    expect(smtp!.messages).toEqual([]);
  });

  describe("when the server refuses", () => {
    it("reports the SMTP stage and code without the address it quoted", async () => {
      const mailer = await mailerFor({
        rcptReply:
          "550 5.1.1 <donor@example.ru>: Recipient address rejected, call +7 (999) 123-45-67",
      });

      const error: unknown = await mailer
        .send(letter())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(EmailSendError);
      const { message } = error as EmailSendError;
      expect(message).toContain("EENVELOPE");
      expect(message).toContain("550");
      expect(message).toContain("Recipient address rejected");
      expect(message).not.toContain("donor");
      expect(message).not.toContain("example.ru");
      expect(message).not.toContain("999");
      expect(JSON.stringify(error)).not.toContain("donor");
    });

    it("masks the address in any case the server echoes it", async () => {
      const mailer = await mailerFor({
        rcptReply: "550 mailbox DONOR@EXAMPLE.RU unavailable",
      });

      const error: unknown = await mailer
        .send(letter())
        .catch((e: unknown) => e);

      expect((error as Error).message).not.toMatch(/donor/i);
    });

    it("reports a server that isn't there", async () => {
      smtp = await startFakeSmtp();
      const port = smtp.port;
      await smtp.close();
      const mailer = createMailer(config({ SMTP_PORT: port }));

      const error: unknown = await mailer
        .send(letter())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(EmailSendError);
      expect((error as Error).message).toMatch(/^(ESOCKET|ECONNECTION)/);
      expect((error as Error).message).not.toContain("donor");
    });
  });
});
