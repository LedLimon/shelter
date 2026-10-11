import { render, toPlainText } from "@react-email/render";
import type { EmailContext } from "./context";
import type { EmailDefinition } from "./definition";
import { emails, type EmailProps, type EmailType } from "./registry";
import { TEXT_CLASS } from "./theme";

// What html-to-text hands a formatter; its own types don't reach this
// package (it is the renderer's dependency, not ours).
type TextNode = {
  attribs?: Record<string, string>;
  children?: TextNode[];
};
type TextBuilder = {
  openBlock(options?: { leadingLineBreaks?: number }): void;
  closeBlock(options?: { trailingLineBreaks?: number }): void;
  addInline(text: string): void;
};
type Walk = (nodes: TextNode[] | undefined, builder: TextBuilder) => void;

/** Every node under `node` marked `data-form="<part>"` (see Form). */
function formParts(node: TextNode, part: string): TextNode[] {
  return (node.children ?? []).flatMap((child) =>
    child.attribs?.["data-form"] === part ? [child] : formParts(child, part),
  );
}

// On top of React Email's defaults (no images, nothing of the preheader):
// - the heading keeps its case: the letter doesn't shout;
// - a link is «text <url>» — in angle brackets, so a full stop after it is
//   not taken for a part of the address;
// - a form reads as lines of «label: value», where a layout table would run
//   its cells together;
// - the links to the site itself are its name and its host, not an address.
const TEXT_OPTIONS = {
  formatters: {
    form(table: TextNode, walk: Walk, builder: TextBuilder) {
      builder.openBlock({ leadingLineBreaks: 2 });
      for (const row of formParts(table, "row")) {
        builder.openBlock({ leadingLineBreaks: 1 });
        // The parts' children, not the parts: a stacked row holds them in
        // blocks, which would put each on a line of its own.
        const inside = (part: string) =>
          formParts(row, part).flatMap((node) => node.children ?? []);
        walk(inside("label"), builder);
        builder.addInline(": ");
        walk(inside("value"), builder);
        builder.closeBlock({ trailingLineBreaks: 1 });
      }
      builder.closeBlock({ trailingLineBreaks: 2 });
    },
  },
  selectors: [
    { selector: "h1", options: { uppercase: false } },
    {
      selector: "a",
      options: { linkBrackets: ["<", ">"], hideLinkHrefIfSameAsText: true },
    },
    {
      selector: `a.${TEXT_CLASS.site}`,
      format: "anchor",
      options: { ignoreHref: true },
    },
    { selector: `table.${TEXT_CLASS.form}`, format: "form" },
  ],
};

export type RenderedEmail = {
  subject: string;
  html: string;
  /** The same letter as plain text: the alternative part of the message. */
  text: string;
  /** Leaves the mailing list, for the List-Unsubscribe header. */
  unsubscribeUrl?: string;
};

/**
 * A letter of the registry as it goes out. Pure: the same props and context
 * give the same letter, in the worker, in the dev preview and in tests.
 * Throws a ZodError if the props don't fit the letter.
 */
export async function renderEmail<T extends EmailType>(
  type: T,
  input: EmailProps<T>,
  context: EmailContext,
): Promise<RenderedEmail> {
  // Each entry pairs a schema with a template of its output; the cast drops
  // that link, which TypeScript can't follow through a lookup by `type`.
  const definition = emails[type] as unknown as EmailDefinition;
  const props: unknown = definition.props.parse(input);
  const links = definition.links?.(props, context) ?? {};
  const { Template } = definition;

  const html = await render(
    <Template props={props} context={context} links={links} />,
  );
  return {
    subject: definition.subject(props, context),
    html,
    text: toPlainText(html, TEXT_OPTIONS),
    unsubscribeUrl: links.unsubscribe,
  };
}
