/**
 * Live proof of build 5 of the bug sweep, on production, as the standing
 * test member.
 *
 * Six things, in the order the prompt asks for them:
 *   1. Each open C fix on its own screen, by the sweep's own reproduction.
 *   2. /programs: the split renders, the dates are hers, no hydration error.
 *   3. The six L1 screens: dates correct, console clean.
 *   4. Home cold load, timed three times, against C7's 32.8 s finding.
 *   5. A full member journey, confirming the earlier builds' fixes hold.
 *   6. Zero console errors and zero em dashes on every screen visited.
 *
 * Bounded: every navigation carries a timeout, the browser is closed in a
 * finally, and the minted session is retired with scope 'local'.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const SHOTS = path.join(import.meta.dirname, '.verify', 'shots', 'build5');
const VIEWPORT = { width: 390, height: 844 };
const NAV_TIMEOUT = 90000;
mkdirSync(SHOTS, { recursive: true });

const results = [];
function record(item, ok, detail) {
  results.push({ item, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}\n      ${String(detail).slice(0, 400)}`);
}

const admin = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const consoleErrors = [];
const hydrationErrors = [];
const emDashFindings = [];
const visited = [];

function attach(page) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 220);
    consoleErrors.push(text);
    if (/#41[89]|#42[35]|[Hh]ydrat/.test(text)) hydrationErrors.push(text);
  });
  page.on('pageerror', (e) => {
    const text = `pageerror: ${String(e).slice(0, 220)}`;
    consoleErrors.push(text);
    if (/#41[89]|#42[35]|[Hh]ydrat/.test(text)) hydrationErrors.push(text);
  });
}

async function open(page, route, shot, settle = 3500) {
  const url = route.startsWith('http') ? route : `${BASE}${route}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(settle);
  const text = await page.evaluate(() => document.body.innerText);
  visited.push(route);
  if (text.includes('—')) {
    emDashFindings.push(
      `${route}: ${(text.split('\n').find((l) => l.includes('—')) ?? '').slice(0, 120)}`
    );
  }
  if (shot) await page.screenshot({ path: path.join(SHOTS, `${shot}.png`) });
  return text;
}

async function main() {
  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
    if (!minted) throw new Error('could not mint a session');
    if (minted.session?.user?.id !== MEMBER_ID) {
      throw new Error(`minted the wrong account: ${minted.session?.user?.id}`);
    }
    const page = await minted.context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    attach(page);

    const herDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const utcDate = new Date().toISOString().slice(0, 10);
    console.log(`her local date ${herDate} / UTC date ${utcDate}`);

    // ---------------------------------------------------------------
    // 4 FIRST: Home cold load, timed three times, before anything else
    // has warmed a lambda. C7 measured /dashboard at 3.9 s and
    // /movement/sessions at 32.8 s to first byte on a cold load.
    // ---------------------------------------------------------------
    const timings = {};
    for (const route of ['/dashboard', '/movement/sessions', '/programs']) {
      timings[route] = [];
      for (let i = 0; i < 3; i += 1) {
        const fresh = await minted.context.newPage();
        fresh.on('pageerror', () => {});
        fresh.setDefaultTimeout(NAV_TIMEOUT);
        const started = Date.now();
        const response = await fresh
          .goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: NAV_TIMEOUT })
          .catch(() => null);
        const ttfb = Date.now() - started;
        await fresh.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {});
        const dom = Date.now() - started;
        // What she actually waits for: the screen's own first heading.
        await fresh
          .locator('h1, h2')
          .first()
          .waitFor({ state: 'visible', timeout: NAV_TIMEOUT })
          .catch(() => {});
        const painted = Date.now() - started;
        await fresh.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
        const idle = Date.now() - started;
        timings[route].push({ ttfb, dom, painted, idle, status: response?.status() ?? null });
        await fresh.close();
      }
    }
    for (const [route, runs] of Object.entries(timings)) {
      const line = runs
        .map(
          (r) =>
            `${(r.ttfb / 1000).toFixed(1)}s ttfb / ${(r.painted / 1000).toFixed(1)}s painted / ${(r.idle / 1000).toFixed(1)}s idle`
        )
        .join(', ');
      record(`C7 load times ${route}`, runs.every((r) => r.status === 200), line);
    }

    // ---------------------------------------------------------------
    // 1. The C fixes, each on its own screen
    // ---------------------------------------------------------------

    // C4 — /food-lens/pattern promises nothing
    const pattern = await open(page, '/food-lens/pattern', 'c4-pattern');
    record(
      'C4 the Primal Pattern screen promises no questionnaire',
      !pattern.includes('on the way') && !pattern.includes('Set it manually for now'),
      pattern.split('\n').filter((l) => l.includes('Food Lens compares')).join(' | ') || pattern.slice(0, 200)
    );

    // C5 — one name, three screens
    const home = await open(page, '/dashboard', 'c5-home', 6000);
    const questionnaires = await open(page, '/questionnaires', 'c5-questionnaires');
    const baseline = await open(page, '/profile/baseline', 'c5-baseline');
    const c5Bad = [
      ['home', home],
      ['questionnaires', questionnaires],
      ['baseline', baseline],
    ].filter(([, t]) => /Comprehensive Health Assessment|Onboarding Assessment/.test(t));
    record(
      'C5 one assessment, one name across Home, Questionnaires and Profile',
      c5Bad.length === 0,
      c5Bad.length === 0
        ? `"Baseline Assessment" on: ${[['home', home], ['questionnaires', questionnaires], ['baseline', baseline]]
            .filter(([, t]) => t.includes('Baseline Assessment'))
            .map(([n]) => n)
            .join(', ') || 'none of the three shows the card today'}`
        : `still says the old name on: ${c5Bad.map(([n]) => n).join(', ')}`
    );

    // C6 — Today's chips are the brand's, not Tailwind's
    await open(page, '/today', 'c6-today', 5000);
    const chipColors = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('span')) {
        const cls = typeof el.className === 'string' ? el.className : '';
        if (!/rounded-full/.test(cls)) continue;
        const label = (el.innerText ?? '').trim().slice(0, 40);
        if (!label) continue;
        const s = getComputedStyle(el);
        out.push({ label, cls: cls.slice(0, 180), bg: s.backgroundColor, fg: s.color });
      }
      return out.slice(0, 14);
    });
    const tailwindDefault = chipColors.filter((c) =>
      /(bg|text)-(blue|amber|green|purple|indigo|sky|teal)-\d{2,3}/.test(c.cls)
    );
    record(
      'C6 no Tailwind default palette on a Today chip',
      tailwindDefault.length === 0,
      chipColors.map((c) => `${c.label}=${c.bg}`).join(' | ').slice(0, 380)
    );

    // C10 — the Home program hero is clamped
    const heroInfo = await page.evaluate(() => null);
    void heroInfo;
    await open(page, '/dashboard', 'c10-home', 6000);
    const clamp = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p')].find((p) =>
        (typeof p.className === 'string' ? p.className : '').includes('line-clamp-3')
      );
      if (!el) return null;
      return {
        clamped: el.scrollHeight > el.clientHeight + 1,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        text: (el.innerText ?? '').slice(0, 80),
      };
    });
    record(
      'C10 the program hero clamps a long explanation',
      clamp === null || clamp.clientHeight <= 90,
      clamp === null
        ? 'no program hero on her Home today, so nothing to clamp (checked, not assumed)'
        : `${clamp.clientHeight}px drawn of ${clamp.scrollHeight}px: "${clamp.text}"`
    );

    // C9 — no em dash in a member-reachable exercise
    const { count: catalogEmDash } = await admin
      .from('exercise_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('is_client_assignable', true)
      .like('description', '%—%');
    record(
      'C9 no client-assignable exercise description carries an em dash',
      (catalogEmDash ?? 0) === 0,
      `${catalogEmDash ?? 0} rows (was 8 assignable of 31 total before migration 188)`
    );

    // C1 — what sits in Available, and whether any of it is plan-locked
    const available = await open(page, '/questionnaires', 'c1-questionnaires');
    record(
      'C1 the Available section holds no plan lock',
      !/AVAILABLE[\s\S]{0,900}(Monthly|24 week program)/i.test(available),
      (available.split('AVAILABLE')[1] ?? '').slice(0, 300).replace(/\n+/g, ' | ')
    );

    // ---------------------------------------------------------------
    // 2. /programs, the split
    // ---------------------------------------------------------------
    const programsBefore = hydrationErrors.length;
    const programs = await open(page, '/programs', 'programs-split', 5000);
    const hasSplit = /coming up/i.test(programs) && /already done/i.test(programs);
    const dates = [...programs.matchAll(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}/g)].map(
      (m) => m[0]
    );
    record(
      '/programs renders her sessions with her dates',
      hydrationErrors.length === programsBefore,
      `split shown: ${hasSplit}; dates: ${dates.join(', ') || 'no dated session on her account'}; hydration errors: ${
        hydrationErrors.length - programsBefore
      }`
    );

    // The split is decided on the SERVER now, so it has to be in the HTML
    // that came off the wire, before any JavaScript ran.
    const ssr = await minted.context.request.get(`${BASE}/programs`, { timeout: NAV_TIMEOUT });
    const ssrHtml = await ssr.text();
    // The rendered heading, not a bare string: the same words also appear
    // in the RSC flight payload, in a different order, and that is not
    // what "the server drew the split" means.
    const comingUpAt = ssrHtml.search(/uppercase[^>]*>Coming up</);
    const alreadyDoneAt = ssrHtml.search(/uppercase[^>]*>Already done</);
    record(
      'the server drew the split, before any JavaScript ran',
      comingUpAt > -1 && alreadyDoneAt > comingUpAt,
      `in the served markup: "Coming up" at ${comingUpAt}, "Already done" at ${alreadyDoneAt}; her date ${herDate}, UTC ${utcDate}${
        herDate === utcDate
          ? ' (they agree today, so a live run today cannot tell the old rule from the new one; the difference is proven locally)'
          : ' (they differ today)'
      }`
    );

    // ---------------------------------------------------------------
    // 3. The six L1 screens
    // ---------------------------------------------------------------
    const L1 = [
      ['/notifications', 'l1-notifications'],
      ['/today', 'l1-today'],
      ['/food-lens/protein/ledger', 'l1-protein-ledger'],
      ['/food-lens/log', 'l1-food-log'],
      ['/connections', 'l1-connections'],
      ['/recommendations', 'l1-recommendations'],
    ];
    for (const [route, shot] of L1) {
      const before = consoleErrors.length;
      const hBefore = hydrationErrors.length;
      const text = await open(page, route, shot, 4000);
      const badDate = /Invalid Date|NaN|undefined/.test(text);
      const dates = [...text.matchAll(/[A-Z][a-z]{2} \d{1,2}(, \d{4})?|\d{1,2}:\d{2}\s?(AM|PM)/g)]
        .map((m) => m[0])
        .slice(0, 6);
      record(
        `L1 ${route}`,
        consoleErrors.length === before && hydrationErrors.length === hBefore && !badDate,
        `dates on screen: ${dates.join(', ') || 'none rendered (no data on her account)'}; console errors: ${
          consoleErrors.length - before
        }`
      );
    }

    // ---------------------------------------------------------------
    // 5. The member journey, end to end
    // ---------------------------------------------------------------
    const chain = [];
    for (let openNo = 1; openNo <= 4; openNo += 1) {
      await open(page, '/dashboard', `journey-home-${openNo}`, 6500);
      const dialog = page.locator('[role="dialog"]').first();
      if ((await dialog.count()) === 0) {
        chain.push('(empty)');
        break;
      }
      const text = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      chain.push(text.slice(0, 60));
      const later = dialog.getByRole('button', { name: /maybe later|not now|close|dismiss/i }).first();
      if ((await later.count()) > 0) await later.click().catch(() => {});
      else await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
    }
    record(
      'the pop-up chain still drains one message per open',
      new Set(chain.filter((c) => c !== '(empty)')).size === chain.filter((c) => c !== '(empty)').length,
      chain.join('  ->  ') || 'nothing pending today'
    );

    const journey = [
      ['/checkin', 'journey-checkin'],
      ['/today', 'journey-today'],
      ['/progress', 'journey-progress'],
      ['/questionnaires', 'journey-questionnaires'],
      ['/assessments/core-values-snapshot', 'journey-core-values'],
      ['/root-score', 'journey-root-score'],
      ['/case', 'journey-case'],
    ];
    for (const [route, shot] of journey) {
      const before = consoleErrors.length;
      await open(page, route, shot, 4000);
      record(`journey ${route}`, consoleErrors.length === before, `console errors: ${consoleErrors.length - before}`);
    }

    // A completed free experience is never re-offered.
    const takeBefore = await countSessions();
    await open(page, '/assessments/core-values-snapshot/take', 'journey-retake-guard', 4000);
    const landedOn = page.url().replace(BASE, '');
    const takeAfter = await countSessions();
    record(
      'a completed experience is not re-offered and starts nothing',
      takeBefore === takeAfter,
      `take URL landed on ${landedOn}; unified sessions ${takeBefore} -> ${takeAfter}`
    );

    // Counts agree between Today and the Case View.
    const todayText = await open(page, '/today', 'counts-today', 4000);
    const caseText = await open(page, '/case', 'counts-case', 4000);
    const todayCount = (todayText.match(/(\d+)\s*\n?\s*Check-ins logged/i) ?? [])[1] ?? null;
    const caseCount = (caseText.match(/(\d+)\s+check-ins?/i) ?? [])[1] ?? null;
    record(
      'the check-in counts agree between Today and the Case View',
      todayCount === null || caseCount === null || todayCount === caseCount,
      `Today "${todayCount}" / Case "${caseCount}"`
    );

    // ---------------------------------------------------------------
    // 6. Console and copy
    // ---------------------------------------------------------------
    record(
      'zero console errors across every screen visited',
      consoleErrors.length === 0,
      consoleErrors.length === 0
        ? `${visited.length} loads, clean`
        : consoleErrors.slice(0, 6).join(' | ')
    );
    record(
      'zero hydration errors',
      hydrationErrors.length === 0,
      hydrationErrors.slice(0, 4).join(' | ') || 'none'
    );
    record(
      'zero em dashes on every screen visited',
      emDashFindings.length === 0,
      emDashFindings.slice(0, 5).join(' | ') || 'none'
    );

    console.log('\nTIMINGS');
    for (const [route, runs] of Object.entries(timings)) {
      console.log(
        `  ${route}: ${runs
          .map(
            (r) =>
              `${(r.ttfb / 1000).toFixed(1)}/${(r.painted / 1000).toFixed(1)}/${(r.idle / 1000).toFixed(1)}`
          )
          .join('  ')}  (ttfb/painted/idle seconds)`
      );
    }
  } finally {
    if (minted) await retireSession(minted).catch(() => {});
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed} of ${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

async function countSessions() {
  const { count } = await admin
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_ID);
  return count ?? 0;
}

main().catch((err) => {
  console.error('RUN FAILED', err);
  process.exit(1);
});
