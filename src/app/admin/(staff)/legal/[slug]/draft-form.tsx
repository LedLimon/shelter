"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  ActionFailureAlert,
  useActionForm,
} from "@/components/admin/action-form";
import { FormActions } from "@/components/admin/form-actions";
import { Panel } from "@/components/admin/panel";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { TextareaField } from "@/components/form/form-field";
import { LegalText } from "@/components/legal/legal-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteDraft, publishDraft, saveDraft } from "../actions";
import { draftFormSchema } from "../schema";

type Draft = { id: string; version: number; body: string; sha256: string };

/**
 * The editor of a document's next version. Saving and publishing are two
 * steps on purpose: what is published is the saved text, the one the preview
 * showed — and publishing can't be undone.
 */
export function DraftForm({ draft, title }: { draft: Draft; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"publish" | "delete" | null>(
    null,
  );
  const { form, submit, failure } = useActionForm({
    schema: draftFormSchema,
    // `sha256` names the stored text this editor works on: a save sends it,
    // so it can't overwrite a text saved elsewhere meanwhile, and publishing
    // names the saved text by it.
    defaultValues: { id: draft.id, sha256: draft.sha256, body: draft.body },
    action: saveDraft,
    success: "Черновик сохранён",
    savedValues: (saved) => ({
      id: draft.id,
      sha256: saved.sha256,
      body: saved.body,
    }),
    // The page's own copy of the draft is old now: without this, coming
    // back to the page through the browser's history shows the text as it
    // was before the save.
    onSuccess: () => router.refresh(),
  });
  const { isDirty, isSubmitting } = form.formState;
  const body = useWatch({ control: form.control, name: "body" });
  const savedSha256 = useWatch({ control: form.control, name: "sha256" });
  // Typing stays quick in a long text: the preview catches up.
  const previewBody = useDeferredValue(body);

  const publishing = useAdminAction();
  const deleting = useAdminAction();
  const closeDialog = () => {
    setConfirming(null);
    publishing.clearFailure();
    deleting.clearFailure();
  };

  return (
    <>
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="grid max-w-3xl gap-grid"
      >
        <Panel
          title={`Черновик версии ${draft.version}`}
          description="На сайте его не видно, пока вы его не опубликуете."
        >
          <Tabs defaultValue="text">
            <TabsList className="w-full sm:w-80">
              <TabsTrigger value="text">Текст</TabsTrigger>
              <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
            </TabsList>
            {/* Mounted while hidden: the field keeps its errors and its focus target. */}
            <TabsContent value="text" keepMounted>
              <TextareaField
                control={form.control}
                name="body"
                label="Текст документа"
                description="Каждая строка — абзац. Заголовок раздела — строка, которая начинается с «## », подзаголовок — с «### », пункт списка — с «- ». Номера пунктов (1.1, 1.2) сайт показывает как набраны."
                spellCheck
                autoComplete="off"
                // On a phone the field grows with the text and the page scrolls;
                // a tall box scrolling inside itself would catch every swipe.
                inputClassName="min-h-80 font-reading md:max-h-[60dvh] md:overflow-y-auto"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="border border-perforation p-4 md:max-h-[70dvh] md:overflow-y-auto">
                <p className="mb-6 font-display text-section">{title}</p>
                {previewBody.trim() === "" ? (
                  <p className="text-toner-muted">
                    Текста пока нет — наберите его на&nbsp;вкладке «Текст».
                  </p>
                ) : (
                  <LegalText body={previewBody} />
                )}
              </div>
            </TabsContent>
          </Tabs>
          {/* Away from «Сохранить» and «Опубликовать»: not a tap by mistake. */}
          <div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setConfirming("delete")}
            >
              Удалить черновик
            </Button>
          </div>
        </Panel>

        <FormActions>
          <ActionFailureAlert failure={failure} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* One filled button at a time: the next step. */}
            <Button
              type="submit"
              variant={isDirty ? "default" : "outline"}
              loading={isSubmitting}
            >
              {isSubmitting ? "Сохраняем…" : "Сохранить черновик"}
            </Button>
            <Button
              type="button"
              disabled={isDirty || isSubmitting}
              onClick={() => setConfirming("publish")}
            >
              Опубликовать
            </Button>
          </div>
          {isDirty && !isSubmitting && (
            <p className="text-caption text-toner-muted">
              Есть несохранённые изменения. Публикуется сохранённый текст —
              сначала сохраните черновик.
            </p>
          )}
        </FormActions>
      </form>

      <Dialog
        open={confirming === "publish"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Опубликовать версию {draft.version}?</DialogTitle>
            <DialogDescription>
              Текст сразу появится на&nbsp;сайте, а&nbsp;новые согласия будут
              записываться с&nbsp;версией {draft.version}. Изменить
              опубликованную версию нельзя — только выпустить следующую.
            </DialogDescription>
          </DialogHeader>
          <ActionFailureAlert failure={publishing.failure} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Не сейчас
            </DialogClose>
            <Button
              type="button"
              loading={publishing.pending}
              onClick={() =>
                void publishing.run(
                  () => publishDraft({ id: draft.id, sha256: savedSha256 }),
                  ({ version }) => {
                    toast.success(`Версия ${version} опубликована`);
                    closeDialog();
                    // The draft is a published version now: show the page anew.
                    router.refresh();
                  },
                )
              }
            >
              {publishing.pending
                ? "Публикуем…"
                : `Опубликовать версию ${draft.version}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить черновик версии {draft.version}?</DialogTitle>
            <DialogDescription>
              Набранный текст пропадёт, восстановить его будет нельзя.
              Опубликованные версии останутся как есть.
            </DialogDescription>
          </DialogHeader>
          <ActionFailureAlert failure={deleting.failure} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Оставить
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              loading={deleting.pending}
              onClick={() =>
                void deleting.run(
                  () => deleteDraft({ id: draft.id }),
                  () => {
                    toast.success("Черновик удалён");
                    closeDialog();
                    router.refresh();
                  },
                )
              }
            >
              {deleting.pending ? "Удаляем…" : "Удалить черновик"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
