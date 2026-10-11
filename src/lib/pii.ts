// Logs and stored error texts must hold no emails, phones or card numbers
// (docs/legal.md). Text that comes from outside — an SMTP reply, an HTTP error
// body — goes through maskPii() before it is logged or saved.

// `user@host`, also inside <…> or a connection string (`password@host`). The
// lengths are an address's limits; unbounded, a megabyte of base64 without a
// single @ would take minutes to scan.
const EMAIL = /[^\s@<>()[\]"',;:=]{1,64}@[^\s@<>()[\]"',;:=]{1,255}/g;
// 9 digits or more, plain or grouped by spaces, dashes and parentheses: phone
// and card numbers (and, as a side effect, long numeric ids and dates). Dots
// are left out, so IP addresses stay readable.
const LONG_NUMBER = /\+?\d(?:[\s()-]*\d){8,}/g;

/** The text with email addresses and long digit sequences replaced. */
export function maskPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_NUMBER, "[number]");
}

/**
 * An address a person recognizes as theirs and nobody else can read off the
 * screen: `i•••@example.ru`. For pages opened by a link from a letter, which
 * the letter's forwarding makes open to others.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
