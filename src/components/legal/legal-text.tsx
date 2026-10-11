import { cn } from "@/lib/utils";
import { parseLegalInline, parseLegalText } from "./parse-legal-text";

/**
 * The text of a legal document as people read it: Literata at a reading
 * measure, clause numbers as typed. The markup is in parse-legal-text.ts.
 * Renders React elements only, so the text can't inject markup.
 */
export function LegalText({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `font-reading`: Literata in the admin's preview as well.
        "max-w-prose font-reading text-body text-pretty",
        className,
      )}
    >
      {parseLegalText(body).map((block, index) => {
        switch (block.kind) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} className="mt-8 mb-3 text-title first:mt-0">
                {block.text}
              </h2>
            ) : (
              <h3 key={index} className="mt-6 mb-2 text-button first:mt-0">
                {block.text}
              </h3>
            );
          case "list":
            return (
              <ul
                key={index}
                className="mt-3 grid list-disc gap-1.5 pl-5 marker:text-toner-muted first:mt-0"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "paragraph":
            return (
              <p key={index} className="mt-3 first:mt-0">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return parseLegalInline(text).map((part, index) =>
    part.kind === "link" ? (
      <a
        key={index}
        href={part.href}
        rel="noopener noreferrer"
        className="break-words text-pen underline"
      >
        {part.href}
      </a>
    ) : (
      part.text
    ),
  );
}
