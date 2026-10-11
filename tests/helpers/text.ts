/**
 * Text with its non-breaking spaces turned into plain ones, so expectations
 * can be written as they read: `1 500 ₽`. Whether a space is non-breaking is
 * formatRub's and formatCount's business, tested with them; an invisible
 * character typed into an expectation is a trap (docs/testing.md).
 */
export function plain(text: string): string {
  return text.replaceAll("\u00A0", " ");
}
