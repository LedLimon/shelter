// Logs and stored error texts must hold no emails, phones or card numbers
// (docs/legal.md). Text that comes from outside — an SMTP reply, an HTTP error
// body — goes through maskPii() before it is logged or saved.

// `user@host`, also inside <…> or a connection string (`password@host`).
const EMAIL = /[^\s@<>()[\]"',;:=]+@[^\s@<>()[\]"',;:=]+/g;
// 9 digits or more, plain or grouped by spaces, dashes and parentheses: phone
// and card numbers. Dots are left out, so IP addresses stay readable.
const LONG_NUMBER = /\+?\d(?:[\s()-]*\d){8,}/g;

/** The text with email addresses and long digit sequences replaced. */
export function maskPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_NUMBER, "[number]");
}
