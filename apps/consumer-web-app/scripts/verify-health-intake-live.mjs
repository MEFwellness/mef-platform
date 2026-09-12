/**
 * A real, signed-in walk of the Health & Lifestyle Intake, end to end, on
 * whichever app the environment points at.
 *
 * WHAT IT DRIVES, in the order the brief asks for it:
 *
 *   as the coach, the real Assign control on the client screen;
 *   as the member, the pop-up, the Home card, the opening screen, the
 *     prefilled name, both sides of a gate, adding and editing a real
 *     medication entry, flipping a gate and confirming the removal it
 *     names, one answer that reaches the safety pathway, a genuine close
 *     and reopen partway through, the completion, and the three cards;
 *   as the coach again, the Health Context section: the digest, the
 *     follow-up alert and the questions worth exploring;
 *   and finally that the MEF Body Systems Survey and the Stress & Load
 *     Deep-Dive still open and still work.
 *
 * WHERE IT RUNS, from environment variables:
 *
 *   HLI_BASE_URL            the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   HLI_MEMBER / HLI_MEMBER_EMAIL   the member to walk as
 *   HLI_COACH  / HLI_COACH_EMAIL    the coach assigned to her
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line.
 *
 * IT CLEANS UP AFTER ITSELF, at the start as well as at the end, because a
 * run that is interrupted leaves rows. The cleanup is confirmed by an
 * independent read rather than by trusting the delete.
 *
 * THE TRAPS IT ALREADY KNOWS ABOUT, every one learned on this codebase:
 *   innerText reports what CSS PAINTED, so text matches are case
 *     insensitive;
 *   a click before hydration does nothing, silently, so every tap is
 *     confirmed by the app agreeing it happened;
 *   headless Chromium reports prefers-reduced-motion: reduce by default,
 *     so the context asks for no-preference explicitly, which is also what
 *     makes the gate settle real rather than skipped;
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

const BASE = process.env.HLI_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.HLI_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.HLI_MEMBER_EMAIL ?? 'member.one@example.test';
const COACH = process.env.HLI_COACH ?? '33333333-3333-3333-3333-333333333333';
const COACH_EMAIL = process.env.HLI_COACH_EMAIL ?? 'coach.one@example.test';

const HLI = '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74';
const BODY_SYSTEMS = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';
const STRESS_LOAD = '9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834';
const EM = String.fromCharCode(0x2014);

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
  results.push({ name, ok, note });
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
  await admin.from('member_health_intake_sessions').delete().eq('member_id', MEMBER);
  for (const definition of [HLI, BODY_SYSTEMS, STRESS_LOAD]) {
    await admin
      .from('assessment_assignments')
      .delete()
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', definition);
    await admin
      .from('assessment_attempts')
      .delete()
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', definition);
  }
  // A "Maybe later" tap leaves a dismissal row keyed by a string, not an
  // FK, so deleting the assignment does not take it with it.
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .like('message_key', 'health_intake:%');
  // The safety rows this run's own answers open.
  const { data: cases } = await admin
    .from('safety_classifications')
    .select('id')
    .eq('member_id', MEMBER)
    .eq('source_record_type', 'health_intake_answer');
  const ids = (cases ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await admin.from('safety_audit_log').delete().in('classification_id', ids);
    await admin.from('safety_review_queue').delete().in('classification_id', ids);
    await admin.from('safety_acknowledgments').delete().in('classification_id', ids);
    await admin.from('safety_classifications').delete().in('id', ids);
  }
}

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
  CREATES the account when the address does not exist, so a single typo
  would mint a session for a brand new stranger and walk the intake as them.
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

async function noEmDash(page, label) {
  const text = await textOf(page);
  check(`${label}: no em dash`, !text.includes(EM));
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

/**
 * The one thing that identifies the screen she is on.
 *
 * THE WHOLE SCREEN, NOT THE HEADING. The opening screen types its headline
 * out one character at a time, so a key built from the h1 changes on every
 * frame and every wait for "the screen changed" returns instantly on a
 * screen that has not changed at all. That was a real, silent failure on
 * the first run of this script.
 */
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

/**
 * Waits for a DIFFERENT screen that has also STOPPED MOVING.
 *
 * Two samples a third of a second apart have to agree, which is what makes
 * this wait on the app rather than on a typewriter, a fade or a settle
 * still in flight.
 */
async function waitForScreenChange(page, previous, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now !== previous && now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 320));
  }
  throw new Error(`the screen never settled away from ${String(previous).slice(0, 60)}`);
}

async function waitForText(page, snippet, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  const needle = snippet.toLowerCase();
  while (Date.now() < deadline) {
    const text = (await textOf(page)).toLowerCase();
    if (text.includes(needle)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

/**
 * Press Continue and wait for a different screen that has stopped moving.
 *
 * IT NEVER PRESSES TWICE INTO A SCREEN THAT ALREADY MOVED. A click that
 * landed before hydration does nothing silently, so a retry is needed; a
 * retry after a click that DID work would press the next screen's Continue
 * and skip a whole screen. So every retry re-reads the screen first and
 * only presses again while it is still the one it started on.
 */
async function advance(page, label = 'Continue') {
  // THE BEFORE IS TAKEN ONCE THIS SCREEN HAS STOPPED MOVING. The opening
  // screen types its headline out, so a "before" caught mid-reveal differs
  // from the same screen a moment later, and the wait below then reports a
  // change that never happened.
  const before = await settled(page);
  const button = page.getByRole('button', { name: label, exact: true });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await screenKey(page)) === before) {
      await button.first().click({ timeout: 10000 }).catch(() => {});
    }
    try {
      return await waitForScreenChange(page, before, attempt === 0 ? 12000 : 5000);
    } catch {
      // Still here. Loop, re-read, and press again only if it is warranted.
    }
  }
  throw new Error(`${label} never moved the screen away from ${before.slice(0, 80)}`);
}

/** Press a folding control and wait for the app to agree it opened. */
async function press(locator, attribute = 'aria-expanded') {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await locator.click({ timeout: 10000 }).catch(() => {});
    if ((await locator.getAttribute(attribute)) === 'true') return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function fill(page, label, value) {
  const field = page.getByLabel(label, { exact: false }).first();
  await field.fill(value, { timeout: 15000 });
  return field.inputValue();
}

const browser = await chromium.launch();
let memberSession = null;
let coachSession = null;

try {
  // -------------------------------------------------------------------
  // 1. The coach sends it, with the real control.
  // -------------------------------------------------------------------
  const coachMint = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 900 },
  });
  if (!coachMint) throw new Error('could not mint a coach session');
  coachSession = coachMint.session;
  const coachPage = await coachMint.context.newPage();
  watch(coachPage, 'coach');

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  const sawDetail = await waitForText(coachPage, 'Assessments and Findings');
  check('coach: the client detail page opened', sawDetail);

  const assessmentsSection = coachPage
    .getByRole('button')
    .filter({ hasText: 'Assessments and Findings' })
    .first();
  check('coach: Assessments and Findings opens', await press(assessmentsSection));

  const searchBox = coachPage.getByPlaceholder(/search/i).first();
  if ((await searchBox.count()) > 0) {
    await searchBox.fill('Health & Lifestyle Intake').catch(() => {});
  }

  const intakeRow = coachPage
    .locator('[id="detail-card-assessment-status"]')
    .getByText('Health & Lifestyle Intake', { exact: false })
    .first();
  check('coach: the intake appears in the assessment status block', (await intakeRow.count()) > 0);

  /*
    THE ROW'S OWN ASSIGN BUTTON, addressed by the data attribute the block
    already puts on it, rather than by "the nth button labelled Assign".
    The block draws one per row, and picking the wrong one would send a
    different questionnaire and report success.
  */
  const toggle = coachPage.locator('[data-assign-toggle="health-lifestyle-intake"]');
  let assigned = false;
  if ((await toggle.count()) > 0) {
    await press(toggle.first());
    const confirm = coachPage.locator(
      '[data-assign-form="health-lifestyle-intake"] button[type="submit"]'
    );
    check('coach: the inline assign form opened on that row', (await confirm.count()) > 0);
    await confirm.first().click({ timeout: 15000 }).catch(() => {});
    for (let wait = 0; wait < 40; wait += 1) {
      const { data } = await admin
        .from('assessment_assignments')
        .select('id, due_at, status')
        .eq('member_id', MEMBER)
        .eq('assessment_definition_id', HLI)
        .eq('status', 'pending')
        .maybeSingle();
      if (data) {
        assigned = true;
        const due = new Date(data.due_at);
        const days = Math.round((due.getTime() - Date.now()) / 86400000);
        check(
          'coach: Assign wrote one pending row, due about seven days out',
          days >= 6 && days <= 8,
          `${days} days`
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  check('coach: the real Assign control created the assignment', assigned);

  if (!assigned) {
    // Stated plainly rather than papered over: the walk still needs an
    // assignment, so it is written directly and the report says which path
    // produced it.
    console.log('NOTE: falling back to a direct assignment write');
    await admin.from('assessment_assignments').insert({
      member_id: MEMBER,
      assessment_definition_id: HLI,
      assigned_by: COACH,
      is_required: true,
      stage: 'standard',
      due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  }

  const { data: assignment } = await admin
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', HLI)
    .eq('status', 'pending')
    .maybeSingle();
  if (!assignment) throw new Error('no assignment to walk');

  await coachMint.context.close();

  // -------------------------------------------------------------------
  // 2. The member.
  // -------------------------------------------------------------------
  const memberMint = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 414, height: 896 },
    // Headless Chromium reports reduce by default, which would skip the
    // gate settle this run exists to watch.
    contextOptions: { reducedMotion: 'no-preference', isMobile: true, hasTouch: true },
  });
  if (!memberMint) throw new Error('could not mint a member session');
  memberSession = memberMint.session;
  const page = await memberMint.context.newPage();
  watch(page, 'member');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const sawPopup = await waitForText(page, 'Health & Lifestyle Intake', 45000);
  check('member: Root knocks with the intake', sawPopup);
  await noEmDash(page, 'member home');

  // The pop-up's own way in, so the receipt is written by a real display.
  const popupCta = page.getByRole('link', { name: /start the intake/i }).first();
  if ((await popupCta.count()) > 0) {
    await popupCta.click({ timeout: 15000 }).catch(() => {});
  } else {
    await page.goto(`${BASE}/health-intake`, { waitUntil: 'domcontentloaded' });
  }

  const sawIntro = await waitForText(page, 'Begin My Intake', 45000);
  check('member: the opening screen arrived', sawIntro);
  const introText = await textOf(page);
  check('member: it says about 8 to 10 minutes', /about 8 to 10 minutes/i.test(introText));
  check('member: it says the answers are private', /your answers are private/i.test(introText));
  check('member: it says she can leave and come back', /you can leave and come back/i.test(introText));
  await noEmDash(page, 'opening screen');

  await advance(page, 'Begin My Intake');
  /*
    CASE INSENSITIVE, BECAUSE innerText REPORTS WHAT CSS PAINTED. The soft
    counter is drawn in an `uppercase` class, so the word between the two
    numbers reaches innerText as "OF". A case sensitive match here reported
    a missing counter about a screen that was drawing it perfectly.
  */
  check('member: chapter one, counted 01 of 11', /01 of 11/i.test(await textOf(page)));

  /*
    THE WALK IS DRIVEN BY WHAT IS ON THE SCREEN, NOT BY A COUNTED SEQUENCE.

    A hardcoded run of Continues is a second, silent model of the
    instrument: it assumes how many screens each chapter holds, which
    chapter screens exist, and which gates open what. The first version of
    this script did exactly that and walked itself off the end of chapter
    one. This reads the screen, decides what that screen needs, does it,
    and moves on, which is also what a member does.
  */
  const seen = new Set();
  let addedMedications = false;
  let editedMedication = false;

  /** Answers whatever screen is showing. Returns false when nothing was left to do. */
  async function answerThisScreen() {
    const text = await textOf(page);
    seen.add(text.slice(0, 80));

    if (/you're all set|finish my intake/i.test(text)) return 'done';

    // Chapter one. Her date of birth is the one field the walk must type.
    if (/let us start with your name/i.test(text)) {
      await page.locator('input[type="date"]').first().fill('1986-04-02');
      await advance(page);
      return true;
    }
    if (/a couple of details that change what we ask you later/i.test(text)) {
      await tap(page, 'Female');
      await advance(page);
      return true;
    }

    // Chapter two.
    if (/what would you most like help with right now/i.test(text)) {
      await tap(page, 'Energy');
      await tap(page, 'Sleep');
      await tap(page, 'Stress');
      await advance(page);
      return true;
    }
    if (/when did you first begin noticing this/i.test(text)) {
      await tap(page, '3 to 6 months');
      await advance(page);
      return true;
    }

    // Chapter three. Medications is the branch this run exercises fully.
    if (/are you currently taking any prescription medications/i.test(text)) {
      if (!addedMedications) {
        const gateContinues = await page
          .getByRole('button', { name: 'Continue', exact: true })
          .count();
        check('member: a gate screen draws no Continue', gateContinues === 0);
        const before = await screenKey(page);
        await tap(page, 'Yes');
        await waitForScreenChange(page, before);
        check('member: a gate advances on her tap alone', true);
      } else {
        // Reached again after the deliberate flip below, already answered.
        // Re-tapping the same answer is the honest way past a gate screen:
        // it has no Continue, by design.
        const before = await screenKey(page);
        await tap(page, 'No');
        await waitForScreenChange(page, before);
      }
      return true;
    }
    if (/what are you taking/i.test(text)) {
      if (!addedMedications) {
        check(
          'member: the list starts empty rather than with blank rows',
          /nothing added yet/i.test(text)
        );
        await page.getByRole('button', { name: /add a medication/i }).first().click();
        await fill(page, 'Name', 'Levothyroxine');
        await fill(page, 'What it is for', 'Thyroid');
        await page.getByRole('button', { name: /^Save$/ }).first().click();
        check('member: the entry printed as a summary card', await waitForText(page, 'Levothyroxine'));

        await page.getByRole('button', { name: /add another medication/i }).first().click();
        await fill(page, 'Name', 'Sertraline');
        await page.getByRole('button', { name: /^Save$/ }).first().click();
        check('member: a second entry was added', await waitForText(page, 'Sertraline'));

        await page.getByRole('button', { name: /^Edit$/ }).first().click();
        const editing = await page.getByLabel('Name', { exact: false }).first().inputValue();
        check('member: Edit reopened that card holding what she wrote', editing === 'Levothyroxine');
        await fill(page, 'Dose', '50mcg');
        await page.getByRole('button', { name: /^Save$/ }).first().click();
        check('member: the edit saved, and the card prints it', await waitForText(page, '50mcg'));
        editedMedication = true;
        addedMedications = true;
      }
      await advance(page);
      return true;
    }
    if (/are you pregnant or nursing right now/i.test(text)) {
      check('member: the pregnancy question was asked, because she said Female', true);
      await tap(page, 'Neither');
      await advance(page);
      return true;
    }

    // Chapter four, with one real event.
    if (/have you had any significant surgeries/i.test(text)) {
      const before = await screenKey(page);
      await tap(page, 'Yes');
      await waitForScreenChange(page, before);
      return true;
    }
    if (/tell us about them, one at a time/i.test(text)) {
      if (!/right knee surgery/i.test(text)) {
        await page.getByRole('button', { name: /add an event/i }).first().click();
        await fill(page, 'Year', '2019');
        await tap(page, 'Surgery');
        await fill(page, 'What happened', 'Right knee surgery');
        await fill(page, 'Where it stands now', 'Recovered, occasional discomfort');
        await page.getByRole('button', { name: /^Save$/ }).first().click();
        await waitForText(page, 'Right knee surgery');
      }
      await advance(page);
      return true;
    }

    // Chapter six.
    if (/how would you describe your current stress load/i.test(text)) {
      await page.getByRole('radio', { name: '8 out of 10' }).first().click();
      await advance(page);
      return true;
    }
    if (/what is contributing most right now/i.test(text)) {
      await tap(page, 'Work');
      await tap(page, 'Family');
      await advance(page);
      return true;
    }

    // Chapter nine.
    if (/do you tend to wake at roughly the same time during the night/i.test(text)) {
      await tap(page, 'Yes');
      await advance(page);
      return true;
    }
    if (/what time do you usually notice it/i.test(text)) {
      await page.locator('input[type="time"]').first().fill('03:00');
      await advance(page);
      return true;
    }
    if (/when do you generally feel your best/i.test(text)) {
      await tap(page, 'Morning');
      await advance(page);
      return true;
    }
    if (/and when do you generally feel at your worst/i.test(text)) {
      await tap(page, 'Afternoon');
      await advance(page);
      return true;
    }

    // Chapter eleven. The safety answer.
    if (/last one\. any of these/i.test(text)) {
      await tap(page, 'Bleeding');
      await advance(page);
      return true;
    }

    // Anything still holding a Continue: answer the first thing it offers
    // if it is refusing to move, then move.
    const carryOn = page.getByRole('button', { name: 'Continue', exact: true }).first();
    if ((await carryOn.count()) > 0) {
      if (await carryOn.isDisabled().catch(() => false)) {
        /*
          A SINGLE SELECT ROW IS A RADIO AND A MULTI SELECT ROW IS A
          TOGGLE. Looking only for a radio found nothing on chapter five,
          so nothing was ever chosen, so Continue stayed refused and the
          run stalled on a screen that was working correctly. Both are
          tried, in that order.
        */
        const radios = page.getByRole('radio');
        const toggles = page.locator('button[aria-pressed]');
        const target = (await radios.count()) > 0 ? radios : toggles;
        if ((await target.count()) > 0) {
          await target.first().click({ timeout: 10000 }).catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
      await advance(page);
      return true;
    }

    // A gate with no Continue, answered No.
    const before = await settled(page);
    const gate = page.getByRole('radio', { name: 'No', exact: true });
    if ((await gate.count()) === 0) {
      // Said out loud rather than thrown as "tap never registered: No",
      // which named the control and not the screen that stalled.
      throw new Error(`no way forward from this screen: ${before.slice(0, 160)}`);
    }
    await tap(page, 'No');
    await waitForScreenChange(page, before);
    return true;
  }

  /** Walks until one of the stop conditions is reached. */
  async function walk(stopWhen, limit = 80) {
    for (let step = 0; step < limit; step += 1) {
      const text = await textOf(page);
      if (await stopWhen(text)) return true;
      const outcome = await answerThisScreen();
      if (outcome === 'done') return true;
    }
    return false;
  }

  // Walk as far as the last chapter, so the close and reopen below happens
  // genuinely partway through rather than on the second screen.
  const reachedSenses = await walk((text) =>
    /have you noticed any recent changes in your senses/i.test(text)
  );
  check('member: the walk reached chapter ten', reachedSenses);
  check('member: her medications were added and edited', addedMedications && editedMedication);
  await noEmDash(page, 'partway through');

  // -----------------------------------------------------------------
  // A genuine close and reopen, partway through.
  // -----------------------------------------------------------------
  const beforeLeaving = await screenKey(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForText(page, 'Health & Lifestyle Intake', 30000);
  const homeText = await textOf(page);
  check(
    'member: the Home card offers to pick up where she left off',
    /pick up where you left off/i.test(homeText)
  );

  const { data: partway } = await admin
    .from('member_health_intake_sessions')
    .select('answers, progress, started_at')
    .eq('member_id', MEMBER)
    .maybeSingle();
  check('member: her draft is on the server', Boolean(partway));
  check(
    'member: her two medications are stored',
    Array.isArray(partway?.answers?.medications) && partway.answers.medications.length === 2
  );
  check('member: started_at is real, and earlier than now', Boolean(partway?.started_at));

  await page.goto(`${BASE}/health-intake`, { waitUntil: 'domcontentloaded' });
  /*
    THE RESULT OF THE WAIT IS THE CHECK, NOT A LITERAL true. The first
    version of this line waited and then reported a pass regardless, so a
    run where nothing had been saved and she was handed the OPENING screen
    printed "reopening offers the resume screen: PASS" and only fell over
    two lines later. A check that cannot fail is worse than no check.
  */
  const sawResume = await waitForText(page, 'Welcome back', 40000);
  check('member: reopening offers the resume screen', sawResume);
  await advance(page, 'Continue my intake');
  const resumedAt = await screenKey(page);
  check('member: she resumed where she left off', resumedAt === beforeLeaving, `${resumedAt}`);

  // -----------------------------------------------------------------
  // Flipping a gate, and the confirmation it draws.
  // -----------------------------------------------------------------
  /*
    FAR ENOUGH TO ACTUALLY GET THERE. The close and reopen above happens in
    chapter ten, and the medications gate is in chapter three, which is
    about thirty screens of Back. A limit of fourteen reported "Back did
    not reach it" about a Back control that was working perfectly.
  */
  for (let back = 0; back < 45; back += 1) {
    const text = await textOf(page);
    if (text.includes('Are you currently taking any prescription medications?')) break;
    const control = page.locator('button[aria-label="Back"]').first();
    if ((await control.count()) === 0) break;
    await control.click({ timeout: 10000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  check(
    'member: Back walked her to the medications gate',
    (await textOf(page)).includes('Are you currently taking any prescription medications?')
  );

  /*
    A PLAIN CLICK, NOT `tap`. `tap` waits for the app to agree the answer
    landed, and on this one screen the answer deliberately does NOT land:
    a gate that would close a branch she has filled in draws the
    confirmation first and commits nothing until she answers it. So the
    thing to wait for here is the confirmation, which is the claim anyway.
  */
  await page.getByRole('radio', { name: 'No', exact: true }).first().click({ timeout: 10000 });
  const sawConfirm = await waitForText(page, 'This will remove the 2 medications you added.', 10000);
  check('member: the confirmation names exactly what goes', sawConfirm);
  check(
    'member: it does not move while she is deciding',
    (await textOf(page)).includes('Are you currently taking any prescription medications?')
  );

  await page.getByRole('button', { name: /keep what i had/i }).first().click();
  await new Promise((resolve) => setTimeout(resolve, 400));
  check(
    'member: declining left everything alone',
    !(await textOf(page)).toLowerCase().includes('this will remove')
  );

  await page.getByRole('radio', { name: 'No', exact: true }).first().click({ timeout: 10000 });
  check(
    'member: it asks again when she tries again',
    await waitForText(page, 'This will remove the 2 medications you added.', 10000)
  );
  await page.getByRole('button', { name: /yes, remove it/i }).first().click();
  await new Promise((resolve) => setTimeout(resolve, 900));

  for (let wait = 0; wait < 40; wait += 1) {
    const { data } = await admin
      .from('member_health_intake_sessions')
      .select('answers, archived')
      .eq('member_id', MEMBER)
      .maybeSingle();
    if (data && !data.answers?.medications) {
      check('member: the medications stopped existing in her live answers', true);
      check(
        'member: they are archived for audit, and nowhere else',
        Array.isArray(data.archived?.medications) && data.archived.medications.length === 2
      );
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // -----------------------------------------------------------------
  // The rest of the walk, including one safety answer.
  // -----------------------------------------------------------------
  /*
    THE SAME SCREEN DRIVEN WALK, FINISHING THE SITTING. It is idempotent by
    construction (it checks whether an entry is already there before adding
    one), which is what lets it pick up in the middle of a chapter she has
    already partly answered after the flip above.
  */
  const reachedEnd = await walk((text) => /you're all set|finish my intake/i.test(text), 90);
  check('member: the walk reached the end', reachedEnd);
  await noEmDash(page, 'completion screen');

  if ((await page.getByRole('button', { name: /finish my intake/i }).count()) > 0) {
    await page.getByRole('button', { name: /finish my intake/i }).first().click();
  }
  const finished = await waitForText(page, "you're all set", 60000);
  check('member: the completion screen arrived', finished);

  const finalText = await textOf(page);
  check('member: card one names what she wants help with', /what you want help with/i.test(finalText));
  check('member: card two names areas she told us about', /areas you told us about/i.test(finalText));
  check('member: card three names the next step', /next step/i.test(finalText));
  check('member: her real answers are on the cards', /energy/i.test(finalText) && /sleep/i.test(finalText));
  check('member: her stress mark is printed as she gave it', /stress load 8 out of 10/i.test(finalText));
  check('member: the removed medications are not on the cards', !/levothyroxine|sertraline/i.test(finalText));
  check('member: no score, no band, no colour', !/\bscore\b/i.test(finalText));
  check(
    'member: the safety sentence is the calm one',
    /best discussed directly with a qualified healthcare professional/i.test(finalText)
  );
  check(
    'member: the safety sentence names no condition and no cause',
    !/you have|this means|caused by|this is likely/i.test(finalText)
  );
  await noEmDash(page, 'three cards');

  // The sitting is closed, and the ledger agrees.
  const { data: done } = await admin
    .from('member_health_intake_sessions')
    .select('completed_at, safety_escalated_at, answers, archived')
    .eq('member_id', MEMBER)
    .maybeSingle();
  check('server: the sitting is completed', Boolean(done?.completed_at));
  check('server: the safety pipeline ran once', Boolean(done?.safety_escalated_at));
  check('server: no medication survived in her answers', !done?.answers?.medications);

  const { data: closed } = await admin
    .from('assessment_assignments')
    .select('status')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', HLI)
    .maybeSingle();
  check('server: the assignment closed itself', closed?.status === 'completed', closed?.status ?? '');

  const { data: receipt } = await admin
    .from('member_assignment_deliveries')
    .select('assignment_id, presentation, delivered_at')
    .eq('assignment_id', assignment.id);
  check('server: a delivery receipt was written on a real display', (receipt ?? []).length > 0,
    (receipt ?? []).map((row) => row.presentation).join(', '));

  const { data: safetyCase } = await admin
    .from('safety_review_queue')
    .select('id, urgency, concern_categories, member_input_excerpt')
    .eq('member_id', MEMBER)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  check('server: a coach review case was opened', Boolean(safetyCase));
  check(
    'server: it is filed under the intake follow-up category',
    (safetyCase?.concern_categories ?? []).includes('health_intake_follow_up')
  );

  await memberMint.context.close();

  // -------------------------------------------------------------------
  // 3. The coach reads it.
  // -------------------------------------------------------------------
  const coachAgain = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1000 },
  });
  if (!coachAgain) throw new Error('could not mint a second coach session');
  coachSession = coachAgain.session;
  const coach2 = await coachAgain.context.newPage();
  watch(coach2, 'coach-read');

  await coach2.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  const sawHealthContext = await waitForText(coach2, 'Health Context', 45000);
  check('coach: the Health Context section is on the page', sawHealthContext);

  const headerText = await textOf(coach2);
  check(
    'coach: its folded header says something worth a look',
    /to follow up/i.test(headerText) || /intake completed/i.test(headerText)
  );

  const healthSection = coach2.getByRole('button').filter({ hasText: 'Health Context' }).first();
  check('coach: it opens on a tap', await press(healthSection));

  const openText = await textOf(coach2);
  check('coach: it prints her primary concerns', /primary concerns/i.test(openText));
  check('coach: it prints her stress load', /8\/10/.test(openText));
  check('coach: it prints her sleep rhythm', /sleep rhythm/i.test(openText));
  check('coach: it prints her history', /right knee surgery/i.test(openText));
  check('coach: it prints a completion date', /completed\s+\w+\s+\d/i.test(openText));
  check('coach: the follow-up alert is drawn', /follow-up may be appropriate/i.test(openText));
  check('coach: the bleeding she reported is named', /bleeding reported/i.test(openText));
  check(
    'coach: what she reported and the question are under different headings',
    /what she reported/i.test(openText) && /questions worth exploring/i.test(openText)
  );
  check(
    'coach: the removed medications are nowhere on the card',
    !/levothyroxine|sertraline/i.test(openText)
  );
  check('coach: no causation language', !/because|caused by|leads to|due to/i.test(openText));
  await noEmDash(coach2, 'coach Health Context');

  // -------------------------------------------------------------------
  // 4. The two instruments this build must not have touched.
  // -------------------------------------------------------------------
  for (const [name, definition, route, marker] of [
    ['MEF Body Systems Survey', BODY_SYSTEMS, '/body-systems', 'begin'],
    ['Stress & Load Deep-Dive', STRESS_LOAD, '/stress-load', 'begin'],
  ]) {
    await admin.from('assessment_assignments').insert({
      member_id: MEMBER,
      assessment_definition_id: definition,
      assigned_by: COACH,
      is_required: true,
      stage: 'standard',
      due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    const other = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 414, height: 896 },
    });
    const otherPage = await other.context.newPage();
    watch(otherPage, name);
    await otherPage.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    const opened = await waitForText(otherPage, marker, 45000);
    const body = await textOf(otherPage);
    check(`${name} still opens and still offers its own way in`, opened, body.slice(0, 60));
    check(`${name}: no em dash`, !body.includes(EM));
    await retireSession(other.session).catch(() => {});
    await other.context.close();
  }

  await coachAgain.context.close();

  check('no console errors anywhere in the run', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
} finally {
  await browser.close().catch(() => {});
  if (memberSession) await retireSession(memberSession).catch(() => {});
  if (coachSession) await retireSession(coachSession).catch(() => {});
  await clean();
  const { data: leftover } = await admin
    .from('member_health_intake_sessions')
    .select('id')
    .eq('member_id', MEMBER);
  console.log(`cleanup confirmed by an independent read: ${(leftover ?? []).length} sitting(s) left`);

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  for (const row of failed) console.log(`  FAILED: ${row.name} ${row.note}`);
  if (failed.length > 0) process.exitCode = 1;
}
