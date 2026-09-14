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
 *   widget mounted    when Cloudflare's own element and its response
 *                     field are in the container: the moment the app has
 *                     done all it can and the challenge is Cloudflare's
 *                     to run. This is the number this app owns.
 *   visible challenge when Cloudflare decides to show the member
 *                     something, which in this mode is usually never
 *
 * A token itself is deliberately not the pass mark: Turnstile correctly
 * refuses to clear a headless browser silently, so no automated run will
 * ever be handed one, and CLAUDE.md says never to report that as a
 * failure. "Widget mounted" is the part this app controls.
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
// Which auth screen to measure. Both carry the same widget and the same
// submit budget, so the same probe answers for either.
const PATH = process.env.MEASURE_PATH ?? '/login';
const THROTTLE = process.env.THROTTLE !== '0';
const CF = 'challenges.cloudflare.com';

const PROBE = () => {
  const t = {};
  window.__mef = t;
  const mark = (k) => {
    if (t[k] === undefined) t[k] = Math.round(performance.now());
  };
  mark('probeInstalled');
  /*
   * WHAT "LIVE" CAN HONESTLY MEAN HERE (rewritten 2026-09-13).
   *
   * This probe used to wait for Cloudflare's own iframe in the light DOM
   * and report CHALLENGE LIVE = NEVER on every run, on a login page whose
   * challenge was demonstrably running: the whole
   * `cdn-cgi/challenge-platform` exchange was in the network log. In the
   * mode this app uses, Cloudflare renders no iframe at all unless it
   * decides to show the member something, so the thing being waited for
   * usually does not exist. A check that can only fail is worse than none.
   *
   * So two marks, and the difference between them is the whole point:
   *
   *   widgetMounted   Cloudflare's own element and its
   *                   `cf-turnstile-response` field are in the container,
   *                   which is the moment the app has done everything it
   *                   can and the challenge is Cloudflare's to run. THIS
   *                   is the number this app owns.
   *   visibleChallenge  an iframe, in the light DOM or inside an open
   *                   shadow root, which only appears when Cloudflare
   *                   decides to ask the member something.
   *
   * A TOKEN IS DELIBERATELY NOT MEASURED. Turnstile refuses to clear an
   * automated browser, so no run will ever be handed one, and CLAUDE.md
   * says never to report that as a failure. Confirmed again on this
   * deployment: `turnstile.getResponse()` stays undefined for as long as a
   * headless run watches it.
   */
  const findFrame = (root, depth) => {
    if (!root || depth > 4) return null;
    const direct = root.querySelector?.('iframe[src*="challenges.cloudflare.com"]');
    if (direct) return direct;
    for (const el of root.querySelectorAll?.('*') ?? []) {
      if (el.shadowRoot) {
        const inner = findFrame(el.shadowRoot, depth + 1);
        if (inner) return inner;
      }
    }
    return null;
  };
  const look = () => {
    const container = document.querySelector('[data-testid="turnstile-gate"]');
    if (container?.querySelector('input[name="cf-turnstile-response"]')) mark('widgetMounted');
    if (findFrame(document, 0)) mark('visibleChallenge');
  };
  // A poll, not only a MutationObserver: a shadow root's own contents never
  // surface through an observer on the host document.
  const poll = setInterval(() => {
    look();
    if (performance.now() > 25000) clearInterval(poll);
  }, 100);
  const observer = new MutationObserver(look);
  const start = () => {
    look();
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

  await page.goto(`${BASE}${PATH}`, { waitUntil: 'commit', timeout: 60000 });
  await page
    .waitForFunction(() => window.__mef && window.__mef.widgetMounted !== undefined, null, {
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
      `WIDGET MOUNTED=${r.widgetMounted ?? 'NEVER'}ms  ` +
      `visibleChallenge=${r.visibleChallenge ?? 'none (Cloudflare asked nothing)'}`
  );
}

function stat(key) {
  const v = rows.map((r) => r[key]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return 'none';
  return `min ${v[0]} / median ${v[Math.floor(v.length / 2)]} / max ${v[v.length - 1]} ms  (${v.length}/${RUNS})`;
}
console.log(`\ncf script requested : ${stat('cfScriptStart')}`);
console.log(`cf script in hand   : ${stat('cfScriptEnd')}`);
console.log(`widget mounted      : ${stat('widgetMounted')}`);
console.log(`visible challenge   : ${stat('visibleChallenge')}`);
console.log(
  `\nThe app waits TOKEN_WAIT_MS from her tap. Every millisecond before the widget is mounted is a\n` +
    `millisecond of that budget spent before Cloudflare can even begin, which is the part this app owns.\n` +
    `How long Cloudflare then takes, and whether it clears at all, is not measurable from automation:\n` +
    `Turnstile refuses an automated browser by design (CLAUDE.md), so a token is never expected here.`
);
