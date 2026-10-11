import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { giveEachTestItsOwnIp, signIn } from "./support/sign-in";
import { E2E_USERS } from "./support/users";

// MediaUploader on its demo page, /admin/dev/media (only in `next dev`, see
// playwright.config.ts), through the whole pipeline: the browser converts and
// uploads straight to the storage, the worker (which Playwright starts too)
// makes the public versions, the /media route serves them.

// The first visit compiles the page in `next dev`.
test.describe.configure({ timeout: 120_000 });

giveEachTestItsOwnIp();

/** What a phone writes into a photo: the camera and where it was taken. */
const PHONE_EXIF = {
  IFD0: { Make: "ShelterPhone", Model: "Curator 15" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "55/1 45/1 2100/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "37/1 37/1 300/100",
  },
};

/** A 1200×900 JPEG with EXIF, as a phone would make it. */
function phonePhoto(colour: string): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 900, channels: 3, background: colour },
  })
    .jpeg()
    .withExif(PHONE_EXIF)
    .toBuffer();
}

// A real HEIC, 960×720, with EXIF: made on macOS from a generated picture —
// `sips -s format heic photo.jpg --out photo.heic`. sharp can't write HEIC.
const HEIC = readFileSync(path.join(__dirname, "fixtures", "photo.heic"));

async function openDemo(page: Page, email: string) {
  await signIn(page, email);
  await page.goto("/admin/dev/media");
  await expect(
    page.getByRole("heading", { level: 1, name: "Загрузка файлов" }),
  ).toBeVisible();
  // The file inputs do nothing until the page is hydrated.
  await page.waitForLoadState("networkidle");
}

const field = (page: Page, name: "Фото" | "Чеки") =>
  page.getByRole("group", { name, exact: true });

const tiles = (group: Locator) => group.locator("li[data-media-id]");

const ids = (group: Locator) =>
  tiles(group).evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-media-id")!),
  );

/** The image of a file as the site serves it: /media/{id}/{width}. */
const processed = (group: Locator, id: string | undefined) =>
  group.locator(`li[data-media-id="${id}"] img[src^="/media/${id}/"]`);

/** Picks files in a field and waits until the worker has processed them. */
async function upload(
  group: Locator,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const before = await ids(group);
  await group.locator("input[type=file]").setInputFiles(files);
  await expect(tiles(group)).toHaveCount(before.length + files.length, {
    timeout: 30_000,
  });
  const added = (await ids(group)).filter((id) => !before.includes(id));
  for (const id of added) {
    // The processed version, served by the site, takes over from the local
    // preview — which goes once that version has loaded.
    await expect(processed(group, id)).toBeVisible({ timeout: 30_000 });
    await expect(group.locator(`li[data-media-id="${id}"] img`)).toHaveCount(1);
  }
  return added;
}

test("uploads a JPEG and a HEIC photo; the site serves them without EXIF", async ({
  page,
  request,
}) => {
  await openDemo(page, E2E_USERS.editor);
  const photos = field(page, "Фото");

  const [jpeg, heic] = await upload(photos, [
    {
      name: "IMG_0001.jpg",
      mimeType: "image/jpeg",
      buffer: await phonePhoto("#9a6b3f"),
    },
    // Windows and Android give a HEIC file no type at all.
    { name: "IMG_0002.HEIC", mimeType: "", buffer: HEIC },
  ]);

  // What anyone gets, without a session: a processed version, no metadata.
  for (const [id, height] of [
    [jpeg, 480],
    [heic, 480],
  ] as const) {
    const response = await request.get(`/media/${id}/640`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toContain("immutable");
    const metadata = await sharp(await response.body()).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 640, height });
    expect(metadata.exif).toBeUndefined();
  }
  expect((await request.get(`/media/${jpeg}/original`)).status()).toBe(404);

  // The page shows them the way a public page would: next/image, ready widths.
  await expect(processed(photos, jpeg)).toHaveAttribute(
    "srcset",
    new RegExp(`/media/${jpeg}/1600 1600w`),
  );
});

test("puts photos in order, picks the cover and takes one back", async ({
  page,
  request,
}) => {
  await openDemo(page, E2E_USERS.owner);
  const photos = field(page, "Фото");
  const [first, second, third] = await upload(photos, [
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await phonePhoto("#444") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await phonePhoto("#888") },
    { name: "c.jpg", mimeType: "image/jpeg", buffer: await phonePhoto("#bbb") },
  ]);
  const tile = (id: string | undefined) =>
    photos.locator(`li[data-media-id="${id}"]`);
  const menu = (id: string | undefined) =>
    tile(id).getByRole("button", { name: /действия$/ });
  const position = async (id: string | undefined) =>
    (await ids(photos)).indexOf(id!);

  // Order, from the keyboard as well as by touch: a menu on every photo.
  await menu(third).click();
  await page.getByRole("menuitem", { name: "В начало" }).click();
  expect(await position(third)).toBe(0);
  await menu(third).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "На одно место позже" }).click();
  expect(await position(third)).toBe(1);
  await expect(menu(third)).toBeFocused();

  // The cover: one photo at a time.
  await tile(second).getByRole("radio", { name: "Обложка" }).click();
  await expect(
    tile(second).getByRole("radio", { name: "Обложка" }),
  ).toBeChecked();
  await expect(photos.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(tile(second)).toHaveAccessibleName(/обложка$/);

  // A photo taken back by mistake comes back to its place.
  const before = await ids(photos);
  await menu(second).click();
  await page.getByRole("menuitem", { name: "Убрать" }).click();
  await expect(tile(second)).toHaveCount(0);
  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(tile(second)).toHaveCount(1);
  expect(await ids(photos)).toEqual(before);

  // Taking a photo back for good, from the keyboard: the focus moves to the
  // photo that took its place, not to the top of the page.
  const neighbour = before[before.indexOf(first!) + 1];
  await menu(first).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Убрать" }).press("Enter");
  await expect(tile(first)).toHaveCount(0);
  await expect(menu(neighbour)).toBeFocused();
  // The file is deleted once the time to bring it back is out.
  await expect
    .poll(async () => (await request.get(`/media/${first}/640`)).status(), {
      timeout: 25_000,
    })
    .toBe(404);
  expect((await request.get(`/media/${second}/640`)).status()).toBe(200);

  // After a reload the form opens with the files that are left.
  await page.reload();
  await expect(processed(photos, second)).toBeVisible();
  await expect(tile(first)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("uploads a photo and says what is wrong with the files it can't take", async ({
    page,
  }) => {
    await openDemo(page, E2E_USERS.editor);
    const photos = field(page, "Фото");
    const before = await ids(photos);

    await photos.locator("input[type=file]").setInputFiles([
      {
        name: "anim.gif",
        mimeType: "image/gif",
        buffer: await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#000" },
        })
          .gif()
          .toBuffer(),
      },
      {
        name: "panorama.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 0xff),
      },
      // Called a photo, but it is not one.
      {
        name: "notes.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("just some text"),
      },
      {
        name: "IMG_0003.jpg",
        mimeType: "image/jpeg",
        buffer: await phonePhoto("#6b8f71"),
      },
    ]);

    const alert = photos.getByRole("alert").filter({ hasText: "Не добавлено" });
    await expect(alert).toContainText("Не добавлено: 3 файла");
    await expect(alert).toContainText(
      "anim.gif — Этот формат не подходит. Загрузите фото в JPEG, PNG, WebP или HEIC.",
    );
    await expect(alert).toContainText(
      "panorama.jpg — Файл больше 15 МБ. Уменьшите фото или выберите другое.",
    );
    await expect(alert).toContainText("notes.jpg — Этот формат не подходит.");

    // The good file went up all the same.
    await expect(tiles(photos)).toHaveCount(before.length + 1, {
      timeout: 30_000,
    });
    await expect(
      tiles(photos).last().locator('img[src^="/media/"]'),
    ).toBeVisible({ timeout: 30_000 });

    // Controls a finger can hit, also the small ones.
    for (const control of [
      alert.getByRole("button", { name: "Понятно" }),
      tiles(photos)
        .last()
        .getByRole("button", { name: /действия$/ }),
    ]) {
      const tappable = await control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const around = getComputedStyle(element, "::after");
        return {
          width: Math.max(box.width, parseFloat(around.width) || 0),
          height: Math.max(box.height, parseFloat(around.height) || 0),
        };
      });
      expect(tappable.width).toBeGreaterThanOrEqual(44);
      expect(tappable.height).toBeGreaterThanOrEqual(44);
    }

    await alert.getByRole("button", { name: "Понятно" }).focus();
    await page.keyboard.press("Enter");
    await expect(alert).toHaveCount(0);
    await expect(
      photos.getByRole("button", { name: "Добавить" }),
    ).toBeFocused();

    // Nothing sticks out of a 375 px screen.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});

test("keeps a receipt private until it is marked redacted", async ({
  page,
  request,
}) => {
  await openDemo(page, E2E_USERS.owner);
  const receipts = field(page, "Чеки");
  const [receipt] = await upload(receipts, [
    {
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      buffer: await phonePhoto("#eee"),
    },
  ]);
  const tile = receipts.locator(`li[data-media-id="${receipt}"]`);

  // Processed, but only staff see it.
  expect((await request.get(`/media/${receipt}/640`)).status()).toBe(404);
  const forStaff = await page.request.get(`/media/${receipt}/640`);
  expect(forStaff.status()).toBe(200);
  expect(forStaff.headers()["cache-control"]).toBe("private, no-store");

  await tile.getByRole("checkbox", { name: "Личные данные закрашены" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Отметки сохранены")).toBeVisible();

  expect((await request.get(`/media/${receipt}/640`)).status()).toBe(200);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the upload field passes WCAG 2.1 AA in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openDemo(page, E2E_USERS.editor);
    const photos = field(page, "Фото");
    await upload(photos, [
      {
        name: "IMG_0004.jpg",
        mimeType: "image/jpeg",
        buffer: await phonePhoto("#9a6b3f"),
      },
    ]);
    // A refusal on screen too: the error state is part of the field.
    await photos.locator("input[type=file]").setInputFiles([
      {
        name: "scan.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7"),
      },
    ]);
    await expect(photos.getByRole("alert")).toContainText("scan.pdf");

    const scan = () =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
    const summary = (
      violations: Awaited<ReturnType<typeof scan>>["violations"],
    ) =>
      violations.map(
        ({ id, nodes }) =>
          `${id}: ${nodes.map(({ target }) => target.join(" ")).join(", ")}`,
      );

    expect(summary((await scan()).violations)).toEqual([]);

    // And with a photo's menu open.
    await tiles(photos)
      .last()
      .getByRole("button", { name: /действия$/ })
      .click();
    await expect(page.getByRole("menuitem", { name: "Убрать" })).toBeVisible();
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((animation) => animation.finished),
      ),
    );
    expect(summary((await scan()).violations)).toEqual([]);
  });
}
