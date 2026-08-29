/**
 * Live verification for the fifth pattern, Recovery Running Behind
 * (2026-08-29).
 *
 * Drives one fresh sitting on app.mefwellness.com in a mobile viewport,
 * answering to hit the new combination exactly: load high, recovery
 * partial, body quiet, somebody named on Q11.
 *
 * IT DELETES NOTHING. The member's existing completed sitting has to
 * survive this run untouched, because half the point is that a stored
 * pattern is not retroactively rewritten and the prior sitting is still
 * selectable on the coach card with its own original reading. The only
 * rows removed are the temporary coach assignment this run creates and
 * the pop-up dismissal for the fresh assignment.
 *
 * Turnstile is live on the login form by design, so this mints one-time
 * sessions (scripts/lib/mint-session.mjs) and retires each with scope
 * 'local'. No password is read or used.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.LIVE_MEMBER_EMAIL;
const COACH_EMAIL = process.env.LIVE_COACH_EMAIL;
const SHOTS = process.env.LIVE_SHOT_DIR || 'screenshots/live-recovery-running-behind';
const VIEWPORT = { width: 390, height: 844 };
const TIMEOUT = 60000;
const DEFINITION_ID = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';

const HEADLINE = 'You are recovering, just not at the pace you are spending.';
const BODY_COPY =
  'There are things in your week that genuinely help you recover, and they are working. The issue is that your current load is asking for more recovery than you are getting. Over time, that gap can slowly wear you down. The goal is not necessarily to add something new. It is to give more room to what you already know helps you recover.';

for (const [name, value] of [['LIVE_MEMBER_EMAIL', MEMBER_EMAIL], ['LIVE_COACH_EMAIL', COACH_EMAIL]]) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? '')) {
    console.error(`${name} must be a plain email address`);
    process.exit(1);
  }
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
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label} pageerror: ${String(e).slice(0, 200)}`));
}

const EM_DASH = '—';
const emDashScreens = [];
function squash(s) { return (s || '').replace(/\s+/g, ' '); }

async function idFor(email) {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email === email)?.id ?? null;
}

async function settle(page, path, waitMs = 3500) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(waitMs);
}
async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
}
async function mainText(page) { return squash(await page.textContent('main').catch(() => '')); }

const browser = await chromium.launch();
let memberId, coachId, priorSessionId = null;
let coachWasTest = null, coachFlagFlipped = false;

try {
  memberId = await idFor(MEMBER_EMAIL);
  coachId = await idFor(COACH_EMAIL);
  check('resolved both accounts', Boolean(memberId && coachId));
  if (!memberId || !coachId) throw new Error('account lookup failed');

  // ==================================================================
  // 0. WHAT IS ALREADY THERE, RECORDED BEFORE ANYTHING IS TOUCHED
  // ==================================================================
  console.log('\n--- 0. the sitting that already exists ---');
  const { data: before } = await service.from('member_stress_load_sessions')
    .select('id, completed_at, pattern').eq('member_id', memberId)
    .order('completed_at', { ascending: false });
  check('exactly one completed sitting exists going in', (before ?? []).length === 1,
    `rows=${(before ?? []).length}`);
  priorSessionId = before?.[0]?.id ?? null;
  const priorPattern = before?.[0]?.pattern?.patternKey ?? null;
  console.log(`      prior sitting ${priorSessionId} stored as ${priorPattern}`);
  check('the prior sitting is a stored pattern key, not a derived one', Boolean(priorPattern));

  // ==================================================================
  // 1. RE-ASSIGN, THROUGH THE REAL COACH SCREEN
  // ==================================================================
  console.log('\n--- 1. re-assign via the coach screen ---');
  // The A3 layout guard (app/coach/clients/[id]/layout.tsx) hard 404s a
  // member whose profile is `is_test` unless the VIEWER is a test account
  // too. That pairing is the exception lib/staff/testAccounts.ts documents
  // as "the whole point of the production QA fixture", so this run turns it
  // on for the coach for the length of the run and turns it back off in the
  // finally block. Nothing else about either account is touched, and no
  // coach_client_assignments row is created or removed: the coach already
  // has a standing assignment to this member.
  // Turning that pairing on means writing to a real staff account's
  // profile, so it is opt-in: without ALLOW_VIEWER_PAIRING=1 the run skips
  // the coach screen entirely and says so, rather than quietly editing an
  // account nobody asked it to touch.
  const PAIRING_ALLOWED = process.env.ALLOW_VIEWER_PAIRING === '1';
  const { data: coachProfile } = await service.from('profiles')
    .select('is_test').eq('id', coachId).maybeSingle();
  coachWasTest = coachProfile?.is_test === true;

  const { data: existingLink } = await service.from('coach_client_assignments')
    .select('id').eq('coach_id', coachId).eq('client_id', memberId).eq('status', 'active');
  check('the coach already has a standing assignment to this member',
    (existingLink ?? []).length > 0, `rows=${(existingLink ?? []).length}`);

  if (PAIRING_ALLOWED && !coachWasTest) {
    await service.from('profiles').update({ is_test: true }).eq('id', coachId);
    coachFlagFlipped = true;
    const { data: readBack } = await service.from('profiles')
      .select('is_test').eq('id', coachId).maybeSingle();
    check('the fixture-viewer pairing was turned on for the run',
      readBack?.is_test === true, `is_test=${readBack?.is_test}`);
  }
  const COACH_SCREEN = PAIRING_ALLOWED || coachWasTest;
  if (!COACH_SCREEN) {
    console.log('SKIP  the coach screen: the A3 guard 404s this member for a non-test viewer,');
    console.log('      and ALLOW_VIEWER_PAIRING=1 was not set. The assignment is written');
    console.log('      directly instead, mirroring assignStressLoadDeepDiveAction.');
  }

  let coachMint = null, coachPage = null, coachText = '';
  if (COACH_SCREEN) {
    coachMint = await mintSessionContext(browser, COACH_EMAIL,
      { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
    check('minted a coach session', Boolean(coachMint));
    coachPage = await coachMint.context.newPage();
    watch(coachPage, 'coach');

    await settle(coachPage, `/coach/clients/${memberId}/detail`, 9000);
    coachText = await mainText(coachPage);
    check('coach card already shows the prior sitting',
      coachText.includes('Stress & Load Deep-Dive') && coachText.includes('Nothing open right now'));
    await shot(coachPage, '01-coach-before');

    const assignButton = coachPage.getByRole('button', { name: /Assign Stress & Load Deep-Dive/i }).first();
    check('assign button is on the coach client screen', await assignButton.count() > 0);
    await assignButton.click();
    await coachPage.waitForTimeout(7000);
    coachText = await mainText(coachPage);
    check('coach card now says assigned and not completed', /not completed yet/.test(coachText));
    await shot(coachPage, '02-coach-assigned');
  } else {
    // The same row assignStressLoadDeepDiveAction writes, and nothing else.
    const { data: written, error } = await service.from('assessment_assignments').insert({
      member_id: memberId,
      assessment_definition_id: DEFINITION_ID,
      assigned_by: coachId,
      status: 'pending',
    }).select('id, status').maybeSingle();
    check('assignment written directly (coach screen skipped)', Boolean(written),
      error?.message ?? JSON.stringify(written));
  }

  const { data: pending } = await service.from('assessment_assignments')
    .select('id, status').eq('member_id', memberId)
    .eq('assessment_definition_id', DEFINITION_ID).eq('status', 'pending');
  check('exactly one pending assignment row exists', (pending ?? []).length === 1,
    JSON.stringify(pending));

  // ==================================================================
  // 2. A FRESH SITTING, ANSWERED ONTO THE NEW COMBINATION
  // ==================================================================
  console.log('\n--- 2. the eleven questions, onto the new combination ---');
  const minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
  check('minted a member session', Boolean(minted));
  if (!minted) throw new Error('mint failed');
  const page = await minted.context.newPage();
  watch(page, 'member');

  await settle(page, '/stress-load', 6000);
  check('lands on the deep-dive route', new URL(page.url()).pathname === '/stress-load', page.url());

  async function screenText() { return squash(await page.textContent('main')); }
  async function continueButton() {
    return page.getByRole('button', { name: /^(Continue|See what Root found)$/ }).first();
  }

  /**
   * The combination, spelled out:
   *   Q1 Crushing (5) + 3 sources (breadth point 1) = 6 load points, HIGH
   *   Q5 two signals of eight, so the body is NOT loud
   *   Q10 "Some, but not enough" (2) + Q11 naming a friend (1) = 3, PARTIAL
   */
  const MULTI = new Set(['Q2', 'Q5', 'Q7', 'Q9', 'Q11']);
  const ANSWERS = [
    { label: 'Q1', pick: ['Crushing'] },
    { label: 'Q2', pick: ['Work or business', 'Money', 'Health'] },
    { label: 'Q3', pick: ['Money'] },
    { label: 'Q4', type: 'The standing Friday status meeting.' },
    { label: 'Q5', pick: ['My sleep changes', 'My energy drops'] },
    { label: 'Q6', pick: ["At night, when I'm trying to sleep"] },
    { label: 'Q7', pick: ['Push through and keep going', 'Exercise or move'] },
    { label: 'Q8', pick: ['Push through and keep going'] },
    { label: 'Q9', pick: ['Being outside', 'Music'] },
    { label: 'Q10', pick: ['Some, but not enough'] },
    { label: 'Q11', pick: ['A friend'] },
  ];

  for (let i = 0; i < ANSWERS.length; i += 1) {
    const step = ANSWERS[i];
    const text = await screenText();
    if (text.includes(EM_DASH)) emDashScreens.push(`question ${i + 1}`);
    if (step.type) {
      await page.locator('textarea').first().fill(step.type);
    } else {
      for (const option of step.pick) {
        await page.getByRole(MULTI.has(step.label) ? 'checkbox' : 'radio', { name: option, exact: true })
          .first().click();
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(400);
    await (await continueButton()).click();
    await page.waitForTimeout(i === ANSWERS.length - 1 ? 10000 : 700);
  }

  // ==================================================================
  // 3. THE READING
  // ==================================================================
  console.log('\n--- 3. the reading ---');
  const reading = await screenText();
  if (reading.includes(EM_DASH)) emDashScreens.push('reading');
  check('the reading names Recovery Running Behind', reading.includes('Recovery Running Behind'),
    reading.slice(0, 200));
  check('the approved headline, word for word', reading.includes(HEADLINE));
  check('the approved body, word for word', reading.includes(squash(BODY_COPY)));
  check('it did NOT fall to one of the other names',
    !reading.includes('Heavy Load, Thin Recovery') && !reading.includes('Carrying It Alone')
      && !reading.includes('Loaded but Buffered') && !reading.includes('Body Speaking First'));
  check('the load side and the recovery side are two separate boxes',
    reading.includes('The load side') && reading.includes('The recovery side')
      && reading.includes('These two are kept apart on purpose'));
  check('and no combined score is printed anywhere',
    !/Overall score|Total score|Combined score|Combined/i.test(reading));
  await shot(page, '03-reading');

  const { data: after } = await service.from('member_stress_load_sessions')
    .select('id, completed_at, pattern').eq('member_id', memberId)
    .order('completed_at', { ascending: false });
  const fresh = (after ?? []).find((s) => s.id !== priorSessionId) ?? null;
  const priorAfter = (after ?? []).find((s) => s.id === priorSessionId) ?? null;
  check('there are now two completed sittings', (after ?? []).length === 2,
    `rows=${(after ?? []).length}`);
  check('the new one stored the new pattern key',
    fresh?.pattern?.patternKey === 'recovery_running_behind', fresh?.pattern?.patternKey);
  check('its bands are exactly the new combination',
    fresh?.pattern?.load?.band === 'high' && fresh?.pattern?.recovery?.band === 'partial'
      && fresh?.pattern?.body?.signalsLoud === false
      && fresh?.pattern?.recovery?.namesSupport === true,
    JSON.stringify({ load: fresh?.pattern?.load?.band, recovery: fresh?.pattern?.recovery?.band,
      loud: fresh?.pattern?.body?.signalsLoud, named: fresh?.pattern?.recovery?.namesSupport }));
  check('the prior sitting was NOT rewritten by this build',
    priorAfter?.pattern?.patternKey === priorPattern,
    `${priorPattern} -> ${priorAfter?.pattern?.patternKey}`);

  // The experiment offer is declined: this run is about the reading.
  const decline = page.getByRole('button', { name: /Not right now/i }).first();
  if (await decline.count() > 0) { await decline.click(); await page.waitForTimeout(4000); }
  const closing = await screenText();
  if (closing.includes(EM_DASH)) emDashScreens.push('closing');
  await shot(page, '04-closing');
  await retireSession(minted);

  // ==================================================================
  // 4. THE COACH CARD, WITH BOTH SITTINGS
  // ==================================================================
  console.log('\n--- 4. the coach card ---');
  if (!COACH_SCREEN) {
    console.log('SKIP  every coach card check: the screen is unreachable for this viewer.');
  } else {
    await settle(coachPage, `/coach/clients/${memberId}/detail`, 10000);
    coachText = await mainText(coachPage);
    check('coach sees the new pattern name on the newest sitting',
      coachText.includes('Recovery Running Behind'), coachText.slice(0, 200));
    check('coach sees both sides separately, still',
      coachText.includes('The load side') && coachText.includes('The recovery side'));
    check('the coach card carries no em dash', !coachText.includes(EM_DASH));
    await shot(coachPage, '05-coach-new-sitting');

    const chips = coachPage.locator('button[aria-pressed]');
    const chipCount = await chips.count();
    check('two sittings are offered as selectable chips', chipCount === 2, `chips=${chipCount}`);
    if (chipCount === 2) {
      await chips.nth(1).click();
      await coachPage.waitForTimeout(1500);
      const priorReadingText = await mainText(coachPage);
      check('selecting the prior chip shows its own original reading, unchanged',
        priorReadingText.includes('Carrying It Alone')
          && !priorReadingText.includes('Recovery Running Behind'),
        priorReadingText.slice(0, 200));
      check('the prior reading still shows two separate sides',
        priorReadingText.includes('The load side') && priorReadingText.includes('The recovery side'));
      if (priorReadingText.includes(EM_DASH)) emDashScreens.push('coach prior sitting');
      await shot(coachPage, '06-coach-prior-sitting');
    }
  }

  // ==================================================================
  // 5. THE ROOT MAP: TWO ROWS, WRITTEN SEPARATELY, SUPERSEDING
  // ==================================================================
  console.log('\n--- 5. the Root Map ---');
  const { data: rows } = await service.from('registry_entries')
    .select('id, code, domain, severity, numeric_value, unit, status, source_record_id, recorded_at')
    .eq('member_id', memberId).eq('source_feature', 'stress_load_deep_dive_finding')
    .order('recorded_at', { ascending: false });
  const freshRows = (rows ?? []).filter((r) => r.source_record_id === fresh?.id);
  const priorRows = (rows ?? []).filter((r) => r.source_record_id === priorSessionId);
  const load = freshRows.find((r) => r.code === 'stress_load_burden');
  const recovery = freshRows.find((r) => r.code === 'recovery_capacity');
  check('the new completion wrote exactly two rows, one per dimension',
    freshRows.length === 2 && Boolean(load) && Boolean(recovery),
    JSON.stringify(freshRows.map((r) => r.code)));
  check('two different units and two different numbers, never one total',
    load?.unit === 'load_points' && recovery?.unit === 'recovery_points'
      && load?.numeric_value !== recovery?.numeric_value,
    `${load?.numeric_value} ${load?.unit} vs ${recovery?.numeric_value} ${recovery?.unit}`);
  check('severity on each row is the unchanged function of its own band',
    load?.severity === 'significant' && recovery?.severity === 'moderate',
    `load=${load?.severity} recovery=${recovery?.severity}`);
  check('both new rows are active', freshRows.every((r) => r.status === 'active'));
  check('the prior completion\'s rows were superseded rather than left active',
    priorRows.length === 0 || priorRows.every((r) => r.status !== 'active'),
    JSON.stringify(priorRows.map((r) => `${r.code}:${r.status}`)));
  if (coachMint) await retireSession(coachMint);

  // ==================================================================
  // 6. CONSOLE AND EM DASHES
  // ==================================================================
  console.log('\n--- 6. console and em dashes ---');
  check('zero em dashes on every screen visited', emDashScreens.length === 0, emDashScreens.join(', '));
  check('zero console or page errors', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));
} catch (error) {
  check('the run completed without throwing', false, String(error).slice(0, 400));
} finally {
  if (coachFlagFlipped) {
    await service.from('profiles').update({ is_test: false }).eq('id', coachId);
    const { data: restored } = await service.from('profiles')
      .select('is_test').eq('id', coachId).maybeSingle();
    console.log(`\ncoach is_test restored to ${restored?.is_test} (was ${coachWasTest})`);
    if (restored?.is_test !== false) console.log('!! COACH FLAG NOT RESTORED, FIX BY HAND !!');
  }
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('failed:', failures.join(' | '));
process.exit(fail === 0 ? 0 : 1);
