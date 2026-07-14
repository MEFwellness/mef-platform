#!/usr/bin/env node
// Regenerates every derived brand asset (favicon, PWA icons, apple touch
// icon, the in-app logo, and the OG/Twitter social image) from a single
// square source image. Run this whenever the logo changes instead of
// hand-editing each size:
//
//   node scripts/generate-brand-assets.mjs /path/to/new-logo.png
//
// Requires `sharp` (devDependency). The source should be square, at least
// 512x512, with its final background already baked in (no transparency
// expected — apple-touch-icon and the OG canvas both assume an opaque image).
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(APP_ROOT, 'public/images');
const ICONS_DIR = path.join(APP_ROOT, 'public/icons');

// OG canvas background — keep this matched to the source artwork's own
// background color (sample a corner pixel) so the composited square in
// og-image.png has no visible seam against the surrounding field.
const OG_BACKGROUND = { r: 0x19, g: 0x23, b: 0x1a };

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/generate-brand-assets.mjs /path/to/new-logo.png');
  process.exit(1);
}

const pngOpts = { compressionLevel: 9, adaptiveFiltering: true };

async function run() {
  await sharp(source).resize(512, 512).png(pngOpts).toFile(`${IMAGES_DIR}/rooted-reset-logo.png`);
  console.log('wrote images/rooted-reset-logo.png (512x512) — the in-app logo, login/signup/dashboard');

  await sharp(source).resize(32, 32).png(pngOpts).toFile(`${ICONS_DIR}/favicon-32.png`);
  console.log('wrote icons/favicon-32.png (32x32) — browser tab icon');

  await sharp(source).resize(192, 192).png(pngOpts).toFile(`${ICONS_DIR}/icon-192.png`);
  console.log('wrote icons/icon-192.png (192x192) — PWA icon');

  await sharp(source).resize(512, 512).png(pngOpts).toFile(`${ICONS_DIR}/icon-512.png`);
  console.log('wrote icons/icon-512.png (512x512) — PWA icon');

  await sharp(source).resize(180, 180).png(pngOpts).toFile(`${ICONS_DIR}/apple-touch-icon.png`);
  console.log('wrote icons/apple-touch-icon.png (180x180) — iOS home screen icon');

  const mark = await sharp(source).resize(440, 440).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: OG_BACKGROUND } })
    .composite([{ input: mark, gravity: 'center' }])
    .png(pngOpts)
    .toFile(`${IMAGES_DIR}/og-image.png`);
  console.log('wrote images/og-image.png (1200x630) — Open Graph / Twitter share image');
}

run()
  .then(() => console.log('done'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
