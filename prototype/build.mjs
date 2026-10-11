// Assembles the single-file prototype: styles, scripts, photos and the ₽ glyph
// are inlined, because a published artifact can load nothing but Google Fonts.
//
//   node prototype/build.mjs
//
// dist/mys-dobroy-nadezhdy.html — the page to publish as an artifact (its host
// adds <html>, <head> and <body> itself); dist/preview.html — the same page as
// a full document: for checking locally and for GitHub Pages
// (.github/workflows/prototype-pages.yml).
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = join(root, "..");

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
};

async function concat(dir, ext) {
  const names = (await readdir(dir))
    .filter((name) => name.endsWith(ext))
    .sort();
  const parts = await Promise.all(
    names.map((name) => readFile(join(dir, name), "utf8")),
  );
  return parts.join("\n");
}

async function dataUri(file, mime) {
  return `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
}

async function photos() {
  const dir = join(root, "assets/photos");
  const entries = {};
  for (const name of (await readdir(dir)).sort()) {
    const mime = MIME[extname(name).toLowerCase()];
    if (mime)
      entries[basename(name, extname(name))] = await dataUri(
        join(dir, name),
        mime,
      );
  }
  return entries;
}

// The same one-glyph file the app uses: Sofia Sans Extra Condensed has no ₽.
const rouble = await dataUri(
  join(repo, "src/app/fonts/rouble-fira-sans-extra-condensed-black.woff2"),
  "font/woff2",
);

const css = (await concat(join(root, "src/styles"), ".css")).replaceAll(
  "__ROUBLE_FONT__",
  rouble,
);
const js = [
  `const PHOTOS = ${JSON.stringify(await photos())};`,
  await concat(join(root, "src/js"), ".js"),
].join("\n");

const template = await readFile(join(root, "src/index.html"), "utf8");
const page = template
  .replace("/*__CSS__*/", () => css)
  .replace(
    "/*__JS__*/",
    () =>
      `(() => {\n"use strict";\n${js.replaceAll("</script", "<\\/script")}\n})();`,
  );

// The app's placeholder icon, so the public copy does not ask for /favicon.ico.
const favicon = await dataUri(join(repo, "src/app/icon.svg"), "image/svg+xml");

// noindex: the public copy is a demo with invented needs and requisites and
// must not be found by a search engine as the shelter's real site.
const preview = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="description" content="Прототип сайта приюта «Мыс доброй надежды» на демо-данных: так сайт будет выглядеть и работать." />
<link rel="icon" type="image/svg+xml" href="${favicon}" />
</head>
<body>
${page}
</body>
</html>
`;

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/mys-dobroy-nadezhdy.html"), page);
await writeFile(join(root, "dist/preview.html"), preview);
console.log(
  `dist/mys-dobroy-nadezhdy.html — ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB`,
);
