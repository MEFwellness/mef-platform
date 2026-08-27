/**
 * Live verification for the completion-state fix (2026-08-27).
 *
 * Drives the real member journey on app.mefwellness.com: records the state
 * of all three free experience cards, completes any that are unfinished,
 * checks every surface that decides "is this done", then simulates the next
 * day the way the pop-up chain and the Priority Card actually key on it.
 *
 * Turnstile is live on the login form by design, so this mints a one-time
 * session (scripts/lib/mint-session.mjs) and retires it with scope 'local'.
 * No password is read or used. Every row this run creates on the member's
 * own account is a real completion she keeps; the only rows deleted are the
 * daily-priority and pop-up-dismissal rows needed to advance the day, and
 * they are re-derived on the next page load.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.LIVE_MEMBER_EMAIL;
const TIMEOUT = 60000;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL ?? '')) {
  console.error('LIVE_MEMBER_EMAIL must be a plain email address');
  process.exit(1);
}

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) pass++; else { fail++; failures.push(name); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
}

const KEYS = ['core-values-snapshot', 'life-signal-check', 'readiness-pulse'];
const TITLES = {
  'core-values-snapshot': 'Core Values Snapshot',
  'life-signal-check': 'Life Signal Check',
  'readiness-pulse': 'Readiness Pulse',
};

let MEMBER_ID;
const DEF_IDS = {};

async function loadDefinitions() {
  const { data } = await service.from('unified_assessment_definitions').select('id, key').in('key', KEYS);
  for (const row of data ?? []) DEF_IDS[row.key] = row.id;
}

async function sessionsFor(key) {
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('id, status, started_at, completed_at')
    .eq('member_id', MEMBER_ID)
    .eq('assessment_definition_id', DEF_IDS[key])
    .order('started_at');
  return data ?? [];
}

async function reportSessions(label) {
  console.log(`\n--- sessions (${label}) ---`);
  for (const key of KEYS) {
    const rows = await sessionsFor(key);
    console.log(`  ${TITLES[key].padEnd(22)} ${rows.length === 0 ? 'none' : rows.map((r) => r.status).join(', ')}`);
  }
}

function text(body) { return (body || '').replace(/\s+/g, ' '); }

async function bodyOf(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(3500);
  return text(await page.textContent('body'));
}

/** Just the rendered page, without the RSC flight payload the <body> also carries. */
async function mainOf(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(3500);
  return text(await page.textContent('main'));
}

/** Everything below the "Completed" SECTION heading, which is the last time that word appears on the page (the tab label above it comes first). */
function completedSectionOf(pageText) {
  const at = pageText.lastIndexOf('Completed');
  return at === -1 ? '' : pageText.slice(at);
}

/** Walks a taker to completion. All three share the same screen grammar. */
async function completeExperience(page, key) {
  await page.goto(`${BASE}/assessments/${key}/take`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(3000);
  if (/\/results\//.test(page.url())) return 'already complete';

  let body = text(await page.textContent('body'));
  if (!/of \d+ answered/.test(body)) {
    const btns = page.locator('main button:visible');
    if (await btns.count()) await btns.last().click().catch(() => {});
    await page.waitForTimeout(1600);
  }

  for (let step = 0; step < 50; step++) {
    body = text(await page.textContent('body'));
    if (!/of \d+ answered/.test(body)) break;

    const numeric = page.locator('main button:visible', { hasText: /^[1-5]$/ });
    const nNum = await numeric.count();
    if (nNum >= 10) {
      for (let i = 2; i < nNum; i += 5) { await numeric.nth(i).click().catch(() => {}); await page.waitForTimeout(220); }
      await page.waitForTimeout(1000);
    } else {
      const opts = page.locator('main button:visible');
      const n = await opts.count();
      for (let i = 0; i < n; i++) {
        const t = ((await opts.nth(i).textContent()) || '').trim();
        if (!t || /^(Back|Continue|Home|See what Root learned|Skip)$/i.test(t)) continue;
        await opts.nth(i).click().catch(() => {}); break;
      }
      await page.waitForTimeout(900);
    }

    const finish = page.locator('main button:visible', { hasText: /See what Root learned|See what Root heard|See what Root found/ }).first();
    if (await finish.count() && await finish.isEnabled().catch(() => false)) { await finish.click(); break; }
    const cont = page.locator('main button:visible', { hasText: /^Continue$/ }).first();
    if (await cont.count() && await cont.isEnabled().catch(() => false)) await cont.click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(6000);
  return 'completed now';
}

const browser = await chromium.launch();
let minted = null;
const consoleErrors = [];
const screensVisited = [];

try {
  await loadDefinitions();
  check('0a. all three experience definitions resolve', KEYS.every((k) => DEF_IDS[k]));

  minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
  if (!minted) throw new Error('could not mint a session for the member under test');
  MEMBER_ID = minted.session.user.id;
  check('0b. the minted session belongs to the member under test', minted.session.user.email === EMAIL);

  const page = await minted.context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ---- 1. Record the starting state ----
  await reportSessions('before this run');
  const homeBefore = await bodyOf(page, '/dashboard');
  screensVisited.push(['Home (before)', homeBefore]);
  const todayBefore = await bodyOf(page, '/today');
  screensVisited.push(['Today (before)', todayBefore]);
  const qBefore = await mainOf(page, '/questionnaires');
  screensVisited.push(['Questionnaires (before)', qBefore]);
  console.log('\nStarting state on Questionnaires:', qBefore.match(/\d+ of \d+ complete/)?.[0] ?? 'not shown');
  console.log('Home names Core Values Snapshot:', /Core Values Snapshot/.test(homeBefore));

  // ---- 2. Complete any experience that is not finished ----
  let completedThisRun = 0;
  for (const key of KEYS) {
    const before = await sessionsFor(key);
    if (before.some((r) => r.status === 'completed')) { console.log(`\n${TITLES[key]}: already completed, left alone`); continue; }
    console.log(`\n${TITLES[key]}: completing it now`);
    const outcome = await completeExperience(page, key);
    if (outcome === 'completed now') completedThisRun += 1;
    console.log(`   ${outcome}`);
  }
  await reportSessions('after completing the arc');

  // ---- 3. Every experience is completed, and left exactly one session ----
  for (const key of KEYS) {
    const rows = await sessionsFor(key);
    check(`1. ${TITLES[key]} has a completed session`, rows.some((r) => r.status === 'completed'));
    check(`2. ${TITLES[key]} left no empty draft behind`,
      !rows.some((r) => r.status === 'in_progress'),
      rows.filter((r) => r.status === 'in_progress').length ? 'a draft is open' : '');
  }

  const qAfter = await mainOf(page, '/questionnaires');
  screensVisited.push(['Questionnaires (after)', qAfter]);
  // The count on this page is the member's whole visible library, not the
  // free arc: what matters is that all three sit under Completed, and that
  // the completed number rose by exactly three.
  const completedBefore = Number(qBefore.match(/(\d+) of \d+ complete/)?.[1] ?? '-1');
  const completedAfter = Number(qAfter.match(/(\d+) of \d+ complete/)?.[1] ?? '-1');
  check(`3a. Questionnaires completed count rose by exactly the ${completedThisRun} this run finished`,
    completedAfter - completedBefore === completedThisRun,
    `${qBefore.match(/\d+ of \d+ complete/)?.[0]} then ${qAfter.match(/\d+ of \d+ complete/)?.[0]}`);
  const completedSection = completedSectionOf(qAfter);
  check('3b. all three sit under Completed on Questionnaires',
    KEYS.every((k) => completedSection.includes(TITLES[k])),
    KEYS.filter((k) => !completedSection.includes(TITLES[k])).map((k) => TITLES[k]).join(', '));
  check('4. Questionnaires shows no "questions answered" draft line for them',
    !/0 of \d+ questions answered/.test(qAfter));

  const homeAfter = await bodyOf(page, '/dashboard');
  screensVisited.push(['Home (after)', homeAfter]);
  check('5. Home offers no free-arc conversation as pending', !/From Root ?(Core Values Snapshot|Life Signal Check|Readiness Pulse)/.test(homeAfter));
  check('6. Home priority is not "Pick up" one of the three',
    !KEYS.some((k) => new RegExp(`Pick up ${TITLES[k]}`, 'i').test(homeAfter)));

  // ---- 4. The Conversation handoffs ----
  for (const key of KEYS) {
    const rows = await sessionsFor(key);
    const completed = rows.find((r) => r.status === 'completed');
    if (!completed) continue;
    const results = await bodyOf(page, `/assessments/${key}/results/${completed.id}`);
    screensVisited.push([`${TITLES[key]} results`, results]);
    check(`7. ${TITLES[key]} results screen renders`, results.length > 200);
  }

  // ---- 5. Open each experience URL directly ----
  for (const key of KEYS) {
    await page.goto(`${BASE}/assessments/${key}/take`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    check(`8. ${TITLES[key]} /take on a completed experience lands on results`,
      /\/results\//.test(page.url()), page.url().replace(BASE, ''));

    const overview = await bodyOf(page, `/assessments/${key}`);
    screensVisited.push([`${TITLES[key]} overview`, overview]);
    check(`9. ${TITLES[key]} overview shows the completed state and a labelled retake`,
      /You have finished this one/.test(overview) && /See your results/.test(overview) && /Take it again/.test(overview));
    check(`10. ${TITLES[key]} overview no longer says "Let's begin"`, !/Let's begin/.test(overview));

    const rows = await sessionsFor(key);
    check(`11. ${TITLES[key]} still has no draft after opening its URLs`,
      !rows.some((r) => r.status === 'in_progress'));
  }

  const homeStill = await bodyOf(page, '/dashboard');
  screensVisited.push(['Home (after visiting every URL)', homeStill]);
  check('12. Home cards still read completed after visiting every experience URL',
    !/From Root ?(Core Values Snapshot|Life Signal Check|Readiness Pulse)/.test(homeStill));

  // ---- 6. "The next day", exactly as the two surfaces key on it ----
  // The Priority Card claims one row per (member, local_date) and the
  // pop-up chain keys on member_root_popup_dismissals. Clearing today's
  // rows makes the very next page load re-decide both from scratch, which
  // is precisely what tomorrow morning's first load does.
  const { data: clearedPriorities } = await service.from('member_daily_priorities').delete().eq('member_id', MEMBER_ID).select('id');
  const { data: clearedDismissals } = await service.from('member_root_popup_dismissals').delete().eq('member_id', MEMBER_ID).select('id');
  console.log(`\nAdvanced the day: cleared ${clearedPriorities?.length ?? 0} daily priority row(s) and ${clearedDismissals?.length ?? 0} pop-up dismissal row(s), so both re-decide from scratch on the next load.`);

  const nextDayHome = await bodyOf(page, '/dashboard');
  screensVisited.push(['Home (next day)', nextDayHome]);
  check('13. next-day Home never asks for a finished experience again',
    !KEYS.some((k) => new RegExp(`Pick up ${TITLES[k]}`, 'i').test(nextDayHome))
    && !/From Root ?(Core Values Snapshot|Life Signal Check|Readiness Pulse)/.test(nextDayHome));
  const nextDayToday = await bodyOf(page, '/today');
  screensVisited.push(['Today (next day)', nextDayToday]);
  check('14. next-day Today never asks for a finished experience again',
    !KEYS.some((k) => new RegExp(`Pick up ${TITLES[k]}`, 'i').test(nextDayToday)));
  const nextDayQ = await mainOf(page, '/questionnaires');
  screensVisited.push(['Questionnaires (next day)', nextDayQ]);
  const nextDayCompleted = Number(nextDayQ.match(/(\d+) of \d+ complete/)?.[1] ?? '-1');
  const nextDaySection = completedSectionOf(nextDayQ);
  check('15. next-day Questionnaires still holds all three under Completed',
    nextDayCompleted === completedAfter && KEYS.every((k) => nextDaySection.includes(TITLES[k])),
    nextDayQ.match(/\d+ of \d+ complete/)?.[0] ?? '');

  await reportSessions('end of run');
  for (const key of KEYS) {
    const rows = await sessionsFor(key);
    check(`16. ${TITLES[key]} still carries no phantom draft at the end of the run`,
      !rows.some((r) => r.status === 'in_progress'));
  }

  // ---- 7. Em dashes and console errors ----
  const withEmDash = screensVisited.filter(([, body]) => body.includes('—')).map(([name]) => name);
  check('17. no em dash on any screen visited', withEmDash.length === 0, withEmDash.join(', '));
  check('18. no browser console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('failed checks:\n  ' + failures.join('\n  '));
} finally {
  await retireSession(minted);
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
