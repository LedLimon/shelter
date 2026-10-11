// An address is checked for shape only: one @, no spaces and none of the
// characters that would let a value smuggle a second recipient or a header
// into a message (`a@b, c@d`, `<…>`, quotes). Unicode is allowed: mail on .рф
// domains exists.
const ADDRESS = /^[^\s<>@"',;:()[\]\\]+@[^\s<>@"',;:()[\]\\]+$/u;

/** Whether `value` is a bare email address, safe to put on an envelope. */
export function isEmailAddress(value: string): boolean {
  return ADDRESS.test(value) && value.length <= 320;
}

export type Mailbox = { name?: string; address: string };

/**
 * Parses `address` or `Имя <address>` (the value of SMTP_FROM); null if it is
 * neither.
 */
export function parseMailbox(value: string): Mailbox | null {
  const text = value.trim();
  const named = /^([^<>]*?)\s*<([^<>]*)>$/.exec(text);
  const address = (named?.[2] ?? text).trim();
  if (!isEmailAddress(address)) return null;
  const name = named?.[1]?.replace(/^"([^"]*)"$/, "$1").trim();
  return name ? { name, address } : { address };
}
