/**
 * Step one of sourcing a photograph for each of the seventy two meals:
 * gather candidates and lay them out so a human being can look at them.
 *
 * WHY A CONTACT SHEET AND NOT A CHOICE MADE HERE. The exercise library's
 * own sourcing run is the reason (docs/BUILD_STATUS.md): matching a name
 * to a photograph by text alone produced a thirty to forty per cent false
 * positive rate even after three rounds of tightening, because a search
 * index knows what a caption says and not what a picture shows. Nothing
 * in this script decides anything. It fetches, it shrinks, it tiles, and
 * every tile is looked at before any of them is used.
 *
 * WIKIMEDIA COMMONS, THROTTLED. It is the source the exercise library
 * work already established here and it needs no key. Openverse was tried
 * first and stopped answering this machine entirely after one burst,
 * which is the same rate limiting the exercise run ran into, so every
 * request below is spaced and every one of them has a timeout: a source
 * that stops answering must fail loudly rather than hang.
 *
 * Usage:
 *   node scripts/fuel-meal-images/fetch-candidates.mjs <outDir> [fromIndex] [count]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MEAL_QUERIES } from './queries.mjs';

const UA = 'MEF-Platform/1.0 (https://app.mefwellness.com; info@mefwellness.com)';
const TILE = 300;
const COLS = 6;

const outDir = process.argv[2];
const from = Number(process.argv[3] ?? 0);
const count = Number(process.argv[4] ?? 6);
if (!outDir) {
  console.error('usage: fetch-candidates.mjs <outDir> [fromIndex] [count]');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wikimedia(query) {
  const search =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: '12',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime|size',
      iiurlwidth: '900',
    });
  const response = await fetch(search, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return [];
  const body = await response.json();
  const pages = Object.values(body.query?.pages ?? {});
  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info || info.mime !== 'image/jpeg') return null;
      // A photograph of a meal is not a thumbnail and is not a panorama.
      // Both ends of that are almost always something else.
      const ratio = (info.width ?? 0) / Math.max(info.height ?? 1, 1);
      if ((info.width ?? 0) < 640 || ratio < 0.5 || ratio > 2.4) return null;
      const meta = info.extmetadata ?? {};
      return {
        provider: 'wikimedia',
        id: String(page.pageid),
        title: page.title ?? '',
        creator: meta.Artist?.value?.replace(/<[^>]*>/g, '') ?? null,
        license: meta.LicenseShortName?.value ?? '',
        licenseUrl: meta.LicenseUrl?.value ?? null,
        landingUrl: info.descriptionurl ?? null,
        fileUrl: info.thumburl ?? info.url,
      };
    })
    .filter(Boolean);
}

async function download(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * A drawing is not a photograph of a meal.
 *
 * The exercise run had to learn this three times: an anatomical plate, a
 * diagram and a bridge all matched by caption. Here the equivalents are
 * logos, packaging labels and recipe cards, so titles that name one are
 * dropped before a single byte is downloaded.
 */
const NOT_A_MEAL =
  /(logo|icon|diagram|chart|map|poster|label|packaging|barcode|nutrition facts|coat of arms|stamp|banknote|advert|catalog|catalogue|engraving|illustration|lithograph|woodcut|drawing|painting|herbarium|letterhead|postcard|book|magazine|page \d|title page|cover|seed|manuscript|portrait|sign|menu)/i;

const ids = Object.keys(MEAL_QUERIES).slice(from, from + count);
await fs.mkdir(outDir, { recursive: true });

const sheet = [];
const manifest = [];

for (const [row, mealId] of ids.entries()) {
  // The narrow phrase first, then the broader one, because Wikimedia's
  // search is an AND and a five word dish name matches almost nothing.
  const phrases = MEAL_QUERIES[mealId];
  const found = new Map();
  for (const phrase of phrases) {
    if (found.size >= COLS) break;
    for (const candidate of await wikimedia(phrase)) {
      if (NOT_A_MEAL.test(candidate.title)) continue;
      if (!found.has(candidate.id)) found.set(candidate.id, candidate);
    }
    await sleep(700);
  }
  const candidates = [...found.values()];

  let column = 0;
  for (const candidate of candidates) {
    if (column >= COLS) break;
    try {
      const bytes = await download(candidate.fileUrl);
      const tile = await sharp(bytes)
        .resize(TILE, TILE, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 72 })
        .toBuffer();
      sheet.push({ input: tile, left: column * TILE, top: row * TILE });
      manifest.push({ mealId, slot: column, ...candidate });
      column += 1;
      await sleep(400);
    } catch {
      // A candidate that will not download is simply not a candidate.
    }
  }
  // Keep a blank where a meal found fewer than four, so the grid stays readable.
  console.error(`${mealId}: ${column} candidates`);
}

const rows = ids.length;
const canvas = sharp({
  create: {
    width: COLS * TILE,
    height: rows * TILE,
    channels: 3,
    background: { r: 245, g: 240, b: 228 },
  },
});
await canvas
  .composite(sheet)
  .jpeg({ quality: 80 })
  .toFile(path.join(outDir, `sheet-${from}.jpg`));

await fs.writeFile(
  path.join(outDir, `sheet-${from}.json`),
  JSON.stringify({ ids, candidates: manifest }, null, 2)
);

console.error(`wrote sheet-${from}.jpg (${COLS} x ${rows})`);
