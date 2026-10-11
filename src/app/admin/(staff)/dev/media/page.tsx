import type { Metadata } from "next";
import { assertDevelopment } from "@/app/dev/dev-only";
import { PageHeader } from "@/components/admin/page-header";
import type { MediaKind } from "@/generated/prisma/enums";
import { toMediaItems } from "@/lib/media/items";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { mediaStateOf } from "@/server/media";
import { MediaDemoForm } from "./media-demo-form";
import { DEMO_PHOTOS_MAX, DEMO_RECEIPTS_MAX } from "./schema";

export const metadata: Metadata = { title: "Загрузка файлов" };

/**
 * A place to try MediaUploader before the forms that will use it exist
 * (dogs, needs, expenses): only in `next dev`, like /dev/ui, but inside the
 * admin — uploading needs a staff session. e2e/media-upload.spec.ts runs here.
 */
export default async function MediaDemoPage() {
  assertDevelopment();
  const user = await requireStaff("media.upload");

  // Nothing is attached anywhere yet: the form opens with what this staff
  // member uploaded last, as a saved form would open with its files.
  const recent = async (kind: MediaKind, take: number) => {
    const rows = await getDb().media.findMany({
      where: { uploadedById: user.id, kind, status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return toMediaItems(rows.reverse().map(mediaStateOf));
  };

  return (
    <>
      <PageHeader
        title="Загрузка файлов"
        description="Проверочная страница поля загрузки. Она есть только в разработке и ничего никуда не прикрепляет: порядок и обложка живут до перезагрузки, сохраняются только отметки у чеков."
      />
      <MediaDemoForm
        defaultValues={{
          photos: await recent("PHOTO", DEMO_PHOTOS_MAX),
          receipts: await recent("RECEIPT", DEMO_RECEIPTS_MAX),
        }}
      />
    </>
  );
}
