"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { formLinkClass } from "@/components/auth/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  cancelFakeCheckout,
  completeFake3ds,
  payFakeCheckout,
  retryFakeCheckout,
} from "./actions";

/**
 * The heading of a screen that replaced another after an action: takes the
 * focus, so that a screen reader announces the result and the keyboard
 * continues from it rather than from the top of the page.
 */
export function ResultHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <h1 ref={ref} tabIndex={-1} className="flex items-start gap-2 text-title">
      {children}
    </h1>
  );
}

type Choice =
  | { name: string; value: string; formAction?: undefined }
  /** Another action for the same form; React names such a button itself. */
  | { formAction: (formData: FormData) => Promise<void>; name?: undefined };

/**
 * A submit button for one of the form's choices. While the form is being
 * sent, the pressed one shows the spinner and the others wait.
 */
function ChoiceButton(props: ButtonProps & Choice) {
  const { pending, data, action } = useFormStatus();
  const chosen =
    pending &&
    (props.formAction
      ? action === props.formAction
      : data?.get(props.name!) === props.value);

  return (
    <Button
      type="submit"
      loading={chosen}
      disabled={pending && !chosen}
      {...props}
    />
  );
}

/** The terminal's «send Check» setting; locked while the payment is sent. */
function CheckOption({ defaultChecked }: { defaultChecked: boolean }) {
  const id = useId();
  const { pending } = useFormStatus();

  return (
    <Field orientation="horizontal">
      <Checkbox
        id={`${id}-check`}
        name="check"
        defaultChecked={defaultChecked}
        readOnly={pending}
        aria-describedby={`${id}-check-note`}
      />
      <FieldContent>
        <FieldLabel htmlFor={`${id}-check`} variant="option">
          Отправлять уведомление Check
        </FieldLabel>
        <FieldDescription id={`${id}-check-note`}>
          Как в&nbsp;настройках сайта в&nbsp;личном кабинете CloudPayments.
          С&nbsp;ним платёж пройдёт, только если сайт ответит на&nbsp;Check{" "}
          <code className="font-mono text-mono">{'{"code":0}'}</code>.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

/** The widget's first screen: how the bank will answer. */
export function PayForm({
  checkoutId,
  sendsCheck,
}: {
  checkoutId: string;
  /** The choice of the previous attempt, kept for «Повторить платёж». */
  sendsCheck: boolean;
}) {
  return (
    <form action={payFakeCheckout} className="flex flex-col gap-5">
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <CheckOption defaultChecked={sendsCheck} />
      <div className="flex flex-col gap-3">
        <ChoiceButton name="outcome" value="success" className="w-full">
          Оплатить
        </ChoiceButton>
        <ChoiceButton
          name="outcome"
          value="3ds"
          variant="outline"
          className="w-full"
        >
          Оплатить с&nbsp;3-D Secure
        </ChoiceButton>
        <ChoiceButton
          name="outcome"
          value="decline"
          variant="outline"
          className="w-full"
        >
          Отклонить платёж
        </ChoiceButton>
      </div>
      <ChoiceButton
        formAction={cancelFakeCheckout}
        variant="link"
        className={cn(formLinkClass, "self-start")}
      >
        Закрыть без оплаты
      </ChoiceButton>
    </form>
  );
}

/** The bank's 3-D Secure page. */
export function ThreeDsForm({ checkoutId }: { checkoutId: string }) {
  return (
    <form action={completeFake3ds} className="flex flex-col gap-3">
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <ChoiceButton name="result" value="passed" className="w-full">
        Ввести верный код
      </ChoiceButton>
      <ChoiceButton
        name="result"
        value="failed"
        variant="outline"
        className="w-full"
      >
        Ввести неверный код
      </ChoiceButton>
    </form>
  );
}

/** «Повторить платёж» of the real widget: the same invoice, a new attempt. */
export function RetryForm({ checkoutId }: { checkoutId: string }) {
  return (
    <form action={retryFakeCheckout}>
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <ChoiceButton name="retry" value="1" variant="outline" className="w-full">
        Повторить платёж
      </ChoiceButton>
    </form>
  );
}
