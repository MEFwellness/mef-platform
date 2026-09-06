#!/usr/bin/env node
/**
 * THE PHONE AUDIT.
 *
 * Most members read this app on a phone, so this walks the member screens
 * at 390x844 and reports the four things that only show up at that size:
 *
 *   overflow      the page scrolls sideways, or an element reaches past the
 *                 right edge of the viewport
 *   tapTargets    an interactive control smaller than 44x44, which is the
 *                 size a thumb can actually hit
 *   clipped       text cut off by its own box (scrollWidth past clientWidth
 *                 with no scrolling of its own)
 *   errors        anything the page logged, and any request that failed
 *
 * Read-only: it navigates and it measures. It clicks nothing.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=... PATHS=/dashboard,/today node scripts/audit-mobile-screens.mjs
 */
import { chromium } from 'playwright';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const DEFAULT_PATHS = [
  '/dashboard',
  '/today',
  '/checkin',
  '/programs',
  '/progress',
  '/conversation',
  '/profile',
  '/stress-load',
  '/notifications',
  '/questionnaires',
  '/membership',
];
const PATHS = (process.env.PATHS ?? DEFAULT_PATHS.join(',')).split(',').filter(Boolean);
const WIDTH = Number(process.env.VIEWPORT_WIDTH ?? 390);
const HEIGHT = Number(process.env.VIEWPORT_HEIGHT ?? 844);

const AUDIT = (width) => {
  const out = { overflow: null, wide: [], small: [], clipped: [] };
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    out.overflow = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  }
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 4).join('.') : '';
    const text = (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // Anything reaching past the right edge by more than a rounding error.
    if (r.right > width + 1 && r.width <= width + 1) out.wide.push({ el: name(el), right: Math.round(r.right) });
  }

  const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="switch"], summary';
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    if (el.hasAttribute('disabled')) continue;
    const r = el.getBoundingClientRect();
    // The hit area can legitimately be a padded ancestor, so a control
    // whose own box is small but whose parent link/button is not is fine.
    const hit = el.closest('a[href], button, [role="button"]') ?? el;
    const hr = hit.getBoundingClientRect();
    const w = Math.max(r.width, hr.width);
    const h = Math.max(r.height, hr.height);
    if (w < 44 || h < 44) out.small.push({ el: name(el), w: Math.round(w), h: Math.round(h) });
  }

  for (const el of document.querySelectorAll('p, h1, h2, h3, h4, span, li, td, th, button, a')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX !== 'visible' && s.overflowX !== 'clip') continue;
    if (s.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      out.clipped.push({ el: name(el), scroll: el.scrollWidth, client: el.clientWidth });
    }
  }
  return out;
};

const browser = await chromium.launch();
let minted = null;
let problems = 0;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: WIDTH, height: HEIGHT },
  });
  if (!minted) {
    console.error('could not mint a session for', EMAIL);
    process.exit(1);
  }

  for (const path of PATHS) {
    const page = await minted.context.newPage();
    const logged = [];
    page.on('pageerror', (e) => logged.push(`pageerror: ${String(e).slice(0, 140)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') logged.push(`console: ${m.text().slice(0, 140)}`);
    });
    page.on('requestfailed', (r) => logged.push(`requestfailed: ${r.url().slice(0, 100)}`));

    await page.goto(`${BASE}${path}`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('[data-settling], .animate-pulse').length === 0, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);

    const landed = new URL(page.url()).pathname;
    const result = await page.evaluate(AUDIT, WIDTH);
    // Same control repeated down a list is one finding, not twenty.
    const uniq = (rows, key) => {
      const seen = new Map();
      for (const r of rows) if (!seen.has(r[key])) seen.set(r[key], r);
      return [...seen.values()];
    };
    const wide = uniq(result.wide, 'el');
    const small = uniq(result.small, 'el');
    const clipped = uniq(result.clipped, 'el');
    const count = (result.overflow ? 1 : 0) + wide.length + small.length + clipped.length + logged.length;
    problems += count;

    console.log(`\n=== ${path}${landed === path ? '' : ` (landed ${landed})`} — ${count} finding(s)`);
    if (result.overflow) console.log(`  SIDEWAYS SCROLL: ${result.overflow.scrollWidth}px in a ${result.overflow.clientWidth}px viewport`);
    for (const r of wide.slice(0, 8)) console.log(`  past the right edge (${r.right}px): ${r.el}`);
    for (const r of small.slice(0, 12)) console.log(`  tap target ${r.w}x${r.h}: ${r.el}`);
    for (const r of clipped.slice(0, 8)) console.log(`  clipped text (${r.scroll} in ${r.client}): ${r.el}`);
    for (const line of [...new Set(logged)].slice(0, 6)) console.log(`  ${line}`);
    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close().catch(() => {});
}
console.log(`\ntotal findings: ${problems}`);
