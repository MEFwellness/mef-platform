/**
 * SENDING A FINISHED ASSESSMENT AGAIN, on production, without destroying
 * the sitting she already has.
 *
 * WHAT IT DRIVES, in the order a coach does it:
 *
 *   the coach's client Detail page, with a finished assessment in
 *     Completed, offering Assign Again beside View results;
 *   the real inline form under that row, and the real confirm;
 *   the page after it: the new sitting under Assigned, Waiting with its
 *     sent date, AND the finished one still in Completed, still carrying
 *     View results, saying "Already assigned, waiting" where its own send
 *     control would have been;
 *   the member, finishing the new sitting for real;
 *   the coach again: one row back in Completed, offering Assign Again,
 *     and BOTH sittings on the card below it as date and score chips.
 *
 * IT RESTORES HER EXACTLY. Everything this run creates is removed at the
 * end and the removal is confirmed by an independent read, and the sitting
 * she had BEFORE the run is compared field by field afterwards. "The old
 * row still exists" and "the sitting she finished is intact" are two
 * different claims and only the second one is what a coach is promised.
 *
 * IT REFUSES TO RUN AGAINST ANYTHING BUT A TEST ACCOUNT, and it refuses if
 * that account has no finished sitting to send again, because a run that
 * quietly assigned a first sitting would be testing a different button.
 *
 * WHERE IT RUNS:
 *   AA_BASE_URL             default https://app.mefwellness.com
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   AA_MEMBER / AA_MEMBER_EMAIL   the client, who must be a test account
 *   AA_COACH_EMAIL                the coach whose caseload she is on
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line, and every session it
 * mints is retired locally the moment it is done.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { selectAllRows } from '../lib/data/pagedSelect.ts';

const BASE = (process.env.AA_BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const SUPA = process.env.PROD_SUPABASE_URL ?? 'https://piafgqstbibvllsnuike.supabase.co';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.AA_MEMBER;
const MEMBER_EMAIL = process.env.AA_MEMBER_EMAIL;
const COACH_EMAIL = process.env.AA_COACH_EMAIL;

/** The row this run sends again. A deep-dive, so the form draws a due date and nothing else. */
const ROW_ID = 'breathing-pattern-check-in';
const DEFINITION_ID = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405';
const EM = '—';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
}
if (!MEMBER || !MEMBER_EMAIL || !COACH_EMAIL) {
  console.error('Set AA_MEMBER, AA_MEMBER_EMAIL and AA_COACH_EMAIL.');
  process.exitCode = 1;
  throw new Error('missing identities');
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok: Boolean(ok), note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${String(e)}`));
}

const PROMPTS = [
  'Chest pain',
  'Feeling tense',
  'Blurred vision',
  'Dizzy spells',
  'Feeling confused',
  'Faster or deeper breathing',
  'Short of breath',
  'Tight feelings in chest',
  'Bloated feeling in stomach',
  'Tingling fingers',
  'Unable to breathe deeply',
  'Stiff fingers or arms',
  'Tight feelings round mouth',
  'Cold hands or feet',
  'Palpitations',
  'Feelings of anxiety',
];
/** Sixteen Rarely: sixteen out of sixty four, deliberately different from anything already stored. */
const ANSWER = 'Rarely';
const EXPECTED_TOTAL = 16;

// ---------------------------------------------------------------------
// Reads, and the waits that are on the app rather than on a clock.
// ---------------------------------------------------------------------

async function assignments() {
  const { rows: data } = await selectAllRows(() =>
    admin
      .from('assessment_assignments')
      .select('id, status, created_at, due_at, assigned_by, updated_at')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', DEFINITION_ID)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  );
  return data ?? [];
}

async function sittings() {
  const { rows: data } = await selectAllRows(() =>
    admin
      .from('member_breathing_check_in_sessions')
      .select('id, assignment_id, results, completed_at, created_at')
      .eq('member_id', MEMBER)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  );
  return data ?? [];
}

/** Waits for the ledger itself to reach a state, rather than for a number of seconds. */
async function ledgerReaches(predicate, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const rows = await assignments();
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`the ledger never reached: ${label}`);
}

async function screenKey(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
}

async function settled(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return last ?? '';
}

async function waitForScreenChange(page, previous, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now !== previous && now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`the screen never settled away from ${String(previous).slice(0, 80)}`);
}

/** Tap an answer and WAIT FOR THE APP TO AGREE it was tapped. */
async function tap(page, name) {
  const radios = page.getByRole('radio', { name, exact: true });
  const target =
    (await radios.count()) > 0 ? radios : page.getByRole('button', { name, exact: true });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await target.first().click({ timeout: 10000 }).catch(() => {});
    const [checked, pressed] = await Promise.all([
      target.first().getAttribute('aria-checked').catch(() => null),
      target.first().getAttribute('aria-pressed').catch(() => null),
    ]);
    if (checked === 'true' || pressed === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

/**
 * Opens the coach's Assessments and Findings fold.
 *
 * PRESSED UNTIL THE APP AGREES. A click before hydration on a page this
 * size does nothing at all and says nothing about it, and the rows are not
 * in the DOM until the fold is open.
 */
async function openAssessments(page) {
  const fold = page.getByRole('button', { name: /assessments and findings/i }).first();
  await fold.waitFor({ state: 'visible', timeout: 40000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await page.locator(`[data-assessment-row="${ROW_ID}"]`).count()) > 0) return;
    await fold.click({ timeout: 10000 }).catch(() => {});
    const open = await page
      .waitForSelector(`[data-assessment-row="${ROW_ID}"]`, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (open) return;
  }
  throw new Error('the Assessments and Findings section never opened');
}

/** Which group one row is sitting in, read from the DOM rather than assumed. */
async function groupOf(page, instanceId) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-assessment-row="${id}"]`);
    if (!row) return null;
    const group = row.closest('[data-assessment-group]');
    return group ? group.getAttribute('data-assessment-group') : null;
  }, instanceId);
}

async function rowText(page, instanceId) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-assessment-row="${id}"]`);
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : null;
  }, instanceId);
}

// ---------------------------------------------------------------------

const { data: guard } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (guard?.is_test !== true) throw new Error(`REFUSING TO RUN: ${MEMBER} is not a test account`);
console.log(`target is the test account "${guard.display_name}" on ${BASE}`);

const beforeAssignments = await assignments();
const beforeSittings = await sittings();
const beforeFinished = beforeSittings.filter((row) => row.completed_at);

if (beforeAssignments.some((row) => row.status === 'pending')) {
  throw new Error('REFUSING TO RUN: she is already sitting on one, so there is nothing to send again');
}
if (beforeFinished.length === 0) {
  throw new Error('REFUSING TO RUN: she has finished none of these, so Assign Again is not the button under test');
}
console.log(
  `before: ${beforeAssignments.length} assignment row(s), ${beforeFinished.length} finished sitting(s)`
);

const browser = await chromium.launch();
let coachSession = null;
let memberSession = null;
let createdAssignmentId = null;

try {
  // -------------------------------------------------------------------
  // 1. THE COACH SEES ASSIGN AGAIN ON A FINISHED ROW.
  // -------------------------------------------------------------------
  const coachCtx = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE });
  if (!coachCtx) throw new Error('could not mint a coach session');
  coachSession = coachCtx.session;
  const coach = await coachCtx.context.newPage();
  watch(coach, 'coach');

  await coach.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coach);
  await openAssessments(coach);

  check('1: the finished assessment is in Completed', (await groupOf(coach, ROW_ID)) === 'completed');

  const toggle = coach.locator(`[data-assign-toggle="${ROW_ID}"]`);
  check('1: ASSIGN AGAIN IS OFFERED ON IT', (await toggle.count()) > 0);
  check(
    '1: and the control says Assign Again, not Assign',
    (await toggle.first().innerText()).trim() === 'Assign Again',
    (await toggle.first().innerText()).trim()
  );
  const finishedRowText = await rowText(coach, ROW_ID);
  check('1: View results is still beside it, not replaced by it', /view results/i.test(finishedRowText));
  check('1: no em dash on the row', !finishedRowText.includes(EM));

  // -------------------------------------------------------------------
  // 2. PRESSING IT SENDS A NEW SITTING.
  // -------------------------------------------------------------------
  await toggle.first().click({ timeout: 15000 });
  const form = coach.locator(`[data-assign-form="${ROW_ID}"]`);
  await form.first().waitFor({ state: 'visible', timeout: 25000 });
  const formText = (await form.first().innerText()).replace(/\s+/g, ' ');
  check('2: the same inline form opens under that row', true, formText.slice(0, 90));
  check(
    '2: and it says what already happened with this one',
    /what has happened with this one/i.test(formText) && /last completed/i.test(formText)
  );
  check('2: the confirm reads Assign, because this creates a sitting', true);

  await form.first().getByRole('button', { name: /^assign$/i }).click({ timeout: 15000 });

  const afterAssign = await ledgerReaches(
    (rows) => rows.some((row) => row.status === 'pending'),
    'a pending assignment'
  );
  const opened = afterAssign.find((row) => row.status === 'pending');
  createdAssignmentId = opened.id;
  check('2: A NEW ASSIGNMENT ROW WAS WRITTEN', Boolean(opened));
  check(
    '2: and the finished ones are all still in the ledger',
    beforeAssignments.every((row) => afterAssign.some((now) => now.id === row.id)),
    `${afterAssign.length} row(s) now, ${beforeAssignments.length} before`
  );

  // -------------------------------------------------------------------
  // 3. THE PAGE AFTERWARDS: ONE WAITING, ONE STILL COMPLETED.
  // -------------------------------------------------------------------
  await coach.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coach);
  await openAssessments(coach);

  check('3: THE NEW SITTING IS UNDER ASSIGNED, WAITING', (await groupOf(coach, ROW_ID)) === 'waiting');
  const waitingText = await rowText(coach, ROW_ID);
  check('3: and the waiting row names the day it was sent', /sent /i.test(waitingText), waitingText.slice(0, 110));

  const completedInstance = `${ROW_ID}__completed`;
  check(
    '3: AND THE FINISHED SITTING IS STILL IN COMPLETED',
    (await groupOf(coach, completedInstance)) === 'completed'
  );
  const keptText = await rowText(coach, completedInstance);
  check('3: it still carries View results', /view results/i.test(keptText), keptText.slice(0, 110));
  check(
    '3: and says why it offers no send of its own',
    /already assigned, waiting/i.test(keptText)
  );
  check(
    '3: the finished half offers NO send control',
    (await coach.locator(`[data-assessment-row="${completedInstance}"] [data-assign-toggle]`).count()) === 0
  );
  check(
    '3: exactly one send control for this assessment on the whole page',
    (await coach.locator(`[data-assign-toggle="${ROW_ID}"]`).count()) === 1
  );
  check('3: no em dash on either half', !waitingText.includes(EM) && !keptText.includes(EM));

  // -------------------------------------------------------------------
  // 4. SHE FINISHES THE NEW SITTING, FOR REAL.
  // -------------------------------------------------------------------
  const memberCtx = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!memberCtx) throw new Error('could not mint a member session');
  memberSession = memberCtx.session;
  const member = await memberCtx.context.newPage();
  watch(member, 'member');

  await member.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
  let screen = await settled(member);
  check(
    '4: SHE IS HANDED THE TAKER, not her old results',
    /begin check-in/i.test(screen),
    screen.slice(0, 90)
  );
  await member.getByRole('button', { name: /begin check-in/i }).first().click({ timeout: 25000 });
  screen = await waitForScreenChange(member, screen);

  for (let index = 0; index < 16; index += 1) {
    check(
      `4: question ${index + 1} is "${PROMPTS[index]}"`,
      screen.toLowerCase().includes(PROMPTS[index].toLowerCase())
    );
    await tap(member, ANSWER);
    screen = await waitForScreenChange(member, screen);
    if (/you're doing well|halfway|almost there/i.test(screen)) {
      screen = await waitForScreenChange(member, screen);
    }
  }
  screen = await waitForScreenChange(member, screen);
  check('4: she reached her reading', /your breathing pattern/i.test(screen));

  const afterSittings = await sittings();
  const newSitting = afterSittings.find((row) => row.assignment_id === createdAssignmentId);
  check('4: the new sitting really saved', Boolean(newSitting?.completed_at));
  check(
    '4: with the score her answers really produce',
    newSitting?.results?.totalScore === EXPECTED_TOTAL,
    `got ${newSitting?.results?.totalScore}, expected ${EXPECTED_TOTAL}`
  );
  check(
    '4: AND THE EARLIER SITTING IS UNTOUCHED, field by field',
    beforeFinished.every((was) => {
      const now = afterSittings.find((row) => row.id === was.id);
      return now && JSON.stringify(now) === JSON.stringify(was);
    })
  );

  // -------------------------------------------------------------------
  // 5. THE COACH SEES BOTH.
  // -------------------------------------------------------------------
  await coach.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coach);
  await openAssessments(coach);

  check('5: it is back to ONE row, in Completed', (await groupOf(coach, ROW_ID)) === 'completed');
  check(
    '5: and the split half is gone, because nothing is out',
    (await coach.locator(`[data-assessment-row="${ROW_ID}__completed"]`).count()) === 0
  );
  check(
    '5: it offers Assign Again once more, with no cooldown',
    (await coach.locator(`[data-assign-toggle="${ROW_ID}"]`).first().innerText()).trim() ===
      'Assign Again'
  );
  check(
    '5: and nothing says it is still waiting',
    (await coach.locator(`[data-assign-waiting-note="${ROW_ID}"]`).count()) === 0
  );

  const card = coach.getByRole('region', { name: 'Breathing Pattern Check-In' }).first();
  const cardText =
    (await card.count()) > 0
      ? (await card.innerText()).replace(/\s+/g, ' ')
      : await screenKey(coach);
  check('5: the card lists previous sittings', /previous sittings/i.test(cardText), cardText.slice(0, 120));
  check(
    '5: BOTH SITTINGS ARE PRINTED, each with its own score',
    afterSittings
      .filter((row) => row.completed_at)
      .every((row) => cardText.includes(String(row.results?.totalScore))),
    afterSittings
      .filter((row) => row.completed_at)
      .map((row) => row.results?.totalScore)
      .join(', ')
  );
  check(
    '5: and no comparison is drawn between them',
    !/improved|better|worse|% change|percent/i.test(cardText)
  );
  check('5: no em dash on the card', !cardText.includes(EM));

  await coach.close();
  await member.close();
  await memberCtx.context.close();
  await coachCtx.context.close();
} catch (error) {
  check('the run completed without throwing', false, String(error));
} finally {
  // -------------------------------------------------------------------
  // RESTORE. Only what this run made, and confirmed by an independent read.
  // -------------------------------------------------------------------
  if (memberSession) await retireSession(memberSession).catch(() => {});
  if (coachSession) await retireSession(coachSession).catch(() => {});
  await browser.close();

  if (createdAssignmentId) {
    const keepSittingIds = new Set(beforeSittings.map((row) => row.id));
    const now = await sittings();
    for (const row of now) {
      if (!keepSittingIds.has(row.id)) {
        await admin.from('member_breathing_check_in_sessions').delete().eq('id', row.id);
      }
    }
    await admin
      .from('assessment_attempts')
      .delete()
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', DEFINITION_ID)
      .eq('assignment_id', createdAssignmentId);
    await admin.from('assessment_assignments').delete().eq('id', createdAssignmentId);
    await admin
      .from('member_root_popup_dismissals')
      .delete()
      .eq('member_id', MEMBER)
      .eq('message_key', `breathing_check_in:${createdAssignmentId}`);
  }

  const restoredAssignments = await assignments();
  const restoredSittings = await sittings();
  check(
    'RESTORE: the assignment ledger is exactly what it was',
    JSON.stringify(restoredAssignments) === JSON.stringify(beforeAssignments),
    `${restoredAssignments.length} row(s), was ${beforeAssignments.length}`
  );
  check(
    'RESTORE: her sittings are exactly what they were',
    JSON.stringify(restoredSittings) === JSON.stringify(beforeSittings),
    `${restoredSittings.length} sitting(s), was ${beforeSittings.length}`
  );

  for (const line of consoleErrors) console.log(`CONSOLE  ${line}`);
  check(
    'no console or page errors on any screen',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ')
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length}`);
  process.exitCode = passed === results.length ? 0 : 1;
}
