import type { UploadMimeType } from "./constraints";

// What a picked file really is, by its first bytes. The browser's File.type
// comes from the extension and is often empty for HEIC (Windows, Android).

/** Bytes needed to tell the formats apart. */
export const SNIFF_BYTES = 32;

export type SniffedType = UploadMimeType | "image/heic";

// `ftyp` brands of HEIF files with HEVC inside: what phones call HEIC.
const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
]);
// Generic HEIF brands: HEIC unless the file also says it is AVIF.
const HEIF_BRANDS = new Set(["mif1", "msf1"]);

/** The image format of a file's head, or null if it is none we take. */
export function sniffImageType(head: Uint8Array): SniffedType | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii(head, 4, 8) === "ftyp") {
    // The major brand, a version, then the compatible brands, 4 bytes each.
    const brands = [ascii(head, 8, 12)];
    for (let offset = 16; offset + 4 <= head.length; offset += 4) {
      brands.push(ascii(head, offset, offset + 4));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      return null;
    }
    if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "image/heic";
    if (HEIF_BRANDS.has(brands[0]!)) return "image/heic";
  }
  return null;
}

function startsWith(head: Uint8Array, bytes: number[]): boolean {
  return bytes.every((byte, index) => head[index] === byte);
}

function ascii(head: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...head.subarray(start, end));
}
