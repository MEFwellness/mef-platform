#!/usr/bin/env node
/**
 * HOME PREFETCH: what Home asks the server for that nobody tapped.
 *
 * Next prefetches a `<Link>` when it scrolls into view, and a prefetch of a
 * dynamically-rendered route is a full server render of that route. This
 * script opens Home on production and writes down every `?_rsc=` request the
 * page made on its own, with the route it hit and how long the server took,
 * so the cost of it is a measurement rather than a
 * belief.
 *
 * It also times a real tap, so the other half of the trade is measured too:
 * turning a prefetch off saves the server that render and costs her the wait
 * at the moment she taps. Both numbers, or neither.
 *
 * Read-only. It navigates, it taps links that only read, and it writes
 * nothing.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   SHOTS_DIR=... node scripts/measure-home-prefetch-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? 'before';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-prefetch';
mkdirSync(SHOTS, { recursive: true });

const ms = (v) => (v === undefined || v === null || v < 0 ? '—' : `${(v / 1000).toFixed(2)}s`);

/** The route a `?_rsc=` URL is asking the server to render. */
function routeOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

const browser = await chromium.launch();
let minted = null;
const runs = [];

try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session for', EMAIL);
    process.exit(1);
  }

  for (let i = 1; i <= RUNS; i++) {
    const page = await minted.context.newPage();
    const rsc = [];
    const started = new Map();

    page.on('request', (req) => {
      if (req.url().includes('_rsc=')) started.set(req, Date.now());
    });
    page.on('requestfinished', (req) => {
      const t = started.get(req);
      if (t === undefined) return;
      rsc.push({ route: routeOf(req.url()), ms: Date.now() - t });
    });

    const t0 = Date.now();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 40000 }).catch(() => {});
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-settling], .animate-pulse').length === 0,
        null,
        { timeout: 15000 }
      )
      .catch(() => {});
    const settledMs = Date.now() - t0;

    // Scroll the whole page: Next prefetches a Link when it enters the
    // viewport, so a Home that is never scrolled under-reports its own
    // prefetching. A member scrolls Home.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 350));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);

    if (i === 1) await page.screenshot({ path: `${SHOTS}/${LABEL}-home.png`, fullPage: true });

    const byRoute = new Map();
    for (const r of rsc) {
      const row = byRoute.get(r.route) ?? { route: r.route, count: 0, totalMs: 0 };
      row.count += 1;
      row.totalMs += r.ms;
      byRoute.set(r.route, row);
    }
    const table = [...byRoute.values()].sort((a, b) => b.totalMs - a.totalMs);
    const totalMs = table.reduce((s, r) => s + r.totalMs, 0);

    console.log(`\n${LABEL} run ${i}: settled=${ms(settledMs)}  prefetch requests=${rsc.length}  prefetch server time=${ms(totalMs)}`);
    for (const r of table) console.log(`    ${r.route}  x${r.count}  ${ms(r.totalMs)}`);

    runs.push({ run: i, settledMs, prefetchCount: rsc.length, prefetchTotalMs: totalMs, byRoute: table });
    await page.close();
  }

  // ---- The other half: what a real tap costs ----
  for (const target of [
    // The landmark is per destination on purpose: "an h1 exists" is not the
    // same moment on every screen, and /root-score's own content is headed
    // by its kicker rather than by a heading tag.
    { name: 'Root Score', selector: 'a[href="/root-score"]', ready: 'Root Score' },
    { name: 'Program', selector: 'a[href^="/programs/"]', ready: null },
  ]) {
    const page = await minted.context.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 40000 }).catch(() => {});
    const link = page.locator(target.selector).first();
    if ((await link.count()) === 0) {
      console.log(`\ntap ${target.name}: no such link on Home`);
      await page.close();
      continue;
    }
    await link.scrollIntoViewIfNeeded().catch(() => {});
    // Give Next its prefetch-on-view window before tapping, so the "before"
    // number is genuinely the prefetched case.
    await page.waitForTimeout(2000);
    const href = await link.getAttribute('href');

    const t0 = Date.now();
    // A real tap, dispatched in the page, so a sticky bar overlapping the
    // link's box cannot make this measure the overlay instead.
    await link.evaluate((el) => el.click());
    let arrivedMs = null;
    let visibleMs = null;
    try {
      await page.waitForURL((u) => new URL(u).pathname === href, { timeout: 30000 });
      arrivedMs = Date.now() - t0;
      await page.waitForFunction(
        (needle) =>
          Array.from(document.querySelectorAll('h1, h2, p')).some((n) => {
            const r = n.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const text = (n.textContent ?? '').trim();
            return needle ? text === needle : n.tagName === 'H1' && text.length > 0;
          }),
        target.ready,
        { timeout: 30000 }
      );
      visibleMs = Date.now() - t0;
    } catch (e) {
      console.log(`    (tap ${target.name} did not complete: ${String(e).split('\n')[0]})`);
    }
    console.log(
      `\ntap ${target.name} (${href}): url in ${ms(arrivedMs)}, heading visible in ${ms(visibleMs)} ` +
        `(now at ${new URL(page.url()).pathname})`
    );
    runs.push({ tap: target.name, href, arrivedMs, visibleMs });
    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close();
}

writeFileSync(`${SHOTS}/${LABEL}-prefetch.json`, JSON.stringify(runs, null, 2));
console.log(`\nwrote ${SHOTS}/${LABEL}-prefetch.json`);
