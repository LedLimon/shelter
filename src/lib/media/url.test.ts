import { describe, expect, it } from "vitest";
import { VARIANT_WIDTHS, variantWidthFor } from "./constraints";
import mediaImageLoader from "./image-loader";
import { mediaIdOf, mediaSrc, mediaUrl } from "./url";

const ID = "tz4a98xxat96iws9zmbrgj3a";

describe("variantWidthFor", () => {
  it("takes the smallest processed width that covers the request", () => {
    expect(variantWidthFor(1)).toBe(320);
    expect(variantWidthFor(320)).toBe(320);
    expect(variantWidthFor(321)).toBe(640);
    expect(variantWidthFor(828)).toBe(1024);
    expect(variantWidthFor(1600)).toBe(1600);
  });

  it("falls back to the widest one", () => {
    expect(variantWidthFor(3840)).toBe(1600);
  });
});

describe("media URLs", () => {
  it("round-trips an id through src", () => {
    expect(mediaSrc(ID)).toBe(`/media/${ID}`);
    expect(mediaIdOf(mediaSrc(ID))).toBe(ID);
  });

  it("takes nothing else for a media src", () => {
    for (const src of [
      "/logo.png",
      `/media/${ID}/640`,
      `/media/../${ID}`,
      `https://example.com/media/${ID}`,
      `/media/${ID}?w=1`,
      "/media/",
    ]) {
      expect(mediaIdOf(src)).toBeNull();
    }
  });

  it("points at a processed width", () => {
    expect(mediaUrl(ID, 700)).toBe(`/media/${ID}/1024`);
  });
});

describe("mediaImageLoader", () => {
  it("asks only for widths the worker makes", () => {
    for (const width of [16, 320, 640, 750, 1080, 1600, 3840]) {
      const url = mediaImageLoader({ src: mediaSrc(ID), width });
      const served = Number(url.split("/").at(-1));
      expect(VARIANT_WIDTHS).toContain(served);
      expect(served >= width || served === 1600).toBe(true);
    }
  });

  it("leaves other images alone", () => {
    expect(mediaImageLoader({ src: "/icon.svg", width: 64 })).toBe("/icon.svg");
  });
});
