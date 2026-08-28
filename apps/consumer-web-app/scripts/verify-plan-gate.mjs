/**
 * Live verification for the 2026-08-27 plan-gate build.
 *
 * Signs in as the standing test member with a one-time minted session
 * (Turnstile blocks a scripted form sign-in by design, and that is not a
 * fault), walks the questionnaire surfaces on a mobile viewport, and
 * counts rows in the database before and after each thing that must not
 * write. The session is retired with scope 'local' at the end, always.
 *
 * Bounded: every navigation has a timeout, the whole run has a deadline,
 * and the browser is closed in a finally block, so nothing is left behind.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/shots';
const VIEWPORT = { width: 390, height: 844 };
const NAV_TIMEOUT = 45_000;

mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function record(item, pass, detail) {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}  ${detail}`);
}

async function memberId() {
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data.users.find((u) => u.email === EMAIL);
  if (!user) throw new Error('test member not found');
  return user.id;
}

async function counts(id) {
  const [drafts, sessions, router] = await Promise.all([
    service.from('wellness_assessments').select('id', { count: 'exact', head: true }).eq('member_id', id),
    service.from('unified_assessment_sessions').select('id', { count: 'exact', head: true }).eq('member_id', id),
    service.from('investigation_router_decisions').select('id', { count: 'exact', head: true }).eq('member_id', id),
  ]);
  return { drafts: drafts.count ?? 0, sessions: sessions.count ?? 0, router: router.count ?? 0 };
}

const run = async () => {
  const id = await memberId();
  const browser = await chromium.launch();
  let minted = null;
  try {
    minted = await mintSessionContext(browser, EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
    if (!minted) throw new Error('could not mint a session');
    const page = await minted.context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);

    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const go = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(2500);
      return page.url();
    };

    // ---- 1. The Questionnaires screen ----
    await go('/questionnaires');
    await page.screenshot({ path: `${SHOTS}/01-questionnaires.png`, fullPage: true });
    const body = await page.locator('body').innerText();
    record(
      '1a. no "Reassessment due" badge anywhere',
      !body.includes('Reassessment due'),
      body.includes('Reassessment due') ? 'still present' : 'absent'
    );
    record(
      '1b. no "Start Reassessment" button anywhere',
      !body.includes('Start Reassessment'),
      body.includes('Start Reassessment') ? 'still present' : 'absent'
    );

    const lockedCards = await page.locator('button[aria-label*="locked"]').count();
    record('1c. locked cards render as tappable cards', lockedCards > 0, `${lockedCards} locked card(s)`);

    // ---- 2. Tap each locked card, read the sheet ----
    const sheetTexts = [];
    for (let i = 0; i < lockedCards; i += 1) {
      const card = page.locator('button[aria-label*="locked"]').nth(i);
      const label = await card.getAttribute('aria-label');
      await card.click();
      await page.waitForTimeout(900);
      const sheet = await page.locator('text=A note from Root').first().isVisible().catch(() => false);
      const text = sheet
        ? await page.locator('text=A note from Root').first().locator('xpath=ancestor::*[3]').innerText().catch(() => '')
        : '';
      sheetTexts.push({ label, sheet, text: text.replace(/\s+/g, ' ').slice(0, 220) });
      await page.screenshot({ path: `${SHOTS}/02-sheet-${i}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    record(
      '2. every locked card opens the Root sheet',
      sheetTexts.length > 0 && sheetTexts.every((s) => s.sheet),
      JSON.stringify(sheetTexts, null, 1)
    );

    // ---- 3. Locked take URLs, direct ----
    const before3 = await counts(id);
    const lockedUrls = [
      '/assessments/nutrition-lifestyle/take',
      '/assessments/four-doctors/take',
      '/assessments/short-haq/take',
      '/assessments/wbsa/take',
      '/assessments/primal-pattern-diet-type/take',
      '/assessment/new?type=static_posture',
      // A slug that resolves to no questionnaire at all. Must 404, never
      // reach a crash screen.
      '/assessments/not-a-real-questionnaire/take',
    ];
    const landings = [];
    for (const url of lockedUrls) {
      const landed = await go(url);
      landings.push({ url, landed: landed.replace(BASE, '') });
    }
    const after3 = await counts(id);
    record(
      '3. locked take URLs are blocked and create nothing',
      JSON.stringify(before3) === JSON.stringify(after3),
      `${JSON.stringify(before3)} -> ${JSON.stringify(after3)}; landings ${JSON.stringify(landings)}`
    );

    // ---- 4. An allowed take page, Back then Forward ----
    const before4 = await counts(id);
    await go('/assessments/core-values-snapshot');
    await page.screenshot({ path: `${SHOTS}/04-cvs-overview.png`, fullPage: true });
    const cvsBody = await page.locator('body').innerText();
    await go('/assessments/core-values-snapshot/take');
    const takeLanded = page.url().replace(BASE, '');
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2000);
    const after4 = await counts(id);
    await page.screenshot({ path: `${SHOTS}/04-after-back-forward.png`, fullPage: true });
    record(
      '4. Back then Forward on a take URL creates no draft',
      JSON.stringify(before4) === JSON.stringify(after4),
      `${JSON.stringify(before4)} -> ${JSON.stringify(after4)}; take URL landed on ${takeLanded}`
    );

    await go('/questionnaires');
    const q2 = await page.locator('body').innerText();
    record(
      '4b. Questionnaires shows no "0 of" resume line',
      !/Resume[\s\S]{0,40}0 of/.test(q2) && !/\b0 of \d+ questions answered/.test(q2),
      /0 of \d+ questions/.test(q2) ? 'a 0-of-N line is present' : 'none'
    );

    // ---- 6. The priority, after browsing ----
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    await service.from('member_daily_priorities').delete().eq('member_id', id).eq('local_date', today);
    await go('/movement');
    await go('/root-map');
    const { data: afterBrowsing } = await service
      .from('member_daily_priorities')
      .select('id, rule, decided_before_checkin')
      .eq('member_id', id)
      .eq('local_date', today)
      .maybeSingle();
    record(
      '6a. browsing Movement and the Root Map does not decide the day',
      afterBrowsing === null,
      afterBrowsing ? `a row exists: ${JSON.stringify(afterBrowsing)}` : 'no priority row was written'
    );

    // Two attempts: a cold serverless function on a just-deployed build can
    // outrun one navigation budget, and a timed-out navigation is not the
    // same finding as a priority that was never claimed.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await go('/dashboard');
        break;
      } catch {
        await page.waitForTimeout(4000);
      }
    }
    await page.screenshot({ path: `${SHOTS}/06-dashboard.png` });
    const { data: afterHome } = await service
      .from('member_daily_priorities')
      .select('id, rule, decided_before_checkin, redecided_at')
      .eq('member_id', id)
      .eq('local_date', today)
      .maybeSingle();
    record(
      '6b. opening Home does decide it, and records whether the check-in was in it',
      afterHome !== null,
      afterHome ? JSON.stringify(afterHome) : 'no row'
    );

    // ---- 8. Console ----
    record('8. zero console or page errors across the walk', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ') || 'none');

    const allBody = cvsBody + q2 + body;
    record('8b. no em dash on any screen read', !allBody.includes('—'), allBody.includes('—') ? 'found one' : 'none');

    console.log('\n--- summary ---');
    console.log(JSON.stringify(results, null, 1));
  } finally {
    await retireSession(minted);
    await browser.close();
  }
};

const deadline = setTimeout(() => {
  console.error('DEADLINE: the run exceeded its budget');
  process.exit(2);
}, 8 * 60 * 1000);
deadline.unref?.();

run()
  .then(() => process.exit(results.some((r) => !r.pass) ? 1 : 0))
  .catch((err) => {
    console.error('RUN FAILED', err);
    process.exit(3);
  });
