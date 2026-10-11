"use client";

import {
  CircleAlert,
  Clock,
  EllipsisVertical,
  ImageIcon,
  ImagePlus,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { toast } from "sonner";
import type { MediaKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { MAX_UPLOAD_MB, VARIANT_WIDTHS } from "@/lib/media/constraints";
import { mediaFailureMessage } from "@/lib/media/messages";
import { mediaUrl } from "@/lib/media/url";
import { needsRedaction } from "@/lib/media/visibility";
import { formatCount, type PluralForms } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { MediaImage } from "./media-image";
import {
  inOrder,
  mergeStates,
  moveTo,
  setCover,
  targetIndex,
  withCover,
  type MediaItem,
  type Move,
} from "@/lib/media/items";
import { discardUpload, fetchMediaStates } from "./upload-client";
import {
  UploadQueue,
  type QueuedUpload,
  type RejectedFile,
} from "./upload-queue";

/*
 * The upload field of an admin form (docs/design.md#админка): pick or drop
 * photos, watch them go up and get processed, put them in order, choose the
 * cover, take one back. For documents the mark is «Личные данные закрашены»
 * instead of the cover.
 *
 * A form control like any other: `value` is the list of files in page order,
 * `onChange` gets the next list, and the form saves it. The files themselves
 * are uploaded right away (src/components/media/upload-queue.ts); nothing
 * else is written before the form's own save.
 */

export type MediaUploaderProps = {
  /** What the field collects: decides the wording and the per-file mark. */
  kind?: MediaKind;
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  /** Offer a cover: one file is marked while there are any. */
  cover?: boolean;
  /** How many files the field takes. */
  max?: number;
  disabled?: boolean;
  /** The form found an error in this field. */
  invalid?: boolean;
  /** Files are on their way or being processed: hold the form's save. */
  onBusyChange?: (busy: boolean) => void;
  /** Name of the form field, for the form's error handling. */
  name?: string;
  /** The button that opens the file dialog: where a form puts the focus. */
  ref?: Ref<HTMLButtonElement>;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

type Wording = {
  /** «Фото 2»: a file by its place. */
  one: string;
  /** The toast after a removal; the noun's gender differs. */
  removed: string;
  /** For counts: «3 фото», «2 чека». */
  forms: PluralForms;
  pick: string;
  drop: string;
  tap: string;
};

const WORDING: Record<MediaKind, Wording> = {
  PHOTO: {
    one: "Фото",
    removed: "Фото убрано",
    forms: ["фото", "фото", "фото"],
    pick: "Выбрать фото",
    drop: "Перетащите фото сюда или выберите на устройстве",
    tap: "Выберите фото в галерее или снимите новое",
  },
  RECEIPT: {
    one: "Чек",
    removed: "Чек убран",
    forms: ["чек", "чека", "чеков"],
    pick: "Выбрать фото чека",
    drop: "Перетащите фото чека сюда или выберите на устройстве",
    tap: "Выберите фото чека в галерее или снимите его",
  },
  INVOICE: {
    one: "Счёт",
    removed: "Счёт убран",
    forms: ["счёт", "счёта", "счетов"],
    pick: "Выбрать фото счёта",
    drop: "Перетащите фото счёта сюда или выберите на устройстве",
    tap: "Выберите фото счёта в галерее или снимите его",
  },
  DOCUMENT: {
    one: "Документ",
    removed: "Документ убран",
    forms: ["документ", "документа", "документов"],
    pick: "Выбрать фото документа",
    drop: "Перетащите фото документа сюда или выберите на устройстве",
    tap: "Выберите фото документа в галерее или снимите его",
  },
};

const DEFAULT_MAX = 20;
const NO_UPLOADS: readonly QueuedUpload[] = [];

const ACCEPT = "image/jpeg,image/png,image/webp";
// So a file dialog offers HEIC files too; the browser converts them itself.
const ACCEPT_HEIC = `${ACCEPT},image/heic,image/heif,.heic,.heif`;

/** How the page asks about files the worker has not finished. */
const POLL_MS = 1_500;
const SLOW_POLL_MS = 5_000;
/** Processing takes seconds; after this something is off with the worker. */
const SLOW_AFTER_MS = 30_000;

const LARGEST_WIDTH = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!;

/** How long a removed file can be brought back; then it is deleted. */
const UNDO_MS = 10_000;

/** A reorder drag carries this type, so dropping a tile into a text field pastes nothing. */
const TILE_DRAG_TYPE = "application/x-shelter-media";

/** How wide a tile is shown, for the browser's choice of image width. */
const TILE_SIZES = "(min-width: 48rem) 12rem, 45vw";

export function MediaUploader({
  kind = "PHOTO",
  value,
  onChange,
  cover = false,
  max = DEFAULT_MAX,
  disabled = false,
  invalid = false,
  onBusyChange,
  name,
  ref,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
}: MediaUploaderProps) {
  const words = WORDING[kind];
  const documents = needsRedaction(kind);

  // Uploads finish and the worker reports long after the render that started
  // them: they change the list as it is by then, not as it was.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const emit = (items: MediaItem[]) => {
    const next = cover ? withCover(items) : items;
    latest.current = next;
    onChange(next);
  };

  /** What was uploaded from this device, by media id: shown until processed. */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  /** Files uploaded here and not saved before: taking one back deletes it. */
  const ownUploads = useRef(new Set<string>());
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const announce = (text: string) => setAnnouncement(repeatable(text));

  // --- Focus: an action that removes the focused control says where the
  // focus goes next, or it would fall back to the top of the page.
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ target: FocusTarget; renders: number } | null>(
    null,
  );
  /** The same for «Убрать» in a tile's menu: the menu hands the focus on. */
  const focusAfterMenu = useRef<FocusTarget | null>(null);
  const moveFocusTo = (target: FocusTarget) => {
    focusNext.current = { target, renders: FOCUS_PATIENCE };
  };
  useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    const active = document.activeElement;
    // The control that had the focus is still there: its removal is a
    // render or two away. An intent nobody collects is dropped.
    if (active && active !== document.body && active.isConnected) {
      next.renders -= 1;
      if (next.renders <= 0) focusNext.current = null;
      return;
    }
    focusNext.current = null;
    focusTargetIn(root.current, next.target)?.focus();
  });

  const current = useRef({ emit, words });
  useEffect(() => {
    current.current = { emit, words };
  });
  const [queue] = useState(() => new UploadQueue());
  useEffect(
    () =>
      queue.onUploaded((media, previewUrl, key) => {
        ownUploads.current.add(media.id);
        if (previewUrl) {
          setPreviews((urls) => ({ ...urls, [media.id]: previewUrl }));
        }
        // The upload's tile gives way to the file's: «Отменить» is gone.
        const tile = root.current?.querySelector(`[data-upload-key="${key}"]`);
        if (tile?.contains(document.activeElement)) {
          focusNext.current = {
            target: { tile: media.id },
            renders: FOCUS_PATIENCE,
          };
        }
        const { emit: add, words: wording } = current.current;
        add([...latest.current, { ...media, isCover: false }]);
        setAnnouncement(
          repeatable(
            `Загружено: ${wording.one.toLowerCase()} ${latest.current.length}. Идёт обработка.`,
          ),
        );
      }),
    [queue],
  );
  const uploads = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    () => NO_UPLOADS,
  );

  const shown = useRef(previews);
  useEffect(() => {
    shown.current = previews;
  });
  const releasePreview = (id: string) => {
    const url = shown.current[id];
    if (!url) return;
    URL.revokeObjectURL(url);
    setPreviews((urls) => {
      const rest = { ...urls };
      delete rest[id];
      return rest;
    });
  };

  // --- Removal can be undone for a while: the file is deleted only after.
  const removals = useRef(new Map<string, Removal>());
  /** Places held for removed files that may still come back. */
  const [held, setHeld] = useState(0);

  useEffect(
    () => () => {
      queue.dispose();
      for (const url of Object.values(shown.current)) URL.revokeObjectURL(url);
      // Nobody is left to bring the removed files back.
      for (const [id, { timer }] of removals.current) {
        window.clearTimeout(timer);
        if (ownUploads.current.delete(id)) discardUpload(id);
      }
      removals.current.clear();
    },
    [queue],
  );

  // --- The worker: ask about unfinished files until it is done with them.
  const pendingKey = value
    .filter(({ status }) => status === "UPLOADED")
    .map(({ id }) => id)
    .join(",");
  const [slowKey, setSlowKey] = useState("");
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(",");
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const ask = async () => {
      try {
        const states = await fetchMediaStates(ids, controller.signal);
        const merged = mergeStates(latest.current, ids, states);
        if (merged) {
          current.current.emit(merged);
          const done = (status: MediaItem["status"]) =>
            merged.filter(
              (item) => ids.includes(item.id) && item.status === status,
            ).length;
          const ready = done("READY");
          const failed = done("FAILED");
          if (ready + failed > 0) {
            setAnnouncement(
              repeatable(
                [
                  ready > 0 && `Обработано: ${formatCount(ready, FILE_FORMS)}.`,
                  failed > 0 &&
                    `Не обработано: ${formatCount(failed, FILE_FORMS)}.`,
                ]
                  .filter(Boolean)
                  .join(" "),
              ),
            );
          }
        }
      } catch {
        // Offline, or the session ended: the next round asks again.
      }
      if (controller.signal.aborted) return;
      const slow = Date.now() - startedAt > SLOW_AFTER_MS;
      if (slow) setSlowKey(pendingKey);
      timer = setTimeout(() => void ask(), slow ? SLOW_POLL_MS : POLL_MS);
    };
    timer = setTimeout(() => void ask(), POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pendingKey]);

  const sending = uploads.some(({ phase }) => phase !== "failed");
  const busy = sending || !!pendingKey;
  const reportBusy = useRef(onBusyChange);
  useEffect(() => {
    reportBusy.current = onBusyChange;
  });
  useEffect(() => {
    reportBusy.current?.(busy);
    // A field that left the page holds the form no longer.
    return () => reportBusy.current?.(false);
  }, [busy]);

  // A file still on its way is lost with the page: closing the tab asks first.
  useEffect(() => {
    if (!sending) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [sending]);

  // --- Picking and dropping files.
  const input = useRef<HTMLInputElement>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const accept = useSyncExternalStore(
    subscribeToNothing,
    () => (isIos() ? ACCEPT : ACCEPT_HEIC),
    () => ACCEPT_HEIC,
  );
  const room = max - value.length - uploads.length - held;

  async function addFiles(files: File[]) {
    if (disabled || files.length === 0) return;
    // «Выбрать фото» of the empty field gives way to the grid's «Добавить»:
    // the focus follows, if it was there.
    if (
      value.length + uploads.length === 0 &&
      root.current?.contains(document.activeElement)
    ) {
      moveFocusTo("add");
    }
    const taken = files.slice(0, Math.max(room, 0));
    const refused = await queue.add(kind, taken);
    const overflow = files.slice(taken.length).map((file) => ({
      name: file.name,
      reason: `В это поле помещается не больше ${formatCount(max, FILE_FORMS_GENITIVE)}.`,
    }));
    // The list is an alert: it announces itself.
    setRejected([...refused, ...overflow]);
  }

  // A file dropped next to the field would open in the tab, in place of the
  // form with everything typed into it.
  useEffect(() => {
    const keepPage = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", keepPage);
    window.addEventListener("drop", keepPage);
    return () => {
      window.removeEventListener("dragover", keepPage);
      window.removeEventListener("drop", keepPage);
    };
  }, []);

  const fileDrop = {
    onDragEnter(event: DragEvent) {
      if (!hasFiles(event) || disabled) return;
      event.preventDefault();
      setFileDrag(true);
    },
    onDragOver(event: DragEvent) {
      if (!hasFiles(event) || disabled) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setFileDrag(false);
      }
    },
    onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setFileDrag(false);
      void addFiles([...event.dataTransfer.files]);
    },
  };

  // --- Order, cover, removal.
  const finePointer = useSyncExternalStore(
    subscribeToNothing,
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  /** The order (of ids) to go back to if the drag is cancelled. */
  const dragStart = useRef<string[] | null>(null);

  function move(id: string, to: Move) {
    const target = targetIndex(value, id, to);
    emit(moveTo(value, id, target));
    announce(`${words.one} теперь на месте ${target + 1} из ${value.length}.`);
  }

  /** The tile that takes the place of a removed file's, or «Добавить». */
  const afterFile = (item: MediaItem): FocusTarget => {
    const index = value.indexOf(item);
    const neighbour = value[index + 1] ?? value[index - 1];
    if (neighbour) return { tile: neighbour.id };
    return uploads[0] ? { upload: uploads[0].key } : "add";
  };
  const afterUpload = (key: string): FocusTarget => {
    const index = uploads.findIndex((upload) => upload.key === key);
    const neighbour = uploads[index + 1] ?? uploads[index - 1];
    if (neighbour) return { upload: neighbour.key };
    const last = value[value.length - 1];
    return last ? { tile: last.id } : "add";
  };

  /** Deletes for good what remove() took off the list. */
  function forget(id: string) {
    if (!removals.current.delete(id)) return;
    setHeld((count) => count - 1);
    if (ownUploads.current.delete(id)) discardUpload(id);
    releasePreview(id);
  }

  function remove(item: MediaItem) {
    const index = value.indexOf(item);
    emit(value.filter(({ id }) => id !== item.id));
    announce(
      `${words.removed}. Осталось: ${formatCount(value.length - 1, words.forms)}.`,
    );
    setHeld((count) => count + 1);
    removals.current.set(item.id, {
      item,
      index,
      timer: window.setTimeout(() => forget(item.id), UNDO_MS),
    });
    // A file that failed is of no use to anyone: nothing to bring back.
    if (item.status === "FAILED") return forget(item.id);
    toast(words.removed, {
      duration: UNDO_MS,
      action: { label: "Вернуть", onClick: () => restore(item.id) },
    });
  }

  function restore(id: string) {
    const removal = removals.current.get(id);
    if (!removal) return;
    window.clearTimeout(removal.timer);
    removals.current.delete(id);
    setHeld((count) => count - 1);
    const next = [...latest.current];
    next.splice(Math.min(removal.index, next.length), 0, removal.item);
    // The toast gives the focus back to where it was before «Вернуть».
    emit(next);
  }

  // Dragging a tile with the mouse: the others make room as it passes over
  // them, and letting go anywhere in the list keeps the new order.
  const reorder = (item: MediaItem) => ({
    draggable: finePointer && !disabled && value.length > 1,
    onDragStart(event: DragEvent) {
      dragStart.current = value.map(({ id }) => id);
      setDraggedId(item.id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(TILE_DRAG_TYPE, item.id);
    },
    onDragEnter() {
      if (!draggedId || draggedId === item.id) return;
      const to = latest.current.findIndex(({ id }) => id === item.id);
      emit(moveTo(latest.current, draggedId, to));
    },
    onDragEnd() {
      // Dropped outside the list or cancelled with Esc: the order as it
      // was. Only the order: a file that finished uploading meanwhile stays.
      if (dragStart.current) emit(inOrder(latest.current, dragStart.current));
      dragStart.current = null;
      setDraggedId(null);
    },
  });
  const reorderTarget = {
    onDragOver(event: DragEvent) {
      if (!draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop(event: DragEvent) {
      if (!draggedId) return;
      event.preventDefault();
      dragStart.current = null;
    },
  };

  const pickButton = {
    type: "button" as const,
    "data-add-files": "",
    // With the field full there is no such button: the form then focuses
    // the first file instead (below).
    ref: room > 0 || value.length === 0 ? ref : undefined,
    disabled,
    onClick: () => input.current?.click(),
  };
  const empty = value.length === 0 && uploads.length === 0;
  const coverId = value.find(({ isCover }) => isCover)?.id ?? null;

  const tiles = (
    <ul
      className="grid grid-cols-1 items-start gap-3 min-[22.5rem]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
      {...reorderTarget}
    >
      {value.map((item, index) => (
        <li
          key={item.id}
          data-media-id={item.id}
          aria-label={`${words.one} ${index + 1}${item.isCover ? ", обложка" : ""}`}
          className={cn(
            "grid min-w-0 content-start gap-2",
            draggedId === item.id && "opacity-40",
          )}
          {...reorder(item)}
        >
          <div
            className={cn(
              "relative",
              finePointer && !disabled && value.length > 1 && "cursor-grab",
            )}
          >
            <Frame documents={documents}>
              <Picture
                item={item}
                previewUrl={previews[item.id]}
                contain={documents}
                onProcessedShown={() => releasePreview(item.id)}
              />
              {item.status === "UPLOADED" && (
                <Plate>
                  <Spinner aria-hidden />
                  Обрабатываем…
                </Plate>
              )}
              {item.status === "FAILED" && (
                <Plate tone="danger">
                  <CircleAlert aria-hidden />
                  Не обработано
                </Plate>
              )}
            </Frame>
            {item.status !== "FAILED" && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      // Where a form puts the focus when the field is full
                      // and has no «Добавить».
                      ref={room <= 0 && index === 0 ? ref : undefined}
                      variant="outline"
                      // A paper corner of the picture, 32 px; the tap area
                      // around it is 44 px.
                      className="absolute top-0 right-0 size-8 min-h-0 border p-0 after:absolute after:-inset-[7px]"
                      disabled={disabled}
                      aria-label={`${words.one} ${index + 1}: действия`}
                    />
                  }
                >
                  <EllipsisVertical aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  // On a phone held sideways the menu scrolls: the shade
                  // says there is more below.
                  className="w-auto min-w-56 scroll-shade-y"
                  finalFocus={() => {
                    const target = focusAfterMenu.current;
                    focusAfterMenu.current = null;
                    // Back to the button that opened it, unless the file
                    // (and the button) is gone.
                    return target ? focusTargetIn(root.current, target) : true;
                  }}
                >
                  {item.status === "READY" && (
                    <>
                      <DropdownMenuLinkItem
                        href={mediaUrl(item.id, LARGEST_WIDTH)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть в новой вкладке
                      </DropdownMenuLinkItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    disabled={index === 0}
                    onClick={() => move(item.id, "first")}
                  >
                    В начало
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === 0}
                    onClick={() => move(item.id, "earlier")}
                  >
                    На одно место раньше
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === value.length - 1}
                    onClick={() => move(item.id, "later")}
                  >
                    На одно место позже
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      focusAfterMenu.current = afterFile(item);
                      remove(item);
                    }}
                  >
                    Убрать
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {item.status === "FAILED" ? (
            <Failure
              message={mediaFailureMessage(item.failure)}
              disabled={disabled}
              onRemove={() => {
                moveFocusTo(afterFile(item));
                remove(item);
              }}
            />
          ) : cover ? (
            <label className="flex min-h-11 items-center gap-2 text-caption sm:min-h-9">
              <RadioGroupItem value={item.id} disabled={disabled} />
              Обложка
              <span className="sr-only">
                : {words.one.toLowerCase()} {index + 1}
              </span>
            </label>
          ) : (
            documents && (
              <label className="flex min-h-11 items-start gap-2 py-1 text-caption sm:min-h-9">
                <Checkbox
                  className="mt-0.5"
                  checked={item.redacted}
                  disabled={disabled}
                  onCheckedChange={(redacted) =>
                    emit(
                      value.map((other) =>
                        other.id === item.id ? { ...other, redacted } : other,
                      ),
                    )
                  }
                />
                <span>
                  Личные данные закрашены
                  <span className="sr-only">
                    : {words.one.toLowerCase()} {index + 1}
                  </span>
                </span>
              </label>
            )
          )}
        </li>
      ))}

      {uploads.map((upload) => (
        <li
          key={upload.key}
          data-upload-key={upload.key}
          aria-label={`${upload.name}: ${PHASE_LABELS[upload.phase]}`}
          className="grid min-w-0 content-start gap-2"
        >
          <Frame documents={documents}>
            {upload.previewUrl ? (
              <Image
                src={upload.previewUrl}
                alt=""
                fill
                unoptimized
                draggable={false}
                className={documents ? "object-contain" : "object-cover"}
              />
            ) : (
              <NoPicture />
            )}
            {upload.phase === "uploading" && (
              <span
                role="progressbar"
                aria-label={`Загрузка: ${upload.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(upload.progress * 100)}
                className="absolute inset-x-0 bottom-0 h-2 border-t border-foreground bg-background"
              >
                <span
                  className="block h-full origin-left bg-pen transition-transform duration-150 ease-out forced-colors:bg-[Highlight]"
                  style={{ transform: `scaleX(${upload.progress})` }}
                />
              </span>
            )}
            <Plate
              tone={upload.phase === "failed" ? "danger" : undefined}
              raised={upload.phase === "uploading"}
            >
              {upload.phase === "queued" && <Clock aria-hidden />}
              {(upload.phase === "preparing" ||
                upload.phase === "finishing") && <Spinner aria-hidden />}
              {upload.phase === "failed" && <CircleAlert aria-hidden />}
              {upload.phase === "uploading" ? (
                <span className="font-mono text-mono tabular-nums">
                  {Math.round(upload.progress * 100)}&nbsp;%
                </span>
              ) : (
                PHASE_LABELS[upload.phase]
              )}
            </Plate>
          </Frame>

          {upload.phase === "failed" ? (
            <Failure
              message={upload.error}
              disabled={disabled}
              onRetry={
                upload.retryable
                  ? () => {
                      // «Повторить» gives way to «Отменить» of the same tile.
                      moveFocusTo({ upload: upload.key });
                      queue.retry(upload.key);
                    }
                  : undefined
              }
              onRemove={() => {
                moveFocusTo(afterUpload(upload.key));
                queue.remove(upload.key);
              }}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 min-h-11 justify-self-start sm:min-h-9"
              onClick={() => {
                moveFocusTo(afterUpload(upload.key));
                queue.remove(upload.key);
              }}
            >
              <X aria-hidden />
              Отменить
              <span className="sr-only">: {upload.name}</span>
            </Button>
          )}
        </li>
      ))}

      {room > 0 && (
        <li className="min-w-0">
          <button
            {...pickButton}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 border border-input bg-background p-2 text-center text-caption transition-colors duration-150 ease-out",
              documents ? "aspect-[3/4]" : "aspect-[4/3]",
              "hover:border-foreground hover:bg-accent disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-input",
              fileDrag && "border-foreground bg-accent",
            )}
          >
            <Plus aria-hidden className="size-5" />
            {fileDrag ? "Отпустите здесь" : "Добавить"}
          </button>
        </li>
      )}
    </ul>
  );

  return (
    <div
      ref={root}
      role="group"
      data-slot="media-uploader"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="grid min-w-0 gap-3"
      {...fileDrop}
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple
        name={name}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          // The same file may be picked again after it was taken back.
          event.target.value = "";
        }}
      />

      {empty ? (
        <div
          className={cn(
            "grid justify-items-center gap-3 border border-input bg-background px-4 py-6 text-center transition-colors duration-150 ease-out",
            invalid && "border-2 border-destructive",
            disabled && "bg-muted text-muted-foreground",
            fileDrag && "border-foreground bg-accent",
          )}
        >
          <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
          {fileDrag ? (
            <p>Отпустите, чтобы загрузить</p>
          ) : (
            <>
              <p className="pointer-coarse:hidden">{words.drop}</p>
              <p className="pointer-fine:hidden">{words.tap}</p>
            </>
          )}
          <Button {...pickButton} variant="outline">
            {words.pick}
          </Button>
        </div>
      ) : cover ? (
        <RadioGroup
          aria-label="Обложка"
          className="block"
          value={coverId}
          onValueChange={(id) => emit(setCover(value, String(id)))}
        >
          {tiles}
        </RadioGroup>
      ) : (
        tiles
      )}

      <p className="text-caption text-muted-foreground">
        JPEG, PNG, WebP или HEIC, до {MAX_UPLOAD_MB}&nbsp;МБ. Геометку
        и&nbsp;данные камеры уберём сами.
        {!empty && (
          <>
            {" "}
            Добавлено: {value.length + uploads.length} из&nbsp;{max}.
          </>
        )}
        {value.length > 1 && (
          <>
            {" "}
            Порядок меняют в&nbsp;меню на&nbsp;снимке
            <span className="pointer-coarse:hidden"> или перетаскиванием</span>.
          </>
        )}
      </p>

      {rejected.length > 0 && (
        <div
          role="alert"
          className="grid gap-2 border-line border-destructive p-3 text-caption"
        >
          <p className="flex items-start gap-2 text-destructive">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Не добавлено: {formatCount(rejected.length, FILE_FORMS)}
          </p>
          <ul className="grid gap-1.5">
            {rejected.map(({ name: fileName, reason }, index) => (
              <li key={`${fileName}-${index}`} className="wrap-anywhere">
                <span className="font-bold">{fileName}</span>
                {" — "}
                {reason}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 justify-self-start sm:min-h-9"
            onClick={() => {
              moveFocusTo("add");
              setRejected([]);
            }}
          >
            Понятно
          </Button>
        </div>
      )}

      {!!pendingKey && slowKey === pendingKey && (
        <p role="status" className="flex items-start gap-2 text-caption">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          Обработка идёт дольше обычного. Можно подождать или убрать файл и
          добавить его позже: с ним форму не сохранить.
        </p>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

const FILE_FORMS: PluralForms = ["файл", "файла", "файлов"];
/** After «не больше»: «1 файла», «3 файлов», «21 файла». */
const FILE_FORMS_GENITIVE: PluralForms = ["файла", "файлов", "файлов"];

/** Renders to wait for a focused control to go before giving its focus on. */
const FOCUS_PATIENCE = 10;

/** A removed file that can still be brought back. */
type Removal = {
  item: MediaItem;
  /** Where it was on the list. */
  index: number;
  /** Deletes it for good when the time is out. */
  timer: number;
};

/** Where the focus goes when the control that had it is removed. */
type FocusTarget = { tile: string } | { upload: string } | "add";

/**
 * The control to focus for a target: the first button of a file's or an
 * upload's tile, else «Добавить», else whatever button the field has left.
 */
function focusTargetIn(
  root: HTMLElement | null,
  target: FocusTarget,
): HTMLElement | null {
  if (!root) return null;
  const tile =
    target === "add"
      ? null
      : root.querySelector<HTMLElement>(
          "tile" in target
            ? `[data-media-id="${target.tile}"] button`
            : `[data-upload-key="${target.upload}"] button`,
        );
  return (
    tile ??
    root.querySelector<HTMLElement>("button[data-add-files]") ??
    root.querySelector<HTMLElement>("button")
  );
}

/**
 * A text for the live region that is announced even when it repeats the
 * previous one (two moves «на место 1 из 4» in a row): an invisible
 * character makes it a change.
 */
const repeatable = (text: string) => (previous: string) =>
  previous === text ? `${text}\u200B` : text;

const PHASE_LABELS: Record<QueuedUpload["phase"], string> = {
  queued: "В очереди",
  preparing: "Готовим файл…",
  uploading: "Загружается",
  finishing: "Сохраняем…",
  failed: "Не загружено",
};

/** The printed photo: a toner frame around whatever the tile shows. */
function Frame({
  documents,
  children,
}: {
  documents: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-foreground bg-muted",
        // A receipt is tall; a dog photo is shown the way NeedCard crops it.
        documents ? "aspect-[3/4]" : "aspect-[4/3]",
      )}
    >
      {children}
    </div>
  );
}

/** A paper label on the corner of the picture: what is happening to the file. */
function Plate({
  tone,
  raised = false,
  children,
}: {
  tone?: "danger";
  /** Above the progress bar. */
  raised?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute left-0 flex max-w-full items-center gap-1.5 border-t border-r border-foreground bg-background px-2 py-1 text-caption [&>svg]:size-4 [&>svg]:shrink-0",
        raised ? "bottom-2" : "bottom-0",
        tone === "danger" && "border-destructive text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function Picture({
  item,
  previewUrl,
  contain,
  onProcessedShown,
}: {
  item: MediaItem;
  previewUrl: string | undefined;
  contain: boolean;
  /** The processed version has loaded: the local preview is not needed. */
  onProcessedShown: () => void;
}) {
  const fit = contain ? "object-contain" : "object-cover";
  const preview = previewUrl && (
    <Image
      src={previewUrl}
      alt=""
      fill
      unoptimized
      draggable={false}
      className={fit}
    />
  );
  if (item.status === "READY") {
    // What the site will show: the processed version, already without EXIF.
    // Over the local preview while it loads, so the picture doesn't blink
    // to the blurred placeholder and back.
    return (
      <>
        {preview}
        <MediaImage
          media={preview ? { ...item, blur: null } : item}
          alt=""
          sizes={TILE_SIZES}
          draggable={false}
          className={cn("relative size-full", fit)}
          onLoad={preview ? onProcessedShown : undefined}
        />
      </>
    );
  }
  return preview || <NoPicture />;
}

/** Nothing to show yet: a HEIC before conversion, a file from another visit. */
function NoPicture() {
  return (
    <span className="absolute inset-0 grid place-items-center text-muted-foreground">
      <ImageIcon aria-hidden className="size-6" />
    </span>
  );
}

/** Why a file didn't make it and what can be done about it. */
function Failure({
  message,
  disabled,
  onRetry,
  onRemove,
}: {
  message: string | null;
  disabled: boolean;
  onRetry?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid justify-items-start gap-1">
      <p role="alert" className="text-caption text-destructive">
        {message}
      </p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 min-h-11 sm:min-h-9"
          disabled={disabled}
          onClick={onRetry}
        >
          <RotateCw aria-hidden />
          Повторить
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        // The icon lines up with the picture's edge.
        className="-ml-3 min-h-11 sm:min-h-9"
        disabled={disabled}
        onClick={onRemove}
      >
        <X aria-hidden />
        Убрать
      </Button>
    </div>
  );
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

const subscribeToNothing = () => () => undefined;

/**
 * iPhone and iPad hand a web page a JPEG copy of a HEIC photo unless the
 * page asks for HEIC itself — and the system converts faster than we do. An
 * iPad says it is a Mac, but a Mac has no touch screen.
 */
function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}
