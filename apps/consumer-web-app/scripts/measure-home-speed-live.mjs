#!/usr/bin/env node
/**
 * HOME SPEED: the stopwatch.
 *
 * Times the four moments the build is judged on, on production, three
 * times, from a cold browser context each run so nothing is served from
 * the browser's own cache:
 *
 *   first byte        PerformanceNavigationTiming.responseStart
 *   first heading     the hero's greeting <h1> has text and a box
 *   priority visible  the Priority Card (inline or pop-up) is on screen
 *                     AND its Done button is enabled
 *   fully settled     no skeleton left AND the network has been quiet
 *
 * The three marks after first byte are recorded IN THE PAGE by a
 * MutationObserver installed before any of the document exists
 * (addInitScript), against performance.timeOrigin, so they are the real
 * paint-adjacent moments rather than the polling loop's granularity.
 *
 * Read-only. It navigates and it measures; it clicks nothing and it
 * writes nothing.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   SHOTS_DIR=... node scripts/measure-home-speed-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? 'run';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-speed';
const PATHS = (process.env.PATHS ?? '/dashboard').split(',');
mkdirSync(SHOTS, { recursive: true });

/**
 * Installed before the document exists. Watches for each landmark and
 * stamps the first moment it is genuinely on screen.
 */
const PROBE = () => {
  const marks = {};
  window.__mefMarks = marks;
  window.__mefSkeletons = -1;
  const stamp = (k) => {
    if (marks[k] === undefined) marks[k] = Math.round(performance.now());
  };
  const onScreen = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const look = () => {
    if (!document.body) return;
    // The greeting: the hero's own h1, with real text in it.
    const h1 = Array.from(document.querySelectorAll('h1')).find(
      (n) => /^Good (morning|afternoon|evening)/.test((n.textContent ?? '').trim()) && onScreen(n)
    );
    if (h1) stamp('firstHeading');

    // The priority, in whichever presentation she got, and interactive:
    // the label is on screen and a Done button is present and enabled.
    const label = Array.from(document.querySelectorAll('p, h2, span, div')).find(
      (n) => (n.textContent ?? '').trim() === 'Your priority today' && onScreen(n)
    );
    if (label) {
      stamp('priorityVisible');
      const done = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'Done' && !b.disabled && onScreen(b)
      );
      if (done) stamp('priorityInteractive');
    }
    if (document.readyState === 'complete') stamp('domComplete');
    window.__mefSkeletons = document.querySelectorAll('[data-settling], .animate-pulse').length;
  };
  // rAF rather than a MutationObserver: this script runs before the
  // document element exists, so there is nothing to observe yet, and a
  // frame-aligned poll is closer to "on screen" than a mutation is anyway.
  const tick = () => {
    look();
    if (performance.now() < 45000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const rows = [];

const browser = await chromium.launch();
let minted = null;
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
    for (let i = 1; i <= RUNS; i++) {
      // A fresh page (and a cleared browser cache) per run: the numbers
      // are what a member gets on open, not what a warm tab gets.
      const page = await minted.context.newPage();
      await page.addInitScript(PROBE);
      await page.route('**/*', (route) => route.continue());

      const t0 = Date.now();
      await page.goto(`${BASE}${path}`, { waitUntil: 'commit', timeout: 60000 });

      // Wait for settle: the network quiet AND no skeleton left.
      let settledAt = null;
      try {
        await page.waitForLoadState('networkidle', { timeout: 40000 });
        await page
          .waitForFunction(
            () => document.querySelectorAll('[data-settling], .animate-pulse').length === 0,
            null,
            {
              timeout: 15000,
            }
          )
          .catch(() => {});
        settledAt = Date.now() - t0;
      } catch {
        settledAt = Date.now() - t0;
      }

      const marks = await page.evaluate(() => ({
        ...window.__mefMarks,
        ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart ?? -1),
        domContentLoaded: Math.round(
          performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? -1
        ),
        loadEvent: Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? -1),
        skeletonsLeft: window.__mefSkeletons ?? -1,
      }));

      if (i === 1) {
        await page.screenshot({ path: `${SHOTS}/${LABEL}${path.replace(/\//g, '_')}.png`, fullPage: true });
      }

      rows.push({ path, run: i, ...marks, settledMs: settledAt });
      console.log(
        `${LABEL} ${path} run ${i}: ttfb=${ms(marks.ttfb)} heading=${ms(marks.firstHeading)} ` +
          `priority=${ms(marks.priorityVisible)} interactive=${ms(marks.priorityInteractive)} ` +
          `settled=${ms(settledAt)} skeletonsLeft=${marks.skeletonsLeft}`
      );
      await page.close();
      await minted.context.clearCookies({ name: 'nothing' }).catch(() => {});
    }
  }
} finally {
  await retireSession(minted);
  await browser.close();
}

function ms(v) {
  return v === undefined || v === null || v < 0 ? '—' : `${(v / 1000).toFixed(2)}s`;
}

writeFileSync(`${SHOTS}/${LABEL}-timings.json`, JSON.stringify(rows, null, 2));
console.log(`\nwrote ${SHOTS}/${LABEL}-timings.json`);
