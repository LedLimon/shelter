import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { VARIANT_WIDTHS } from "@/lib/media/constraints";
import { processImage, UnprocessableImageError } from "./process";

type Rgb = { r: number; g: number; b: number };

const solid = (width: number, height: number, background: Rgb) =>
  sharp({ create: { width, height, channels: 3, background } });

/** What a phone writes into a photo: camera, time and where it was taken. */
const PHONE_EXIF = {
  IFD0: { Make: "ShelterPhone", Model: "Curator 15", Software: "17.5" },
  IFD2: { DateTimeOriginal: "2026:10:11 12:30:00" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "55/1 45/1 2100/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "37/1 37/1 300/100",
  },
};
const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Curator Name"/></rdf:RDF></x:xmpmeta>';

/** The colour in the middle of an encoded image. */
async function centreOf(image: Buffer, at?: { left: number; top: number }) {
  const { width, height } = await sharp(image).metadata();
  const { data } = await sharp(image)
    .extract({
      left: at?.left ?? Math.floor(width / 2),
      top: at?.top ?? Math.floor(height / 2),
      width: 1,
      height: 1,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

function expectColour(actual: Rgb, expected: Rgb, tolerance = 8) {
  for (const channel of ["r", "g", "b"] as const) {
    expect(
      Math.abs(actual[channel] - expected[channel]),
      `${channel}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

async function failureOf(
  input: Uint8Array,
  options?: { maxInputPixels: number },
) {
  const error: unknown = await processImage(input, options).catch(
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(UnprocessableImageError);
  return (error as UnprocessableImageError).failure;
}

describe("processImage", () => {
  it("makes every width in WebP and AVIF", async () => {
    const original = await solid(2000, 1500, { r: 120, g: 90, b: 60 })
      .jpeg()
      .toBuffer();

    const processed = await processImage(original);

    expect(processed).toMatchObject({ width: 2000, height: 1500 });
    expect(
      processed.variants.map(({ width, format }) => `${width}.${format}`),
    ).toEqual(
      VARIANT_WIDTHS.flatMap((width) => [`${width}.webp`, `${width}.avif`]),
    );
    for (const { width, format, data } of processed.variants) {
      const metadata = await sharp(data).metadata();
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(width * 0.75);
      if (format === "webp") expect(metadata.format).toBe("webp");
      else
        expect(metadata).toMatchObject({ format: "heif", compression: "av1" });
    }
  });

  it("doesn't enlarge an original narrower than a width", async () => {
    const original = await solid(800, 600, { r: 0, g: 0, b: 0 })
      .png()
      .toBuffer();

    const { variants } = await processImage(original);

    const widths = await Promise.all(
      variants
        .filter(({ format }) => format === "webp")
        .map(async ({ data }) => (await sharp(data).metadata()).width),
    );
    expect(widths).toEqual([320, 640, 800, 800]);
  });

  it("removes EXIF with GPS, XMP and the colour profile", async () => {
    const original = await solid(900, 600, { r: 30, g: 120, b: 200 })
      .jpeg()
      .withExif(PHONE_EXIF)
      .withXmp(XMP)
      .withIccProfile("srgb")
      .toBuffer();
    // The fixture is what the test claims: a photo that tells where it was taken.
    const before = await sharp(original).metadata();
    expect(before.exif?.includes("ShelterPhone")).toBe(true);
    // GPSLatitudeRef (tag 0x0001, ASCII, 2 bytes: "N") as stored, little-endian.
    expect(before.exif?.includes(Buffer.from("0100020002000000", "hex"))).toBe(
      true,
    );
    expect(before.xmpAsString).toContain("Curator Name");
    expect(before.icc).toBeDefined();

    const { variants, blur } = await processImage(original);

    const outputs = [
      ...variants.map(({ data }) => data),
      Buffer.from(blur.split(",")[1]!, "base64"),
    ];
    expect(outputs).toHaveLength(9);
    for (const output of outputs) {
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      // And nothing of it survives outside the containers sharp knows.
      for (const trace of ["ShelterPhone", "Curator", "Exif", "2026:10:11"]) {
        expect(output.includes(trace), trace).toBe(false);
      }
    }
  });

  it("turns a photo shot sideways upright", async () => {
    // Stored 400×200, red on the left; the camera says "rotate 90° to view".
    const stored = await solid(400, 200, { r: 0, g: 0, b: 220 })
      .composite([
        {
          input: await solid(200, 200, { r: 220, g: 0, b: 0 }).png().toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 95 })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const processed = await processImage(stored);

    expect(processed).toMatchObject({ width: 200, height: 400 });
    const [smallest] = processed.variants;
    expect(await sharp(smallest!.data).metadata()).toMatchObject({
      width: 200,
      height: 400,
    });
    // Upright, the red half is on top.
    expectColour(
      await centreOf(smallest!.data, { left: 100, top: 100 }),
      {
        r: 220,
        g: 0,
        b: 0,
      },
      12,
    );
    expectColour(
      await centreOf(smallest!.data, { left: 100, top: 300 }),
      {
        r: 0,
        g: 0,
        b: 220,
      },
      12,
    );
  });

  it("converts Display P3 colours to sRGB", async () => {
    const colour = { r: 200, g: 40, b: 40 };
    const p3 = await solid(64, 64, colour)
      .png()
      .withIccProfile("p3")
      .toBuffer();
    // In P3 the same colour is other numbers: dropping the profile without
    // converting would wash the photo out.
    const stored = await centreOf(
      await sharp(p3)
        .keepIccProfile()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => sharp(data, { raw: info }).png().toBuffer()),
    );
    expect(Math.abs(stored.g - colour.g)).toBeGreaterThan(10);

    const { variants } = await processImage(p3);

    for (const { data } of variants.slice(0, 2)) {
      expectColour(await centreOf(data), colour);
    }
  });

  it("keeps transparency", async () => {
    const original = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const { variants } = await processImage(original);

    expect((await sharp(variants[0]!.data).metadata()).hasAlpha).toBe(true);
  });

  it("makes a tiny blurred placeholder", async () => {
    const original = await solid(1200, 800, { r: 10, g: 200, b: 90 })
      .jpeg()
      .toBuffer();

    const { blur } = await processImage(original);

    expect(blur).toMatch(/^data:image\/webp;base64,/);
    expect(blur.length).toBeLessThan(1000);
    const metadata = await sharp(
      Buffer.from(blur.split(",")[1]!, "base64"),
    ).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 16 });
  });

  it("refuses what is not a JPEG, PNG or WebP image", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    const gif = await solid(10, 10, { r: 1, g: 2, b: 3 }).gif().toBuffer();
    const tiff = await solid(10, 10, { r: 1, g: 2, b: 3 }).tiff().toBuffer();
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");

    for (const input of [svg, gif, tiff, html, new Uint8Array(0)]) {
      expect(await failureOf(input)).toBe("not-an-image");
    }
  });

  it("refuses a file cut short", async () => {
    const jpeg = await solid(600, 400, { r: 200, g: 100, b: 50 })
      .jpeg()
      .toBuffer();

    expect(await failureOf(jpeg.subarray(0, jpeg.length / 2))).toBe(
      "not-an-image",
    );
  });

  it("refuses more pixels than the limit", async () => {
    const original = await solid(200, 200, { r: 0, g: 0, b: 0 })
      .png()
      .toBuffer();

    expect(await failureOf(original, { maxInputPixels: 10_000 })).toBe(
      "too-many-pixels",
    );
  });
});
