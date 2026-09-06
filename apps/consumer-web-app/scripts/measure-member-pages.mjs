#!/usr/bin/env node
/**
 * THE STOPWATCH FOR EVERY MEMBER PAGE.
 *
 * scripts/measure-home-speed-live.mjs times one screen against the four
 * landmarks Home is judged on. This one is the general instrument: give it
 * a list of paths and it reports, per path, the numbers a browser can
 * actually defend.
 *
 *   ttfb        PerformanceNavigationTiming.responseStart
 *   fcp         first-contentful-paint (PerformanceObserver)
 *   lcp         largest-contentful-paint, final value at settle
 *   dcl / load  domContentLoadedEventEnd / loadEventEnd
 *   settled     network quiet AND no skeleton left on screen
 *   cls         layout-shift sum, EXCLUDING shifts within 500ms of an input
 *   longTasks   count and total ms of tasks over 50ms (main-thread jank)
 *   transfer    bytes over the wire for the document and its subresources
 *
 * Every run gets a fresh page from a fresh context so nothing is served out
 * of the browser's own cache, and the median of RUNS is what is reported:
 * a single sample of a server-rendered page is mostly noise.
 *
 * Read-only. It navigates and it measures; it clicks nothing and it writes
 * nothing.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=http://localhost:3100 MEMBER_EMAIL=... \
 *   PATHS=/dashboard,/today node scripts/measure-member-pages.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? 'run';
const OUT = process.env.OUT_FILE ?? `./measure-${LABEL}.json`;
const DEFAULT_PATHS = [
  '/dashboard',
  '/today',
  '/checkin',
  '/programs',
  '/stress-load',
  '/conversation',
  '/profile',
  '/progress',
  '/trial/week',
];
const PATHS = (process.env.PATHS ?? DEFAULT_PATHS.join(',')).split(',').filter(Boolean);

/**
 * Installed before the document exists, so the observers are registered
 * before the first paint they are meant to catch. Everything is stamped
 * against performance.timeOrigin rather than the driver's clock.
 */
const PROBE = () => {
  const w = window;
  w.__mef = { fcp: null, lcp: null, cls: 0, longTasks: 0, longTaskMs: 0, shifts: [] };
  let lastInput = 0;
  for (const type of ['pointerdown', 'keydown']) {
    addEventListener(type, () => (lastInput = performance.now()), true);
  }
  const obs = (type, fn, extra) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({
        type,
        buffered: true,
        ...extra,
      });
    } catch {
      /* an engine without this entry type reports null rather than failing */
    }
  };
  obs('paint', (e) => {
    if (e.name === 'first-contentful-paint' && w.__mef.fcp === null)
      w.__mef.fcp = Math.round(e.startTime);
  });
  obs('largest-contentful-paint', (e) => (w.__mef.lcp = Math.round(e.startTime)));
  obs('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    // A shift within half a second of a tap is a response to that tap, not
    // a page moving under her.
    if (performance.now() - lastInput < 500) return;
    w.__mef.cls += e.value;
    if (e.value > 0.001) {
      const sources = (e.sources ?? [])
        .map((s) => {
          const n = s.node;
          if (!n || !n.tagName) return '?';
          return `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${
            n.className && typeof n.className === 'string'
              ? '.' + n.className.split(/\s+/).slice(0, 3).join('.')
              : ''
          }`;
        })
        .slice(0, 3);
      w.__mef.shifts.push({ value: Number(e.value.toFixed(4)), at: Math.round(e.startTime), sources });
    }
  });
  obs('longtask', (e) => {
    w.__mef.longTasks += 1;
    w.__mef.longTaskMs += Math.round(e.duration);
  });
};

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
};

const browser = await chromium.launch();
let minted = null;
const results = [];
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session for', EMAIL);
    process.exit(1);
  }

  for (const path of PATHS) {
    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      const page = await minted.context.newPage();
      await page.addInitScript(PROBE);
      let transfer = 0;
      let requests = 0;
      page.on('response', async (res) => {
        requests += 1;
        const len = Number(res.headers()['content-length'] ?? 0);
        if (len) transfer += len;
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 160));
      });

      const t0 = Date.now();
      let status = 0;
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'commit', timeout: 60000 });
        status = resp?.status() ?? 0;
      } catch (e) {
        runs.push({ error: String(e).slice(0, 120) });
        await page.close();
        continue;
      }
      let settled = null;
      try {
        await page.waitForLoadState('networkidle', { timeout: 45000 });
        await page
          .waitForFunction(
            () => document.querySelectorAll('[data-settling], .animate-pulse').length === 0,
            null,
            { timeout: 20000 }
          )
          .catch(() => {});
        settled = Date.now() - t0;
      } catch {
        settled = Date.now() - t0;
      }
      // A beat for the LCP observer to receive its final entry.
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] ?? {};
        return {
          ...window.__mef,
          ttfb: Math.round(nav.responseStart ?? 0),
          dcl: Math.round(nav.domContentLoadedEventEnd ?? 0),
          load: Math.round(nav.loadEventEnd ?? 0),
          url: location.pathname,
        };
      });
      runs.push({ ...m, settled, transfer, requests, status, errors });
      await page.close();
    }
    const ok = runs.filter((r) => !r.error);
    const row = {
      path,
      landed: ok[0]?.url ?? null,
      status: ok[0]?.status ?? null,
      ttfb: median(ok.map((r) => r.ttfb)),
      fcp: median(ok.map((r) => r.fcp)),
      lcp: median(ok.map((r) => r.lcp)),
      dcl: median(ok.map((r) => r.dcl)),
      load: median(ok.map((r) => r.load)),
      settled: median(ok.map((r) => r.settled)),
      cls: ok.length ? Number(median(ok.map((r) => r.cls * 10000)) / 10000) : null,
      longTasks: median(ok.map((r) => r.longTasks)),
      longTaskMs: median(ok.map((r) => r.longTaskMs)),
      transferKb: median(ok.map((r) => Math.round(r.transfer / 1024))),
      requests: median(ok.map((r) => r.requests)),
      shifts: ok[0]?.shifts ?? [],
      errors: [...new Set(ok.flatMap((r) => r.errors ?? []))].slice(0, 5),
    };
    results.push(row);
    console.log(
      `${path.padEnd(18)} ttfb=${String(row.ttfb).padStart(5)} fcp=${String(row.fcp).padStart(5)} ` +
        `lcp=${String(row.lcp).padStart(5)} settled=${String(row.settled).padStart(6)} ` +
        `cls=${String(row.cls).padStart(7)} longTasks=${row.longTasks}/${row.longTaskMs}ms ` +
        `kb=${row.transferKb} landed=${row.landed}`
    );
  }
} finally {
  await retireSession(minted);
  await browser.close().catch(() => {});
}
writeFileSync(OUT, JSON.stringify({ base: BASE, label: LABEL, runs: RUNS, results }, null, 2));
console.log('\nwrote', OUT);
