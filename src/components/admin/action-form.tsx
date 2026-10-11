"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormAlert } from "@/components/auth/form-alert";
import { SERVER_ERROR } from "@/components/form/form-field";
import {
  ACTION_MESSAGES,
  type ActionFailure,
  type ActionResult,
} from "@/server/admin/result";

type ActionFormOptions<
  Values extends FieldValues,
  Output extends FieldValues,
  Data,
> = {
  /** The form's schema: typed values in, the stored shape out. */
  schema: z.ZodType<Output, Values>;
  defaultValues: DefaultValues<Values>;
  /** The toast after a successful submit. */
  success?: string;
  /**
   * The form's values as the server stored them, if the action returns them:
   * what it normalized (a trimmed name, a nick turned into a link) shows up
   * at once. Without it the form keeps the values as they were typed.
   */
  savedValues?: (data: Data) => Values;
  onSuccess?: (data: Data) => void;
} & (
  | {
      changedOnly?: false;
      action: (input: Values) => Promise<ActionResult<Data>>;
    }
  | {
      /**
       * Send only the top-level fields that differ from the form's clean
       * state. For a form that edits several independent records at once
       * (the settings): a tab opened long ago then cannot write its old copy
       * over what it didn't touch. The action's schema takes a partial input.
       */
      changedOnly: true;
      action: (input: Partial<Values>) => Promise<ActionResult<Data>>;
    }
);

/**
 * A react-hook-form form that submits to an adminAction() server action and
 * handles what comes back the same way everywhere:
 * - saved — a toast, and the saved values become the form's clean state;
 * - field errors from the server — at the fields, the first one focused;
 * - anything else (no permission, session over, refused, no connection, an
 *   error that belongs to no field on screen) — `failure` for
 *   <ActionFailureAlert> next to the submit button.
 * What the user typed stays in the form in every case, what they typed while
 * the request was on its way included.
 *
 * The action gets the values as typed, not the schema's output: the server
 * parses them with the same schema, so error paths match the field names.
 */
export function useActionForm<
  Values extends FieldValues,
  Output extends FieldValues,
  Data,
>({
  schema,
  defaultValues,
  action,
  changedOnly = false,
  success = "Сохранено",
  savedValues,
  onSuccess,
}: ActionFormOptions<Values, Output, Data>) {
  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  // The form's clean state: the values it opened with, then the last saved.
  const [opened] = useState(() => snapshot(defaultValues as Values));
  const saved = useRef<Values>(null);
  const busy = useRef(false);

  // Closing or reloading the tab with unsaved changes asks first. Links
  // inside the admin are not held back.
  const { isDirty } = form.formState;
  useEffect(() => {
    if (!isDirty) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [isDirty]);

  /** For the form's onSubmit. Ignores a submit while one is on its way. */
  async function submit(event?: BaseSyntheticEvent) {
    // Enter in a field submits even while the button shows the spinner.
    event?.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      await form.handleSubmit(onValid, onInvalid)(event);
    } finally {
      busy.current = false;
    }
  }

  async function onValid() {
    setFailure(null);
    // A copy: getValues() shares its nested objects with the live form.
    const sent = snapshot(form.getValues());
    const input = changedOnly ? changesOf(sent, saved.current ?? opened) : sent;
    if (changedOnly && Object.keys(input).length === 0) {
      toast.info("Изменений нет: сохранять нечего");
      return;
    }

    let result: ActionResult<Data>;
    try {
      result = await action(input as Values);
    } catch {
      // The action threw, or the request never reached the server.
      result = {
        ok: false,
        error: { code: "failed", message: ACTION_MESSAGES.unexpected },
      };
    }

    if (result.ok) {
      const stored = savedValues ? savedValues(result.data) : sent;
      saved.current = snapshot(stored);
      // Typed while the request was on its way: it stays, marked as unsaved.
      const typedSince = !sameValues(form.getValues(), sent);
      form.reset(stored, { keepValues: typedSince });
      toast.success(success);
      onSuccess?.(result.data);
      return;
    }

    // The empty path is an error of the form as a whole.
    const { "": formError, ...fieldErrors } = result.error.fieldErrors ?? {};
    const paths = Object.keys(fieldErrors) as FieldPath<Values>[];
    for (const path of paths) {
      form.setError(path, { type: SERVER_ERROR, message: fieldErrors[path] });
    }
    const shown = paths.filter(hasControl);
    const [first] = shown;
    if (first) {
      form.setFocus(first);
      revealFieldMessages();
    }
    // An error of a field that is not on screen would show nowhere.
    const orphans = paths
      .filter((path) => !shown.includes(path))
      .map((path) => fieldErrors[path]);
    if (!first || formError || orphans.length > 0) {
      setFailure({
        ...result.error,
        message: [formError ?? result.error.message, ...orphans].join(" "),
      });
    }
  }

  /** The schema rejected the values in the browser. */
  function onInvalid(errors: FieldErrors<Values>) {
    // Errors of fields are at the fields, and the first one has the focus.
    // One that belongs to no control (a list as a whole) would show nowhere.
    const orphans = messagesOf(errors).filter(([path]) => !hasControl(path));
    setFailure(
      orphans.length > 0
        ? {
            code: "validation",
            message: orphans.map(([, message]) => message).join(" "),
          }
        : null,
    );
    revealFieldMessages();
  }

  return { form, submit, failure };
}

/**
 * Scrolls the hint and the error of the field that took the focus into
 * view. Focusing a field shows the field: its message, rendered right below,
 * may still lie under the sticky bar of the form's buttons. The page's
 * scroll padding (the admin layout) keeps what is scrolled to clear of the
 * bar and the header.
 */
function revealFieldMessages() {
  // After react-hook-form has focused the first invalid field and React has
  // rendered the messages.
  setTimeout(() => {
    const described = document.activeElement?.getAttribute("aria-describedby");
    for (const id of described?.split(" ") ?? []) {
      document.getElementById(id)?.scrollIntoView({ block: "nearest" });
    }
  });
}

/** A deep copy of plain form values. */
function snapshot<Values>(values: Values): Values {
  return structuredClone(values);
}

function sameValues(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The top-level fields of `values` that differ from the clean state. */
function changesOf<Values extends FieldValues>(
  values: Values,
  clean: Values,
): Partial<Values> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([name, value]) => !sameValues(value, clean[name]),
    ),
  ) as Partial<Values>;
}

/** Whether a control with this field name is on the page. */
function hasControl(path: string): boolean {
  return document.getElementsByName(path).length > 0;
}

/** Every message in react-hook-form's error tree with its field path. */
function messagesOf(errors: object, prefix = ""): [string, string][] {
  return Object.entries(errors).flatMap(([key, value]: [string, unknown]) => {
    // `ref` is the field's element, not a part of the tree.
    if (typeof value !== "object" || value === null || key === "ref") return [];
    // The error of a field array as a whole sits under `root`.
    const path = key === "root" ? prefix : prefix ? `${prefix}.${key}` : key;
    if ("message" in value && typeof value.message === "string") {
      return [[path, value.message] as [string, string]];
    }
    return messagesOf(value, path);
  });
}

/**
 * Why the action didn't go through, next to the submit button. A session
 * that ended is renewed in another tab, so the form keeps what was typed.
 */
export function ActionFailureAlert({
  failure,
}: {
  failure: ActionFailure | null;
}) {
  if (!failure) return null;

  return (
    <FormAlert>
      {failure.message}
      {failure.code === "unauthorized" && (
        <>
          {" "}
          <a
            href="/admin/login"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Войти в новой вкладке
          </a>
        </>
      )}
    </FormAlert>
  );
}
