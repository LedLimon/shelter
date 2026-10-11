import { describe, expect, it } from "vitest";
import type { MediaState } from "./types";
import {
  isSettled,
  mediaItemsSchema,
  mergeStates,
  moveTo,
  setCover,
  targetIndex,
  toMediaItems,
  withCover,
  type MediaItem,
} from "./items";

const state = (id: string, changes: Partial<MediaState> = {}): MediaState => ({
  id,
  kind: "PHOTO",
  status: "READY",
  width: 1200,
  height: 900,
  blur: "data:image/webp;base64,AAAA",
  redacted: false,
  failure: null,
  ...changes,
});

const items = (...ids: string[]): MediaItem[] =>
  toMediaItems(ids.map((id) => state(id)));

const order = (list: readonly MediaItem[]) => list.map(({ id }) => id).join("");
const coverOf = (list: readonly MediaItem[]) =>
  list.filter(({ isCover }) => isCover).map(({ id }) => id);

describe("cover", () => {
  it("is the stored one", () => {
    expect(coverOf(toMediaItems([state("a"), state("b")], "b"))).toEqual(["b"]);
  });

  it("falls to the first file when none is marked", () => {
    expect(coverOf(withCover(items("a", "b", "c")))).toEqual(["a"]);
    expect(withCover([])).toEqual([]);
  });

  it("stays where it is when files are added before it", () => {
    const list = setCover(items("a", "b", "c"), "c");

    expect(coverOf(withCover(moveTo(list, "c", 1)))).toEqual(["c"]);
  });

  it("moves to the first file when the cover is removed", () => {
    const list = setCover(items("a", "b", "c"), "b");

    expect(coverOf(withCover(list.filter(({ id }) => id !== "b")))).toEqual([
      "a",
    ]);
  });

  it("is one at a time", () => {
    const list = setCover(setCover(items("a", "b", "c"), "b"), "c");

    expect(coverOf(list)).toEqual(["c"]);
    // An unknown id leaves the mark alone.
    expect(coverOf(setCover(list, "zzz"))).toEqual(["c"]);
  });
});

describe("order", () => {
  const list = items("a", "b", "c", "d");

  it("moves a file one place, to the start, or to a place", () => {
    expect(order(moveTo(list, "c", targetIndex(list, "c", "earlier")))).toBe(
      "acbd",
    );
    expect(order(moveTo(list, "b", targetIndex(list, "b", "later")))).toBe(
      "acbd",
    );
    expect(order(moveTo(list, "d", targetIndex(list, "d", "first")))).toBe(
      "dabc",
    );
    expect(order(moveTo(list, "a", 3))).toBe("bcda");
  });

  it("stops at the edges", () => {
    expect(targetIndex(list, "a", "earlier")).toBe(0);
    expect(targetIndex(list, "d", "later")).toBe(3);
    expect(order(moveTo(list, "a", targetIndex(list, "a", "earlier")))).toBe(
      "abcd",
    );
  });

  it("ignores what it can't do", () => {
    expect(targetIndex(list, "zzz", "first")).toBe(-1);
    expect(order(moveTo(list, "zzz", 0))).toBe("abcd");
    expect(order(moveTo(list, "a", 9))).toBe("abcd");
    expect(order(moveTo(list, "a", -1))).toBe("abcd");
  });
});

describe("mergeStates", () => {
  const uploaded = {
    status: "UPLOADED",
    width: null,
    height: null,
    blur: null,
  } as const;

  it("takes the worker's results and keeps the form's marks", () => {
    const list: MediaItem[] = [
      { ...state("a", uploaded), isCover: true },
      {
        ...state("b", { ...uploaded, kind: "RECEIPT", redacted: true }),
        isCover: false,
      },
    ];

    const merged = mergeStates(
      list,
      ["a", "b"],
      [
        state("a"),
        // The stored mark differs from the one being edited in the form.
        state("b", {
          kind: "RECEIPT",
          redacted: false,
          status: "FAILED",
          failure: "not-an-image",
          width: null,
          height: null,
          blur: null,
        }),
      ],
    );

    expect(merged).toMatchObject([
      { id: "a", status: "READY", width: 1200, isCover: true },
      { id: "b", status: "FAILED", failure: "not-an-image", redacted: true },
    ]);
  });

  it("returns null when nothing changed", () => {
    const list = [{ ...state("a", uploaded), isCover: false }];

    expect(mergeStates(list, ["a"], [state("a", uploaded)])).toBeNull();
    expect(mergeStates(list, [], [])).toBeNull();
  });

  it("fails a file the server no longer has", () => {
    const list = [
      { ...state("a", uploaded), isCover: false },
      { ...state("b", uploaded), isCover: false },
    ];

    expect(mergeStates(list, ["a"], [])).toMatchObject([
      { id: "a", status: "FAILED", failure: "missing" },
      // Not asked about: left alone.
      { id: "b", status: "UPLOADED" },
    ]);
  });
});

describe("isSettled", () => {
  it("is false while a file waits for the worker", () => {
    expect(isSettled(items("a", "b"))).toBe(true);
    expect(isSettled([])).toBe(true);
    expect(
      isSettled(toMediaItems([state("a"), state("b", { status: "UPLOADED" })])),
    ).toBe(false);
    expect(isSettled(toMediaItems([state("a", { status: "FAILED" })]))).toBe(
      true,
    );
  });
});

describe("mediaItemsSchema", () => {
  const schema = mediaItemsSchema({ max: 2 });
  const messageOf = (value: unknown) =>
    schema.safeParse(value).error?.issues[0]?.message;

  it("takes processed files as they are", () => {
    const list = items("a", "b");

    expect(schema.parse(list)).toEqual(list);
    expect(schema.parse([])).toEqual([]);
  });

  it("holds the form while a file is being processed", () => {
    expect(messageOf(toMediaItems([state("a", { status: "UPLOADED" })]))).toBe(
      "Дождитесь, пока файлы обработаются, и сохраните ещё раз.",
    );
  });

  it("asks to take back a file that failed", () => {
    expect(
      messageOf(
        toMediaItems([state("a", { status: "FAILED", failure: "stuck" })]),
      ),
    ).toBe("Уберите файлы, которые не удалось обработать.");
  });

  it("limits the number of files", () => {
    expect(messageOf(items("a", "b", "c"))).toBe(
      "Не больше 2: уберите лишние файлы.",
    );
  });

  it("refuses what is not a list of files", () => {
    expect(schema.safeParse([{ id: "a" }]).success).toBe(false);
    expect(schema.safeParse("a").success).toBe(false);
  });
});
