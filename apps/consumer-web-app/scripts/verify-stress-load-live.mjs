/**
 * Live verification for the Stress & Load Deep-Dive (2026-08-29).
 *
 * Drives the real member journey on app.mefwellness.com, in a mobile
 * viewport, from "her coach has not assigned it" through assigning it by
 * driving the coach's own screen, the pop-up, the eleven questions, the
 * reading, the experiment, the coach card, and a fresh sign-in afterwards.
 *
 * Turnstile is live on the login form by design, so this mints one-time
 * sessions (scripts/lib/mint-session.mjs) and retires each with scope
 * 'local'. No password is read or used.
 *
 * WHAT IT LEAVES BEHIND. One completed sitting for the standing test
 * member, which is the thing being verified, plus the two Root Map rows and
 * (if the cap allows) one experiment. The temporary coach_client_assignments
 * row it needs to reach the coach screen is removed in the finally block.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.LIVE_MEMBER_EMAIL;
const COACH_EMAIL = process.env.LIVE_COACH_EMAIL;
const SHOTS = process.env.LIVE_SHOT_DIR || 'screenshots/live-stress-load';
const VIEWPORT = { width: 390, height: 844 };
const TIMEOUT = 60000;
const DEFINITION_ID = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';

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

async function mainText(page) {
  return squash(await page.textContent('main').catch(() => ''));
}

const browser = await chromium.launch();
let memberId, coachId, tempAssignmentId = null;

try {
  memberId = await idFor(MEMBER_EMAIL);
  coachId = await idFor(COACH_EMAIL);
  check('resolved both accounts', Boolean(memberId && coachId));
  if (!memberId || !coachId) throw new Error('account lookup failed');

  // ------------------------------------------------------------------
  // Clean slate: this member must start the run genuinely unassigned.
  // ------------------------------------------------------------------
  await service.from('assessment_assignments').delete()
    .eq('member_id', memberId).eq('assessment_definition_id', DEFINITION_ID);
  await service.from('member_stress_load_sessions').delete().eq('member_id', memberId);
  await service.from('assessment_attempts').delete()
    .eq('member_id', memberId).eq('assessment_definition_id', DEFINITION_ID);
  await service.from('registry_entries').delete()
    .eq('member_id', memberId).eq('source_feature', 'stress_load_deep_dive_finding');
  await service.from('member_root_popup_dismissals').delete()
    .eq('member_id', memberId).like('message_key', 'stress_load:%');

  // ==================================================================
  // 1. BEFORE ASSIGNMENT
  // ==================================================================
  console.log('\n--- 1. before assignment ---');
  let minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
  check('minted a member session', Boolean(minted));
  if (!minted) throw new Error('mint failed');
  let page = await minted.context.newPage();
  watch(page, 'member/pre');

  await settle(page, '/dashboard', 5000);
  let home = await mainText(page);
  const bodyPre = squash(await page.textContent('body'));
  check('no pop-up before assignment', !bodyPre.includes('asked Root to sit down'));
  check('no Home card before assignment', !home.includes('From your coach: Stress & Load Deep-Dive'));
  await shot(page, '01-home-before');

  await settle(page, '/stress-load', 4000);
  check('direct URL bounces to Home', new URL(page.url()).pathname === '/dashboard',
    page.url().replace(BASE, ''));

  const { count: rowsBefore } = await service.from('member_stress_load_sessions')
    .select('id', { count: 'exact', head: true }).eq('member_id', memberId);
  check('zero rows written by any of that', (rowsBefore ?? 0) === 0, `rows=${rowsBefore}`);
  await retireSession(minted);

  // ==================================================================
  // 2. ASSIGN, THROUGH THE REAL COACH SCREEN
  // ==================================================================
  console.log('\n--- 2. assign via the coach screen ---');
  // The coach client tree hard 404s a test account for a coach who is not
  // assigned to them, so this run adds that row and removes it at the end.
  const { data: temp } = await service.from('coach_client_assignments')
    .insert({ coach_id: coachId, client_id: memberId, assigned_by: coachId, status: 'active' })
    .select('id').maybeSingle();
  tempAssignmentId = temp?.id ?? null;
  check('temporary coach assignment created for the run', Boolean(tempAssignmentId));

  const coachMint = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
  check('minted a coach session', Boolean(coachMint));
  const coachPage = await coachMint.context.newPage();
  watch(coachPage, 'coach');

  await settle(coachPage, `/coach/clients/${memberId}/detail`, 8000);
  let coachText = await mainText(coachPage);
  check('coach card shows the not-assigned state', coachText.includes('Not assigned.'));
  const assignButton = coachPage.getByRole('button', { name: /Assign Stress & Load Deep-Dive/i }).first();
  check('assign button is on the coach client screen', await assignButton.count() > 0);
  await shot(coachPage, '02-coach-not-assigned');

  await assignButton.click();
  await coachPage.waitForTimeout(6000);
  coachText = await mainText(coachPage);
  check('coach card now says assigned and not completed', /not completed yet/.test(coachText));
  await shot(coachPage, '03-coach-assigned');

  const { data: created } = await service.from('assessment_assignments')
    .select('id, status').eq('member_id', memberId)
    .eq('assessment_definition_id', DEFINITION_ID);
  check('exactly one pending assignment row exists', (created ?? []).length === 1
    && created[0].status === 'pending', JSON.stringify(created));

  // ==================================================================
  // 3. THE MEMBER SEES IT
  // ==================================================================
  console.log('\n--- 3. the pop-up and the card ---');
  minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
  page = await minted.context.newPage();
  watch(page, 'member/assigned');

  await settle(page, '/dashboard', 6000);
  let body = squash(await page.textContent('body'));
  check('pop-up appears with the approved line',
    body.includes('Your coach asked Root to sit down with you on this one.'));
  check('pop-up is titled with the experience name', body.includes('Stress &'));
  await shot(page, '04-popup');

  const maybeLater = page.getByRole('button', { name: /Maybe later/i }).first();
  check('pop-up offers Maybe later', await maybeLater.count() > 0);
  if (await maybeLater.count() > 0) {
    await maybeLater.click();
    await page.waitForTimeout(4000);
  }
  home = await mainText(page);
  check('the Home card sits there once the pop-up is dismissed',
    home.includes('From your coach: Stress & Load Deep-Dive'));
  await shot(page, '05-home-card');
  await retireSession(minted);

  // A genuinely fresh sign-in, which is what "Maybe later means next login"
  // actually depends on.
  minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
  page = await minted.context.newPage();
  watch(page, 'member/relogin');
  await settle(page, '/dashboard', 6000);
  body = squash(await page.textContent('body'));
  check('Maybe later brings it back on the next sign-in',
    body.includes('Your coach asked Root to sit down with you on this one.'));
  const startNow = page.getByRole('button', { name: /^Start now$/i }).first();
  check('pop-up offers Start now', await startNow.count() > 0);

  // ==================================================================
  // 4. THE ELEVEN QUESTIONS
  // ==================================================================
  console.log('\n--- 4. the eleven questions ---');
  if (await startNow.count() > 0) {
    await startNow.click();
    await page.waitForTimeout(5000);
  } else {
    await settle(page, '/stress-load', 5000);
  }
  check('lands on the deep-dive route', new URL(page.url()).pathname === '/stress-load', page.url());

  const seen = [];
  const emDashScreens = [];

  async function screenText() { return squash(await page.textContent('main')); }
  async function continueButton() {
    return page.getByRole('button', { name: /^(Continue|See what Root found)$/ }).first();
  }

  const ANSWERS = [
    { label: 'Q1 heaviness', pick: ['Crushing'] },
    { label: 'Q2 sources', pick: ['Work or business', 'Money', 'Health'] },
    { label: 'Q3 follows home', pick: ['Money'] },
    { label: 'Q4 would drop', type: 'The Thursday budget review nobody reads.' },
    { label: 'Q5 body signals', pick: ['My sleep changes', 'My energy drops', 'My mind races'] },
    { label: 'Q6 loudest', pick: ["At night, when I'm trying to sleep"] },
    { label: 'Q7 what you do', pick: ['Push through and keep going', 'Scroll, watch TV, or distract myself'] },
    { label: 'Q8 relied on most', pick: ['Push through and keep going'] },
    { label: 'Q9 restores', pick: ['Being outside', 'Music'] },
    { label: 'Q10 how much', pick: ['A taste'] },
    { label: 'Q11 lean on', pick: ['No one right now'] },
  ];

  let disabledSeen = 0, reasonSeen = 0;
  for (let i = 0; i < ANSWERS.length; i += 1) {
    const step = ANSWERS[i];
    const before = await screenText();
    seen.push(before.slice(0, 90));
    if (before.includes(EM_DASH)) emDashScreens.push(`question ${i + 1}`);

    const cta = await continueButton();
    if (await cta.count() > 0 && (await cta.isDisabled())) disabledSeen += 1;
    // Its reason has to be on the screen, not only in the button state.
    if (/Pick |Write |Name |Say |Add /.test(before)) reasonSeen += 1;

    if (i === 2) {
      // Q3 offers only her own Q2 selections, and nothing else.
      const offered = ['Work or business', 'Money', 'Health'].every((o) => before.includes(o));
      const absent = ['Family or caregiving', 'A relationship', 'Home or living situation']
        .every((o) => !before.includes(o));
      check('Q3 offers only her own Q2 choices', offered && absent);
      await shot(page, '06-q3-derived');
    }
    if (i === 7) {
      const offered = ['Push through and keep going', 'Scroll, watch TV, or distract myself']
        .every((o) => before.includes(o));
      const absent = ['Drink alcohol', 'Talk to someone'].every((o) => !before.includes(o));
      check('Q8 offers only her own Q7 choices', offered && absent);
      await shot(page, '07-q8-derived');
    }

    if (step.type) {
      await page.locator('textarea').first().fill(step.type);
    } else {
      for (const option of step.pick) {
        await page.getByRole(step.label.startsWith('Q2') || step.label.startsWith('Q5')
          || step.label.startsWith('Q7') || step.label.startsWith('Q9')
          || step.label.startsWith('Q11') ? 'checkbox' : 'radio', { name: option, exact: true })
          .first().click();
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(400);

    if (i === 0) {
      // Back is not offered on the first question, and Close always is.
      check('Close is on the first question', await page.getByRole('button', { name: 'Close' }).count() > 0);
      check('Back is not offered on the first question',
        await page.getByRole('button', { name: 'Back' }).count() === 0);
    }
    if (i === 1) {
      // Back navigation really goes back a question and keeps her answer.
      await page.getByRole('button', { name: 'Back' }).first().click();
      await page.waitForTimeout(800);
      const backText = await screenText();
      check('Back returns to the previous question', backText.includes('Question 1 of 11'));
      check('and her earlier answer survives it', backText.includes('Crushing'));
      await (await continueButton()).click();
      await page.waitForTimeout(800);
    }

    const go = await continueButton();
    await go.click();
    await page.waitForTimeout(i === ANSWERS.length - 1 ? 9000 : 700);
  }

  check('every question showed a disabled Continue before it was answered',
    disabledSeen === ANSWERS.length, `${disabledSeen} of ${ANSWERS.length}`);
  check('every question showed the reason it was disabled',
    reasonSeen === ANSWERS.length, `${reasonSeen} of ${ANSWERS.length}`);

  const reading = await screenText();
  if (reading.includes(EM_DASH)) emDashScreens.push('reading');
  check('the reading screen names her pattern', reading.includes('Carrying It Alone'), reading.slice(0, 200));
  check('the reading shows the load side and the recovery side separately',
    reading.includes('The load side') && reading.includes('The recovery side'));
  check('and does not print a combined score', !/Overall score|Total score|Combined/i.test(reading));
  await shot(page, '08-reading');

  const { data: sessions } = await service.from('member_stress_load_sessions')
    .select('id, assignment_id, completed_at, pattern, answers').eq('member_id', memberId);
  check('exactly one session row, and it is complete',
    (sessions ?? []).length === 1 && Boolean(sessions[0]?.completed_at),
    `rows=${(sessions ?? []).length}`);
  check('no empty draft rows anywhere',
    (sessions ?? []).every((s) => s.completed_at && Object.keys(s.answers ?? {}).length === 11));
  check('the stored reading holds two sides and no combined number',
    sessions?.[0]?.pattern?.load?.band === 'high'
      && sessions?.[0]?.pattern?.recovery?.band === 'thin'
      && !('score' in (sessions?.[0]?.pattern ?? {})),
    JSON.stringify({ load: sessions?.[0]?.pattern?.load?.band, recovery: sessions?.[0]?.pattern?.recovery?.band }));

  const { data: assignmentAfter } = await service.from('assessment_assignments')
    .select('status').eq('member_id', memberId).eq('assessment_definition_id', DEFINITION_ID);
  check('the assignment closed itself out on completion',
    (assignmentAfter ?? []).every((a) => a.status === 'completed'), JSON.stringify(assignmentAfter));

  // ==================================================================
  // 7. THE EXPERIMENT AND THE RESOURCE
  // ==================================================================
  console.log('\n--- 7. the experiment and the resource ---');
  await (await continueButton()).click().catch(() => {});
  await page.waitForTimeout(2500);
  let offerText = await screenText();
  if (offerText.includes(EM_DASH)) emDashScreens.push('experiment');
  check('the experiment is built from what she picked first in Q9',
    /outside/i.test(offerText), offerText.slice(0, 220));
  check('it carries a difficult-day version', /On a difficult day/i.test(offerText));
  await shot(page, '09-experiment');

  const accept = page.getByRole('button', { name: /start the 7 days/i }).first();
  check('the experiment can be accepted', await accept.count() > 0);
  const { count: activeBefore } = await service.from('lifestyle_experiments')
    .select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('status', 'active');
  if (await accept.count() > 0) { await accept.click(); await page.waitForTimeout(7000); }

  const closing = await screenText();
  if (closing.includes(EM_DASH)) emDashScreens.push('closing');
  const { data: experiments } = await service.from('lifestyle_experiments')
    .select('id, title, protocol, status, source_experience_key')
    .eq('member_id', memberId).eq('source_experience_key', 'stress-load-deep-dive');
  const cappedMessage = /already working on 2 experiments/i.test(closing);
  check('accepting either started it or said the 2 slot cap stopped it',
    (experiments ?? []).length === 1 || cappedMessage,
    `existing active before=${activeBefore}, started=${(experiments ?? []).length}, capped=${cappedMessage}`);
  check('the closing screen is readable and did not flash past',
    closing.includes('Thank you for sitting with that'), closing.slice(0, 160));
  await shot(page, '10-closing');

  const readFull = page.getByRole('button', { name: /Read the full piece/i }).first();
  check('the resource is offered by name',
    closing.includes('Load Is Not the Enemy. Unpaid Recovery Is.'));
  if (await readFull.count() > 0) {
    await readFull.click();
    await page.waitForTimeout(1200);
    const opened = await screenText();
    check('the resource opens', opened.includes('Load and recovery are two separate accounts'));
    if (opened.includes(EM_DASH)) emDashScreens.push('resource');
    await shot(page, '11-resource');
  } else {
    check('the resource opens', false, 'read button not found');
  }
  await retireSession(minted);

  // ==================================================================
  // 6. THE ROOT MAP RECEIVED TWO SEPARATE WRITES
  // ==================================================================
  console.log('\n--- 6. the Root Map ---');
  const { data: rows } = await service.from('registry_entries')
    .select('code, domain, severity, numeric_value, unit, status')
    .eq('member_id', memberId).eq('source_feature', 'stress_load_deep_dive_finding');
  const load = (rows ?? []).find((r) => r.code === 'stress_load_burden');
  const recovery = (rows ?? []).find((r) => r.code === 'recovery_capacity');
  check('two rows, one per dimension', (rows ?? []).length === 2 && Boolean(load) && Boolean(recovery),
    JSON.stringify(rows));
  check('they carry two different numbers under two different units',
    load?.unit === 'load_points' && recovery?.unit === 'recovery_points'
      && load?.numeric_value !== recovery?.numeric_value,
    `${load?.numeric_value} vs ${recovery?.numeric_value}`);
  check('both are active', [load, recovery].every((r) => r?.status === 'active'));

  // ==================================================================
  // 5. THE COACH CARD
  // ==================================================================
  console.log('\n--- 5. the coach card ---');
  await settle(coachPage, `/coach/clients/${memberId}/detail`, 9000);
  coachText = await mainText(coachPage);
  check('coach sees the pattern name', coachText.includes('Carrying It Alone'));
  check('coach sees both sides separately',
    coachText.includes('The load side') && coachText.includes('The recovery side'));
  check('what she would drop tomorrow is the opener, above her answers',
    coachText.includes('What they would drop tomorrow')
      && coachText.indexOf('What they would drop tomorrow') < coachText.indexOf('In their own words'));
  check('and it is in her own words',
    coachText.includes('The Thursday budget review nobody reads.'));
  check('her recovery sources are named', coachText.includes('What restores them')
    && /Being outside/.test(coachText));
  check('who she can lean on is named', coachText.includes('Who they can lean on')
    && /No one right now/.test(coachText));
  check('her answers are grouped under the three screen headings',
    coachText.includes('The Load') && coachText.includes("The Body's Answer")
      && coachText.includes('The Recovery Side'));
  check('the coach card carries no em dash', !coachText.includes(EM_DASH));
  await shot(coachPage, '12-coach-completed');
  await retireSession(coachMint);

  // ==================================================================
  // 8. A FRESH SIGN-IN AFTERWARDS
  // ==================================================================
  console.log('\n--- 8. after completion ---');
  minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: VIEWPORT });
  page = await minted.context.newPage();
  watch(page, 'member/after');
  await settle(page, '/dashboard', 6000);
  body = squash(await page.textContent('body'));
  home = await mainText(page);
  check('no pop-up after completion', !body.includes('asked Root to sit down'));
  check('no Home card after completion', !home.includes('From your coach: Stress & Load Deep-Dive'));
  await shot(page, '13-home-after');

  await settle(page, '/stress-load', 5000);
  const done = await mainText(page);
  check('the URL shows the completed state rather than bouncing',
    new URL(page.url()).pathname === '/stress-load' && done.includes('This one is done'),
    page.url().replace(BASE, ''));
  check('and nothing is re-offered there', !done.includes('Question 1 of 11'));
  if (done.includes(EM_DASH)) emDashScreens.push('completed state');
  await shot(page, '14-completed-state');
  await retireSession(minted);

  // ==================================================================
  // 9. CONSOLE AND EM DASHES
  // ==================================================================
  console.log('\n--- 9. console and em dashes ---');
  check('zero em dashes on every screen visited', emDashScreens.length === 0, emDashScreens.join(', '));
  check('zero console or page errors', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));
} catch (error) {
  check('the run completed without throwing', false, String(error).slice(0, 300));
} finally {
  if (tempAssignmentId) {
    await service.from('coach_client_assignments').delete().eq('id', tempAssignmentId);
    console.log('\nremoved the temporary coach assignment');
  }
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('failed:', failures.join(' | '));
process.exit(fail === 0 ? 0 : 1);
