/**
 * A real, signed-in walk of the Breathing Pattern Check-In, end to end, on
 * whichever app the environment points at.
 *
 * WHAT IT DRIVES, in the order the brief asks for it:
 *
 *   as the coach, the real Assign control on the client screen;
 *   as the member, the Home card, the opening screen, all sixteen
 *     questions one at a time, the three pauses, Back onto a previous
 *     answer, a genuine close and reopen partway through, the completion
 *     moment and her reading;
 *   as the coach again, the card: the score out of sixty four, the
 *     threshold sentence, all sixteen responses and the coaching
 *     questions;
 *   and the two rules that cannot be proved anywhere but on a real screen
 *     against a real database: SHE IS NEVER SHOWN A NUMBER FROM THE
 *     SCORING MODEL, and SHE IS NEVER SHOWN THE NAME OF THE UNDERLYING
 *     INSTRUMENT.
 *
 * WHY IT EXISTS AT ALL, when the feature has ninety unit tests. The one
 * that mattered on the Health & Lifestyle Intake was invisible to every
 * one of its unit tests: the autosave matched no policy, every time, and
 * because a failed autosave is deliberately not something to interrupt a
 * member with, the refusal never reached her screen. Only a real session
 * against real RLS can see that. THIS RUN READS THE STORED ROW BACK after
 * the walk rather than trusting the screen.
 *
 * WHERE IT RUNS, from environment variables:
 *
 *   BPC_BASE_URL            the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   BPC_MEMBER / BPC_MEMBER_EMAIL   the member to walk as
 *   BPC_COACH  / BPC_COACH_EMAIL    the coach assigned to her
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line.
 *
 * IT CLEANS UP AFTER ITSELF, at the start as well as at the end, because a
 * run that is interrupted leaves rows.
 *
 * THE TRAPS IT ALREADY KNOWS ABOUT, every one learned on this codebase:
 *   innerText reports what CSS PAINTED, so text matches are case
 *     insensitive;
 *   a click before hydration does nothing, silently, so every tap is
 *     confirmed by the app agreeing it happened;
 *   headless Chromium reports prefers-reduced-motion: reduce by default,
 *     and this taker's pauses WAIT FOR CONTINUE under reduced motion, so
 *     the context asks for no-preference explicitly and the run drives the
 *     real automatic advance;
 *   an answer row is a radio, not a button;
 *   a coach section is a button with aria-expanded whose children are not
 *     in the DOM until it is pressed;
 *   process.exit in a finally swallows the throw above it, so this sets
 *     process.exitCode and lets the process end on its own.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BPC_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.BPC_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.BPC_MEMBER_EMAIL ?? 'member.one@example.test';
const COACH = process.env.BPC_COACH ?? '33333333-3333-3333-3333-333333333333';
const COACH_EMAIL = process.env.BPC_COACH_EMAIL ?? 'coach.one@example.test';

const BPC = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405';
const EM = String.fromCharCode(0x2014);

/** The sixteen, in the instrument's own order. Retyped on purpose: a run
 *  importing the constant could not notice the constant changing. */
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

/**
 * What this run answers, and the total it must therefore produce.
 *
 * A MIXED SITTING RATHER THAN SIXTEEN OF THE SAME, so the score is a real
 * sum that a wrong point map would get wrong. Four Very often, four Often,
 * four Sometimes, four Never: 16 + 12 + 8 + 0 = 36.
 */
const ANSWERS = PROMPTS.map((_, index) =>
  index < 4 ? 'Very often' : index < 8 ? 'Often' : index < 12 ? 'Sometimes' : 'Never'
);
const EXPECTED_TOTAL = 36;

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
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

/** Everything this run creates, removed. Run before the walk and again after it. */
async function clean() {
  await admin.from('member_breathing_check_in_sessions').delete().eq('member_id', MEMBER);
  await admin
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', BPC);
  await admin
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', BPC);
  // A "Maybe later" tap leaves a dismissal row keyed by a string, not an
  // FK, so deleting the assignment does not take it with it.
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .like('message_key', 'breathing_check_in:%');
}

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
  CREATES the account when the address does not exist, so a single typo
  would mint a session for a brand new stranger and walk the check-in as
  them.
*/
async function assertExistingUser(email, expectedId) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`could not list users: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`REFUSING TO RUN: ${email} is not an existing account`);
  if (found.id !== expectedId) {
    throw new Error(`REFUSING TO RUN: ${email} is ${found.id}, expected ${expectedId}`);
  }
  console.log(`identity confirmed: ${email} is ${found.id}`);
}

await assertExistingUser(MEMBER_EMAIL, MEMBER);
await assertExistingUser(COACH_EMAIL, COACH);

const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
console.log(`target is the test account "${targetProfile.display_name}"`);

await clean();

// ---------------------------------------------------------------------
// Helpers that wait on the app rather than on the clock.
// ---------------------------------------------------------------------

async function textOf(page) {
  return page.evaluate(() => document.body.innerText);
}

/** Tap an answer and WAIT FOR THE APP TO AGREE it was tapped. */
async function tap(page, name, exact = true) {
  const radios = page.getByRole('radio', { name, exact });
  const target = (await radios.count()) > 0 ? radios : page.getByRole('button', { name, exact });
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

/** The whole screen, normalised. Never a heading: a heading that animates changes every frame. */
async function screenKey(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
}

/** The current screen's text, once two samples a third of a second apart agree. */
async function settled(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 320));
  }
  return last ?? '';
}

/** Waits for a DIFFERENT screen that has also STOPPED MOVING. */
async function waitForScreenChange(page, previous, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now !== previous && now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 320));
  }
  throw new Error(`the screen never settled away from ${String(previous).slice(0, 80)}`);
}

/**
 * Is there a number on this screen that is not her POSITION?
 *
 * "Question 6 of 16" is a fact about the task in front of her. Anything
 * else numeric would be a point value, a running total, the maximum or the
 * reference threshold, none of which she is ever shown.
 */
function scoreDigitsIn(text) {
  const stripped = text.replace(/Question \d+ of \d+/gi, '');
  const found = stripped.match(/\d+/g);
  return found ?? [];
}

// ---------------------------------------------------------------------

const browser = await chromium.launch();
let coachSession = null;
let memberSession = null;

try {
  // -------------------------------------------------------------------
  // 1. The coach assigns it, with the real control.
  // -------------------------------------------------------------------
  const coachCtx = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE });
  if (!coachCtx) throw new Error('could not mint a coach session');
  coachSession = coachCtx.session;
  const coachPage = await coachCtx.context.newPage();
  watch(coachPage, 'coach');

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coachPage);

  const assessmentsSection = coachPage
    .getByRole('button', { name: /assessments and findings/i })
    .first();
  await assessmentsSection.click({ timeout: 20000 });
  await coachPage.waitForTimeout(600);

  // The row is found by the MEMBER FACING name, which is the one name this
  // instrument is addressed by everywhere a coach picks it.
  const row = coachPage.getByText('Breathing Pattern Check-In', { exact: true }).first();
  check('coach: the check-in appears in the assessment list', (await row.count()) > 0);

  /*
    ASSIGNING THROUGH THE UI IS THE REAL PATH, and the row is addressed by
    its own stable hook rather than by hunting for a button whose label
    happens to say Assign. There are a dozen rows on that screen and every
    unassigned one carries the same word; a label search finds the first,
    which is a different instrument. `data-assign-toggle` is the row's own
    id, put there by the component for exactly this.
  */
  const toggle = coachPage.locator('[data-assign-toggle="breathing-pattern-check-in"]');
  await toggle.first().waitFor({ state: 'visible', timeout: 20000 });
  await toggle.first().click({ timeout: 10000 });

  // The form that opens is labelled with the row's own name, so the submit
  // inside it cannot be another row's.
  const form = coachPage.locator('[data-assign-form="breathing-pattern-check-in"]');
  await form.first().waitFor({ state: 'visible', timeout: 20000 });
  await form.first().getByRole('button', { name: /^assign$/i }).click({ timeout: 10000 });

  let assignedThroughUi = false;
  for (let wait = 0; wait < 40; wait += 1) {
    const { data } = await admin
      .from('assessment_assignments')
      .select('id, status, assigned_by')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', BPC)
      .maybeSingle();
    if (data) {
      assignedThroughUi = true;
      check(
        'coach: Assign wrote a pending assignment, by this coach',
        data.status === 'pending' && data.assigned_by === COACH
      );
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check('coach: assigned it through the real control', assignedThroughUi);
  if (!assignedThroughUi) throw new Error('the coach could not assign it from the UI');

  await coachPage.close();

  // -------------------------------------------------------------------
  // 2. The member walks it.
  // -------------------------------------------------------------------
  const memberCtx = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    // HEADLESS CHROMIUM DEFAULTS TO reduce, and under reduced motion this
    // taker's pauses deliberately wait for Continue. Asking for
    // no-preference is what makes this run drive the REAL automatic
    // advance rather than a path a member with motion on never sees.
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!memberCtx) throw new Error('could not mint a member session');
  memberSession = memberCtx.session;
  const page = await memberCtx.context.newPage();
  watch(page, 'member');

  // Home first: the card has to be there, and it is the way in.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const home = await settled(page, 40000);
  check('member: Home shows the check-in card', /breathing pattern check-in/i.test(home));
  check('member: the card says how long it takes', /16 questions/i.test(home) && /2 minutes/i.test(home));

  await page.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
  let screen = await settled(page, 40000);

  check('member: opens on the introduction screen', /breathing pattern check-in/i.test(screen));
  check(
    'member: the introduction says what it is for',
    /tension, energy, focus, sleep/i.test(screen)
  );
  check('member: no em dash on the introduction', !screen.includes(EM));
  check(
    'member: the introduction shows no score',
    scoreDigitsIn(screen).every((n) => n === '16' || n === '2'),
    scoreDigitsIn(screen).join(',')
  );

  await page.getByRole('button', { name: /begin check-in/i }).first().click({ timeout: 20000 });
  screen = await waitForScreenChange(page, screen);

  // ---- the sixteen -------------------------------------------------
  const promptsSeen = [];
  const pausesSeen = [];
  let closedAndReopened = false;

  for (let index = 0; index < PROMPTS.length; index += 1) {
    const expected = PROMPTS[index];

    check(
      `member: question ${index + 1} is "${expected}"`,
      screen.toLowerCase().includes(expected.toLowerCase())
    );
    promptsSeen.push(expected);

    // ONE QUESTION PER SCREEN. No other prompt may be on it.
    const others = PROMPTS.filter((p, i) => i !== index && screen.toLowerCase().includes(p.toLowerCase()));
    check(`member: question ${index + 1} is alone on its screen`, others.length === 0, others.join(','));

    check(
      `member: question ${index + 1} shows no score`,
      scoreDigitsIn(screen).length === 0,
      scoreDigitsIn(screen).join(',')
    );
    check(
      `member: question ${index + 1} never names the instrument`,
      !/nijmegen/i.test(screen)
    );
    check(`member: question ${index + 1} has no em dash`, !screen.includes(EM));
    check(
      `member: question ${index + 1} says its position`,
      new RegExp(`question\\s+${index + 1}\\s+of\\s+16`, 'i').test(screen)
    );

    await tap(page, ANSWERS[index]);
    screen = await waitForScreenChange(page, screen);

    // ---- a pause, where one is due --------------------------------
    if ([4, 8, 12].includes(index + 1)) {
      check(
        `member: a pause follows question ${index + 1}`,
        !PROMPTS.some((p) => screen.toLowerCase().includes(p.toLowerCase()))
      );
      check(`member: the pause reveals no score`, scoreDigitsIn(screen).length === 0);
      pausesSeen.push(index + 1);

      // IT MOVES ON BY ITSELF, with motion on. No Continue is pressed
      // here, so a pause that only advanced on a tap would hang this run.
      screen = await waitForScreenChange(page, screen, 20000);
    }

    // ---- Back, once, onto a real previous answer ------------------
    if (index === 5) {
      const back = page.getByRole('button', { name: /^back$/i }).first();
      await back.click({ timeout: 10000 });
      screen = await waitForScreenChange(page, screen);
      check(
        'member: Back lands on the question she just answered',
        screen.toLowerCase().includes(PROMPTS[5].toLowerCase())
      );
      const stillChosen = await page
        .getByRole('radio', { name: ANSWERS[5], exact: true })
        .first()
        .getAttribute('aria-checked');
      check('member: her previous answer is still selected', stillChosen === 'true');
      await tap(page, ANSWERS[5]);
      screen = await waitForScreenChange(page, screen);
    }

    // ---- a genuine close and reopen, partway through ---------------
    if (index === 8 && !closedAndReopened) {
      closedAndReopened = true;
      // Long enough for the autosave to have been sent, then a real
      // reload rather than a client side navigation.
      await page.waitForTimeout(1500);
      await page.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
      screen = await settled(page, 40000);

      check('member: reopening offers to pick up where she left off', /welcome back/i.test(screen));
      await page
        .getByRole('button', { name: /continue my check-in/i })
        .first()
        .click({ timeout: 20000 });
      screen = await waitForScreenChange(page, screen);

      check(
        'member: she is returned to her next unanswered question, not to the start',
        screen.toLowerCase().includes(PROMPTS[index + 1].toLowerCase()),
        screen.slice(0, 80)
      );
      check(
        'member: reopening did NOT put her back on question one',
        !screen.toLowerCase().includes(PROMPTS[0].toLowerCase())
      );
    }
  }

  check('member: all sixteen questions were shown', promptsSeen.length === 16);
  check('member: three pauses, after four, eight and twelve', JSON.stringify(pausesSeen) === JSON.stringify([4, 8, 12]));

  // ---- the completion moment, then her reading ---------------------
  check('member: the completion moment plays', /your breathing pattern is ready/i.test(screen));
  screen = await waitForScreenChange(page, screen, 40000);

  check('member: her reading appears', /your breathing pattern/i.test(screen));
  check(
    'member: it leads with a statement, not a score',
    /signals are showing up|signals are quiet|showing up clearly/i.test(screen)
  );
  check('member: the three areas are named', /breathing sensations/i.test(screen) && /tension signals/i.test(screen) && /body sensations/i.test(screen));
  check('member: the disclaimer is on the reading', /not a diagnosis/i.test(screen));
  check(
    'member: HER READING SHOWS NO SCORE AT ALL',
    scoreDigitsIn(screen).length === 0,
    scoreDigitsIn(screen).join(',')
  );
  check('member: her reading never names the instrument', !/nijmegen/i.test(screen));
  check('member: no em dash on her reading', !screen.includes(EM));

  // -------------------------------------------------------------------
  // 3. THE STORED ROW, read back independently of the screen.
  //    This is the check the intake's own unit tests could not make.
  // -------------------------------------------------------------------
  const { data: stored } = await admin
    .from('member_breathing_check_in_sessions')
    .select('answers, results, completed_at, content_version')
    .eq('member_id', MEMBER)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  check('stored: the sitting really saved', Boolean(stored));
  check('stored: it is marked finished', Boolean(stored?.completed_at));
  check('stored: all sixteen answers are in the row', Object.keys(stored?.answers ?? {}).length === 16);
  check(
    'stored: the score is the real sum of what she tapped',
    stored?.results?.totalScore === EXPECTED_TOTAL,
    `got ${stored?.results?.totalScore}, expected ${EXPECTED_TOTAL}`
  );
  check('stored: out of sixty four', stored?.results?.maxScore === 64);
  check('stored: sixteen of sixteen answered', stored?.results?.answeredCount === 16);

  const { data: attempt } = await admin
    .from('assessment_attempts')
    .select('status, source_table')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', BPC)
    .maybeSingle();
  check('stored: the attempt ledger row was written by the trigger', attempt?.status === 'completed');

  const { data: closed } = await admin
    .from('assessment_assignments')
    .select('status')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', BPC)
    .maybeSingle();
  check('stored: finishing closed the assignment out', closed?.status === 'completed');

  await page.close();

  // -------------------------------------------------------------------
  // 4. The coach reads it back.
  // -------------------------------------------------------------------
  const coachCtx2 = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE });
  if (!coachCtx2) throw new Error('could not mint a second coach session');
  const coach2 = await coachCtx2.context.newPage();
  watch(coach2, 'coach2');

  await coach2.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coach2);
  await coach2.getByRole('button', { name: /assessments and findings/i }).first().click({ timeout: 20000 });
  await coach2.waitForTimeout(900);

  const card = coach2.getByRole('region', { name: 'Breathing Pattern Check-In' }).first();
  const cardText = (await card.count()) > 0 ? await card.innerText() : await textOf(coach2);

  check('coach: the card names the underlying instrument', /nijmegen questionnaire/i.test(cardText));
  check(
    'coach: the card shows the real total out of sixty four',
    new RegExp(`total score:\\s*${EXPECTED_TOTAL}\\s*/\\s*64`, 'i').test(cardText),
    cardText.slice(0, 120)
  );
  check('coach: the threshold is named as a reference figure', /traditional reference threshold: 23\+/i.test(cardText));
  check(
    'coach: the threshold sentence does NOT claim a diagnosis',
    /may indicate a higher burden/i.test(cardText) && !/diagnos/i.test(cardText)
  );
  check('coach: all sixteen responses are listed', PROMPTS.every((p) => cardText.toLowerCase().includes(p.toLowerCase())));
  check(
    'coach: the highest-response symptoms are surfaced',
    /highest-response symptoms/i.test(cardText) && /chest pain/i.test(cardText)
  );
  check('coach: the coaching questions are there', /when do you notice this sensation most/i.test(cardText));
  check('coach: no em dash on the card', !cardText.includes(EM));

  await coach2.close();
  await coachCtx2.context.close();
  await memberCtx.context.close();
  await coachCtx.context.close();
} catch (error) {
  check('the run completed without throwing', false, String(error));
} finally {
  if (coachSession) await retireSession(coachSession).catch(() => {});
  if (memberSession) await retireSession(memberSession).catch(() => {});
  await clean();
  await browser.close();

  for (const line of consoleErrors) console.log(`CONSOLE  ${line}`);
  check('no console or page errors on any screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length}`);
  // process.exit in a finally swallows the throw above it. Set the code and
  // let the process end on its own.
  process.exitCode = passed === results.length ? 0 : 1;
}
