"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type BaseSyntheticEvent } from "react";
import {
  useForm,
  type DefaultValues,
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

/**
 * A react-hook-form form that submits to an adminAction() server action and
 * handles what comes back the same way everywhere:
 * - saved — a toast, and the saved values become the form's clean state;
 * - field errors from the server — at the fields, the first one focused;
 * - anything else (no permission, session over, refused, no connection) —
 *   `failure` for <ActionFailureAlert> next to the submit button. What the
 *   user typed stays in the form in every case.
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
  success = "Сохранено",
  savedValues,
  onSuccess,
}: {
  /** The schema the action was made with: typed values in, stored shape out. */
  schema: z.ZodType<Output, Values>;
  defaultValues: DefaultValues<Values>;
  action: (input: Values) => Promise<ActionResult<Data>>;
  /** The toast after a successful submit. */
  success?: string;
  /**
   * The form's values as the server stored them, if the action returns them:
   * what it normalized (a trimmed name, a nick turned into a link) shows up
   * at once. Without it the form keeps the values as they were typed.
   */
  savedValues?: (data: Data) => Values;
  onSuccess?: (data: Data) => void;
}) {
  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const [failure, setFailure] = useState<ActionFailure | null>(null);

  const handle = form.handleSubmit(onValid, () => setFailure(null));
  const busy = useRef(false);

  /** For the form's onSubmit. Ignores a submit while one is on its way. */
  async function submit(event?: BaseSyntheticEvent) {
    // Enter in a field submits even while the button shows the spinner.
    event?.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      await handle(event);
    } finally {
      busy.current = false;
    }
  }

  async function onValid() {
    setFailure(null);
    const values = form.getValues();

    let result: ActionResult<Data>;
    try {
      result = await action(values);
    } catch {
      // The action threw, or the request never reached the server.
      result = {
        ok: false,
        error: { code: "failed", message: ACTION_MESSAGES.unexpected },
      };
    }

    if (result.ok) {
      form.reset(savedValues ? savedValues(result.data) : values);
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
    const [first] = paths;
    if (first) form.setFocus(first);
    if (!first || formError) {
      setFailure({
        ...result.error,
        message: formError ?? result.error.message,
      });
    }
  }

  return { form, submit, failure };
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
