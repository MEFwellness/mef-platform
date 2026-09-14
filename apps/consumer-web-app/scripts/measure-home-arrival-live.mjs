#!/usr/bin/env node
/**
 * HOME, ARRIVING: WHEN EACH BAND LANDS, AND WHETHER ANYTHING MOVES.
 *
 * measure-home-speed-live.mjs answers "how long until it is there". This
 * answers the two questions the skeleton build is judged on:
 *
 *   WHEN does each band of the page arrive (the hero's greeting, the Quick
 *   Actions row, Assigned to You, the program card, the lower sections),
 *   so a slow region can be named rather than guessed at;
 *
 *   DOES ANYTHING MOVE when it does. Layout shift is measured the way the
 *   browser measures it (PerformanceObserver, 'layout-shift'), plus the top
 *   offset of three landmarks sampled every frame, so a band that slides
 *   down when its neighbour lands is caught even if its own score is small.
 *
 * ENTRY_COOKIE=1 reproduces the POST-LOGIN arrival rather than an ordinary
 * open: it sets the one-shot mef_entry_login token signIn() sets, which is
 * what makes the branded Reset splash play. That is the only way to see the
 * real thing a member sees after tapping "Log in" without the login form,
 * which bot protection correctly refuses to a script.
 *
 * READ ONLY. It navigates, watches and screenshots.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   THROTTLE=1 ENTRY_COOKIE=1 node scripts/measure-home-arrival-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 3);
const LABEL = process.env.LABEL ?? 'run';
const WIDTH = Number(process.env.WIDTH ?? 390);
const THROTTLE = process.env.THROTTLE === '1';
const ENTRY = process.env.ENTRY_COOKIE === '1';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-arrival';
mkdirSync(SHOTS, { recursive: true });

/**
 * Installed before the document exists. Every mark is stamped the first
 * frame the thing is genuinely on screen, against the navigation's own
 * time origin.
 */
const PROBE = () => {
  const marks = {};
  window.__m = marks;
  window.__cls = 0;
  window.__shifts = [];
  window.__tracks = { quickRow: [], assigned: [], program: [] };
  const stamp = (k) => {
    if (marks[k] === undefined) marks[k] = Math.round(performance.now());
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__cls += entry.value;
        if (entry.value > 0.001) {
          window.__shifts.push({ at: Math.round(entry.startTime), value: Number(entry.value.toFixed(4)) });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* older engines: the sampled offsets below still answer the question */
  }
  const onScreen = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textIs = (needle) =>
    Array.from(document.querySelectorAll('p, h1, h2, h3, span')).find(
      (n) => (n.textContent ?? '').trim() === needle && onScreen(n)
    );
  const track = (key, el) => {
    if (!el) return;
    const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
    const list = window.__tracks[key];
    const last = list[list.length - 1];
    if (!last || last.top !== top) list.push({ at: Math.round(performance.now()), top });
  };
  const look = () => {
    if (!document.body) return;
    if (document.querySelector('[data-settling]')) stamp('firstSkeleton');
    // The splash the branded entry animation draws, when it is playing.
    const splash = document.querySelector('.fixed.inset-0.z-\\[999\\]');
    if (splash && onScreen(splash)) stamp('splashVisible');
    else if (marks.splashVisible !== undefined) stamp('splashGone');

    const h1 = Array.from(document.querySelectorAll('h1')).find(
      (n) => /^Good (morning|afternoon|evening)/.test((n.textContent ?? '').trim()) && onScreen(n)
    );
    if (h1) stamp('greeting');

    const quickLabel = textIs('Quick Actions');
    if (quickLabel) stamp('quickActionsLabel');
    const tiles = document.querySelectorAll('.mef-home-quick-tile');
    if (tiles.length > 0) {
      stamp('quickActionsTiles');
      track('quickRow', tiles[0]);
    }
    const assigned = textIs('Assigned to You');
    if (assigned) {
      stamp('assignedSection');
      track('assigned', assigned);
    }
    const program = document.querySelector('.mef-home-program, [data-home-program]');
    if (program && onScreen(program)) {
      stamp('programCard');
      track('program', program);
    }
    const today = textIs('Today');
    if (today) stamp('todayZone');
    if (document.querySelectorAll('[data-settling]').length === 0 && marks.firstSkeleton !== undefined) {
      stamp('noSkeletonsLeft');
    }
    window.__left = document.querySelectorAll('[data-settling]').length;
  };
  const tick = () => {
    look();
    if (performance.now() < 45000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const ms = (v) => (v === undefined || v === null || v < 0 ? '—' : `${(v / 1000).toFixed(2)}s`);
const rows = [];

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: WIDTH, height: 844 },
  });
  if (!minted) {
    console.error('could not mint a session');
    process.exit(1);
  }

  for (let i = 1; i <= RUNS; i++) {
    if (ENTRY) {
      // Exactly what signIn() sets on a successful password login: a
      // one-shot random token, not httpOnly, path '/'.
      await minted.context.addCookies([
        {
          name: 'mef_entry_login',
          value: randomUUID(),
          domain: new URL(BASE).hostname,
          path: '/',
          httpOnly: false,
          sameSite: 'Lax',
        },
      ]);
    }
    const page = await minted.context.newPage();
    if (THROTTLE) {
      const cdp = await minted.context.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
        latency: 150,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(PROBE);
    const t0 = Date.now();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 60000 });
    await page
      .waitForFunction(() => document.querySelectorAll('[data-settling]').length === 0, null, {
        timeout: 40000,
      })
      .catch(() => {});
    const settled = Date.now() - t0;
    const out = await page.evaluate(() => ({
      ...window.__m,
      cls: Number((window.__cls ?? 0).toFixed(4)),
      shifts: window.__shifts ?? [],
      tracks: window.__tracks,
      left: window.__left,
      ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart ?? -1),
    }));
    rows.push({ run: i, settled, ...out });
    console.log(
      `${LABEL} run ${i}: ttfb=${ms(out.ttfb)} splash=${ms(out.splashVisible)}..${ms(out.splashGone)} ` +
        `greeting=${ms(out.greeting)} tiles=${ms(out.quickActionsTiles)} assigned=${ms(out.assignedSection)} ` +
        `today=${ms(out.todayZone)} noSkeleton=${ms(out.noSkeletonsLeft)} settled=${ms(settled)} CLS=${out.cls}`
    );
    for (const s of out.shifts) console.log(`    shift at ${ms(s.at)} value ${s.value}`);
    for (const [key, list] of Object.entries(out.tracks)) {
      if (list.length > 1) {
        console.log(
          `    ${key} moved: ${list.map((p) => `${ms(p.at)}@${p.top}px`).join(' -> ')}`
        );
      }
    }
    if (i === 1) await page.screenshot({ path: `${SHOTS}/${LABEL}-${WIDTH}.png`, fullPage: true });
    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close();
}

writeFileSync(`${SHOTS}/${LABEL}-arrival.json`, JSON.stringify(rows, null, 2));
const clsVals = rows.map((r) => r.cls).sort((a, b) => a - b);
console.log(`\nmedian CLS ${clsVals[Math.floor(clsVals.length / 2)]}`);
console.log(`wrote ${SHOTS}/${LABEL}-arrival.json`);
