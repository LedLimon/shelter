"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import {
  ActionFailureAlert,
  useActionForm,
} from "@/components/admin/action-form";
import { FormActions } from "@/components/admin/form-actions";
import { Panel } from "@/components/admin/panel";
import { MediaField } from "@/components/form/media-field";
import { MediaImage } from "@/components/media/media-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveMediaDemo } from "./actions";
import {
  DEMO_PHOTOS_MAX,
  DEMO_RECEIPTS_MAX,
  mediaDemoSchema,
  type MediaDemoValues,
} from "./schema";

export function MediaDemoForm({
  defaultValues,
}: {
  defaultValues: MediaDemoValues;
}) {
  const { form, submit, failure } = useActionForm({
    schema: mediaDemoSchema,
    defaultValues,
    action: saveMediaDemo,
    success: "Отметки сохранены",
    savedValues: (saved) => saved,
  });
  const { control } = form;
  const { isSubmitting, isDirty } = form.formState;
  const [busy, setBusy] = useState({ photos: false, receipts: false });
  const uploading = busy.photos || busy.receipts;

  const photos = useWatch({ control, name: "photos" });
  const published = photos.filter(({ status }) => status === "READY");

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid max-w-3xl gap-grid"
    >
      <Panel
        title="Фото собаки"
        description="Как в карточке собаки: несколько снимков, один из них — обложка."
      >
        <MediaField
          control={control}
          name="photos"
          label="Фото"
          kind="PHOTO"
          cover
          max={DEMO_PHOTOS_MAX}
          onBusyChange={(photosBusy) =>
            setBusy((current) => ({ ...current, photos: photosBusy }))
          }
        />
      </Panel>

      <Panel
        title="Чеки расхода"
        description="Чек виден на сайте только с отметкой «Личные данные закрашены». Пока её нет, его видят одни сотрудники."
      >
        <MediaField
          control={control}
          name="receipts"
          label="Чеки"
          kind="RECEIPT"
          max={DEMO_RECEIPTS_MAX}
          description="Закрасьте в редакторе телефона фамилии, телефоны и номера карт, потом загрузите фото."
          onBusyChange={(receiptsBusy) =>
            setBusy((current) => ({ ...current, receipts: receiptsBusy }))
          }
        />
      </Panel>

      <Panel
        title="Как это увидят на сайте"
        description="Обработанные версии: уменьшены, без геометки и данных камеры. Браузер сам берёт подходящую ширину."
      >
        {published.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            Загрузите фото выше — здесь появится то, что увидят посетители.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {published.map((photo) => (
              <li
                key={photo.id}
                className={
                  photo.isCover ? "col-span-2 row-span-2 grid gap-2" : undefined
                }
              >
                <MediaImage
                  media={photo}
                  alt=""
                  sizes={
                    photo.isCover
                      ? "(min-width: 48rem) 30rem, 90vw"
                      : "(min-width: 48rem) 15rem, 45vw"
                  }
                  className="aspect-[4/3] h-auto w-full border border-foreground object-cover"
                />
                {photo.isCover && <Badge variant="outline">Обложка</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <FormActions>
        <ActionFailureAlert failure={failure} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={isSubmitting} disabled={uploading}>
            {isSubmitting ? "Сохраняем…" : "Сохранить"}
          </Button>
          {uploading ? (
            <p className="text-caption text-toner-muted">
              Файлы ещё загружаются: сохранить можно будет через несколько
              секунд.
            </p>
          ) : (
            isDirty &&
            !isSubmitting && (
              <p className="text-caption text-toner-muted">
                Есть несохранённые изменения.
              </p>
            )
          )}
        </div>
      </FormActions>
    </form>
  );
}
