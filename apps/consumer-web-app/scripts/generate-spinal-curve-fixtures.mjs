/**
 * Generates the side-view silhouette fixtures tests/spinal-curve.test.ts
 * measures against, plus the anchor sidecar that names the landmark points
 * each one was drawn around.
 *
 * WHY SYNTHETIC. What lib/body-assessment/spinalCurve.ts actually consumes
 * in production is a MediaPipe segmentation mask, not a photograph: a
 * greyscale image where each pixel says how likely it is to be part of the
 * person. So the honest fixture for it is a mask, not a photo, and a mask
 * is exactly what this script writes. Drawing them also means the true
 * shape of every back is known in advance, which is what makes "the rounded
 * back must read a larger upper-back angle than the upright one" a real
 * assertion rather than a guess about an unlabelled photo.
 *
 * The back edge of each silhouette is drawn from two smooth bumps: a
 * backward bulge in the upper back and a forward hollow in the lower back,
 * which is the shape of a real sagittal profile. Changing only the height of
 * those two bumps is what separates the upright, rounded-upper-back, and
 * flattened-lower-back cases. Every fixture also has a buttock contour below
 * hip height on purpose, so the measurement's rule about stopping short of
 * it is actually exercised.
 *
 * Run: node scripts/generate-spinal-curve-fixtures.mjs
 * Output is committed, so the test suite never depends on running this.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'tests', 'fixtures', 'spinal-curve');

const WIDTH = 720;
const HEIGHT = 1280;

// The pose landmarks each silhouette is drawn around, in the normalized
// [0,1] coordinates the real pose model reports. The subject faces right,
// so the back of the body is the left edge of the outline.
const ANCHORS = {
  shoulder: { x: 0.5, y: 0.235 },
  hip: { x: 0.5, y: 0.545 },
  facePoint: { x: 0.6, y: 0.075 },
};

const SHOULDER_ROW = Math.round(ANCHORS.shoulder.y * HEIGHT); // 301
const HIP_ROW = Math.round(ANCHORS.hip.y * HEIGHT); // 698
const BAND = HIP_ROW - SHOULDER_ROW;

const BACK_BASE = 300;
const FRONT_BASE = 470;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a, b, s) {
  return a + (b - a) * s;
}

function gaussian(t, centre, spread) {
  const z = (t - centre) / spread;
  return Math.exp(-z * z);
}

/**
 * Back edge of the silhouette, in pixels, for a given image row.
 * Smaller x is further back, because the subject faces right.
 */
function backEdge(row, preset) {
  const t = (row - SHOULDER_ROW) / BAND;

  // Upper-back backward bulge and lower-back forward hollow: the two
  // features the measurement exists to read.
  const thoracic = preset.thoracic * gaussian(t, 0.28, 0.2);
  const lumbar = preset.lumbar * gaussian(t, 0.8, 0.16);
  // Gluteal contour, deliberately below the measured band.
  const buttock = 34 * gaussian(t, 1.11, 0.13);
  let x = BACK_BASE - thoracic + lumbar - buttock;

  // Neck above the shoulders sits forward of the upper back.
  x = mix(352, x, smoothstep(238, 306, row));
  // Legs below the buttock straighten and drift forward toward the ankle.
  x = mix(x, 322, smoothstep(770, 900, row));
  x = mix(x, 352, smoothstep(900, 1235, row));

  if (preset.ripple) {
    // A loose garment hanging off the back: real amplitude, and irregular
    // rather than a single clean wave.
    const gate = smoothstep(SHOULDER_ROW - 10, SHOULDER_ROW + 40, row) * (1 - smoothstep(HIP_ROW, HIP_ROW + 60, row));
    x -= gate * (9 * Math.sin(row * 0.34) + 6 * Math.sin(row * 0.113 + 1.3) + 4 * Math.sin(row * 0.71 + 0.4));
  }
  return x;
}

/** Front edge of the silhouette, in pixels, for a given image row. */
function frontEdge(row) {
  const t = (row - SHOULDER_ROW) / BAND;
  let x = FRONT_BASE + 16 * gaussian(t, 0.15, 0.25) + 14 * gaussian(t, 0.78, 0.3);
  // The arm hangs at the side and reads as part of the front outline.
  x += 20 * smoothstep(315, 355, row) * (1 - smoothstep(600, 645, row));
  // Neck.
  x = mix(408, x, smoothstep(238, 306, row));
  // Thigh, knee, ankle.
  x = mix(x, 452, smoothstep(700, 800, row));
  x = mix(x, 424, smoothstep(800, 960, row));
  x = mix(x, 402, smoothstep(960, 1235, row));
  return x;
}

const HEAD = { cx: 370, cy: 96, rx: 54, ry: 66 };

/** True when a point falls inside the drawn body. */
function insideBody(x, y, preset) {
  // Head, plus a small nose so the face side of the outline is unambiguous.
  const hx = (x - HEAD.cx) / HEAD.rx;
  const hy = (y - HEAD.cy) / HEAD.ry;
  if (hx * hx + hy * hy <= 1) return true;
  if (y >= 84 && y <= 108 && x >= HEAD.cx && x <= 434) {
    const noseHalf = 12 * (1 - (x - 418) / 16);
    if (x <= 418 || Math.abs(y - 96) <= Math.max(0, noseHalf)) return true;
  }

  if (y < 150 || y > 1238) return false;
  return x >= backEdge(y, preset) && x <= frontEdge(y);
}

const SUBSAMPLES = 4;

async function render(name, preset) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT);
  const bodyValue = preset.bodyValue ?? 255;
  const backgroundValue = preset.backgroundValue ?? 0;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let hits = 0;
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const px = x + (sx + 0.5) / SUBSAMPLES;
          const py = y + (sy + 0.5) / SUBSAMPLES;
          if (insideBody(px, py, preset)) hits++;
        }
      }
      const coverage = hits / (SUBSAMPLES * SUBSAMPLES);
      pixels[y * WIDTH + x] = Math.round(mix(backgroundValue, bodyValue, coverage));
    }
  }

  let image = sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } });
  if (preset.blurSigma) image = image.blur(preset.blurSigma);

  const file = path.join(OUT_DIR, `${name}.png`);
  await image.png({ compressionLevel: 9 }).toFile(file);
  console.log(`wrote ${file}`);
}

const PRESETS = {
  // A back with ordinary, unremarkable curves. The reference case.
  upright: { thoracic: 14, lumbar: 12 },
  // The same body with a much deeper backward bulge in the upper back and
  // an unchanged lower back.
  'rounded-upper-back': { thoracic: 40, lumbar: 12 },
  // The same body with an unchanged upper back and the lower-back hollow
  // almost entirely removed.
  'flat-lower-back': { thoracic: 14, lumbar: 1 },
  // Confidence-floor cases. Both are the upright body underneath, so any
  // rejection is caused by edge quality alone, not by the posture.
  'loose-clothing': { thoracic: 14, lumbar: 12, ripple: true },
  'low-contrast': { thoracic: 14, lumbar: 12, bodyValue: 150, backgroundValue: 108, blurSigma: 12 },
};

await mkdir(OUT_DIR, { recursive: true });
for (const [name, preset] of Object.entries(PRESETS)) {
  await render(name, preset);
}
await writeFile(
  path.join(OUT_DIR, 'anchors.json'),
  `${JSON.stringify(
    {
      note:
        'Pose-landmark anchors every fixture in this folder was drawn around, in normalized [0,1] image coordinates. Regenerate with scripts/generate-spinal-curve-fixtures.mjs.',
      width: WIDTH,
      height: HEIGHT,
      anchors: ANCHORS,
    },
    null,
    2
  )}\n`
);
console.log('wrote anchors.json');
