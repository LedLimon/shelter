"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/*
 * Fields of a react-hook-form form (docs/design.md#базовые-компоненты): the
 * wrappers do the wiring every field repeats — id, label, hint, error,
 * aria-invalid and aria-describedby — so a form lists its fields and nothing
 * else. FormField takes any control; TextField, TextareaField and SelectField
 * are the common ones.
 */

/** Error type of a message that came back from the server action. */
export const SERVER_ERROR = "server";

/** Props that tie a control to its label, hint and error. */
export type FieldControlProps = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

type FormFieldProps<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output,
> = {
  control: Control<Values, unknown, Output>;
  name: Name;
  label: ReactNode;
  /** For a field whose neighbours make the label obvious: a row of a list. */
  labelHidden?: boolean;
  /** A hint under the field; it stays next to an error. */
  description?: ReactNode;
  /** Classes of the whole field (its place in the form's grid). */
  className?: string;
};

export function FormField<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output = Values,
>({
  control,
  name,
  label,
  labelHidden = false,
  description,
  className,
  children,
}: FormFieldProps<Values, Name, Output> & {
  children: (
    field: ControllerRenderProps<Values, Name>,
    props: FieldControlProps,
  ) => ReactNode;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { invalid, error } }) => (
        <Field data-invalid={invalid || undefined} className={className}>
          <FieldLabel htmlFor={id} className={cn(labelHidden && "sr-only")}>
            {label}
          </FieldLabel>
          {children(field, {
            id,
            "aria-invalid": invalid || undefined,
            "aria-describedby":
              [description && `${id}-hint`, invalid && `${id}-error`]
                .filter(Boolean)
                .join(" ") || undefined,
          })}
          {description && (
            <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>
          )}
          <FieldError
            id={`${id}-error`}
            errors={[error]}
            // An error from the server arrives after the submit: announce it.
            role={error?.type === SERVER_ERROR ? "alert" : undefined}
          />
        </Field>
      )}
    />
  );
}

type ControlOwnProps = "name" | "value" | "defaultValue" | "id" | "children";

export function TextField<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output = Values,
>({
  control,
  name,
  label,
  labelHidden,
  description,
  className,
  inputClassName,
  ...input
}: FormFieldProps<Values, Name, Output> &
  Omit<ComponentProps<typeof Input>, ControlOwnProps | "className"> & {
    inputClassName?: string;
  }) {
  return (
    <FormField
      {...{ control, name, label, labelHidden, description, className }}
    >
      {(field, props) => (
        <Input {...input} {...field} {...props} className={inputClassName} />
      )}
    </FormField>
  );
}

export function TextareaField<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output = Values,
>({
  control,
  name,
  label,
  labelHidden,
  description,
  className,
  inputClassName,
  ...textarea
}: FormFieldProps<Values, Name, Output> &
  Omit<ComponentProps<typeof Textarea>, ControlOwnProps | "className"> & {
    inputClassName?: string;
  }) {
  return (
    <FormField
      {...{ control, name, label, labelHidden, description, className }}
    >
      {(field, props) => (
        <Textarea
          {...textarea}
          {...field}
          {...props}
          className={inputClassName}
        />
      )}
    </FormField>
  );
}

export function SelectField<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
  Output = Values,
>({
  control,
  name,
  label,
  labelHidden,
  description,
  className,
  options,
  placeholder,
}: FormFieldProps<Values, Name, Output> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <FormField
      {...{ control, name, label, labelHidden, description, className }}
    >
      {(field, props) => (
        <Select
          items={options}
          name={field.name}
          value={field.value}
          onValueChange={field.onChange}
          inputRef={field.ref}
          disabled={field.disabled}
        >
          <SelectTrigger {...props} onBlur={field.onBlur}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ value, label: optionLabel }) => (
              <SelectItem key={value} value={value}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
