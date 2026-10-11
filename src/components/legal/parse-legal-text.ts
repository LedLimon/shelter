// The light markup of legal texts (LegalDocument.body): what the owner types
// or pastes from the lawyer's file, line by line. Not Markdown: clause numbers
// («1.1.») stay as they are typed, nothing is renumbered or reinterpreted.

export type LegalBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const HEADING = /^(#{1,3})\s+(.+)$/;
// A dash, an asterisk or a bullet, then a space: «— пункт», «• пункт».
const LIST_ITEM = /^[-*•–—]\s+(.+)$/;

/**
 * Every line is a block of its own, as in a text pasted from Word:
 * - `## Раздел` — a heading (`#` too: the page's title is the only h1),
 *   `### Подраздел` — a smaller one;
 * - lines starting with a dash or a bullet — a list;
 * - any other line — a paragraph. Blank lines only separate.
 */
export function parseLegalText(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const [, marks = "", text = ""] = heading;
      blocks.push({ kind: "heading", level: marks.length === 3 ? 3 : 2, text });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const [, text = ""] = item;
      const last = blocks.at(-1);
      if (last?.kind === "list") last.items.push(text);
      else blocks.push({ kind: "list", items: [text] });
      continue;
    }

    blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

export type LegalInline =
  { kind: "text"; text: string } | { kind: "link"; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"«»]+/g;
// Punctuation that ends a sentence, not an address.
const TRAILING = /[.,;:!?)\]»"']+$/;

/** Splits a line into plain text and the web addresses in it. */
export function parseLegalInline(text: string): LegalInline[] {
  const parts: LegalInline[] = [];
  let index = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = match[0].replace(TRAILING, "");
    if (!isWebUrl(href)) continue;
    if (match.index > index) {
      parts.push({ kind: "text", text: text.slice(index, match.index) });
    }
    parts.push({ kind: "link", href });
    index = match.index + href.length;
  }
  if (index < text.length) {
    parts.push({ kind: "text", text: text.slice(index) });
  }
  return parts;
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === "https:" || protocol === "http:") && hostname !== "";
  } catch {
    return false;
  }
}
