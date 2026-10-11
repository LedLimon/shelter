"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  cancelFakeCheckout,
  completeFake3ds,
  payFakeCheckout,
} from "./actions";

/**
 * A submit button that says which choice it sends. While the form is being
 * sent, the pressed one shows the spinner and the others wait.
 */
function ChoiceButton({
  name,
  value,
  ...props
}: ButtonProps & { name: string; value: string }) {
  const { pending, data } = useFormStatus();
  const chosen = pending && data?.get(name) === value;

  return (
    <Button
      type="submit"
      name={name}
      value={value}
      loading={chosen}
      disabled={pending && !chosen}
      {...props}
    />
  );
}

/** The widget's first screen: how the bank will answer. */
export function PayForm({ checkoutId }: { checkoutId: string }) {
  const id = useId();

  return (
    <div className="flex flex-col gap-4">
      <form action={payFakeCheckout} className="flex flex-col gap-5">
        <input type="hidden" name="checkoutId" value={checkoutId} />
        <div className="flex flex-col gap-3">
          <ChoiceButton name="outcome" value="success" className="w-full">
            Оплатить
          </ChoiceButton>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceButton name="outcome" value="3ds" variant="outline">
              С 3-D Secure
            </ChoiceButton>
            <ChoiceButton name="outcome" value="decline" variant="destructive">
              Отказ банка
            </ChoiceButton>
          </div>
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-check`}
            name="check"
            defaultChecked
            aria-describedby={`${id}-check-note`}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${id}-check`} variant="option">
              Отправлять уведомление Check
            </FieldLabel>
            <FieldDescription id={`${id}-check-note`}>
              Как в&nbsp;настройках терминала. С&nbsp;ним платёж пройдёт, только
              если сайт ответит на&nbsp;Check{" "}
              <code className="font-mono text-mono">{'{"code":0}'}</code>.
            </FieldDescription>
          </FieldContent>
        </Field>
      </form>
      <form action={cancelFakeCheckout}>
        <input type="hidden" name="checkoutId" value={checkoutId} />
        <ChoiceButton
          name="close"
          value="1"
          variant="link"
          className="min-h-11 text-caption text-toner-muted hover:text-toner"
        >
          Закрыть без оплаты
        </ChoiceButton>
      </form>
    </div>
  );
}

/** The bank's 3-D Secure page. */
export function ThreeDsForm({ checkoutId }: { checkoutId: string }) {
  return (
    <form action={completeFake3ds} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <ChoiceButton name="result" value="passed">
        Код верный
      </ChoiceButton>
      <ChoiceButton name="result" value="failed" variant="destructive">
        Код неверный
      </ChoiceButton>
    </form>
  );
}
