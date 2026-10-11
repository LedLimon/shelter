import { describe, expect, it } from "vitest";
import { stylesheet } from "@/server/email/theme";
import { forceTheme, parsePreviewQuery, previewHref } from "./preview-query";

describe("parsePreviewQuery", () => {
  it("starts with the first letter, its first example, light and a phone", () => {
    expect(parsePreviewQuery({})).toEqual({
      template: "donation.thanks",
      example: "need",
      theme: "light",
      width: "phone",
    });
  });

  it("takes what the address names", () => {
    expect(
      parsePreviewQuery({
        template: "donation.thanks",
        example: "split",
        theme: "dark",
        width: "desktop",
      }),
    ).toEqual({
      template: "donation.thanks",
      example: "split",
      theme: "dark",
      width: "desktop",
    });
  });

  it("replaces anything unknown with the default", () => {
    expect(
      parsePreviewQuery({
        template: "toString",
        example: ["constructor", "split"],
        theme: "sepia",
        width: "9000",
      }),
    ).toEqual(parsePreviewQuery({}));
  });
});

describe("previewHref", () => {
  const query = parsePreviewQuery({ example: "split", theme: "dark" });

  it("changes one choice and keeps the rest", () => {
    expect(previewHref(query, { width: "desktop" })).toBe(
      "/dev/email?template=donation.thanks&example=split&theme=dark&width=desktop",
    );
  });
});

describe("forceTheme", () => {
  const html = `<meta name="color-scheme" content="light dark"/><style>${stylesheet()}</style>`;

  it("applies the dark rules whatever the browser's scheme", () => {
    const dark = forceTheme(html, "dark");

    expect(dark).toContain("@media all{.bg-board{");
    expect(dark).toContain('content="dark"');
    expect(dark).not.toContain("prefers-color-scheme");
  });

  it("switches the dark rules off for the light theme", () => {
    const light = forceTheme(html, "light");

    expect(light).toContain("@media not all{.bg-board{");
    expect(light).toContain('content="light"');
    expect(light).not.toContain("prefers-color-scheme");
  });
});
