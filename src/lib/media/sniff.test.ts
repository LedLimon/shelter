import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SNIFF_BYTES, sniffImageType } from "./sniff";

const image = () =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: "#777" },
  });

const head = (bytes: Uint8Array) => bytes.subarray(0, SNIFF_BYTES);

/** The start of an ISO-BMFF file: a `ftyp` box with these brands. */
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const brands = [major, "\0\0\0\0", ...compatible].join("");
  const box = new Uint8Array(8 + brands.length);
  new DataView(box.buffer).setUint32(0, box.length);
  box.set(new TextEncoder().encode("ftyp"), 4);
  box.set(
    Uint8Array.from(brands, (char) => char.charCodeAt(0)),
    8,
  );
  return box;
}

describe("sniffImageType", () => {
  it("knows the formats sharp makes", async () => {
    expect(sniffImageType(head(await image().jpeg().toBuffer()))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(head(await image().png().toBuffer()))).toBe(
      "image/png",
    );
    expect(sniffImageType(head(await image().webp().toBuffer()))).toBe(
      "image/webp",
    );
  });

  it("knows HEIC by its brands, whatever the file is called", () => {
    // What an iPhone and macOS write.
    expect(sniffImageType(ftyp("heic", "mif1", "MiPr", "miaf", "heic"))).toBe(
      "image/heic",
    );
    expect(sniffImageType(ftyp("mif1", "heic", "hevc"))).toBe("image/heic");
    expect(sniffImageType(ftyp("heix", "mif1"))).toBe("image/heic");
    expect(sniffImageType(ftyp("mif1"))).toBe("image/heic");
  });

  it("doesn't take AVIF, video or anything else for a photo", async () => {
    expect(sniffImageType(head(await image().avif().toBuffer()))).toBeNull();
    expect(sniffImageType(ftyp("mif1", "avif", "miaf"))).toBeNull();
    expect(sniffImageType(ftyp("isom", "mp42"))).toBeNull();
    expect(sniffImageType(head(await image().gif().toBuffer()))).toBeNull();
    expect(sniffImageType(head(await image().tiff().toBuffer()))).toBeNull();
    expect(
      sniffImageType(new TextEncoder().encode("<svg xmlns='…'></svg>")),
    ).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
