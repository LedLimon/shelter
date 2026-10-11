export const NBSP = "\u00A0";

// Words that must not end a line: one- and two-letter prepositions,
// conjunctions and the particle «не».
const SHORT_WORD =
  /(^|[\s«(])(а|в|и|к|о|с|у|я|во|до|за|из|ко|на|не|но|об|от|по|со)[ \t]+(?=\S)/giu;

/**
 * Russian line-breaking for a run of text: a short preposition stays with the
 * next word and a dash with the previous one, so no line of a letter ends in
 * «в» or starts with «—». Mail clients have no `text-wrap: pretty`.
 */
export function typeset(text: string): string {
  // Twice: in «и в том» the second word starts where the first match ended.
  return text
    .replace(SHORT_WORD, `$1$2${NBSP}`)
    .replace(SHORT_WORD, `$1$2${NBSP}`)
    .replace(/[ \t]+—/g, `${NBSP}—`);
}
