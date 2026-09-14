/**
 * Step two of sourcing meal photographs: take the candidates a human
 * being actually looked at and chose, store them in the repository, and
 * write down where each one came from.
 *
 * NOTHING IS HOTLINKED. Every accepted photograph is downloaded, cropped
 * to the card's own aspect ratio, re-encoded and committed under
 * public/images/fuel-meals. A remote URL in a meal card would mean a
 * member's breakfast card depending on somebody else's server staying up,
 * and on their file staying the same picture.
 *
 * THE MANIFEST IS THE ATTRIBUTION. docs/fuel-meal-image-manifest.json
 * records, per image, the meal it belongs to, the file it came from, the
 * page it lives on, who made it and under what licence. A meal with no
 * honest match is in there too, marked as an illustration, so the file
 * answers "where did this picture come from" for all seventy two rather
 * than for the ones that happen to have a photograph.
 *
 * Usage:
 *   node scripts/fuel-meal-images/apply-picks.mjs <sheetDir> <picks.json>
 *
 * picks.json is { "<mealId>": { "sheet": 0, "slot": 2 } | null }
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MEAL_QUERIES } from './queries.mjs';

const UA = 'MEF-Platform/1.0 (https://app.mefwellness.com; info@mefwellness.com)';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const OUT_DIR = path.join(APP, 'public/images/fuel-meals');
const MANIFEST = path.resolve(APP, '../../docs/fuel-meal-image-manifest.json');

const WIDTH = 1200;
const HEIGHT = 750;

const [sheetDir, picksPath] = process.argv.slice(2);
if (!sheetDir || !picksPath) {
  console.error('usage: apply-picks.mjs <sheetDir> <picks.json>');
  process.exit(1);
}

const picks = JSON.parse(await fs.readFile(picksPath, 'utf8'));
await fs.mkdir(OUT_DIR, { recursive: true });

/** Every candidate that was offered, keyed by meal and slot. */
const candidates = new Map();
for (const file of await fs.readdir(sheetDir)) {
  if (!file.endsWith('.json')) continue;
  const sheet = JSON.parse(await fs.readFile(path.join(sheetDir, file), 'utf8'));
  for (const candidate of sheet.candidates) {
    candidates.set(`${candidate.mealId}:${candidate.slot}`, candidate);
  }
}

const manifest = [];
let stored = 0;
let illustrated = 0;

for (const mealId of Object.keys(MEAL_QUERIES)) {
  const pick = picks[mealId];

  if (!pick) {
    manifest.push({
      mealId,
      image: null,
      source: 'illustration',
      note: 'No honest open-license photograph of this meal was found. The card draws the brand plate illustration built from the meal own range words.',
    });
    illustrated += 1;
    continue;
  }

  const candidate = candidates.get(`${mealId}:${pick.slot}`);
  if (!candidate) {
    console.error(`no candidate for ${mealId} slot ${pick.slot}`);
    process.exitCode = 1;
    continue;
  }

  const response = await fetch(candidate.fileUrl, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    console.error(`${mealId}: HTTP ${response.status}`);
    process.exitCode = 1;
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  const fileName = `${mealId}.jpg`;
  await sharp(bytes)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(path.join(OUT_DIR, fileName));

  manifest.push({
    mealId,
    image: fileName,
    source: candidate.provider,
    title: candidate.title,
    creator: candidate.creator,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    pageUrl: candidate.landingUrl,
    fileUrl: candidate.fileUrl,
  });
  stored += 1;
  console.error(`${mealId}: stored`);
}

await fs.writeFile(
  MANIFEST,
  `${JSON.stringify(
    {
      about:
        'Every image on a Rooted Reset Fuel Pattern meal card, and where it came from. Photographs are downloaded and committed under apps/consumer-web-app/public/images/fuel-meals, never hotlinked. A meal with no honest open-license photograph is listed here as an illustration and its card draws the brand plate built from the meal own range words.',
      generatedBy: 'apps/consumer-web-app/scripts/fuel-meal-images/apply-picks.mjs',
      photographs: stored,
      illustrations: illustrated,
      entries: manifest,
    },
    null,
    2
  )}\n`
);

console.error(`stored ${stored} photographs, ${illustrated} illustrated placeholders`);
