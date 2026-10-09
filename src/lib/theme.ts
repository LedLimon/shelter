export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "theme";
/** Dispatched on window after the preference changes in this tab. */
export const THEME_CHANGE_EVENT = "theme-change";

/**
 * Inlined into <head> so the `dark` class is on <html> before the first paint.
 * No stored choice means "system". It also follows the OS setting, other tabs
 * and THEME_CHANGE_EVENT for the rest of the page's life.
 */
export const THEME_SCRIPT = `(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var preference = null;
    try {
      preference = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    } catch (error) {}
    root.classList.toggle("dark", preference === "dark" || (preference !== "light" && media.matches));
  }
  // Later switches skip CSS transitions, so components don't fade between themes.
  function switchTheme() {
    var style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
    apply();
    window.getComputedStyle(root).color;
    window.setTimeout(function () {
      style.remove();
    }, 1);
  }
  apply();
  media.addEventListener("change", switchTheme);
  window.addEventListener(${JSON.stringify(THEME_CHANGE_EVENT)}, switchTheme);
  window.addEventListener("storage", function (event) {
    if (event.key === ${JSON.stringify(THEME_STORAGE_KEY)}) switchTheme();
  });
})();`;

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage is unavailable (private mode, blocked cookies): keep the system theme.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeToThemePreference(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
