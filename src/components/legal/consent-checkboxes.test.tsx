import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import {
  consentsSchema,
  noConsents,
  type ConsentDocument,
  type ConsentValues,
} from "@/server/legal/consent-input";
import { ConsentCheckboxes } from "./consent-checkboxes";

const DOCUMENTS: ConsentDocument[] = [
  { id: "doc-offer-3", type: "OFFER", version: 3 },
  { id: "doc-consent-2", type: "PD_CONSENT", version: 2 },
  { id: "doc-recurring-1", type: "RECURRING", version: 1 },
  { id: "doc-marketing-1", type: "MARKETING", version: 1 },
];
const TYPES = DOCUMENTS.map(({ type }) => type);

type FormValues = { consents: ConsentValues };

function Form({ consents }: { consents: Partial<ConsentValues> }) {
  const form = useForm<FormValues>({
    defaultValues: { consents: consents },
  });
  return (
    <form>
      <ConsentCheckboxes
        control={form.control}
        name="consents"
        documents={DOCUMENTS}
        recurringTerms="1 500 ₽ каждый месяц"
      />
    </form>
  );
}

const boxes = (html: string) =>
  [...html.matchAll(/role="checkbox"[^>]*aria-checked="(\w+)"/g)].map(
    ([, checked]) => checked,
  );

describe("ConsentCheckboxes", () => {
  it("shows every box unticked by default", () => {
    const html = renderToStaticMarkup(<Form consents={noConsents(TYPES)} />);

    expect(boxes(html)).toEqual(["false", "false", "false", "false"]);
    // Nor do the hidden inputs behind the boxes start checked.
    expect(html).not.toMatch(/\schecked(=|\s|>)/);
  });

  it("links every box to the very version it is about, in a new tab", () => {
    const html = renderToStaticMarkup(<Form consents={noConsents(TYPES)} />);

    for (const href of [
      "/legal/offer/3",
      "/legal/consent/2",
      "/legal/recurring/1",
      "/legal/marketing/1",
      // The policy the consent refers to: whatever version is in force.
      "/legal/privacy",
    ]) {
      expect(html).toContain(`href="${href}" target="_blank"`);
    }
    expect(html).toContain("Разрешаю списывать 1 500 ₽ каждый месяц");
  });

  it("counts a box as ticked only for the version it shows", () => {
    const html = renderToStaticMarkup(
      <Form
        consents={{
          ...noConsents(TYPES),
          OFFER: "doc-offer-3",
          // Ticked while version 1 was in force; the form now shows version 2.
          PD_CONSENT: "doc-consent-1",
        }}
      />,
    );

    expect(boxes(html)).toEqual(["true", "false", "false", "false"]);
  });
});

describe("noConsents and consentsSchema", () => {
  const schema = consentsSchema({
    required: {
      OFFER: "Чтобы помочь, примите условия оферты.",
      PD_CONSENT: "Нужно согласие на обработку данных.",
    },
    optional: ["MARKETING"],
  });

  it("starts a form with no consent given, so it can't be sent as it is", () => {
    const empty = noConsents(["OFFER", "PD_CONSENT", "MARKETING"]);

    expect(empty).toEqual({ OFFER: "", PD_CONSENT: "", MARKETING: "" });
    expect(
      schema.safeParse(empty).error?.issues.map(({ path, message }) => ({
        path,
        message,
      })),
    ).toEqual([
      { path: ["OFFER"], message: "Чтобы помочь, примите условия оферты." },
      { path: ["PD_CONSENT"], message: "Нужно согласие на обработку данных." },
    ]);
  });

  it("passes once the required boxes are ticked; the optional one may stay empty", () => {
    const values = { OFFER: "doc-offer-3", PD_CONSENT: "doc-consent-2" };

    expect(schema.parse({ ...values, MARKETING: "" })).toEqual({
      ...values,
      MARKETING: "",
    });
  });
});
