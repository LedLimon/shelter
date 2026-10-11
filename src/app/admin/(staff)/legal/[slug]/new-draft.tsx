"use client";

import { useRouter } from "next/navigation";
import { ActionFailureAlert } from "@/components/admin/action-form";
import { Panel } from "@/components/admin/panel";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { createDraft } from "../actions";

/** No draft yet: explains how a new version is made and starts one. */
export function NewDraft({
  type,
  version,
  currentVersion,
}: {
  type: LegalDocumentType;
  /** The number the new version gets. */
  version: number;
  currentVersion: number | null;
}) {
  const router = useRouter();
  const { run, pending, failure } = useAdminAction();

  return (
    <Panel title="Новая версия" className="max-w-3xl">
      <p className="max-w-prose">
        {currentVersion === null ? (
          <>
            У&nbsp;документа ещё нет текста. Создайте черновик: на&nbsp;сайте
            он&nbsp;появится только после публикации.
          </>
        ) : (
          <>
            Сейчас действует версия {currentVersion}. Чтобы изменить текст,
            создайте черновик версии {version}: он&nbsp;начнётся с&nbsp;копии
            действующего текста и&nbsp;не&nbsp;виден на&nbsp;сайте, пока
            вы&nbsp;его не&nbsp;опубликуете.
          </>
        )}
      </p>
      <ActionFailureAlert failure={failure} />
      <div>
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            void run(
              () => createDraft({ type }),
              // The page now has a draft: show its editor.
              () => router.refresh(),
            )
          }
        >
          {pending ? "Создаём…" : `Создать черновик версии ${version}`}
        </Button>
      </div>
    </Panel>
  );
}
