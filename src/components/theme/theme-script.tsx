import { THEME_SCRIPT } from "@/lib/theme";

/** Render in <head> of the root layout: sets the theme before the first paint. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
