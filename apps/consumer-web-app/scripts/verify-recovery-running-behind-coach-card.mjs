/**
 * The coach card half of the Recovery Running Behind verification
 * (2026-08-29).
 *
 * Split out from scripts/verify-recovery-running-behind-live.mjs because
 * that run already left production in exactly the state this one needs:
 * two completed sittings for the standing test member, the older stored as
 * Carrying It Alone and the newer as Recovery Running Behind. Re-running
 * the whole thing would write a third sitting nobody asked for.
 *
 * WHY IT WRITES A FLAG. app/coach/clients/[id]/layout.tsx hard 404s any
 * member whose profile is `is_test` unless the VIEWER is a test account
 * too. lib/staff/testAccounts.ts documents that pairing as "the whole
 * point of the production QA fixture". So this turns `is_test` on for the
 * coach for the length of the run and turns it back off in the finally
 * block, reading it back both times. It is the only write this script
 * makes, and it refuses to start if the flag is not what it expects.
 *
 * Turnstile is live on the login form by design, so the coach session is
 * minted (scripts/lib/mint-session.mjs) and retired with scope 'local'.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.LIVE_MEMBER_EMAIL;
const COACH_EMAIL = process.env.LIVE_COACH_EMAIL;
const SHOTS = process.env.LIVE_SHOT_DIR || 'scripts/.verify/recovery-running-behind';
const TIMEOUT = 60000;

const HEADLINE = 'You are recovering, just not at the pace you are spending.';
const BODY_COPY =
  'There are things in your week that genuinely help you recover, and they are working. The issue is that your current load is asking for more recovery than you are getting. Over time, that gap can slowly wear you down. The goal is not necessarily to add something new. It is to give more room to what you already know helps you recover.';

for (const [name, value] of [['LIVE_MEMBER_EMAIL', MEMBER_EMAIL], ['LIVE_COACH_EMAIL', COACH_EMAIL]]) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? '')) {
    console.error(`${name} must be a plain email address`);
    process.exit(1);
  }
}
if (process.env.ALLOW_VIEWER_PAIRING !== '1') {
  console.error('ALLOW_VIEWER_PAIRING=1 is required: this run writes profiles.is_test on the coach.');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

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

const consoleErrors = [];
const EM_DASH = '—';
const emDashScreens = [];
function squash(s) { return (s || '').replace(/\s+/g, ' '); }

const browser = await chromium.launch();
let coachId = null, flipped = false, coachMint = null;

try {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  const memberId = data.users.find((u) => u.email === MEMBER_EMAIL)?.id ?? null;
  coachId = data.users.find((u) => u.email === COACH_EMAIL)?.id ?? null;
  check('resolved both accounts', Boolean(memberId && coachId));
  if (!memberId || !coachId) throw new Error('account lookup failed');

  // The two sittings this run reads, named before anything is touched.
  const { data: sittings } = await service.from('member_stress_load_sessions')
    .select('id, completed_at, pattern').eq('member_id', memberId)
    .order('completed_at', { ascending: false });
  check('two completed sittings are already on this member', (sittings ?? []).length === 2,
    `rows=${(sittings ?? []).length}`);
  check('the newest is the new pattern and the older is not',
    sittings?.[0]?.pattern?.patternKey === 'recovery_running_behind'
      && sittings?.[1]?.pattern?.patternKey === 'carrying_it_alone',
    `${sittings?.[0]?.pattern?.patternKey} then ${sittings?.[1]?.pattern?.patternKey}`);

  const { data: coachBefore } = await service.from('profiles')
    .select('is_test').eq('id', coachId).maybeSingle();
  check('the coach is not a test account going in', coachBefore?.is_test === false,
    `is_test=${coachBefore?.is_test}`);
  if (coachBefore?.is_test !== false) throw new Error('refusing to touch an unexpected flag');

  await service.from('profiles').update({ is_test: true }).eq('id', coachId);
  flipped = true;
  const { data: onNow } = await service.from('profiles')
    .select('is_test').eq('id', coachId).maybeSingle();
  check('the fixture-viewer pairing is on for the run', onNow?.is_test === true);

  coachMint = await mintSessionContext(browser, COACH_EMAIL,
    { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
  check('minted a coach session', Boolean(coachMint));
  if (!coachMint) throw new Error('mint failed');
  const page = await coachMint.context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`coach: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`coach pageerror: ${String(e).slice(0, 200)}`));

  const resp = await page.goto(`${BASE}/coach/clients/${memberId}/detail`,
    { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(12000);
  check('the client screen opens rather than 404ing', resp?.status() === 200, `HTTP ${resp?.status()}`);

  const cardText = squash(await page.textContent('main'));
  if (cardText.includes(EM_DASH)) emDashScreens.push('coach card, newest sitting');
  check('the deep-dive card is on the screen', cardText.includes('Stress & Load Deep-Dive'));
  check('the newest sitting shows the new pattern name',
    cardText.includes('Recovery Running Behind'));
  check('with the approved headline, word for word', cardText.includes(HEADLINE));
  check('and the approved body, word for word', cardText.includes(squash(BODY_COPY)));
  check('the two sides are still shown separately',
    cardText.includes('The load side') && cardText.includes('The recovery side'));
  check('and no combined figure is printed',
    !/Overall score|Total score|Combined score/i.test(cardText));
  await page.screenshot({ path: `${SHOTS}/05-coach-new-sitting.png`, fullPage: true }).catch(() => {});

  // Scoped to the deep-dive card: the Weekly Reflection panel beside it
  // uses the same aria-pressed chip pattern, so an unscoped locator counts
  // both panels' chips and proves nothing about this one.
  const card = page.locator('section', { hasText: 'Stress & Load Deep-Dive' }).last();
  const chips = card.locator('button[aria-pressed]');
  const chipCount = await chips.count();
  check('both sittings are offered as selectable chips', chipCount === 2, `chips=${chipCount}`);
  if (chipCount === 2) {
    await chips.nth(1).click();
    await page.waitForTimeout(2000);
    const priorText = squash(await page.textContent('main'));
    if (priorText.includes(EM_DASH)) emDashScreens.push('coach card, prior sitting');
    check('selecting the prior chip shows its own original reading, unchanged',
      priorText.includes('Carrying It Alone') && !priorText.includes('Recovery Running Behind'),
      priorText.slice(priorText.indexOf('What Root found'), priorText.indexOf('What Root found') + 120));
    check('the prior reading still shows two separate sides',
      priorText.includes('The load side') && priorText.includes('The recovery side'));
    await page.screenshot({ path: `${SHOTS}/06-coach-prior-sitting.png`, fullPage: true }).catch(() => {});
  }

  check('zero em dashes on the coach screens visited', emDashScreens.length === 0,
    emDashScreens.join(', '));
  check('zero console or page errors', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));
} catch (error) {
  check('the run completed without throwing', false, String(error).slice(0, 400));
} finally {
  if (coachMint) await retireSession(coachMint).catch(() => {});
  await browser.close();
  if (flipped && coachId) {
    await service.from('profiles').update({ is_test: false }).eq('id', coachId);
    const { data: restored } = await service.from('profiles')
      .select('is_test').eq('id', coachId).maybeSingle();
    console.log(`\ncoach is_test restored to ${restored?.is_test}`);
    if (restored?.is_test !== false) console.log('!! COACH FLAG NOT RESTORED, FIX BY HAND !!');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('failed:', failures.join(' | '));
process.exit(fail === 0 ? 0 : 1);
