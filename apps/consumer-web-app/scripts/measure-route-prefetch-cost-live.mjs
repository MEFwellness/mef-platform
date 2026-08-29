#!/usr/bin/env node
/**
 * WHAT ONE PREFETCH ACTUALLY COSTS THE SERVER, per route.
 *
 * A `<Link>` that scrolls into view makes Next ask the server for that
 * route's RSC payload. For a route with a `loading.tsx` that is a render of
 * the layouts plus the loading boundary; for a route without one it is a
 * render of the whole page. Both are real server work, and this measures
 * each separately so "turn this prefetch off" is a decision with a number
 * behind it rather than a hunch.
 *
 * Read-only: GETs only, with the member's own session cookie, so RLS is
 * exactly what it would be for her.
 *
 * Usage, from apps/consumer-web-app:
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   node scripts/measure-route-prefetch-cost-live.mjs
 */
import { chromium } from 'playwright';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const REPS = Number(process.env.REPS ?? 3);
const ROUTES = (
  process.env.ROUTES ??
  '/dashboard,/today,/progress,/food-lens,/checkin,/root-score,/case,/movement,/recommendations,/noticing'
).split(',');

const ms = (v) => `${(v / 1000).toFixed(2)}s`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
  if (!minted) {
    console.error('could not mint a session for', EMAIL);
    process.exit(1);
  }

  // Discover her real program id from Home, so the program route measured is
  // the one Home actually links to.
  const page = await minted.context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  const programHref = await page
    .locator('a[href^="/programs/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (programHref) ROUTES.push(programHref);
  await page.close();

  // Warm every route once before timing any of it. The first hit on a
  // serverless function is a cold start, and the route that happens to be
  // measured first would otherwise wear the whole platform penalty and look
  // like the expensive one.
  for (const route of ROUTES) {
    await minted.context.request
      .get(`${BASE}${route}`, { headers: { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Url': '/dashboard' }, timeout: 60000 })
      .catch(() => {});
  }

  console.log(`\n${'route'.padEnd(46)} ${'prefetch'.padStart(9)} ${'full'.padStart(9)}  bytes(prefetch)`);
  console.log('-'.repeat(82));

  const results = [];
  for (const route of ROUTES) {
    const prefetchTimes = [];
    const fullTimes = [];
    let prefetchBytes = 0;

    for (let i = 0; i < REPS; i++) {
      for (const isPrefetch of [true, false]) {
        const headers = { RSC: '1', 'Next-Url': '/dashboard' };
        if (isPrefetch) headers['Next-Router-Prefetch'] = '1';
        const t = Date.now();
        const res = await minted.context.request.get(`${BASE}${route}`, { headers, timeout: 60000 });
        const body = await res.body();
        const elapsed = Date.now() - t;
        if (isPrefetch) {
          prefetchTimes.push(elapsed);
          prefetchBytes = body.length;
        } else {
          fullTimes.push(elapsed);
        }
      }
    }

    const p = median(prefetchTimes);
    const f = median(fullTimes);
    results.push({ route, prefetchMs: p, fullMs: f, prefetchBytes });
    console.log(`${route.padEnd(46)} ${ms(p).padStart(9)} ${ms(f).padStart(9)}  ${prefetchBytes}`);
  }

  console.log('-'.repeat(82));
  console.log(JSON.stringify(results));
} finally {
  await retireSession(minted);
  await browser.close();
}
