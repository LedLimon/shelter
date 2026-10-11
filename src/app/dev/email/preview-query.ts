import { emails, isEmailType, type EmailType } from "@/server/email/registry";
import { DARK_MEDIA } from "@/server/email/theme";

// What the preview shows lives in the address, so a view can be shared and
// reloaded: /dev/email?template=donation.thanks&example=split&theme=dark&width=phone

export const THEMES = ["light", "dark"] as const;
export const WIDTHS = ["phone", "desktop"] as const;

export type PreviewQuery = {
  /** Which letter of the registry. */
  template: EmailType;
  example: string;
  /** The mail client's colour scheme. */
  theme: (typeof THEMES)[number];
  width: (typeof WIDTHS)[number];
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function oneOf<T extends string>(values: readonly T[], value: unknown): T {
  return values.find((candidate) => candidate === value) ?? values[0]!;
}

/** The first letter and its first example stand in for anything unknown. */
export function parsePreviewQuery(params: SearchParams): PreviewQuery {
  const requested = first(params.template) ?? "";
  const template = isEmailType(requested)
    ? requested
    : (Object.keys(emails)[0] as EmailType);
  return {
    template,
    example: oneOf(
      Object.keys(emails[template].examples),
      first(params.example),
    ),
    theme: oneOf(THEMES, first(params.theme)),
    width: oneOf(WIDTHS, first(params.width)),
  };
}

export function previewHref(
  query: PreviewQuery,
  change: Partial<PreviewQuery> = {},
): string {
  const next = { ...query, ...change };
  // Another letter has examples of its own.
  if (change.template && change.template !== query.template) {
    next.example = "";
  }
  const params = new URLSearchParams(
    Object.entries(next).filter(([, value]) => value !== ""),
  );
  return `/dev/email?${params.toString()}`;
}

/**
 * The letter as a mail client with the given colour scheme shows it,
 * whatever the scheme of the browser: its dark rules either always apply or
 * never do.
 */
export function forceTheme(html: string, theme: PreviewQuery["theme"]): string {
  return html
    .replaceAll(DARK_MEDIA, theme === "dark" ? "@media all" : "@media not all")
    .replaceAll("light dark", theme);
}
