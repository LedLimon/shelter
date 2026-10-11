import { Children, type CSSProperties, type ReactNode } from "react";
import { FONT, inked, TEXT_CLASS, type Ink } from "./theme";
import { NBSP, typeset } from "./typography";

// The building blocks of a letter. Mail clients lay out tables and inline
// styles and little else, so every block is one of the two. Templates use
// these instead of raw tags, and take colours only through `ink`.

type BlockProps = {
  children: ReactNode;
  ink?: Ink;
  style?: CSSProperties;
  className?: string;
};

function classes(...names: (string | undefined)[]): string | undefined {
  return names.filter(Boolean).join(" ") || undefined;
}

/** The words of a block with their line-breaking fixed (./typography.ts). */
function set(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? typeset(child) : child,
  );
}

/**
 * The same for text in the display face. The condensed fonts of the stack
 * draw a non-breaking space about twice as wide as a plain one, so words
 * that must stay together are held by a nowrap span around plain spaces.
 */
function setDisplay(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string"
      ? typeset(child)
          .split(" ")
          .flatMap((chunk, index) => [
            index > 0 ? " " : null,
            chunk.includes(NBSP) ? (
              <span key={index} style={{ whiteSpace: "nowrap" }}>
                {chunk.replaceAll(NBSP, " ")}
              </span>
            ) : (
              chunk
            ),
          ])
      : child,
  );
}

/**
 * The line a mail client shows next to the subject. Hidden in the letter and
 * left out of the plain-text part, where the same words open the body anyway.
 */
export function Preheader({ children }: { children: string }) {
  return (
    <div
      data-skip-in-text="true"
      style={{
        display: "none",
        overflow: "hidden",
        maxHeight: 0,
        maxWidth: 0,
        opacity: 0,
        lineHeight: "1px",
      }}
    >
      {children}
      {/* Padding, so the client doesn't continue the line with body text. */}
      {"\u00A0\u200C".repeat(120)}
    </div>
  );
}

/** A full-width layout table of one cell: the cell takes the styles. */
export function Block({ children, ink = {}, style, className }: BlockProps) {
  const cell = inked(ink, style);
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: "collapse" }}
    >
      <tbody>
        <tr>
          <td className={classes(cell.className, className)} style={cell.style}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** A paragraph of body text. */
export function Text({
  children,
  ink = { fg: "toner" },
  style,
  className,
}: BlockProps) {
  const paragraph = inked(ink, {
    margin: "0 0 16px",
    fontFamily: FONT.body,
    fontSize: 16,
    lineHeight: "25px",
    ...style,
  });
  return (
    <p
      className={classes(paragraph.className, className)}
      style={paragraph.style}
    >
      {set(children)}
    </p>
  );
}

/** A caption: who sent the letter and why, legal notes. */
export function Caption({
  children,
  ink = { fg: "toner-muted" },
  style,
}: BlockProps) {
  return (
    <Text ink={ink} style={{ fontSize: 14, lineHeight: "20px", ...style }}>
      {children}
    </Text>
  );
}

/** The letter's heading, in sentence case: long condensed caps would shout. */
export function Title({ children }: { children: ReactNode }) {
  const heading = inked(
    { fg: "toner" },
    {
      margin: "0 0 16px",
      fontFamily: FONT.display,
      fontSize: 40,
      lineHeight: 1,
      fontWeight: 900,
    },
  );
  return (
    <h1 className={classes(heading.className, "title")} style={heading.style}>
      {setDisplay(children)}
    </h1>
  );
}

type LinkProps = {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

/** A link in the text: the pen's colour, underlined. */
export function Link({ href, children, style, className }: LinkProps) {
  const link = inked({ fg: "pen" }, { textDecoration: "underline", ...style });
  return (
    <a
      href={href}
      target="_blank"
      className={classes(link.className, className)}
      style={link.style}
    >
      {set(children)}
    </a>
  );
}

/**
 * The letter's one action: a toner block with the label in condensed caps,
 * like the site's buttons. The yellow «Помочь» is not for letters that thank.
 */
export function Button({ href, children }: LinkProps) {
  const cell = inked({ bg: "toner" });
  const label = inked(
    { fg: "paper" },
    {
      display: "inline-block",
      padding: "14px 22px",
      fontFamily: FONT.display,
      fontSize: 22,
      lineHeight: "24px",
      fontWeight: 900,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      textDecoration: "none",
    },
  );
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: "separate", margin: "8px 0 24px" }}
    >
      <tbody>
        <tr>
          <td className={cell.className} style={cell.style}>
            <a
              href={href}
              target="_blank"
              className={label.className}
              style={label.style}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export type FormRow = {
  label: string;
  value: ReactNode;
  /** The row the form is about: its value is set large. */
  primary?: boolean;
};

/**
 * A filled-in form: a box in a toner frame, rows parted by perforation, each
 * a label in the service face and its value. For the facts of a letter —
 * what was paid, when, under what number.
 */
export function Form({ rows }: { rows: FormRow[] }) {
  const box = inked(
    { border: "toner" },
    {
      borderCollapse: "separate",
      borderWidth: 2,
      borderStyle: "solid",
      margin: "0 0 24px",
    },
  );
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      className={classes(box.className, TEXT_CLASS.form)}
      style={box.style}
    >
      <tbody>
        {rows.map((row, index) => {
          const divider: CSSProperties =
            index === 0 ? {} : { borderTopWidth: 2, borderTopStyle: "dashed" };
          const label = inked(
            { fg: "toner-muted", border: "perforation" },
            {
              ...divider,
              padding: "12px 8px 12px 14px",
              fontFamily: FONT.mono,
              fontSize: 12,
              lineHeight: "18px",
              // Labels are a word or two; a long value wraps instead.
              whiteSpace: "nowrap",
              verticalAlign: row.primary ? "middle" : "top",
            },
          );
          const value = inked(
            { fg: "toner", border: "perforation" },
            {
              ...divider,
              padding: "12px 14px 12px 8px",
              textAlign: "right",
              verticalAlign: row.primary ? "middle" : "top",
              fontVariantNumeric: "tabular-nums",
              ...(row.primary
                ? {
                    fontFamily: FONT.display,
                    fontSize: 36,
                    lineHeight: "36px",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }
                : {
                    fontFamily: FONT.body,
                    fontSize: 16,
                    lineHeight: "22px",
                  }),
            },
          );
          return (
            <tr key={row.label}>
              <td className={label.className} style={label.style}>
                {row.label}
              </td>
              <td className={value.className} style={value.style}>
                {row.primary ? setDisplay(row.value) : row.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
