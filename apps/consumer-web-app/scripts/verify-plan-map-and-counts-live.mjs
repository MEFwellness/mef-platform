/**
 * Live verification for Build 2 (2026-08-27): the corrected plan map, the
 * retirement of the coach-assign-only lock, and the four counts that used
 * to disagree with each other.
 *
 * Read-only about the member's own data. It navigates as her, records the
 * exact sentences on Home, Root's Daily Brief, Today and Progress, opens
 * every locked take URL, and counts her rows before and after so a bounced
 * URL can be proved to have written nothing. Nothing of hers is created,
 * edited or deleted.
 *
 * Turnstile is live on the login form by design, so this mints a one-time
 * session (scripts/lib/mint-session.mjs) and retires it with scope 'local'.
 * No password is read or used.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.LIVE_MEMBER_EMAIL;
const TIMEOUT = 60000;
const SHOTS = process.env.SHOT_DIR ?? '.verify-shots';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL ?? '')) {
  console.error('LIVE_MEMBER_EMAIL must be a plain email address');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    failures.push(name);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
}

/** The map as shipped, member-facing name and which plan sentence its card must carry. */
const MAP = [
  { key: 'onboarding-health-history', title: 'Onboarding Assessment', plan: 'trial' },
  { key: 'core-values-snapshot', title: 'Core Values Snapshot', plan: 'trial' },
  { key: 'life-signal-check', title: 'Life Signal Check', plan: 'trial' },
  { key: 'readiness-pulse', title: 'Readiness Pulse', plan: 'trial' },
  { key: 'short-haq', title: 'Health Check-In', plan: 'monthly' },
  { key: 'primal-pattern-diet-type', title: 'Primal Pattern', plan: 'monthly' },
  { key: 'chek-hlc1-nutrition-lifestyle', title: 'Nutrition & Lifestyle', plan: 'monthly' },
  { key: 'four-doctors', title: 'Four Doctors', plan: 'program' },
  { key: 'wbsa', title: 'Whole-Body Check-In', plan: 'program' },
  { key: 'body-assessment', title: 'Body Assessment', plan: 'program' },
];

const MONTHLY_SENTENCE = 'This one comes with a Monthly plan';
const PROGRAM_SENTENCE = 'This one is part of the 24 week program';
const RETIRED_COACH_SENTENCE = 'Your coach opens this one for you';

/** Take URLs a trial member must be bounced from. */
const LOCKED_TAKE_PATHS = [
  '/assessments/short-haq/take',
  '/assessments/primal-pattern-diet-type/take',
  '/assessments/chek-hlc1-nutrition-lifestyle/take',
  '/assessments/four-doctors/take',
  '/assessments/wbsa/take',
  '/assessment/new',
];

function text(body) {
  return (body || '').replace(/\s+/g, ' ');
}

let MEMBER_ID;

async function rowCounts() {
  const tables = [
    ['wellness_assessments', 'member_id'],
    ['primal_pattern_assessments', 'member_id'],
    ['body_assessments', 'member_id'],
    ['unified_assessment_sessions', 'member_id'],
    ['assessment_attempts', 'member_id'],
  ];
  const out = {};
  for (const [table, column] of tables) {
    const { count, error } = await service
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, MEMBER_ID);
    out[table] = error ? `error: ${error.message}` : (count ?? 0);
  }
  return out;
}

const browser = await chromium.launch();
let minted = null;
const consoleErrors = [];
const screensVisited = [];

async function bodyOf(page, path, shotName) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(3500);
  if (shotName) await page.screenshot({ path: `${SHOTS}/${shotName}.png`, fullPage: true });
  return text(await page.textContent('body'));
}

async function mainOf(page, path, shotName) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(3500);
  if (shotName) await page.screenshot({ path: `${SHOTS}/${shotName}.png`, fullPage: true });
  return text(await page.textContent('main'));
}

try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) throw new Error('could not mint a session for the member under test');
  MEMBER_ID = minted.session.user.id;
  check('0. the minted session belongs to the member under test', minted.session.user.email === EMAIL);

  const { data: sub } = await service
    .from('member_subscriptions')
    .select('tier, status')
    .eq('member_id', MEMBER_ID)
    .maybeSingle();
  console.log(`\nPlan on record: tier=${sub?.tier ?? 'none'} status=${sub?.status ?? 'none'}`);
  check('0b. this account is on a trial plan, which is what the checks below assume', sub?.tier === 'trial');

  const page = await minted.context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const countsBefore = await rowCounts();
  console.log('\nRow counts before:', JSON.stringify(countsBefore));

  // ---- 1. The Questionnaires screen ----
  const questionnaires = await mainOf(page, '/questionnaires', '01_questionnaires');
  screensVisited.push(['Questionnaires', questionnaires]);

  for (const item of MAP) {
    if (item.key === 'body-assessment') continue; // its card lives on Home and Profile
    check(`1a. ${item.title} appears on the Questionnaires screen`, questionnaires.includes(item.title));
  }

  check(
    '1b. the retired coach sentence appears nowhere on the Questionnaires screen',
    !questionnaires.includes(RETIRED_COACH_SENTENCE)
  );

  // Tap each locked card and read the sheet it opens.
  for (const item of MAP.filter((m) => m.plan !== 'trial' && m.key !== 'body-assessment')) {
    await page.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    const card = page.locator(`button[aria-label*="${item.title}"][aria-label*="locked"]`).first();
    const found = (await card.count()) > 0;
    check(`2a. ${item.title} renders as a locked card`, found);
    if (!found) continue;
    await card.click().catch(() => {});
    await page.waitForTimeout(1200);
    const sheet = text(await page.textContent('body'));
    await page.screenshot({ path: `${SHOTS}/02_sheet_${item.key}.png` });
    const expected = item.plan === 'monthly' ? MONTHLY_SENTENCE : PROGRAM_SENTENCE;
    check(`2b. ${item.title} sheet says: ${expected}`, sheet.includes(expected));
    check(`2c. ${item.title} sheet never mentions a coach opening it`, !sheet.includes(RETIRED_COACH_SENTENCE));
  }

  // ---- 3. Locked take URLs bounce, and write nothing ----
  for (const path of LOCKED_TAKE_PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(3500);
    const landed = page.url().replace(BASE, '');
    const bounced = !landed.startsWith(path);
    const body = text(await page.textContent('body'));
    const blocked = bounced || /Available with|comes with a Monthly plan|part of the 24 week program/.test(body);
    check(`3. ${path} does not open the questionnaire`, blocked, `landed on ${landed}`);
  }

  const countsAfter = await rowCounts();
  console.log('\nRow counts after:', JSON.stringify(countsAfter));
  check(
    '4. every locked take URL wrote nothing at all',
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
    `${JSON.stringify(countsBefore)} then ${JSON.stringify(countsAfter)}`
  );

  // ---- 5. The four numbers, read from the screen ----
  const home = await bodyOf(page, '/dashboard', '05_home');
  screensVisited.push(['Home', home]);
  const today = await bodyOf(page, '/today', '06_today');
  screensVisited.push(['Today', today]);
  const progress = await bodyOf(page, '/progress', '07_progress');
  screensVisited.push(['Progress', progress]);
  const caseView = await bodyOf(page, '/case', '08_case');
  screensVisited.push(['Case', caseView]);

  const windowed = home.match(/checked in on (\d+) days? in the last (\d+) days/);
  const rootLine = home.match(/logged (\d+) check-ins? with me so far/);
  const todayTotal = today.match(/(\d+) Check-ins? logged/);
  const progressDays = progress.match(/from (\d+) recorded days?/);

  console.log('\n--- the numbers as she reads them ---');
  console.log(`Home, under the score:      ${windowed ? windowed[0] : 'not shown (she may be above the data floor)'}`);
  console.log(`Root's Daily Brief:         ${rootLine ? rootLine[0] : 'not shown'}`);
  console.log(`Today, YOUR TOTALS:         ${todayTotal ? todayTotal[0] : 'not shown'}`);
  console.log(`Progress, avg energy:       ${progressDays ? progressDays[0] : 'not shown'}`);

  check(
    '5a. no screen says "logged days so far", the phrase that made a windowed count read as all time',
    !/logged days? so far/.test(home) && !/logged days? so far/.test(caseView),
    home.match(/[^.]*logged days? so far[^.]*/)?.[0] ?? ''
  );

  if (windowed) {
    check('5b. the windowed sentence on Home names its window', /in the last \d+ days/.test(windowed[0]));
  } else {
    console.log('NOTE  Home shows no data-floor sentence, so 5b does not apply to this account today.');
  }

  if (rootLine && todayTotal) {
    check(
      "5c. Root's own line and Today's YOUR TOTALS are the same number",
      rootLine[1] === todayTotal[1],
      `Root says ${rootLine[1]}, Today says ${todayTotal[1]}`
    );
  } else {
    console.log('NOTE  one of the two all-time figures is not on screen for this account, so 5c does not apply.');
  }

  if (rootLine) {
    const caseLine = caseView.match(/logged (\d+) check-ins? with me so far/);
    check(
      '5d. the Case View reads the same all-time number as Root',
      !caseLine || caseLine[1] === rootLine[1],
      caseLine ? `Case says ${caseLine[1]}, Root says ${rootLine[1]}` : 'Case does not show it'
    );
  }

  check(
    '5e. Home Quick Actions no longer prints the questionnaire count on the Case pill',
    !/Case \d+ of \d+ complete/.test(home)
  );

  // ---- 6. Root's Daily Brief dates a stale reading ----
  const stale = home.match(/You logged [^.]*at your last check-in[^.]*/);
  if (stale) {
    check(
      '6. a reading from an earlier check-in says how many days ago it was',
      /\d+ days ago/.test(stale[0]),
      stale[0]
    );
  } else {
    console.log("NOTE  Home carries no 'at your last check-in' line today, so 6 does not apply.");
  }

  // ---- 7. Em dashes and console errors ----
  const withEmDash = screensVisited.filter(([, body]) => body.includes('—')).map(([name]) => name);
  check('7. no em dash on any screen visited', withEmDash.length === 0, withEmDash.join(', '));
  check('8. no browser console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('failed checks:\n  ' + failures.join('\n  '));
} finally {
  await retireSession(minted);
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
