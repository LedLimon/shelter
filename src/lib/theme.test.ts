import { describe, expect, it } from "vitest";

import {
  THEME_CHANGE_EVENT,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

type Listener = (event: { key?: string | null }) => void;

/** Runs THEME_SCRIPT against a minimal fake of the browser globals it uses. */
function runThemeScript({
  stored = null,
  systemDark = false,
  storageThrows = false,
}: {
  stored?: string | null;
  systemDark?: boolean;
  storageThrows?: boolean;
}) {
  const classes = new Set<string>();
  const headStyles = new Set<object>();
  // Whether transitions were off at every class change after the first paint.
  const transitionsOffAtSwitch: boolean[] = [];
  const windowListeners = new Map<string, Listener[]>();
  const mediaListeners: Listener[] = [];
  const state = { stored, systemDark };

  const media = {
    get matches() {
      return state.systemDark;
    },
    addEventListener: (_type: string, listener: Listener) => {
      mediaListeners.push(listener);
    },
  };
  const window = {
    matchMedia: () => media,
    getComputedStyle: () => ({ color: "" }),
    setTimeout: (callback: () => void) => callback(),
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError");
        return key === THEME_STORAGE_KEY ? state.stored : null;
      },
    },
    addEventListener: (type: string, listener: Listener) => {
      windowListeners.set(type, [
        ...(windowListeners.get(type) ?? []),
        listener,
      ]);
    },
  };
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) => {
          if (initialised) transitionsOffAtSwitch.push(headStyles.size > 0);
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
    },
    head: { appendChild: (style: object) => headStyles.add(style) },
    createElement: () => {
      const style = { textContent: "", remove: () => headStyles.delete(style) };
      return style;
    },
  };
  let initialised = false;

  // The script is our own constant; run it with the fakes as its globals.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("window", "document", THEME_SCRIPT) as (
    window: unknown,
    document: unknown,
  ) => void;
  run(window, document);
  initialised = true;

  return {
    isDark: () => classes.has("dark"),
    transitionsOffAtSwitch,
    leftoverStyles: () => headStyles.size,
    setStored: (value: string | null) => (state.stored = value),
    setSystemDark: (value: boolean) => {
      state.systemDark = value;
      mediaListeners.forEach((listener) => listener({}));
    },
    dispatch: (type: string, event: { key?: string | null } = {}) =>
      windowListeners.get(type)?.forEach((listener) => listener(event)),
  };
}

describe("THEME_SCRIPT", () => {
  it.each([
    { stored: null, systemDark: false, dark: false },
    { stored: null, systemDark: true, dark: true },
    { stored: "light", systemDark: true, dark: false },
    { stored: "dark", systemDark: false, dark: true },
    { stored: "garbage", systemDark: true, dark: true },
  ])(
    "stored $stored, system dark $systemDark → dark $dark",
    ({ stored, systemDark, dark }) => {
      expect(runThemeScript({ stored, systemDark }).isDark()).toBe(dark);
    },
  );

  it("falls back to the system theme when storage is blocked", () => {
    expect(
      runThemeScript({ systemDark: true, storageThrows: true }).isDark(),
    ).toBe(true);
  });

  it("follows the system setting while the choice is «system»", () => {
    const page = runThemeScript({ systemDark: false });
    page.setSystemDark(true);
    expect(page.isDark()).toBe(true);
  });

  it("ignores the system setting after an explicit choice", () => {
    const page = runThemeScript({ stored: "light", systemDark: false });
    page.setSystemDark(true);
    expect(page.isDark()).toBe(false);
  });

  it("re-applies on the change event and on storage changes from other tabs", () => {
    const page = runThemeScript({});
    page.setStored("dark");
    page.dispatch(THEME_CHANGE_EVENT);
    expect(page.isDark()).toBe(true);

    page.setStored("light");
    page.dispatch("storage", { key: "unrelated" });
    expect(page.isDark()).toBe(true);
    page.dispatch("storage", { key: THEME_STORAGE_KEY });
    expect(page.isDark()).toBe(false);
  });

  it("re-applies when another tab clears the whole storage", () => {
    const page = runThemeScript({ stored: "light", systemDark: true });
    expect(page.isDark()).toBe(false);
    page.setStored(null);
    page.dispatch("storage", { key: null });
    expect(page.isDark()).toBe(true);
  });

  it("switches without CSS transitions and cleans up after itself", () => {
    const page = runThemeScript({});
    page.setSystemDark(true);
    page.dispatch(THEME_CHANGE_EVENT);
    expect(page.transitionsOffAtSwitch).toEqual([true, true]);
    expect(page.leftoverStyles()).toBe(0);
  });
});
