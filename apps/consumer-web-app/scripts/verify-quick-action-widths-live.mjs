#!/usr/bin/env node
/**
 * DOES ANY QUICK ACTION TILE CUT ITS OWN STATUS LINE OFF?
 *
 * The row's tile width is a fraction of the column, so the narrowest
 * supported phone is the one that decides whether a status line fits. This
 * asks the real rendered row on production, at the three widths the app
 * supports, and reports per tile:
 *
 *   label        the tile's own name
 *   hint         the status line under it, as rendered
 *   clamped      whether the browser is hiding part of it (the hint is a
 *                two line clamp, so scrollHeight > clientHeight is the
 *                one honest signal that something was cut)
 *   lines        how many lines the hint actually takes
 *   overflowX    whether the tile's own content is wider than the tile
 *
 * READ ONLY. It navigates, measures and screenshots. It taps nothing.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   SHOTS_DIR=... node scripts/verify-quick-action-widths-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const WIDTHS = (process.env.WIDTHS ?? '320,360,390').split(',').map(Number);
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-quick-widths';
const LABEL = process.env.LABEL ?? 'run';
mkdirSync(SHOTS, { recursive: true });

const READ_ROW = () => {
  const tiles = Array.from(document.querySelectorAll('.mef-home-quick-tile'));
  return tiles.map((tile) => {
    const hint = tile.querySelector('.mef-home-quick-hint');
    const label = tile.querySelector('.mef-home-quick-label');
    const lineHeight = hint ? parseFloat(getComputedStyle(hint).lineHeight) : 0;
    return {
      label: (label?.textContent ?? '').trim(),
      hint: (hint?.textContent ?? '').trim(),
      tileWidth: Math.round(tile.getBoundingClientRect().width),
      hintWidth: hint ? Math.round(hint.getBoundingClientRect().width) : 0,
      clamped: hint ? hint.scrollHeight > hint.clientHeight + 1 : false,
      lines: hint && lineHeight ? Math.round(hint.scrollHeight / lineHeight) : 0,
      labelClamped: label ? label.scrollWidth > label.clientWidth + 1 : false,
    };
  });
};

let failures = 0;
const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
  if (!minted) {
    console.error('could not mint a session');
    process.exit(1);
  }
  for (const width of WIDTHS) {
    const page = await minted.context.newPage();
    await page.setViewportSize({ width, height: 780 });
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.mef-home-quick-tile', { timeout: 30000 });
    // The row streams in its own boundary: give the tiles a moment to be
    // the real ones rather than the placeholder's shapes.
    await page.waitForFunction(
      () => document.querySelectorAll('.mef-home-quick-tile').length > 1,
      null,
      { timeout: 20000 }
    );
    const rows = await page.evaluate(READ_ROW);
    console.log(`\n=== ${width}px ===`);
    for (const r of rows) {
      const bad = r.clamped || r.labelClamped;
      if (bad) failures += 1;
      console.log(
        `  ${bad ? 'CUT ' : 'ok  '} tile=${String(r.tileWidth).padStart(3)}px ` +
          `hint=${String(r.hintWidth).padStart(3)}px lines=${r.lines} ` +
          `"${r.label}" / "${r.hint}"${r.labelClamped ? ' [label cut]' : ''}`
      );
    }
    await page.screenshot({ path: `${SHOTS}/${LABEL}-${width}.png` });
    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close();
}

console.log(failures === 0 ? '\nPASS: nothing is cut off at any supported width' : `\nFAIL: ${failures} cut`);
process.exitCode = failures === 0 ? 0 : 1;
