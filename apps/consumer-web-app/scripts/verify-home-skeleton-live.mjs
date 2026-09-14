#!/usr/bin/env node
/**
 * DOES HOME'S SKELETON HOLD THE SHAPE HOME ACTUALLY ARRIVES IN?
 *
 * A skeleton is not decoration. Its whole job is that the screen does not
 * move when the real thing lands, and the only way to know is to measure
 * the same landmarks twice: once while the placeholders are on screen, once
 * when the page has settled, and subtract.
 *
 * HOW IT CATCHES THE SKELETON. The route-level skeleton
 * (app/dashboard/loading.tsx) is what Next shows while the destination
 * renders, so this reaches Home the way a member does from inside the app:
 * it opens another screen, throttles the connection hard, taps Home, and
 * samples the DOM on the very next frames. Then it lets the page settle and
 * samples again.
 *
 * WHAT IT COMPARES
 *   hero band height      the full-bleed band the greeting sits in
 *   each child of <main>  top offset and height, in order, which is the
 *                         one measurement that answers "did the bands move"
 *   layout shift          the browser's own 'layout-shift' entries, and the
 *                         CLS they add up to
 *   skeleton inventory    that the placeholders were genuinely on screen,
 *                         so a run cannot pass by never seeing one
 *
 * READ ONLY apart from one tap on the Home link, which is a navigation.
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   node scripts/verify-home-skeleton-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const RUNS = Number(process.env.RUNS ?? 3);
const WIDTH = Number(process.env.WIDTH ?? 390);
const LABEL = process.env.LABEL ?? 'run';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-home-skeleton';
/** How much slower than the measured band shift is allowed to be called "it did not move". */
const TOLERANCE_PX = Number(process.env.TOLERANCE_PX ?? 8);
mkdirSync(SHOTS, { recursive: true });

const SAMPLE = () => {
  const main = document.querySelector('main');
  const hero = document.querySelector('section');
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
  };
  return {
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    bands: main ? Array.from(main.children).map(rect) : [],
    settling: document.querySelectorAll('[data-settling]').length,
    tiles: document.querySelectorAll('.mef-home-quick-tile').length,
    docHeight: Math.round(document.documentElement.scrollHeight),
    cls: Number((window.__cls ?? 0).toFixed(4)),
    shifts: window.__shifts ?? [],
  };
};

const OBSERVE = () => {
  window.__cls = 0;
  window.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__cls += entry.value;
        if (entry.value > 0.0005) {
          window.__shifts.push({
            at: Math.round(entry.startTime),
            value: Number(entry.value.toFixed(4)),
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* the band comparison below still answers the question */
  }
};

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL ${message}`);
};
const pass = (message) => console.log(`  ok   ${message}`);

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

  for (let run = 1; run <= RUNS; run++) {
    console.log(`\n=== run ${run} at ${WIDTH}px ===`);
    const page = await minted.context.newPage();
    await page.addInitScript(OBSERVE);
    // Start somewhere else in the app so tapping Home is a real in-app
    // navigation, which is what makes Next show the route skeleton.
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page
      .waitForFunction(() => document.querySelectorAll('[data-settling]').length === 0, null, {
        timeout: 30000,
      })
      .catch(() => {});

    // Throttle hard only now, so the skeleton is on screen long enough to
    // be sampled rather than gone in one frame.
    const cdp = await minted.context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });

    const home = page.locator('a[href="/dashboard"]').first();
    await home.click({ timeout: 15000 });

    // The first moment the skeleton is genuinely up.
    let skeleton = null;
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-settling]').length > 0 && document.querySelector('main'),
        null,
        { timeout: 15000 }
      );
      skeleton = await page.evaluate(SAMPLE);
      await page.screenshot({ path: `${SHOTS}/${LABEL}-${WIDTH}-run${run}-skeleton.png` });
    } catch {
      fail('never caught a skeleton at all, so this run measured nothing');
      await page.close();
      continue;
    }

    // Back to a normal connection and let it settle.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    await page
      .waitForFunction(() => document.querySelectorAll('[data-settling]').length === 0, null, {
        timeout: 40000,
      })
      .catch(() => {});
    await page.waitForTimeout(600);
    const settled = await page.evaluate(SAMPLE);
    await page.screenshot({ path: `${SHOTS}/${LABEL}-${WIDTH}-run${run}-settled.png` });

    console.log(
      `  skeleton: hero=${skeleton.heroHeight}px bands=${skeleton.bands.length} settling=${skeleton.settling} tiles=${skeleton.tiles}`
    );
    console.log(
      `  settled:  hero=${settled.heroHeight}px bands=${settled.bands.length} settling=${settled.settling} tiles=${settled.tiles} CLS=${settled.cls}`
    );
    for (const s of settled.shifts) console.log(`    shift at ${s.at}ms value ${s.value}`);

    if (skeleton.settling === 0) fail('the sample caught no placeholder');
    else pass(`${skeleton.settling} placeholders were on screen`);

    if (skeleton.heroHeight !== settled.heroHeight) {
      fail(`the hero band changed height: ${skeleton.heroHeight}px then ${settled.heroHeight}px`);
    } else {
      pass(`the hero band is ${settled.heroHeight}px in both states`);
    }

    // The bands of <main>, in order, as far as the two states are
    // comparable. The skeleton draws four blocks (one per streaming
    // region); the settled page draws eleven, because the day frame
    // returns its sections as siblings rather than wrapped in one div. So
    // the first two are the same objects in both states (the Quick Actions
    // row, then the block under it) and past that the comparison would be
    // measuring different things. The first two are also the whole of the
    // first screenful, which is the part a member is looking at.
    const COMPARABLE_BANDS = 2;
    const count = Math.min(skeleton.bands.length, settled.bands.length, COMPARABLE_BANDS);
    for (let i = 0; i < count; i++) {
      const a = skeleton.bands[i];
      const b = settled.bands[i];
      const moved = Math.abs(a.top - b.top);
      if (moved > TOLERANCE_PX) {
        fail(`band ${i + 1} moved ${moved}px (${a.top} then ${b.top}), height ${a.height} then ${b.height}`);
      } else {
        pass(`band ${i + 1} held its position (${a.top} then ${b.top}, ${moved}px), height ${a.height} then ${b.height}`);
      }
    }
    console.log(
      `  (the skeleton drew ${skeleton.bands.length} bands, the settled page ${settled.bands.length}; ` +
        `the first ${count} are the same objects in both and are what is compared above)`
    );
    if (settled.cls > 0.05) fail(`layout shift is ${settled.cls}, which a member can see`);
    else pass(`layout shift ${settled.cls}`);

    await page.close();
  }
} finally {
  await retireSession(minted);
  await browser.close();
}

console.log(failures === 0 ? '\nPASS' : `\nFAIL: ${failures} problems`);
process.exitCode = failures === 0 ? 0 : 1;
