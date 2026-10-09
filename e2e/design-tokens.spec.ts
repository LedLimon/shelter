import { expect, test, type Page } from "@playwright/test";

// Board colour of each theme (docs/design.md#палитра) as getComputedStyle reports it.
const BOARD = { light: "rgb(209, 213, 214)", dark: "rgb(18, 19, 21)" };

/** Records whether <html> already had the `dark` class when <body> appeared. */
async function watchThemeAtFirstPaint(page: Page, stored: string | null) {
  await page.addInitScript((value) => {
    if (value) window.localStorage.setItem("theme", value);
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      (window as unknown as { darkAtBody: boolean }).darkAtBody =
        document.documentElement.classList.contains("dark");
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, stored);
}

const darkAtBody = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { darkAtBody?: boolean }).darkAtBody,
  );

test.describe("theme", () => {
  test("a stored dark theme is applied before the body renders", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await watchThemeAtFirstPaint(page, "dark");

    await page.goto("/");

    expect(await darkAtBody(page)).toBe(true);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      BOARD.dark,
    );
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("without a stored choice the system theme wins", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await watchThemeAtFirstPaint(page, null);

    await page.goto("/");

    expect(await darkAtBody(page)).toBe(true);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      BOARD.light,
    );
  });

  test("a stored light theme overrides a dark system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await watchThemeAtFirstPaint(page, "light");

    await page.goto("/");

    expect(await darkAtBody(page)).toBe(false);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      BOARD.light,
    );
  });
});

test.describe("fonts", () => {
  test("are self-hosted and cover Russian typography", async ({ page }) => {
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
        googleRequests.push(request.url());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const uncovered = await page.evaluate(async () => {
      const characters = "ёЁ«»—№₽";
      const style = getComputedStyle(document.documentElement);
      const faces = [
        { variable: "--font-face-display", weight: 900 },
        { variable: "--font-face-body", weight: 400 },
        { variable: "--font-face-mono", weight: 400 },
      ];
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("No canvas");
      const problems: string[] = [];

      for (const { variable, weight } of faces) {
        // next/font puts its own fallback after the face: keep the face only.
        const family = style.getPropertyValue(variable).split(",")[0]?.trim();
        if (!family) {
          problems.push(`${variable} is not set`);
          continue;
        }
        await document.fonts.load(`${weight} 40px ${family}`, characters);
        // A glyph missing from the face would come from the generic
        // fallback, and serif and monospace fallbacks differ in width.
        for (const character of characters) {
          context.font = `${weight} 40px ${family}, serif`;
          const withSerif = context.measureText(character).width;
          context.font = `${weight} 40px ${family}, monospace`;
          if (context.measureText(character).width !== withSerif) {
            problems.push(`${family}: ${character}`);
          }
        }
      }
      return problems;
    });

    expect(uncovered).toEqual([]);
    expect(googleRequests).toEqual([]);
    await expect(page.locator("h1")).toHaveCSS(
      "font-family",
      /Sofia Sans Extra Condensed/,
    );
    await expect(page.locator("body")).toHaveCSS("font-family", /Literata/);
  });
});
