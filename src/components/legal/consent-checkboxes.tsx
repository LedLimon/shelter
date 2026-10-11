"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { legalHref } from "@/server/legal/catalog";
import {
  NOT_GIVEN,
  type ConsentDocument,
  type ConsentValue,
} from "@/server/legal/consent-input";
import { SERVER_ERROR } from "@/components/form/form-field";

type ConsentCheckboxesProps<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output,
> = {
  control: Control<Values, unknown, Output>;
  /**
   * The form field that holds the consents: an object of ConsentValue by
   * document type — noConsents() by default, consentsSchema() in the schema.
   */
  name: Name;
  /**
   * The versions in force — consentDocuments() on the server. One box per
   * document, in this order; the form leaves out what it doesn't ask for
   * (RECURRING for a one-time donation). A box that leaves the form loses
   * its tick, and so does a box whose document got a newer version: when
   * the action answers that a consent is outdated (ConsentError OUTDATED),
   * the form calls router.refresh() to get the versions in force.
   */
  documents: readonly ConsentDocument[];
  /**
   * What a monthly donor agrees to be charged, for the RECURRING box:
   * «1 500 ₽ каждый месяц» (docs/legal.md: the sum and the period are part
   * of that consent). When it changes, the box loses its tick: the consent
   * was given to another sum.
   */
  recurringTerms?: string;
  /**
   * The boxes the form can't go without — the `required` of consentsSchema():
   * a screen reader says so before the form is sent.
   */
  required?: readonly LegalDocumentType[];
  className?: string;
};

/**
 * The consent boxes of a form (docs/legal.md): one box per document, every
 * one unticked until the person ticks it, each with a link to the very
 * version it is about. A ticked box holds that version's id, which the
 * server action passes to recordConsents().
 */
export function ConsentCheckboxes<
  Values extends FieldValues,
  Name extends FieldPathByValue<
    Values,
    Partial<Record<LegalDocumentType, ConsentValue>>
  >,
  Output = Values,
>({
  control,
  name,
  documents,
  recurringTerms,
  required = [],
  className,
}: ConsentCheckboxesProps<Values, Name, Output>) {
  return (
    <FieldSet className={className}>
      <FieldLegend className="sr-only">Согласия</FieldLegend>
      {documents.map((document) => (
        <Controller
          key={document.type}
          control={control}
          // A key of the consents object: the path exists whatever Values is.
          name={`${name}.${document.type}` as FieldPath<Values>}
          render={({ field, fieldState: { invalid, error } }) => (
            <ConsentBox
              document={document}
              recurringTerms={recurringTerms}
              required={required.includes(document.type)}
              name={field.name}
              value={typeof field.value === "string" ? field.value : NOT_GIVEN}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              disabled={field.disabled}
              invalid={invalid}
              error={error}
            />
          )}
        />
      ))}
    </FieldSet>
  );
}

function ConsentBox({
  document,
  recurringTerms,
  required,
  name,
  value,
  onChange,
  onBlur,
  inputRef,
  disabled,
  invalid,
  error,
}: {
  document: ConsentDocument;
  recurringTerms: string | undefined;
  required: boolean;
  name: string;
  value: ConsentValue;
  onChange: (value: ConsentValue) => void;
  onBlur: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
  disabled: boolean | undefined;
  invalid: boolean;
  error: { type?: string; message?: string } | undefined;
}) {
  const id = useId();
  const { label, hint } = consentText(document, recurringTerms);
  // What the box was ticked for: this version, and for RECURRING this sum.
  const terms = document.type === "RECURRING" ? recurringTerms : undefined;
  const tickedFor = useRef({ id: document.id, terms });
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  // The tick is a consent to one text. The form now shows a newer version,
  // or another sum to charge every month: it was not given to those.
  useEffect(() => {
    const ticked = tickedFor.current;
    tickedFor.current = { id: document.id, terms };
    const changed = ticked.id !== document.id || ticked.terms !== terms;
    if (changed && latest.current.value !== NOT_GIVEN) {
      latest.current.onChange(NOT_GIVEN);
    }
  }, [document.id, terms]);

  // A box that leaves the form (the donor switched back to a one-time
  // donation) takes its tick along: it must not come back ticked.
  useEffect(
    () => () => {
      if (latest.current.value !== NOT_GIVEN) {
        latest.current.onChange(NOT_GIVEN);
      }
    },
    [],
  );

  return (
    <Field orientation="horizontal" data-invalid={invalid || undefined}>
      <Checkbox
        id={id}
        name={name}
        checked={value === document.id}
        onCheckedChange={(checked) =>
          onChange(checked ? document.id : NOT_GIVEN)
        }
        onBlur={onBlur}
        inputRef={inputRef}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [hint && `${id}-hint`, invalid && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <FieldContent>
        <FieldLabel htmlFor={id} variant="option" className="block">
          {label}
        </FieldLabel>
        {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
        <FieldError
          id={`${id}-error`}
          errors={[error]}
          // An error from the server arrives after the submit: announce it.
          role={error?.type === SERVER_ERROR ? "alert" : undefined}
        />
      </FieldContent>
    </Field>
  );
}

/** The sentence next to a box, with the link to the text it is about. */
function consentText(
  { type, version }: ConsentDocument,
  recurringTerms: string | undefined,
): { label: ReactNode; hint?: ReactNode } {
  // The address of this very version: what the person reads is what the
  // consent is recorded for, even if a newer version comes out meanwhile.
  const link = (text: string) => (
    <DocumentLink href={legalHref(type, version)}>{text}</DocumentLink>
  );

  switch (type) {
    case "OFFER":
      return {
        label: <>Принимаю условия {link("оферты о\u00A0пожертвовании")}</>,
      };
    case "PD_CONSENT":
      return {
        label: (
          <>
            Даю {link("согласие на\u00A0обработку персональных данных")}{" "}
            по&nbsp;
            <DocumentLink href={legalHref("PRIVACY")}>
              политике приюта
            </DocumentLink>
          </>
        ),
      };
    case "PRIVACY":
      return {
        label: (
          <>
            Ознакомлен(а) с&nbsp;
            {link("политикой обработки персональных данных")}
          </>
        ),
      };
    case "RECURRING":
      return {
        label: recurringTerms ? (
          <>
            Разрешаю списывать {recurringTerms}, пока не&nbsp;отменю подписку,
            и&nbsp;принимаю {link("условия ежемесячных пожертвований")}
          </>
        ) : (
          <>Принимаю {link("условия ежемесячных пожертвований")}</>
        ),
      };
    case "MARKETING":
      return {
        label: (
          <>
            Хочу получать новости приюта на&nbsp;почту —{" "}
            {link("согласие на\u00A0рассылку")}
          </>
        ),
        hint: "Необязательно. Отписаться можно по ссылке в любом письме.",
      };
  }
}

/** Opens next to the form, so nothing typed into it is lost. */
function DocumentLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="text-pen underline hover:decoration-[3px]"
    >
      {children}
      <span className="sr-only"> (откроется в новой вкладке)</span>
    </a>
  );
}
