"use client";

import { CircleCheck } from "lucide-react";
import { useActionState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { sendSample, type SendSampleState } from "./actions";

/** Queues the shown example for the worker to send to Mailpit. */
export function SendSampleForm({
  template,
  example,
}: {
  template: string;
  example: string;
}) {
  const [state, action, pending] = useActionState<SendSampleState, FormData>(
    sendSample,
    null,
  );

  return (
    <form action={action} className="grid justify-items-start gap-3">
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="example" value={example} />
      <Button type="submit" loading={pending}>
        Отправить образец
      </Button>
      {state && !state.ok ? <FormAlert>{state.message}</FormAlert> : null}
      {state?.ok ? (
        <p role="status" className="flex gap-2 text-caption text-success">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
