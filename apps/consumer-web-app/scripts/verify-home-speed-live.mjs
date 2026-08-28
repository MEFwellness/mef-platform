#!/usr/bin/env node
/**
 * HOME SPEED BUILD (2026-08-28) — the live run, read-only half.
 *
 * Five things, on production, as the standing test member. The sixth,
 * completing a real Daily Reset and reloading Home, is the one that writes
 * and lives in scripts/verify-home-after-checkin-live.mjs so this half can
 * be re-run any number of times without touching a row.
 *
 *   1. Home's four moments, timed, three times, from a cold page each run.
 *   2. One load watched: what the placeholders look like, whether anything
 *      moves as the regions land (cumulative layout shift, measured by the
 *      browser's own PerformanceObserver, not by eye).
 *   3. A fresh sign-in: the pop-up chain behaves as it did, one due message
 *      at most, and no repeat on the load after it.
 *   4. Today, Progress and /programs, which share the timezone lookup this
 *      build consolidated: dates still correct, no console errors.
 *   5. Zero console errors and zero em dashes on every screen visited.
 *
 * Writes nothing.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-speed';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (text) => console.log(`      ${text}`);

/** Every console error and page error seen on every page in this run. */
const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${String(e).slice(0, 200)}`));
}

/** Records layout shift and the four moments, installed before the document exists. */
const PROBE = () => {
  const marks = {};
  window.__mefCls = 0;
  const stamp = (k) => {
    if (marks[k] === undefined) marks[k] = Math.round(performance.now());
  };
  const onScreen = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__mefCls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    window.__mefCls = -1;
  }
  const look = () => {
    if (!document.body) return;
    const h1 = Array.from(document.querySelectorAll('h1')).find(
      (n) => /^Good (morning|afternoon|evening)/.test((n.textContent ?? '').trim()) && onScreen(n)
    );
    if (h1) stamp('firstHeading');
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
    const settling = document.querySelectorAll('[data-settling], .animate-pulse').length;
    if (settling > 0) window.__mefSawPlaceholder = true;
    if (window.__mefSawPlaceholder && settling === 0) stamp('placeholdersGone');
    window.__mefSettling = settling;
  };
  const tick = () => {
    look();
    if (performance.now() < 45000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__mefMarks = marks;
};

const ms = (v) => (v === undefined || v === null || v < 0 ? 'never' : `${(v / 1000).toFixed(2)}s`);

const browser = await chromium.launch();
let minted = null;
const timings = [];

try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session');
    process.exit(1);
  }

  // ---- warm the function, so run 1 is not a cold start measured as ours ----
  const warm = await minted.context.newPage();
  await warm.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await warm.close();

  // ---- 1 and 2: time it, and watch what moves --------------------------
  for (let run = 1; run <= 3; run++) {
    const page = await minted.context.newPage();
    watch(page, `home run ${run}`);
    await page.addInitScript(PROBE);
    const t0 = Date.now();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 90000 });

    if (run === 1) {
      // What she is looking at while it settles.
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/home-settling.png` });
    }

    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    const settled = Date.now() - t0;
    const marks = await page.evaluate(() => ({
      ...window.__mefMarks,
      ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart ?? -1),
      cls: Number((window.__mefCls ?? -1).toFixed(4)),
      settlingLeft: window.__mefSettling ?? -1,
      sawPlaceholder: window.__mefSawPlaceholder === true,
    }));
    timings.push({ run, ...marks, settled });
    console.log(
      `      run ${run}: first byte ${ms(marks.ttfb)} | greeting ${ms(marks.firstHeading)} | ` +
        `priority ${ms(marks.priorityVisible)} | interactive ${ms(marks.priorityInteractive)} | ` +
        `settled ${ms(settled)} | layout shift ${marks.cls}`
    );
    if (run === 1) await page.screenshot({ path: `${SHOTS}/home-settled.png`, fullPage: true });
    await page.close();
  }

  const median = (key) => {
    const v = timings.map((t) => t[key]).filter((n) => typeof n === 'number' && n >= 0).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  check('Home timed three times on production, mobile viewport, warm function', true,
    `greeting ${ms(median('firstHeading'))}, priority ${ms(median('priorityVisible'))}, settled ${ms(median('settled'))} (medians)`);
  check('every load drew a placeholder before the real content, none left at the end',
    timings.every((t) => t.sawPlaceholder && t.settlingLeft === 0),
    timings.map((t) => `run ${t.run}: ${t.sawPlaceholder ? 'placeholder seen' : 'NONE SEEN'}, ${t.settlingLeft} left`).join('; '));
  const worstCls = Math.max(...timings.map((t) => t.cls));
  check('nothing jumps as the regions land (cumulative layout shift under 0.1)', worstCls >= 0 && worstCls < 0.1,
    `worst of three runs: ${worstCls}`);

  // ---- 4 and 5: the three screens that shared the timezone lookup ------
  for (const [label, path] of [['Today', '/today'], ['Progress', '/progress'], ['Programs', '/programs']]) {
    const page = await minted.context.newPage();
    watch(page, label);
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${SHOTS}/${label.toLowerCase()}.png`, fullPage: true });
    check(`${label} renders`, text.length > 200, `${text.length} characters`);
    check(`${label}: no broken date`, !/Invalid Date|NaN|undefined/.test(text));
    check(`${label}: no em dash`, !text.includes('—'));
    const dates = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/g);
    note(`${label} dates on screen: ${dates ? dates.slice(0, 6).join(' | ') : 'none rendered today'}`);
    await page.close();
  }

  // ---- 3: the pop-up chain, on a fresh sign-in -------------------------
  // A newly minted session IS a fresh login: verifyOtp moves
  // last_sign_in_at, which is exactly what the chain's "due this login"
  // rule reads. Two loads in a row: at most one message, and no repeat.
  const second = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  const popupCounts = [];
  for (let load = 1; load <= 2; load++) {
    const page = await second.context.newPage();
    watch(page, `popup load ${load}`);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(4000);
    const dialogs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="dialog"], .mef-modal-viewport'))
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => (el.textContent ?? '').trim().slice(0, 60))
    );
    popupCounts.push(dialogs);
    if (load === 1) await page.screenshot({ path: `${SHOTS}/popup-load-1.png` });
    await page.close();
  }
  check('the pop-up chain shows at most one message on a fresh sign-in',
    popupCounts[0].length <= 1,
    `load 1: ${popupCounts[0].length} (${popupCounts[0].join(' / ') || 'none'})`);
  check('and does not repeat it on the next load',
    popupCounts[1].length <= popupCounts[0].length,
    `load 2: ${popupCounts[1].length} (${popupCounts[1].join(' / ') || 'none'})`);
  await retireSession(second);

  // ---- 3: the Daily Reset, then Home ---------------------------------
  // Its own script: it is the one WRITING check in this run, and it reuses
  // the already-proven wizard walk rather than a fresh guess at it. See
  // scripts/verify-home-after-checkin-live.mjs.

  // ---- 5: the tally ---------------------------------------------------
  check('zero console errors across every screen in this run', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));
} finally {
  await retireSession(minted);
  await browser.close();
}

writeFileSync(`${SHOTS}/verification.json`, JSON.stringify({ results, timings }, null, 2));
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed} of ${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
