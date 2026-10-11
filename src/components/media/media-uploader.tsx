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
import type { MediaKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { MAX_UPLOAD_MB } from "@/lib/media/constraints";
import { MEDIA_FAILURE_MESSAGES } from "@/lib/media/messages";
import { needsRedaction } from "@/lib/media/visibility";
import { formatCount, type PluralForms } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { MediaImage } from "./media-image";
import {
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
  /** For counts: «3 фото», «2 чека». */
  forms: PluralForms;
  pick: string;
  drop: string;
  tap: string;
};

const WORDING: Record<MediaKind, Wording> = {
  PHOTO: {
    one: "Фото",
    forms: ["фото", "фото", "фото"],
    pick: "Выбрать фото",
    drop: "Перетащите фото сюда или выберите на устройстве",
    tap: "Выберите фото в галерее или снимите новое",
  },
  RECEIPT: {
    one: "Чек",
    forms: ["чек", "чека", "чеков"],
    pick: "Выбрать фото чека",
    drop: "Перетащите фото чека сюда или выберите на устройстве",
    tap: "Выберите фото чека в галерее или снимите его",
  },
  INVOICE: {
    one: "Счёт",
    forms: ["счёт", "счёта", "счетов"],
    pick: "Выбрать фото счёта",
    drop: "Перетащите фото счёта сюда или выберите на устройстве",
    tap: "Выберите фото счёта в галерее или снимите его",
  },
  DOCUMENT: {
    one: "Документ",
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

  const current = useRef({ emit, words });
  useEffect(() => {
    current.current = { emit, words };
  });
  const [queue] = useState(() => new UploadQueue());
  useEffect(
    () =>
      queue.onUploaded((media, previewUrl) => {
        ownUploads.current.add(media.id);
        if (previewUrl) {
          setPreviews((urls) => ({ ...urls, [media.id]: previewUrl }));
        }
        const { emit: add, words: wording } = current.current;
        add([...latest.current, { ...media, isCover: false }]);
        setAnnouncement(
          `${wording.one} ${latest.current.length} загружено и обрабатывается.`,
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
  useEffect(
    () => () => {
      queue.dispose();
      for (const url of Object.values(shown.current)) URL.revokeObjectURL(url);
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
        if (merged) current.current.emit(merged);
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

  const busy = uploads.some(({ phase }) => phase !== "failed") || !!pendingKey;
  const reportBusy = useRef(onBusyChange);
  useEffect(() => {
    reportBusy.current = onBusyChange;
  });
  useEffect(() => {
    reportBusy.current?.(busy);
  }, [busy]);

  // --- Picking and dropping files.
  const input = useRef<HTMLInputElement>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const accept = useSyncExternalStore(
    subscribeToNothing,
    () => (isIos() ? ACCEPT : ACCEPT_HEIC),
    () => ACCEPT_HEIC,
  );
  const room = max - value.length - uploads.length;

  async function addFiles(files: File[]) {
    if (disabled || files.length === 0) return;
    const taken = files.slice(0, Math.max(room, 0));
    const refused = await queue.add(kind, taken);
    const overflow = files.slice(taken.length).map((file) => ({
      name: file.name,
      reason: `В это поле помещается не больше ${formatCount(max, FILE_FORMS)}.`,
    }));
    setRejected([...refused, ...overflow]);
    if (refused.length + overflow.length > 0) {
      setAnnouncement(
        `Не добавлено: ${formatCount(refused.length + overflow.length, FILE_FORMS)}.`,
      );
    }
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
  /** The order to go back to if the drag is cancelled. */
  const dragStart = useRef<MediaItem[] | null>(null);

  function move(id: string, to: Move) {
    const target = targetIndex(value, id, to);
    emit(moveTo(value, id, target));
    setAnnouncement(
      `${words.one} теперь на месте ${target + 1} из ${value.length}.`,
    );
  }

  function remove(item: MediaItem) {
    emit(value.filter(({ id }) => id !== item.id));
    if (ownUploads.current.delete(item.id)) discardUpload(item.id);
    const url = previews[item.id];
    if (url) {
      URL.revokeObjectURL(url);
      setPreviews((urls) => {
        const rest = { ...urls };
        delete rest[item.id];
        return rest;
      });
    }
    setAnnouncement(
      `Убрано. Осталось: ${formatCount(value.length - 1, words.forms)}.`,
    );
  }

  const reorder = (item: MediaItem) => ({
    draggable: finePointer && !disabled && value.length > 1,
    onDragStart(event: DragEvent) {
      dragStart.current = value;
      setDraggedId(item.id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    },
    onDragEnter(event: DragEvent) {
      if (!draggedId || draggedId === item.id) return;
      event.preventDefault();
      // The tiles make room as the dragged one passes over them.
      emit(moveTo(latest.current, draggedId, latest.current.indexOf(item)));
    },
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
    onDragEnd() {
      // Dropped outside the list or cancelled with Esc: as it was.
      if (dragStart.current) emit(dragStart.current);
      dragStart.current = null;
      setDraggedId(null);
    },
  });

  const pickButton = {
    type: "button" as const,
    ref,
    disabled,
    onClick: () => input.current?.click(),
  };
  const empty = value.length === 0 && uploads.length === 0;
  const coverId = value.find(({ isCover }) => isCover)?.id ?? null;

  const tiles = (
    <ul className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-4">
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
          <Frame documents={documents}>
            <Picture
              item={item}
              previewUrl={previews[item.id]}
              contain={documents}
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

          {item.status === "FAILED" ? (
            <Failure
              message={MEDIA_FAILURE_MESSAGES[item.failure ?? "stuck"]}
              disabled={disabled}
              onRemove={() => remove(item)}
            />
          ) : (
            <div className="flex min-h-11 items-center justify-between gap-1 sm:min-h-9">
              {cover ? (
                <label className="flex min-w-0 items-center gap-2 py-1 text-caption">
                  <RadioGroupItem value={item.id} disabled={disabled} />
                  Обложка
                </label>
              ) : documents ? (
                <label className="flex min-w-0 items-start gap-2 py-1 text-caption">
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
                  Личные данные закрашены
                </label>
              ) : (
                <span className="font-mono text-mono text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 sm:size-9"
                      disabled={disabled}
                      aria-label={`${words.one} ${index + 1}: действия`}
                    />
                  }
                >
                  <EllipsisVertical aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-56">
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
                    onClick={() => remove(item)}
                  >
                    Убрать
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </li>
      ))}

      {uploads.map((upload) => (
        <li
          key={upload.key}
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
                  className="block h-full bg-pen transition-[width] duration-150 ease-out"
                  style={{ width: `${upload.progress * 100}%` }}
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
                upload.retryable ? () => queue.retry(upload.key) : undefined
              }
              onRemove={() => queue.remove(upload.key)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 justify-start px-0 sm:min-h-9"
              onClick={() => queue.remove(upload.key)}
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
                <span className="font-mono text-mono">{fileName}</span>
                {" — "}
                {reason}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setRejected([])}
          >
            Понятно
          </Button>
        </div>
      )}

      {!!pendingKey && slowKey === pendingKey && (
        <p role="status" className="flex items-start gap-2 text-caption">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          Обработка идёт дольше обычного. Файлы уже на сервере: можно подождать
          или вернуться к форме позже.
        </p>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

const FILE_FORMS: PluralForms = ["файл", "файла", "файлов"];

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
}: {
  item: MediaItem;
  previewUrl: string | undefined;
  contain: boolean;
}) {
  const fit = contain ? "object-contain" : "object-cover";
  if (item.status === "READY") {
    // What the site will show: the processed version, already without EXIF.
    return (
      <MediaImage
        media={item}
        alt=""
        sizes={TILE_SIZES}
        draggable={false}
        className={cn("size-full", fit)}
      />
    );
  }
  if (previewUrl) {
    return (
      <Image
        src={previewUrl}
        alt=""
        fill
        unoptimized
        draggable={false}
        className={fit}
      />
    );
  }
  return <NoPicture />;
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
    <div className="grid gap-2">
      <p role="alert" className="text-caption text-destructive">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
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
          disabled={disabled}
          onClick={onRemove}
        >
          <X aria-hidden />
          Убрать
        </Button>
      </div>
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
