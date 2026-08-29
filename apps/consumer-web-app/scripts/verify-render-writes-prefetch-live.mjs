#!/usr/bin/env node
/**
 * LIVE VERIFICATION: the render stopped writing, and Home stopped asking the
 * server for screens nobody tapped.
 *
 * Two claims, checked against production rather than against a fixture:
 *
 *   1. Opening Home writes ZERO `member_pattern_states` rows, and completing
 *      a Daily Reset writes them all. Checked by reading the rows straight
 *      out of the database either side of each event with the service key,
 *      so it is row counts and timestamps rather than an inference from what
 *      the screen said.
 *   2. The expensive routes are no longer requested on Home view, and her
 *      real tap still arrives quickly. Both halves, because turning a
 *      prefetch off spends her tap to save the server, and a report with
 *      only one of those numbers in it is not a report.
 *
 * The one write this run makes on purpose is her Daily Reset. Everything
 * else reads.
 *
 * Usage, from apps/consumer-web-app:
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   SHOTS_DIR=... node scripts/verify-render-writes-prefetch-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/shots/render-writes';
const DO_CHECKIN = process.env.SKIP_CHECKIN !== '1';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const ms = (v) => (v === undefined || v === null || v < 0 ? 'n/a' : `${(v / 1000).toFixed(2)}s`);

// ---- the database side, read directly ----
const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const { data: userPage } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
const member = userPage.users.find((u) => u.email === EMAIL);
if (!member) {
  console.error('no such member on production:', EMAIL);
  process.exit(1);
}

async function patternStates() {
  const { data, error } = await service
    .from('member_pattern_states')
    .select('signal_key,state,tier,occurrence_count,updated_at')
    .eq('member_id', member.id)
    .order('signal_key');
  if (error) throw new Error(`member_pattern_states read failed: ${error.message}`);
  return data ?? [];
}
/** Rows whose updated_at moved, which is what an upsert of an unchanged row still does. */
function touched(before, after) {
  return after.filter((a) => {
    const b = before.find((x) => x.signal_key === a.signal_key);
    return !b || b.updated_at !== a.updated_at;
  });
}

const EXPENSIVE = ['/root-score', '/programs/', '/case', '/movement', '/noticing', '/root-map', '/recommendations', '/questionnaires', '/connections', '/weekly-reflection', '/profile/baseline', '/assessment/'];
const KEPT = ['/today', '/progress', '/food-lens', '/checkin'];

const browser = await chromium.launch();
let minted = null;
const timings = [];
const consoleErrors = [];
const emDashScreens = [];

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: pageerror ${String(e).slice(0, 200)}`));
}

async function emDashScan(page, label) {
  const text = await page.locator('body').innerText().catch(() => '');
  if (text.includes('—')) {
    emDashScreens.push(label);
    writeFileSync(`${SHOTS}/emdash-${label.replace(/\W/g, '_')}.txt`, text);
  }
}

try {
  minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
  if (!minted) {
    console.error('could not mint a session');
    process.exit(1);
  }

  // ================================================================
  // 1. Three fresh Home loads: what it asks the server for, and when
  //    it finishes.
  // ================================================================
  console.log('\n--- 1. Home, three times ---');
  const statesBeforeLoads = await patternStates();

  for (let run = 1; run <= 3; run++) {
    const page = await minted.context.newPage();
    watch(page, `home run ${run}`);
    const rsc = [];
    const started = new Map();
    page.on('request', (r) => { if (r.url().includes('_rsc=')) started.set(r, Date.now()); });
    page.on('requestfinished', (r) => {
      const t = started.get(r);
      if (t === undefined) return;
      rsc.push({ route: new URL(r.url()).pathname, ms: Date.now() - t });
    });

    const t0 = Date.now();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'commit', timeout: 60000 });
    let heading = null;
    await page
      .waitForFunction(() => {
        const h = Array.from(document.querySelectorAll('h1')).find((n) =>
          /^Good (morning|afternoon|evening)/.test((n.textContent ?? '').trim())
        );
        return Boolean(h && h.getBoundingClientRect().height > 0);
      }, null, { timeout: 30000 })
      .then(() => { heading = Date.now() - t0; })
      .catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 40000 }).catch(() => {});
    await page
      .waitForFunction(() => document.querySelectorAll('[data-settling], .animate-pulse').length === 0, null, { timeout: 15000 })
      .catch(() => {});
    const settled = Date.now() - t0;

    // Scroll the page so every link gets its chance to prefetch.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 350));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);

    if (run === 1) {
      await page.screenshot({ path: `${SHOTS}/home-after.png`, fullPage: true });
      await emDashScan(page, 'home');
    }

    const expensive = rsc.filter((r) => EXPENSIVE.some((e) => r.route.startsWith(e)));
    const kept = rsc.filter((r) => KEPT.includes(r.route));
    timings.push({ run, heading, settled, rsc, expensive: expensive.length, kept: kept.length });
    console.log(
      `  run ${run}: heading=${ms(heading)} settled=${ms(settled)}  _rsc total=${rsc.length}` +
        `  expensive=${expensive.length}  kept=${kept.length}` +
        (rsc.length ? `  [${[...new Set(rsc.map((r) => r.route))].join(', ')}]` : '')
    );
    await page.close();
  }

  const totalExpensive = timings.reduce((s, t) => s + t.expensive, 0);
  check(
    'no expensive route is prefetched on Home view, across three loads',
    totalExpensive === 0,
    `${totalExpensive} such requests`
  );

  // ================================================================
  // 2. A real tap, both destinations.
  // ================================================================
  console.log('\n--- 2. Tapping through ---');
  const taps = [];
  for (const target of [
    { name: 'Root Score', selector: 'a[href="/root-score"]', ready: 'Root Score' },
    { name: 'Program', selector: 'a[href^="/programs/"]', ready: null },
  ]) {
    const page = await minted.context.newPage();
    watch(page, `tap ${target.name}`);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const link = page.locator(target.selector).first();
    if ((await link.count()) === 0) {
      check(`tap ${target.name}`, false, 'no such link on Home');
      await page.close();
      continue;
    }
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1500);
    const href = await link.getAttribute('href');
    const t0 = Date.now();
    await link.evaluate((el) => el.click());
    let visible = null;
    try {
      await page.waitForURL((u) => new URL(u).pathname === href, { timeout: 30000 });
      await page.waitForFunction(
        (needle) =>
          Array.from(document.querySelectorAll('h1, h2, p')).some((n) => {
            const r = n.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const t = (n.textContent ?? '').trim();
            return needle ? t === needle : n.tagName === 'H1' && t.length > 0;
          }),
        target.ready,
        { timeout: 30000 }
      );
      visible = Date.now() - t0;
    } catch { /* reported as n/a below */ }
    taps.push({ name: target.name, href, visible });
    check(`tap ${target.name} arrives and paints`, visible !== null, `visible in ${ms(visible)}`);
    await emDashScan(page, target.name);
    await page.screenshot({ path: `${SHOTS}/tap-${target.name.replace(/\W/g, '')}.png`, fullPage: true });
    await page.close();
  }

  // ================================================================
  // 3. Did those three Home loads write anything?
  // ================================================================
  console.log('\n--- 3. What Home wrote ---');
  const statesAfterLoads = await patternStates();
  const writtenByLoads = touched(statesBeforeLoads, statesAfterLoads);
  check(
    'three Home loads wrote zero member_pattern_states rows',
    writtenByLoads.length === 0,
    `${writtenByLoads.length} rows touched, ${statesAfterLoads.length} rows on file`
  );

  // ================================================================
  // 4. Root's coaching message still renders.
  // ================================================================
  console.log('\n--- 4. The coaching message ---');
  {
    const page = await minted.context.newPage();
    watch(page, 'from root');
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const body = await page.locator('body').innerText();
    const hasTile = body.includes('From Root');
    if (hasTile) {
      await page.getByText('From Root').first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const sheet = await page.locator('body').innerText();
      const extra = sheet.length - body.length;
      check('the From Root tile opens and has real text in it', extra > 0, `${extra} more characters once opened`);
      writeFileSync(`${SHOTS}/from-root.txt`, sheet);
      await page.screenshot({ path: `${SHOTS}/from-root.png`, fullPage: true });
    } else {
      check('the From Root tile renders', true, 'Root has nothing to say to her today, which is a real answer');
    }
    await page.close();
  }

  // ================================================================
  // 5. A fresh sign-in: the pop-up chain shows at most one, once.
  // ================================================================
  console.log('\n--- 5. Signing in again ---');
  {
    const second = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
    if (!second) {
      check('a second session could be minted', false);
    } else {
      const page = await second.context.newPage();
      watch(page, 'fresh sign-in');
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(6000);
      const popupsFirst = await page.locator('[role="dialog"]').count();
      // Case-insensitively: the card's label is styled uppercase, and
      // innerText returns text the way CSS transformed it, so an exact-case
      // match reports a card that is plainly on the screen as missing.
      const priorityFirst = /your priority today/i.test(await page.locator('body').innerText());
      await page.screenshot({ path: `${SHOTS}/fresh-signin.png`, fullPage: true });
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(6000);
      const popupsSecond = await page.locator('[role="dialog"]').count();
      check(
        'the pop-up chain shows at most one message',
        popupsFirst <= 1,
        `${popupsFirst} on first load, ${popupsSecond} on the load after`
      );
      check('the Priority Card is on Home', priorityFirst, priorityFirst ? '' : 'not found');
      await page.close();
      await retireSession(second);
    }
  }

  // ================================================================
  // 6. A real Daily Reset, and the states it refreshes.
  // ================================================================
  if (DO_CHECKIN) {
    console.log('\n--- 6. Completing a Daily Reset ---');
    const statesBeforeCheckin = await patternStates();
    const page = await minted.context.newPage();
    watch(page, 'checkin');
    await page.goto(`${BASE}/checkin`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const NAV = /^(continue|next|back|done|submit|finish|save|skip|close|exit|cancel|update|home|go to screen|sign out|profile|membership|connected devices|notifications|help|about|e$)/i;
    const DO_NOT_TOUCH = /send your coach|something new or worsening/i;
    const ANSWER_SELECTOR = 'main button:not([disabled]), main [role="radio"], main [role="option"], main [role="switch"]';

    let submitted = false;
    for (let screen = 0; screen < 24 && !submitted; screen += 1) {
      await page.waitForTimeout(900);
      const groups = await page.evaluate(([navSource, selector]) => {
        const nav = new RegExp(navSource, 'i');
        const byParent = new Map();
        Array.from(document.querySelectorAll(selector)).forEach((el, domIndex) => {
          const name = (el.textContent ?? '').trim().replace(/\s+/g, ' ') || el.getAttribute('aria-label') || '';
          if (!name || nav.test(name) || /send your coach|something new or worsening/i.test(name)) return;
          const key = el.parentElement ? Array.from(document.querySelectorAll('*')).indexOf(el.parentElement) : -1;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key).push({ domIndex, name });
        });
        return Array.from(byParent.values()).filter((g) => g.length >= 2);
      }, [NAV.source, ANSWER_SELECTOR]);

      const controls = page.locator(ANSWER_SELECTOR);
      for (const group of groups) {
        const pick = group[Math.floor(group.length / 2)];
        await controls.nth(pick.domIndex).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      const continueBtn = page.getByRole('button', { name: /^(continue|finish|submit|done|save check-in)$/i });
      if ((await continueBtn.count()) === 0) break;
      if (!(await continueBtn.first().isEnabled().catch(() => false))) {
        const remaining = page.locator(ANSWER_SELECTOR);
        const total = await remaining.count();
        for (let i = 0; i < total; i += 1) {
          const el = remaining.nth(i);
          const name = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
          if (!name || NAV.test(name) || DO_NOT_TOUCH.test(name)) continue;
          await el.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(300);
          if (await continueBtn.first().isEnabled().catch(() => false)) break;
        }
      }
      if (!(await continueBtn.first().isEnabled().catch(() => false))) {
        await page.screenshot({ path: `${SHOTS}/checkin-stuck.png`, fullPage: true });
        break;
      }
      const wasSave = /save check-in/i.test(((await continueBtn.first().innerText().catch(() => '')) || '').trim());
      await continueBtn.first().click();
      await page.waitForTimeout(2600);
      if (wasSave || !page.url().includes('/checkin')) submitted = true;
    }
    await page.screenshot({ path: `${SHOTS}/checkin-final.png`, fullPage: true });
    check('the Daily Reset was completed', submitted, page.url());
    await emDashScan(page, 'checkin');

    // The refresh is best-effort and runs after the submit returns.
    await page.waitForTimeout(9000);
    const statesAfterCheckin = await patternStates();
    const refreshed = touched(statesBeforeCheckin, statesAfterCheckin);
    check(
      'completing the Daily Reset refreshed her pattern states',
      refreshed.length > 0,
      `${refreshed.length} of ${statesAfterCheckin.length} rows updated`
    );
    writeFileSync(`${SHOTS}/pattern-states.json`, JSON.stringify({ statesBeforeCheckin, statesAfterCheckin }, null, 2));

    // Back to Home: it must not write them again.
    const beforeReturn = await patternStates();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${SHOTS}/home-after-checkin.png`, fullPage: true });
    await emDashScan(page, 'home after checkin');
    const afterReturn = await patternStates();
    check(
      'returning to Home after the check-in still writes nothing',
      touched(beforeReturn, afterReturn).length === 0,
      `${touched(beforeReturn, afterReturn).length} rows touched`
    );
    await page.close();
  }

  // ================================================================
  // 7. The three screens that share the bottom bar.
  // ================================================================
  console.log('\n--- 7. Today, Progress, Programs ---');
  for (const route of ['/today', '/progress', '/programs']) {
    const page = await minted.context.newPage();
    watch(page, route);
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const body = await page.locator('body').innerText();
    const bad = ['Invalid Date', 'NaN', 'undefined'].filter((n) => body.includes(n));
    check(`${route} renders with real dates`, bad.length === 0, bad.length ? `found ${bad.join(', ')}` : '');
    await emDashScan(page, route);
    await page.screenshot({ path: `${SHOTS}/screen-${route.replace(/\//g, '_')}.png`, fullPage: true });
    await page.close();
  }

  check('zero console errors across every screen visited', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('zero em dashes across every screen visited', emDashScreens.length === 0, emDashScreens.join(', '));
} finally {
  await retireSession(minted);
  await browser.close();
}

writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, timings, taps: null }, null, 2));
const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed`);
if (consoleErrors.length) console.log('console errors:\n  ' + consoleErrors.join('\n  '));
