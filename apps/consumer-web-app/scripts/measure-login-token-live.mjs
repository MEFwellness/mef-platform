#!/usr/bin/env node
/**
 * HOW SOON CAN THE LOGIN SCREEN'S BOT CHECK ACTUALLY START?
 *
 * WHY THIS NUMBER IS THE LOGIN BUG. lib/turnstile/tokenLifecycle.ts waits
 * TOKEN_WAIT_MS for a token, submits without one when none arrives,
 * Supabase refuses the request, lib/turnstile/submit.ts tries once more,
 * and if that also arrives empty the member reads "We could not confirm
 * that in time. Please try again." with a correct email and password in
 * front of her. So every millisecond between opening /login and the
 * challenge being live is a millisecond of that budget already spent
 * before she has typed anything.
 *
 * WHAT IT MEASURES, on a throttled phone profile (Fast 3G, 4x CPU), from
 * a cold context each run:
 *
 *   ttfb              PerformanceNavigationTiming.responseStart
 *   domInteractive    the document is parsed
 *   cf script start   when the browser first ASKS for Cloudflare's api.js
 *   cf script end     when it has it
 *   challenge live    when Cloudflare's own iframe is in the container,
 *                     which is the first moment a token can be solved
 *
 * A token itself is deliberately not the pass mark: Turnstile correctly
 * refuses to clear a headless browser silently, so no automated run will
 * ever be handed one, and CLAUDE.md says never to report that as a
 * failure. "Challenge live" is the part this app controls.
 *
 * Read only. It navigates and it watches. It submits nothing and it
 * writes nothing.
 *
 *   RUNS=5 node scripts/measure-login-token-live.mjs
 *   BASE_URL=http://localhost:3000 THROTTLE=0 node scripts/...
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const RUNS = Number(process.env.RUNS ?? 5);
const THROTTLE = process.env.THROTTLE !== '0';
const CF = 'challenges.cloudflare.com';

const PROBE = () => {
  const t = {};
  window.__mef = t;
  const mark = (k) => {
    if (t[k] === undefined) t[k] = Math.round(performance.now());
  };
  mark('probeInstalled');
  // The challenge is genuinely live the moment Cloudflare's own iframe is
  // in the document. Watching the DOM rather than wrapping turnstile.render
  // avoids racing the app's own call to it.
  const seen = () =>
    document.querySelector('iframe[src*="challenges.cloudflare.com"]') !== null;
  const observer = new MutationObserver(() => {
    if (seen()) {
      mark('challengeLive');
      observer.disconnect();
    }
  });
  const start = () => {
    if (seen()) return mark('challengeLive');
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
  document.addEventListener('DOMContentLoaded', () => mark('domContentLoaded'));
  window.addEventListener('load', () => mark('windowLoad'));
};

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  await context.addInitScript(PROBE);
  const page = await context.newPage();

  if (THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 60000 });
  await page
    .waitForFunction(() => window.__mef && window.__mef.challengeLive !== undefined, null, {
      timeout: 25000,
    })
    .catch(() => {});
  // Settle so the resource entry for api.js has landed either way.
  await page.waitForLoadState('load', { timeout: 25000 }).catch(() => {});

  const out = await page.evaluate((cf) => {
    const n = performance.getEntriesByType('navigation')[0];
    const s = performance
      .getEntriesByType('resource')
      .find((r) => r.name.includes(cf) && r.name.includes('api.js'));
    return {
      ttfb: n ? Math.round(n.responseStart) : null,
      domInteractive: n ? Math.round(n.domInteractive) : null,
      cfScriptStart: s ? Math.round(s.startTime) : null,
      cfScriptEnd: s ? Math.round(s.responseEnd) : null,
      ...window.__mef,
    };
  }, CF);

  await browser.close();
  return out;
}

const rows = [];
for (let i = 1; i <= RUNS; i++) {
  const r = await run();
  rows.push(r);
  console.log(
    `run ${i}  ttfb=${r.ttfb}ms  domInteractive=${r.domInteractive}ms  ` +
      `cfScript=${r.cfScriptStart ?? '-'}..${r.cfScriptEnd ?? '-'}ms  ` +
      `CHALLENGE LIVE=${r.challengeLive ?? 'NEVER'}ms`
  );
}

function stat(key) {
  const v = rows.map((r) => r[key]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return 'none';
  return `min ${v[0]} / median ${v[Math.floor(v.length / 2)]} / max ${v[v.length - 1]} ms  (${v.length}/${RUNS})`;
}
console.log(`\ncf script requested : ${stat('cfScriptStart')}`);
console.log(`cf script in hand   : ${stat('cfScriptEnd')}`);
console.log(`challenge live      : ${stat('challengeLive')}`);
console.log(
  `\nThe app waits 8000ms from her tap. A challenge that only goes live at N ms has already\n` +
    `spent N ms of a real member's patience before she can even reach the button.`
);
