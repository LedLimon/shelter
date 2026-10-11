import { z } from "zod";
import { MediaKind, MediaStatus } from "@/generated/prisma/enums";
import { MEDIA_FAILURES, type MediaState } from "./types";

// The value of a MediaUploader: the files of a form field, in the order the
// page will show them. Plain data and pure functions, shared by the uploader,
// a form's schema and its server action.

/** One file of the field. */
export type MediaItem = MediaState & {
  /** The cover of the gallery; always false where a field has no cover. */
  isCover: boolean;
};

/** Stored media as the uploader's value; `coverId` marks the cover. */
export function toMediaItems(
  media: readonly MediaState[],
  coverId: string | null = null,
): MediaItem[] {
  return media.map((state) => ({ ...state, isCover: state.id === coverId }));
}

/**
 * The same files with exactly one cover while there are any: the one already
 * marked, else the first.
 */
export function withCover(items: readonly MediaItem[]): MediaItem[] {
  const cover = items.find(({ isCover }) => isCover) ?? items[0];
  return items.map((item) => ({ ...item, isCover: item === cover }));
}

export function setCover(items: readonly MediaItem[], id: string): MediaItem[] {
  if (!items.some((item) => item.id === id)) return [...items];
  return items.map((item) => ({ ...item, isCover: item.id === id }));
}

export type Move = "first" | "earlier" | "later";

/** Where the file would land; its own position if it can't move that way. */
export function targetIndex(
  items: readonly MediaItem[],
  id: string,
  move: Move,
): number {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return -1;
  if (move === "first") return 0;
  const target = move === "earlier" ? index - 1 : index + 1;
  return Math.min(Math.max(target, 0), items.length - 1);
}

/** The files with one of them moved to position `to`. */
export function moveTo(
  items: readonly MediaItem[],
  id: string,
  to: number,
): MediaItem[] {
  const from = items.findIndex((item) => item.id === id);
  const next = [...items];
  if (from === -1 || to < 0 || to >= items.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * The files with what the worker has done since: status, size, blur, the
 * failure. Marks set in the form (cover, redacted) stay as they are. A file
 * that was asked about and is not in the answer no longer exists. Returns
 * null if nothing changed.
 */
export function mergeStates(
  items: readonly MediaItem[],
  asked: readonly string[],
  states: readonly MediaState[],
): MediaItem[] | null {
  const byId = new Map(states.map((state) => [state.id, state]));
  let changed = false;
  const merged = items.map((item) => {
    if (!asked.includes(item.id)) return item;
    const state = byId.get(item.id);
    const next: MediaItem = state
      ? {
          ...item,
          status: state.status,
          width: state.width,
          height: state.height,
          blur: state.blur,
          failure: state.failure,
        }
      : { ...item, status: "FAILED", failure: "missing" };
    if (
      next.status === item.status &&
      next.width === item.width &&
      next.height === item.height &&
      next.blur === item.blur &&
      next.failure === item.failure
    ) {
      return item;
    }
    changed = true;
    return next;
  });
  return changed ? merged : null;
}

/** Whether the worker is done with every file: nothing is still UPLOADED. */
export function isSettled(items: readonly MediaItem[]): boolean {
  return items.every(({ status }) => status !== "UPLOADED");
}

const mediaItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(MediaKind),
  status: z.enum(MediaStatus),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  blur: z.string().nullable(),
  redacted: z.boolean(),
  failure: z.enum(MEDIA_FAILURES).nullable(),
  isCover: z.boolean(),
});

/**
 * The schema of an upload field, for the form and its server action alike:
 * at most `max` files, each one processed. The action takes ids, order and
 * the marks from it; whatever else the browser says about a file (status,
 * size) it reads from the database itself.
 */
export function mediaItemsSchema({ max }: { max: number }) {
  return z
    .array(mediaItemSchema)
    .max(max, `Не больше ${max}: уберите лишние файлы.`)
    .refine((items) => items.every(({ status }) => status !== "FAILED"), {
      error: "Уберите файлы, которые не удалось обработать.",
    })
    .refine(isSettled, {
      error: "Дождитесь, пока файлы обработаются, и сохраните ещё раз.",
    });
}
