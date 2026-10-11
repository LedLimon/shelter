"use client";

import { useId, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";
import {
  MediaUploader,
  type MediaUploaderProps,
} from "@/components/media/media-uploader";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldTitle,
} from "@/components/ui/field";
import type { MediaItem } from "@/lib/media/items";
import { SERVER_ERROR } from "./form-field";

/**
 * An upload field of a react-hook-form form: MediaUploader with the label,
 * hint and error every field has (./form-field.tsx). The field's value is the
 * list of files, MediaItem[]; its schema is mediaItemsSchema().
 */
export function MediaField<
  Values extends FieldValues,
  Name extends FieldPathByValue<Values, MediaItem[]>,
  Output = Values,
>({
  control,
  name,
  label,
  description,
  className,
  ...uploader
}: {
  control: Control<Values, unknown, Output>;
  name: Name;
  label: ReactNode;
  /** A hint under the field; it stays next to an error. */
  description?: ReactNode;
  /** Classes of the whole field (its place in the form's grid). */
  className?: string;
} & Pick<
  MediaUploaderProps,
  "kind" | "cover" | "max" | "disabled" | "onBusyChange"
>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { invalid, error } }) => (
        <Field data-invalid={invalid || undefined} className={className}>
          <FieldTitle id={`${id}-label`}>{label}</FieldTitle>
          <MediaUploader
            {...uploader}
            ref={field.ref}
            name={field.name}
            value={field.value as MediaItem[]}
            onChange={field.onChange}
            disabled={uploader.disabled ?? field.disabled}
            invalid={invalid}
            aria-labelledby={`${id}-label`}
            aria-describedby={
              [description && `${id}-hint`, invalid && `${id}-error`]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          {description && (
            <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>
          )}
          <FieldError
            id={`${id}-error`}
            // The list as a whole (too many files, one still processing).
            errors={[error, error?.root]}
            role={error?.type === SERVER_ERROR ? "alert" : undefined}
          />
        </Field>
      )}
    />
  );
}
