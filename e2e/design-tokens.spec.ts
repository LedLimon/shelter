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

    // Render every character in each role's font stack, then ask Chromium
    // which font actually draws it: a system font means the glyph is missing.
    await page.evaluate(async () => {
      const probe = document.createElement("div");
      probe.id = "glyph-probe";
      const roles = [
        ["display", "var(--font-display)", "900"],
        ["body", "var(--font-body)", "400"],
        ["mono", "var(--font-mono)", "400"],
      ] as const;
      for (const [role, family, weight] of roles) {
        for (const character of "ёЁ«»—№₽") {
          const span = document.createElement("span");
          span.dataset.probe = `${role} ${character}`;
          span.style.fontFamily = family;
          span.style.fontWeight = weight;
          span.textContent = character;
          probe.append(span);
        }
      }
      document.body.append(probe);
      // Load only our web fonts: next/font's "… Fallback" faces are
      // local("Arial"), which Linux CI lacks, and a failed face rejects
      // fonts.load(). The CDP check below judges the result anyway.
      await Promise.allSettled(
        [...probe.children].map((span) => {
          const style = getComputedStyle(span);
          const webFonts = style.fontFamily
            .split(",")
            .map((family) => family.trim())
            .filter((family) => !/ Fallback"?$/.test(family))
            .join(", ");
          return document.fonts.load(
            `${style.fontWeight} 40px ${webFonts}`,
            span.textContent ?? "",
          );
        }),
      );
      await document.fonts.ready;
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: "#glyph-probe span",
    });
    const uncovered: string[] = [];
    for (const nodeId of nodeIds) {
      const { attributes } = await cdp.send("DOM.getAttributes", { nodeId });
      const label = attributes[attributes.indexOf("data-probe") + 1];
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
        nodeId,
      });
      for (const font of fonts.filter(({ isCustomFont }) => !isCustomFont)) {
        uncovered.push(`${label}: ${font.familyName}`);
      }
    }

    expect(uncovered).toEqual([]);
    expect(googleRequests).toEqual([]);
    await expect(page.locator("h1")).toHaveCSS(
      "font-family",
      /Sofia Sans Extra Condensed/,
    );
    await expect(page.locator("body")).toHaveCSS("font-family", /Literata/);
  });
});
