// The mailbox of the integration tests: Mailpit in a container (started by
// tests/integration/setup/mailpit.ts), read through its API. Every letter the
// code under test sends lands there; nothing leaves the machine.
//
// The container is shared by all test files, which run in parallel: give
// every test its own recipient (uniqueAddress()) and read only its inbox.
import { randomBytes } from "node:crypto";
import { expect, inject, vi } from "vitest";

export type ReceivedEmail = {
  subject: string;
  from: { name: string; address: string };
  to: string[];
  replyTo: string[];
  html: string;
  text: string;
  /** Header names as sent, e.g. "Message-Id"; a header may repeat. */
  headers: Record<string, string[]>;
};

type Mailbox = { Name: string; Address: string };
type Summary = { messages: { ID: string }[] };
type Message = {
  Subject: string;
  From: Mailbox;
  To: Mailbox[];
  ReplyTo: Mailbox[];
  HTML: string;
  Text: string;
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${inject("mailpit").apiUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status} to ${path}`);
  }
  return (await response.json()) as T;
}

/** An address no other test writes to. */
export function uniqueAddress(prefix = "donor"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@shelter.localhost`;
}

/** Every letter delivered to `address`, oldest first. */
export async function inboxOf(address: string): Promise<ReceivedEmail[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const { messages } = await api<Summary>(`/api/v1/search?query=${query}`);
  const emails = await Promise.all(
    messages.map(async ({ ID }) => {
      const [message, headers] = await Promise.all([
        api<Message>(`/api/v1/message/${ID}`),
        api<Record<string, string[]>>(`/api/v1/message/${ID}/headers`),
      ]);
      return {
        subject: message.Subject,
        from: { name: message.From.Name, address: message.From.Address },
        to: message.To.map((mailbox) => mailbox.Address),
        replyTo: message.ReplyTo.map((mailbox) => mailbox.Address),
        html: message.HTML,
        text: message.Text,
        headers,
      };
    }),
  );
  // The search lists the newest first.
  return emails.reverse();
}

/** Waits until `address` has `count` letters and returns them. */
export async function waitForInbox(
  address: string,
  count = 1,
): Promise<ReceivedEmail[]> {
  return vi.waitFor(
    async () => {
      const emails = await inboxOf(address);
      expect(emails).toHaveLength(count);
      return emails;
    },
    { timeout: 15_000, interval: 50 },
  );
}
