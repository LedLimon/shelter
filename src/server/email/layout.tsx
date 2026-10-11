import { domainToUnicode } from "node:url";
import type { ReactNode } from "react";
import { Block, Caption, Link, Preheader } from "./components";
import type { EmailContext } from "./context";
import { SHEET_SHADOW } from "./palette";
import { FONT, inked, SHEET_WIDTH, stylesheet, TEXT_CLASS } from "./theme";

/** Where the reader manages what they get from us; a letter may have neither. */
export type EmailLinks = {
  /** A page to change or cancel what the letter is about (a subscription). */
  manage?: string;
  /** Leaves the mailing list at once; also sent as the List-Unsubscribe header. */
  unsubscribe?: string;
};

type EmailLayoutProps = {
  context: EmailContext;
  /** The subject: the document's title. */
  title: string;
  /** The line mail clients show next to the subject. */
  preview: string;
  /** Why the reader got the letter: opens the footer. */
  reason: string;
  links?: EmailLinks;
  children: ReactNode;
};

/**
 * The frame of every letter: one sheet of paper on the board, the shelter's
 * name set as a masthead (there is no logo until ORG-5), and under the sheet
 * who wrote, why, and how to stop it.
 */
export function EmailLayout({
  context,
  title,
  preview,
  reason,
  links = {},
  children,
}: EmailLayoutProps) {
  const { shelter, siteUrl } = context;
  const masthead = inked(
    { fg: "toner" },
    {
      fontFamily: FONT.display,
      fontSize: 22,
      lineHeight: "24px",
      fontWeight: 900,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      textDecoration: "none",
    },
  );
  const page = inked({ bg: "board" }, { margin: 0, padding: 0 });

  return (
    <html lang="ru" dir="ltr">
      {/* eslint-disable-next-line @next/next/no-head-element -- a letter's own document, not a page of the app */}
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        {/* iOS Mail: don't rescale the letter or turn dates into links. */}
        <meta name="x-apple-disable-message-reformatting" />
        <meta
          name="format-detection"
          content="telephone=no, date=no, address=no, email=no"
        />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: stylesheet() }} />
      </head>
      <body className={page.className} style={page.style}>
        <Preheader>{preview}</Preheader>
        <Block
          ink={{ bg: "board" }}
          className="board"
          style={{ padding: "24px 12px 32px" }}
        >
          <table
            role="presentation"
            align="center"
            width={SHEET_WIDTH}
            cellPadding={0}
            cellSpacing={0}
            border={0}
            style={{
              width: "100%",
              maxWidth: SHEET_WIDTH,
              margin: "0 auto",
              borderCollapse: "separate",
            }}
          >
            <tbody>
              <tr>
                <td
                  {...withClass(
                    inked(
                      { bg: "paper" },
                      { padding: "28px 28px 32px", boxShadow: SHEET_SHADOW },
                    ),
                    "inset",
                  )}
                >
                  <Block
                    ink={{ border: "toner" }}
                    style={{
                      paddingBottom: 14,
                      borderBottomWidth: 2,
                      borderBottomStyle: "solid",
                    }}
                  >
                    <a
                      href={siteUrl}
                      target="_blank"
                      className={`${masthead.className} ${TEXT_CLASS.site}`}
                      style={masthead.style}
                    >
                      {shelter.name}
                    </a>
                  </Block>
                  <Block style={{ paddingTop: 24 }}>{children}</Block>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "20px 28px 0" }} className="inset">
                  <Caption>{reason}</Caption>
                  {(links.manage ?? links.unsubscribe) ? (
                    <Caption>
                      {links.manage ? (
                        <Link href={links.manage}>Управлять подпиской</Link>
                      ) : null}
                      {links.manage && links.unsubscribe ? " · " : null}
                      {links.unsubscribe ? (
                        <Link href={links.unsubscribe}>
                          Отписаться от рассылки
                        </Link>
                      ) : null}
                    </Caption>
                  ) : null}
                  <Caption style={{ margin: 0 }}>
                    Приют «{shelter.name}»
                    {shelter.legalName ? ` · ${shelter.legalName}` : null}
                    <br />
                    <Link href={siteUrl} className={TEXT_CLASS.site}>
                      {hostOf(siteUrl)}
                    </Link>
                    {shelter.email ? (
                      <>
                        {" · "}
                        <Link href={`mailto:${shelter.email}`}>
                          {shelter.email}
                        </Link>
                      </>
                    ) : null}
                  </Caption>
                </td>
              </tr>
            </tbody>
          </table>
        </Block>
      </body>
    </html>
  );
}

function withClass<T extends { className: string }>(props: T, name: string): T {
  return { ...props, className: `${props.className} ${name}` };
}

/** The site as people type it: `priyut.example` or `приют.рф`, no scheme. */
function hostOf(url: string): string {
  const { hostname, port } = new URL(url);
  // URL keeps a Cyrillic domain as punycode (xn--…).
  const name = domainToUnicode(hostname) || hostname;
  return port ? `${name}:${port}` : name;
}
