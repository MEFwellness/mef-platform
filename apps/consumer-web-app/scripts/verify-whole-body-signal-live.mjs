/**
 * A real, signed-in walk of the MEF Whole-Body Signal Assessment, end to
 * end, on whichever app the environment points at.
 *
 * WHAT IT DRIVES, in the order the brief asks for it:
 *
 *   as the coach, the real Assign control on the client screen, with the
 *     default due date;
 *   as the member, the pop-up, the Home card, the opening screen, every
 *     section transition, one question per screen with its dual progress,
 *     the Section 8 branch answered "I am in perimenopause or menopause"
 *     with only T1, T2, B1 and the universal four following it, a genuine
 *     close and resume, the completion reveal and her results;
 *   as the coach again, the whole reading: priorities, signal map, Signal
 *     Load, why-scored-high with View All Answers, the Zone panel and its
 *     contributors, the associated coaching map, the fired cross patterns,
 *     at most six coaching questions with working controls, and a chosen
 *     focus that differs from the recommendation;
 *   a retake answered differently, and the reassessment comparison.
 *
 * WHERE IT RUNS. Anywhere, from environment variables:
 *
 *   WBS_BASE_URL            the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   WBS_MEMBER / WBS_MEMBER_EMAIL     the member to walk as
 *   WBS_COACH  / WBS_COACH_EMAIL      the coach assigned to her
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line.
 *
 * IT CLEANS UP AFTER ITSELF, at the start as well as at the end, because a
 * run that is interrupted leaves rows. The cleanup is confirmed by an
 * independent read rather than by trusting the delete.
 *
 * THE TRAPS IT ALREADY KNOWS ABOUT, every one of them learned on this
 * codebase:
 *
 *   innerText reports what CSS PAINTED, so every text match is case
 *     insensitive.
 *   a click before hydration does nothing, silently, so every tap is
 *     confirmed by the app agreeing it happened.
 *   headless Chromium reports prefers-reduced-motion: reduce by default,
 *     which would silently skip every beat this run exists to watch, so
 *     the context asks for no-preference explicitly.
 *   an answer row is a radio, not a button.
 *   a coach section is a button with aria-expanded whose children are not
 *     in the DOM until it is pressed.
 *   process.exit in a finally swallows the throw above it, so this sets
 *     process.exitCode and lets the process end on its own.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.WBS_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.WBS_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.WBS_MEMBER_EMAIL ?? 'member.one@example.test';
const COACH = process.env.WBS_COACH ?? '33333333-3333-3333-3333-333333333333';
const COACH_EMAIL = process.env.WBS_COACH_EMAIL ?? 'coach.one@example.test';
const DEFINITION = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36';
const EM = String.fromCharCode(0x2014);

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

/** Everything this run creates, removed. Run before the walk and again after it. */
async function clean() {
  const { data: sittings } = await admin
    .from('member_whole_body_signal_sessions')
    .select('id')
    .eq('member_id', MEMBER);
  const ids = (sittings ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await admin.from('member_whole_body_signal_question_actions').delete().in('session_id', ids);
    await admin.from('member_whole_body_signal_focus').delete().in('session_id', ids);
  }
  await admin.from('member_whole_body_signal_sessions').delete().eq('member_id', MEMBER);
  await admin
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  await admin
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  // A "Maybe later" tap leaves a dismissal row keyed by a string, not an
  // FK, so deleting the assignment does not take it with it.
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .like('message_key', 'whole_body_signal:%');
}

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
  CREATES the account when the address does not exist, so a single typo
  would mint a session for a brand new stranger and walk the assessment as
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

/*
  EVERY PRACTITIONER WORD, READ OUT OF THE DATABASE RATHER THAN TYPED HERE.

  The blind half of this run checks that none of them reaches a member
  screen, so a Zone renamed tomorrow is covered the day it is renamed.
*/
const [{ data: zoneRows }, { data: sectionRows }, { data: copyRows }] = await Promise.all([
  admin.from('whole_body_signal_zones').select('display_name, chakra_lens, organ_gland_list, spinal_segments'),
  admin.from('whole_body_signal_sections').select('section_key, position, display_name, member_transition_line'),
  admin.from('whole_body_signal_copy').select('copy_key, value').eq('audience', 'member'),
]);
if (!zoneRows?.length || !sectionRows?.length || !copyRows?.length) {
  throw new Error('could not read the seeded content');
}
const MEMBER_COPY = Object.fromEntries(copyRows.map((row) => [row.copy_key, row.value]));

/*
  THE TWO ANSWER SCALES, READ OUT OF THE DATABASE RATHER THAN TYPED HERE.

  Which questions are answered Yes / No / Not sure is a stored column, so a
  coach who moves one more question onto the binary scale tomorrow is
  covered by this run the day he does it, and a coach who moves one back is
  too.
*/
const [{ data: scaleOptionRows }, { data: questionRows }] = await Promise.all([
  admin.from('whole_body_signal_scale_options').select('scale_key, value_key, position, label').eq('is_active', true),
  admin
    .from('whole_body_signal_questions')
    .select('question_ref, section_key, prompt, scale_key, allows_pnta, is_universal, branch_group')
    .eq('is_active', true),
]);
if (!scaleOptionRows?.length || !questionRows?.length) {
  throw new Error('could not read the questions and their answer scales');
}
const LABELS_FOR_SCALE = {};
for (const row of scaleOptionRows.slice().sort((a, b) => a.position - b.position)) {
  (LABELS_FOR_SCALE[row.scale_key] ??= []).push(row.label);
}
const SCALE_OF_PROMPT = new Map(questionRows.map((row) => [row.prompt, row.scale_key]));
const BINARY_PROMPTS = questionRows.filter((row) => row.scale_key === 'binary').map((row) => row.prompt);
const UNIVERSAL_PROMPTS = questionRows.filter((row) => row.is_universal).map((row) => row.prompt);
console.log(
  `answer scales: ${Object.entries(LABELS_FOR_SCALE)
    .map(([key, labels]) => `${key} [${labels.join(', ')}]`)
    .join('  ')}`
);
console.log(`${BINARY_PROMPTS.length} question(s) on the binary scale`);
const SECTIONS = sectionRows.slice().sort((a, b) => a.position - b.position);
/*
  THE LIST IS THE DISTINCTIVE HALF, and both filters are load bearing.

  A chakra lens is "Root", "Heart", "Throat". Those are ordinary English
  and, in this app, "Root" is the assistant's own name on every screen she
  opens. Matching them would fail on a working Home and would teach
  everybody to ignore this check. Two rules keep it honest and keep it
  sharp: a term has to be at least six characters, and it must not already
  appear in an approved member copy row.
*/
const MEMBER_COPY_TEXT = Object.values(MEMBER_COPY).join(' ').toLowerCase();
const PRACTITIONER_WORDS = [
  ...zoneRows.map((row) => row.display_name),
  ...zoneRows.map((row) => row.chakra_lens),
  ...zoneRows.flatMap((row) => row.organ_gland_list.split(',').map((s) => s.trim())),
  ...zoneRows.map((row) => row.spinal_segments),
]
  .filter((word) => word && word.length >= 6)
  .filter((word) => !MEMBER_COPY_TEXT.includes(word.toLowerCase()));
console.log(`blind check armed against ${PRACTITIONER_WORDS.length} practitioner strings`);

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

/** Tap a control and WAIT FOR THE APP TO AGREE it was tapped. */
async function tap(scope, name, exact = true) {
  const radios = scope.getByRole('radio', { name, exact });
  const target = (await radios.count()) > 0 ? radios : scope.getByRole('button', { name, exact });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await target.first().click({ timeout: 10000 }).catch(() => {});
    const [checked, pressed] = await Promise.all([
      target.first().getAttribute('aria-checked'),
      target.first().getAttribute('aria-pressed'),
    ]);
    if (checked === 'true' || pressed === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

/** The one thing that identifies the screen she is on. */
async function screenKey(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('h1');
    const eyebrow = document.body.innerText.match(/section \d+ of \d+/i);
    return `${heading ? heading.textContent.trim() : 'no-h1'}|${eyebrow ? eyebrow[0].toLowerCase() : ''}`;
  });
}

/** WAIT ON THE APP, NEVER ON THE CLOCK. */
async function waitForScreenChange(page, previous, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now !== previous && !now.startsWith('no-h1')) return now;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`the screen never changed away from ${previous}`);
}

async function textOf(page) {
  return page.evaluate(() => document.body.innerText);
}

async function noEmDash(page, label) {
  const text = await textOf(page);
  check(`${label}: no em dash`, !text.includes(EM));
}

/** No Zone, chakra, organ, gland, spinal segment, colour word or percentage. */
async function noPractitionerWord(page, label) {
  const [text, html] = await Promise.all([textOf(page), page.content()]);
  const leaked = PRACTITIONER_WORDS.filter((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );
  check(`${label}: no practitioner word on screen`, leaked.length === 0, leaked.slice(0, 3).join(', '));
  const inPayload = ['chakraLens', 'organGland', 'spinalSegments', 'coachTopic', 'zoneKey', 'primaryZone'].filter(
    (field) => html.includes(field)
  );
  check(`${label}: no practitioner field in the page payload`, inPayload.length === 0, inPayload.join(', '));
  check(`${label}: no percentage`, !/\d+\s*%/.test(text));
}

/**
 * Press a control and WAIT FOR THE APP TO AGREE it was pressed.
 *
 * The coach detail page is large, and a click that lands on server
 * rendered HTML before React has hydrated does nothing at all, silently.
 * That is what made the first three runs report "View All Answers is not
 * offered" about a panel that offers it perfectly: the fold had never been
 * opened, because the click had never reached a listener.
 */
async function press(locator, attribute = 'aria-expanded') {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await locator.click({ timeout: 10000 }).catch(() => {});
    if ((await locator.getAttribute(attribute)) === 'true') return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Open every folded section on the coach page, which is how its cards reach the DOM. */
async function openFolds(page) {
  for (let pass = 0; pass < 3; pass += 1) {
    const folds = page.locator('[aria-expanded="false"]');
    const count = await folds.count();
    if (count === 0) break;
    for (let i = count - 1; i >= 0; i -= 1) {
      await folds.nth(i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
  }
}

const browser = await chromium.launch();
let minted = null;
let coach = null;
/** Declared out here so the cleanup in the finally can read it. */
let knownDismissals = null;

try {
  // ------------------------------------------------------------------
  // 1. AS THE COACH: assign it, through the real control.
  // ------------------------------------------------------------------
  coach = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1000 },
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!coach) throw new Error('could not mint the coach session');
  const coachPage = await coach.context.newPage();
  watch(coachPage, 'coach');

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  // A COACH SECTION IS A FOLD, and its children are not in the DOM until it
  // is pressed, so waiting for a card inside one waits forever on a page
  // that is working perfectly.
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  await openFolds(coachPage);
  await coachPage.waitForSelector('[aria-label="Assessment Status"]', { timeout: 120000 });
  const statusBlock = coachPage.locator('[aria-label="Assessment Status"]');
  const blockText = await statusBlock.innerText();
  check(
    'the coach can find it by name in the assign section',
    /MEF Whole-Body Signal Assessment/i.test(blockText)
  );

  /*
    ADDRESS THE ROW BY ITS OWN ID, never by "the first Assign button".

    Every row in the Not Yet Assigned group has an Assign button, so a
    copy-based or first-match locator would open somebody else's form and
    still report a pass.
  */
  const row = coachPage.locator('#assessment-row-whole-body-signal');
  await row.waitFor({ timeout: 60000 });
  const rowText = await row.innerText();
  // A row in Not Yet Assigned carries no status sentence, because there is
  // no assignment to write one about. What it does carry is its area and
  // its own Assign control, and that is what "not sent yet" looks like.
  check(
    'and it sits in Not Yet Assigned, with its own Assign control',
    /whole body/i.test(rowText) && /assign/i.test(rowText),
    rowText.replace(/\n/g, ' ').slice(0, 90)
  );

  await row.getByRole('button', { name: 'Assign', exact: true }).click();
  const form = row.locator('[data-assign-form="whole-body-signal"]');
  await form.waitFor({ timeout: 30000 });
  check('its own assign form opens, with no reason field a deep-dive cannot store', true);
  // The DEFAULT due date: nothing typed, so its own action decides it.
  await form.getByRole('button', { name: /^(Assign|Sending)$/ }).click();

  // WAIT ON THE SERVER. The row landing is the event, not a fixed sleep.
  let assignment = null;
  for (let attempt = 0; attempt < 80 && !assignment; attempt += 1) {
    const { data } = await admin
      .from('assessment_assignments')
      .select('id, due_at, is_required, status')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', DEFINITION)
      .maybeSingle();
    assignment = data ?? null;
    if (!assignment) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check('the coach Assign control really wrote the assignment', Boolean(assignment));
  if (!assignment) throw new Error('no assignment row after the coach pressed Assign');

  const dueDays = Math.round(
    (new Date(assignment.due_at).getTime() - Date.now()) / 86400000
  );
  check('the default due date is seven days out', dueDays >= 6 && dueDays <= 8, `${dueDays} days`);
  check('it is written as required, with its own action deciding that', assignment.is_required === true);

  // ------------------------------------------------------------------
  // 2. AS THE MEMBER: the pop-up, the card, and the whole journey.
  // ------------------------------------------------------------------
  minted = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!minted) throw new Error('could not mint the member session');
  let page = await minted.context.newPage();
  watch(page, 'member');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/whole-body signal/i', { timeout: 120000 });

  /*
    ROOT KNOCKS ONCE AT A TIME, AND THIS ONE IS NOT NECESSARILY FIRST.

    The chain returns a single message per open, in a fixed order, and this
    member can legitimately have another one due above it. So this reads
    every knock she is given, dismissing each in turn, and asserts that one
    of them carried the approved line. Reading only the first would have
    made this check depend on what else happened to be due that day.
  */
  /*
    SHE MAY BE OWED MORE THAN ONE KNOCK, AND ROOT GIVES ONE PER OPEN.

    The chain returns a single message per open, in a fixed order, and this
    member legitimately has others above this one. So each knock is
    dismissed with Maybe later, which genuinely means "ask again next
    login", and Home is reopened to collect the next. Reading only the
    first would have made this check depend on what else happened to be due
    that day, which is exactly how it failed on the first run: she was
    knocked about the Core Values Snapshot and this reported no knock.

    EVERY DISMISSAL THIS RUN WRITES IS REMOVED AT THE END, and only the
    ones this run wrote: the keys already on her row are read first.
  */
  const { data: dismissalsBefore } = await admin
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', MEMBER);
  knownDismissals = new Set((dismissalsBefore ?? []).map((row) => row.message_key));

  const knocks = [];
  /*
    AND THE KNOCK ARRIVES AFTER THE PAGE DOES. The chain is resolved on the
    server and the frame mounts a moment after Home's own content, so
    counting dialogs the instant the card's words appear counts zero and
    reports "she was never knocked" about a member who was. Wait for the
    frame, not for the page.
  */
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=/whole-body signal/i', { timeout: 120000 });
    }
    const appeared = await page
      .waitForSelector('[role="dialog"]', { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) break;

    const dialog = page.getByRole('dialog').first();
    // ITS TEXT ARRIVES AFTER ITS BOX DOES. The frame mounts first and its
    // words a frame or two later, so reading innerText the instant the
    // selector resolves reads an empty dialog and reports a knock nobody
    // could see.
    let knockText = '';
    for (let read = 0; read < 25 && knockText.trim().length === 0; read += 1) {
      // textContent rather than innerText: this frame fades in, and
      // innerText reports what is PAINTED, so a dialog mid-animation reads
      // as an empty one.
      knockText = (await dialog.textContent().catch(() => '')) ?? '';
      if (knockText.trim().length === 0) await page.waitForTimeout(200);
    }
    if (knockText.trim()) knocks.push(knockText);
    check('a knock carries no em dash', !knockText.includes(EM));

    const dismiss = dialog.getByRole('button', {
      name: /maybe later|not today|not now|later|dismiss|no thanks|close/i,
    });
    if (await dismiss.count()) {
      await dismiss.first().click().catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page
      .waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, {
        timeout: 15000,
      })
      .catch(() => {});

    if (knockText.includes(MEMBER_COPY['member.popup_body'])) break;
  }

  check(
    'the pop-up knocks with the approved line',
    knocks.some((text) => text.includes(MEMBER_COPY['member.popup_body'])),
    `${knocks.length} knock(s): ${knocks.map((t) => t.split('\n')[1] ?? t.split('\n')[0]).join(' | ').slice(0, 160)}`
  );

  // Nothing may be covering the card underneath by the time it is read.
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, {
    timeout: 30000,
  });

  const cardText = await textOf(page);
  check('the entry card says what it is', cardText.includes(MEMBER_COPY['member.card_body']));
  check('and how long it takes', cardText.includes(MEMBER_COPY['member.card_duration']));
  check('and what her coach will do with it', cardText.includes(MEMBER_COPY['member.card_footnote']));
  await noPractitionerWord(page, 'Home');

  // The receipt is written on a real display, once.
  let delivery = null;
  for (let attempt = 0; attempt < 40 && !delivery; attempt += 1) {
    const { data } = await admin
      .from('member_assignment_deliveries')
      .select('assignment_id, presentation')
      .eq('member_id', MEMBER)
      .eq('assignment_id', assignment.id);
    delivery = data && data.length ? data : null;
    if (!delivery) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check('the delivery receipt is written once, on a real display', delivery?.length === 1,
    delivery ? delivery.map((d) => d.presentation).join(',') : 'none');

  await page.getByRole('link', { name: new RegExp(MEMBER_COPY['member.card_cta'], 'i') }).first().click();
  await page.waitForURL(/\/whole-body-signal/, { timeout: 60000 });

  // --- the opening screen ---
  await page.waitForSelector(`text=/${MEMBER_COPY['member.intro_button']}/i`, { timeout: 60000 });
  /*
    THE INTRO TYPES ITSELF IN, so reading the screen the instant its button
    appears reads a half written line. Wait on the words, not on the clock.
  */
  async function waitForText(needle, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await textOf(page)).includes(needle)) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }
  check(
    'the opening screen carries the coach voice intro',
    await waitForText(MEMBER_COPY['member.intro_line_1'])
  );
  check(
    'and the 8 to 12 weeks framing line',
    await waitForText(MEMBER_COPY['member.intro_line_3'])
  );
  await noPractitionerWord(page, 'the opening screen');
  await noEmDash(page, 'the opening screen');

  await page.getByRole('button', { name: MEMBER_COPY['member.intro_button'] }).click();

  /**
   * Answer every question on screen until the journey is over.
   *
   * ONE QUESTION PER SCREEN, and a tap is both the answer and the advance,
   * so this waits for the heading to change rather than pressing anything
   * else. The section beats and the routing screen carry their own
   * controls and are handled by name.
   */
  async function walk({
    label,
    answerFor,
    stopAfterSections = null,
    routingLabel = 'I am in perimenopause or menopause',
  }) {
    const seenSections = new Set();
    const sectionOrder = [];
    const branchPrompts = [];
    /** Every Section 8 screen she was shown, with the answers it offered. */
    const branchScreens = [];
    /** Every binary question she was shown, with the answers it offered. */
    const binaryScreens = [];
    let questionsAnswered = 0;
    let dualProgressSeen = false;
    let transitionsSeen = 0;
    let completeBeatsSeen = 0;
    let backCheckDone = false;

    for (let screen = 0; screen < 400; screen += 1) {
      await page.waitForSelector('h1', { timeout: 60000 });
      const text = await textOf(page);
      const heading = (await page.locator('h1').first().innerText()).trim();
      const key = await screenKey(page);

      if (text.includes(EM)) check(`${label}: no em dash on "${heading.slice(0, 40)}"`, false);

      // The completion screen.
      if (heading.toLowerCase().includes(MEMBER_COPY['member.completion_title'].toLowerCase())) {
        check(`${label}: the completion screen arrives`, true);
        check(
          `${label}: and says the picture is being pulled together`,
          text.includes(MEMBER_COPY['member.completion_body'])
        );
        return { seenSections, sectionOrder, branchPrompts, branchScreens, binaryScreens, questionsAnswered, dualProgressSeen, transitionsSeen, completeBeatsSeen };
      }

      // A section intro.
      const asSection = SECTIONS.find((s) => s.display_name === heading);
      if (asSection && /section \d+ of 9/i.test(text)) {
        if (!seenSections.has(asSection.section_key)) {
          seenSections.add(asSection.section_key);
          sectionOrder.push(asSection.section_key);
          transitionsSeen += 1;
        }
        if (stopAfterSections && seenSections.size > stopAfterSections) {
          return { seenSections, sectionOrder, branchPrompts, branchScreens, binaryScreens, questionsAnswered, dualProgressSeen, transitionsSeen, completeBeatsSeen, stopped: true };
        }
        check(
          `${label}: ${asSection.display_name} opens with its own one-line purpose`,
          text.includes(asSection.member_transition_line)
        );
        await page.getByRole('button', { name: MEMBER_COPY['member.continue'] }).first().click();
        await waitForScreenChange(page, key);
        continue;
      }

      // A section completion beat.
      if (new RegExp(`\\b${MEMBER_COPY['member.section_complete_suffix']}\\b`, 'i').test(heading)) {
        completeBeatsSeen += 1;
        check(
          `${label}: the beat thanks her and names what is next`,
          text.includes(MEMBER_COPY['member.section_complete_line']) &&
            new RegExp(`${MEMBER_COPY['member.next_section_label']}:`, 'i').test(text)
        );
        await page.getByRole('button', { name: MEMBER_COPY['member.continue'] }).first().click();
        await waitForScreenChange(page, key);
        continue;
      }

      // The routing screen.
      if (heading === MEMBER_COPY['member.branch_question']) {
        // innerText reports what CSS PAINTED, and this eyebrow carries an
        // `uppercase` class, so a case sensitive match fails against a
        // screen displaying exactly the right words.
        check(
          `${label}: the branch screen says Before we continue`,
          new RegExp(MEMBER_COPY['member.branch_intro'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)
        );
        const options = await page.getByRole('radio').allInnerTexts();
        check(`${label}: it offers all six routing options`, options.length === 6, String(options.length));
        await tap(page, routingLabel);
        await waitForScreenChange(page, key);
        continue;
      }

      // A question.
      if (/section \d+ of 9/i.test(text) === false && (await page.getByRole('radio').count()) === 0) {
        throw new Error(`${label}: unrecognised screen "${heading.slice(0, 60)}"`);
      }
      if (!dualProgressSeen) {
        const bars = await page.locator('[role="progressbar"]').count();
        const markers = await page.locator('h1').count();
        dualProgressSeen = bars >= 1 && markers >= 1;
      }
      // Section 8's questions are the ones this run is checking the branch on.
      const inHormone = await page.evaluate(() =>
        /hormone/i.test(document.body.innerText.split('\n').slice(0, 6).join(' '))
      );

      /*
        WHAT THIS QUESTION ACTUALLY OFFERS HER.

        An answer row is a radio, not a button, and the labels on it are
        what the screen is really asking with. Reading them here is what
        lets a binary question be checked as a binary question rather than
        by trusting that the database and the screen agree.
      */
      const options = (await page.getByRole('radio').allInnerTexts()).map((text) => text.trim());
      const scaleKey = SCALE_OF_PROMPT.get(heading) ?? null;

      if (inHormone) {
        branchPrompts.push(heading);
        branchScreens.push({ heading, options });
      }

      if (scaleKey === 'binary') {
        const offered = options.filter((option) => option !== MEMBER_COPY['member.pnta_label']);
        binaryScreens.push({ heading, options: offered });
        check(
          `${label}: "${heading.slice(0, 45)}" offers exactly Yes / No / Not sure`,
          offered.length === LABELS_FOR_SCALE.binary.length &&
            LABELS_FOR_SCALE.binary.every((expected, index) => offered[index] === expected),
          offered.join(' / ')
        );
      } else if (scaleKey === 'frequency') {
        const offered = options.filter((option) => option !== MEMBER_COPY['member.pnta_label']);
        if (offered.length !== LABELS_FOR_SCALE.frequency.length) {
          check(
            `${label}: a frequency question still offers its own five`,
            false,
            `${heading.slice(0, 45)} offered ${offered.join(' / ')}`
          );
        }
      }

      const value = answerFor({ heading, options, index: questionsAnswered, scaleKey });
      await tap(page, value);
      questionsAnswered += 1;
      const afterAnswer = await waitForScreenChange(page, key);

      /*
        BACK KEEPS THE ANSWER ON SCREEN.

        Done once per walk, on the first binary question, because that is
        the screen this change rebuilt. Back is the correction path for an
        instrument whose tap is also its advance, so an answer that does
        not come back with her is a member who cannot change her mind.
      */
      if (!backCheckDone && scaleKey === 'binary') {
        backCheckDone = true;
        // PRESSED UNTIL THE APP AGREES. A click that lands mid transition
        // does nothing, silently, and a single click would then report a
        // Back control that works perfectly as broken.
        let returned = false;
        for (let attempt = 0; attempt < 10 && !returned; attempt += 1) {
          await page
            .getByRole('button', { name: MEMBER_COPY['member.back'] })
            .first()
            .click({ timeout: 10000 })
            .catch(() => {});
          returned = await page
            .waitForFunction(
              (prompt) => {
                const h1 = document.querySelector('h1');
                return Boolean(h1 && h1.textContent.trim() === prompt);
              },
              heading,
              { timeout: 4000 }
            )
            .then(() => true)
            .catch(() => false);
        }
        check(`${label}: Back returns to the question just answered`, returned, heading.slice(0, 45));
        if (returned) {
          const chosen = page.getByRole('radio', { name: value, exact: true }).first();
          let held = null;
          for (let attempt = 0; attempt < 20 && held !== 'true'; attempt += 1) {
            held = await chosen.getAttribute('aria-checked');
            if (held !== 'true') await page.waitForTimeout(150);
          }
          check(`${label}: and her answer is still selected`, held === 'true', `${value}: ${held}`);
          // Forward again by tapping the same answer, which is the real
          // correction path: one tap, not a restart.
          const backKey = await screenKey(page);
          await tap(page, value);
          await waitForScreenChange(page, backKey);
        }
      } else {
        void afterAnswer;
      }
    }
    throw new Error(`${label}: the walk never reached the completion screen`);
  }

  /**
   * Wait for her results to arrive.
   *
   * THE SUBMIT IS ALREADY IN FLIGHT: her last answer started it, and the
   * reveal plays over it, so View My Results is disabled until it lands and
   * the screen turns into her results on its own. Waiting on the heading is
   * waiting on the server.
   *
   * AND IF IT DOES NOT ARRIVE, THE BUTTON IS PRESSED. That button exists
   * for the member whose submit did not land, and a run that never used it
   * would never prove it works. Whatever happens, this reports what the
   * screen actually said rather than a bare timeout.
   */
  async function awaitResults(label) {
    const started = Date.now();
    const heading = `text=/${MEMBER_COPY['member.results_heading']}/i`;
    const arrived = await page
      .waitForSelector(heading, { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    if (arrived) {
      check(label, true, `${Math.round((Date.now() - started) / 1000)}s`);
      return;
    }

    const cta = page.getByRole('button', { name: MEMBER_COPY['member.completion_cta'] });
    const pressable = (await cta.count()) > 0 && !(await cta.first().isDisabled());
    if (pressable) {
      await cta.first().click().catch(() => {});
      const second = await page
        .waitForSelector(heading, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      if (second) {
        check(label, true, `${Math.round((Date.now() - started) / 1000)}s, after pressing View My Results`);
        return;
      }
    }

    const stuck = await textOf(page);
    check(
      label,
      false,
      `after ${Math.round((Date.now() - started) / 1000)}s the screen said: ${stuck
        .replace(/\n/g, ' ')
        .slice(0, 240)} | button pressable: ${pressable} | console: ${consoleErrors.slice(0, 2).join(' | ')}`
    );
    throw new Error(`${label}: her results never arrived`);
  }

  // --- the first two sections, then a real close and resume ---
  /** The loud answer on whichever scale the question in front of her uses. */
  const loudAnswer = ({ options }) => (options.includes('Often') ? 'Often' : 'Yes');
  /** The quiet one, for the retake. */
  const quietAnswer = ({ options }) => (options.includes('Never') ? 'Never' : 'No');

  const partial = await walk({
    label: 'first sitting',
    answerFor: loudAnswer,
    stopAfterSections: 2,
  });
  check('the first section opened, and so did the second', partial.seenSections.size >= 2);
  check('every question screen carried both progress lines', partial.dualProgressSeen);
  await noPractitionerWord(page, 'a question screen');

  // CLOSE THE APP. The pending save is flushed on pagehide, so this is the
  // real thing rather than a navigation that politely waits.
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  /*
    THE DRAFT SHE LEFT REALLY WAS SAVED.

    Read from the row, before anything is asserted about the screen,
    because "Welcome back did not appear" has two completely different
    causes: a screen that did not draw it, and a draft that was never
    written. Waiting on the row rather than on the clock is also what makes
    this honest on a slow write.
  */
  let draft = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data } = await admin
      .from('member_whole_body_signal_sessions')
      .select('id, answers, completed_at, content_version')
      .eq('member_id', MEMBER)
      .maybeSingle();
    draft = data ?? null;
    if (draft && Object.keys(draft.answers ?? {}).length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const draftCount = Object.keys(draft?.answers ?? {}).length;
  check(
    'closing the app kept every answer she had given',
    draftCount >= 20,
    `${draftCount} answers stored, completed_at ${draft?.completed_at ?? 'null'}`
  );

  page = await minted.context.newPage();
  watch(page, 'member');
  await page.goto(`${BASE}/whole-body-signal`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 60000 });
  const resumeText = await textOf(page);
  console.log(`   reopened on: "${(await page.locator('h1').first().innerText()).trim()}"`);
  check('coming back says Welcome back', resumeText.includes(MEMBER_COPY['member.resume_title']));
  check(
    'and tells her how many sections she is in',
    /you are \d+ sections? in/i.test(resumeText),
    (resumeText.match(/you are \d+ sections? in/i) ?? [''])[0]
  );
  check('and never restarts her', !resumeText.includes(MEMBER_COPY['member.intro_line_1']));
  await page.getByRole('button', { name: MEMBER_COPY['member.resume_cta'] }).click();

  // --- the rest of the sitting ---
  const first = await walk({ label: 'first sitting', answerFor: loudAnswer });
  check('all nine sections were walked', first.seenSections.size + 2 >= 9 || first.seenSections.size >= 9,
    `${first.seenSections.size} after resume`);
  check('eight beats between nine sections', first.completeBeatsSeen >= 1);

  // THE BINARY QUESTIONS. Every one of them, and no other, asked Yes / No
  // / Not sure, one per screen, with the tap still doing the advancing.
  check(
    'every question on the binary scale was asked with Yes / No / Not sure',
    first.binaryScreens.length + partial.binaryScreens.length >= 1,
    `${first.binaryScreens.length + partial.binaryScreens.length} seen`
  );
  const binarySeen = new Set(
    [...partial.binaryScreens, ...first.binaryScreens].map((screen) => screen.heading)
  );
  check(
    'and all of them were reached in the walk',
    BINARY_PROMPTS.every((prompt) => binarySeen.has(prompt)),
    `${binarySeen.size} of ${BINARY_PROMPTS.length}`
  );

  // THE BRANCH. Only T1, T2, B1 and the universal four may have appeared.
  const { data: branchRows } = await admin
    .from('whole_body_signal_questions')
    .select('question_ref, prompt, branch_group, is_universal')
    .eq('section_key', 'hormone_pelvic_rhythm');
  const expectedBranch = branchRows
    .filter((row) => row.is_universal || ['T', 'B'].includes(row.branch_group))
    .map((row) => row.prompt);
  const forbiddenBranch = branchRows
    .filter((row) => row.branch_group === 'C')
    .map((row) => row.prompt);
  const askedBranch = new Set(first.branchPrompts);
  check(
    'the menopause branch asked exactly T1, T2, B1 and the universal four',
    expectedBranch.every((p) => askedBranch.has(p)) && askedBranch.size === expectedBranch.length,
    `${askedBranch.size} asked, ${expectedBranch.length} expected`
  );
  check(
    'and asked none of the cycle questions',
    forbiddenBranch.every((p) => !askedBranch.has(p))
  );

  // --- the completion reveal, then her results ---
  await awaitResults('the completion reveal resolves into her results');
  const resultsText = await textOf(page);
  check('her results are headed with the approved line', resultsText.includes(MEMBER_COPY['member.results_heading']));
  check('and the calm opening sentence', resultsText.includes(MEMBER_COPY['member.results_intro']));
  check('and the closing she is owed', resultsText.includes(MEMBER_COPY['member.closing_line_1']));
  check('with a way home', /return home/i.test(resultsText));
  check('BAND LANGUAGE ONLY: at least one band name is on screen',
    /quiet|showing up|speaking loudly|asking for priority/i.test(resultsText));
  check('NO TRAFFIC LIGHT WORDS anywhere on her results',
    !/\b(green|yellow|orange|red)\b/i.test(resultsText));
  await noPractitionerWord(page, 'her results');
  await noEmDash(page, 'her results');

  // Tap into a section card.
  const firstCard = page.getByRole('button', { name: new RegExp(SECTIONS[0].display_name, 'i') }).first();
  await firstCard.click();
  await page.waitForTimeout(500);
  const cardOpen = await textOf(page);
  check('tapping a section opens its card', cardOpen.includes(MEMBER_COPY['member.section_card_next_heading']));
  check('with the what-happens-next copy', cardOpen.includes(MEMBER_COPY['member.section_card_next_body']));
  // innerText reports what CSS PAINTED, and this label carries an
  // `uppercase` class.
  check(
    'and plain language themes only',
    new RegExp(MEMBER_COPY['member.section_card_themes_label'], 'i').test(cardOpen)
  );
  await noPractitionerWord(page, 'an open section card');

  const { data: stored } = await admin
    .from('member_whole_body_signal_sessions')
    .select('id, routing_option_key, answers, results, completed_at')
    .eq('member_id', MEMBER)
    .not('completed_at', 'is', null)
    .maybeSingle();
  check('the sitting landed in the database', Boolean(stored?.completed_at));
  check('with her branch stored beside it', stored?.routing_option_key === 'menopause');
  check('and a Signal Load computed from it', typeof stored?.results?.load?.value === 'number',
    String(stored?.results?.load?.value));
  check('and a Zone rollup built from her answers', (stored?.results?.zones?.length ?? 0) > 0);

  /*
    HER BINARY ANSWERS WERE STORED AS BINARY ANSWERS.

    The strongest form of this check: not what a screen printed, but what
    landed in the row. A binary question holding "often" would mean the
    screen and the database disagree about what she was asked.
  */
  const binaryValues = new Set(
    scaleOptionRows.filter((row) => row.scale_key === 'binary').map((row) => row.value_key)
  );
  const storedBinary = BINARY_PROMPTS.map((prompt) => questionRows.find((row) => row.prompt === prompt))
    .filter(Boolean)
    .map((row) => [row.question_ref, stored?.answers?.[row.question_ref]]);
  check(
    'every binary question stored a Yes / No / Not sure value',
    storedBinary.length > 0 && storedBinary.every(([, value]) => binaryValues.has(value)),
    storedBinary.map(([ref, value]) => `${ref}=${value}`).join(' ')
  );

  // ------------------------------------------------------------------
  // 3. AS THE COACH: the whole reading.
  // ------------------------------------------------------------------
  await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  await openFolds(coachPage);
  await coachPage.waitForSelector('#detail-card-whole-body-signal', { state: 'attached', timeout: 90000 });
  const panel = coachPage.locator('#detail-card-whole-body-signal');
  const panelText = await panel.innerText();

  check('the coach sees the primary coaching priorities', /primary coaching priorities/i.test(panelText));
  check('the signal map, with a real percentage', /signal map/i.test(panelText) && /\d+%/.test(panelText));
  check('the Whole-Body Signal Load and its three components',
    /whole-body signal load/i.test(panelText) &&
      /mean of all sections/i.test(panelText) &&
      /share of sections at 50 or above/i.test(panelText) &&
      /mean of the three highest sections/i.test(panelText));
  check('why this scored high', /why this scored high/i.test(panelText));
  check('the Zone pattern panel', /zone pattern/i.test(panelText) && /primary zone pattern/i.test(panelText));
  check('with its interpretation note, not a diagnosis',
    /interpretation, not diagnosis/i.test(panelText));
  check('the associated coaching map, with organs, segments and a chakra lens',
    /associated coaching map/i.test(panelText) &&
      /organs and glands/i.test(panelText) &&
      /spinal segments/i.test(panelText) &&
      /chakra lens/i.test(panelText));
  check('the cross section patterns block', /patterns across the assessment/i.test(panelText));
  check('questions worth exploring', /questions worth exploring/i.test(panelText));

  const askButtons = await panel.getByRole('button', { name: /mark as asked/i }).count();
  check('at most six coaching questions are offered', askButtons <= 6, `${askButtons} cards`);
  check('and at least one is', askButtons >= 1);

  /*
    VIEW ALL ANSWERS, ON A REAL SECTION.

    A why-section toggle is the only control on this panel that is both an
    aria-expanded button and carries a percentage, which is what
    distinguishes it from the coaching question chips (aria-pressed) and
    from the page's own folds.
  */
  const sectionToggle = panel.locator('button[aria-expanded]').filter({ hasText: '%' }).first();
  check('a section can be opened to see why it scored', (await sectionToggle.count()) > 0);
  check('and the press registers', await press(sectionToggle));
  const viewAll = panel.getByRole('button', { name: /view all answers/i }).first();
  const viewAllAppeared = await viewAll
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    'View All Answers is offered on an open section',
    viewAllAppeared,
    viewAllAppeared ? '' : (await panel.innerText()).replace(/\n/g, ' ').slice(0, 200)
  );
  if (viewAllAppeared) {
    await viewAll.click();
    await coachPage.waitForTimeout(600);
    const opened = await panel.innerText();
    check('and it lists her own answers', /never|rarely|sometimes|often|almost always/i.test(opened));
  }

  /*
    THE BINARY ANSWERS, ON THE COACH'S SIDE.

    Gut Environment is the section that holds them, so its own why-block is
    the one that has to print Yes, No or Not sure rather than a frequency
    word borrowed from the other scale.
  */
  const gutToggle = panel
    .locator('button[aria-expanded]')
    .filter({ hasText: new RegExp('gut environment', 'i') })
    .first();
  if ((await gutToggle.count()) > 0) {
    check('the section holding the binary questions opens', await press(gutToggle));
    const gutViewAll = panel.getByRole('button', { name: /view all answers/i }).first();
    if (await gutViewAll.count()) {
      await gutViewAll.click();
      await coachPage.waitForTimeout(600);
      const gutText = await panel.innerText();
      const binaryLines = BINARY_PROMPTS.filter((prompt) => gutText.includes(prompt));
      check(
        'her binary answers are listed against those questions',
        binaryLines.length >= 1,
        `${binaryLines.length} of ${BINARY_PROMPTS.length} prompts on screen`
      );
      check(
        'and they read Yes, No or Not sure rather than a frequency word',
        LABELS_FOR_SCALE.binary.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(gutText)),
        gutText.replace(/\n/g, ' ').slice(0, 160)
      );
    }
  }

  // The section that mixes the two scales still reads as one percentage.
  const gutResult = (stored.results.sections ?? []).find((s) => s.sectionKey === 'gut_environment');
  check(
    'the mixed scale section scores out of its own maximum, not out of four a question',
    gutResult ? gutResult.possible === 6 * 4 + 4 * 3 : false,
    gutResult ? `${gutResult.points} of ${gutResult.possible}, ${gutResult.percent}%` : 'missing'
  );
  check(
    'and its percentage is a real nought to a hundred number',
    gutResult ? gutResult.percent >= 0 && gutResult.percent <= 100 : false,
    gutResult ? `${gutResult.percent}%` : 'missing'
  );

  // The coaching question controls.
  if (askButtons > 0) {
    await panel.getByRole('button', { name: /mark as asked/i }).first().click();
    let asked = null;
    for (let attempt = 0; attempt < 40 && !asked; attempt += 1) {
      const { data } = await admin
        .from('member_whole_body_signal_question_actions')
        .select('question_key, asked_at, saved_at, hidden_at')
        .eq('session_id', stored.id);
      asked = data && data.length && data[0].asked_at ? data : null;
      if (!asked) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    check('marking a question as asked is stored', Boolean(asked));

    const saveButton = panel.getByRole('button', { name: /save to session prep/i }).first();
    if (await saveButton.count()) {
      await saveButton.click();
      let saved = null;
      for (let attempt = 0; attempt < 40 && !saved; attempt += 1) {
        const { data } = await admin
          .from('member_whole_body_signal_question_actions')
          .select('question_key, asked_at, saved_at')
          .eq('session_id', stored.id)
          .not('saved_at', 'is', null);
        saved = data && data.length ? data : null;
        if (!saved) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      check('saving one to session prep is stored', Boolean(saved));
      // A BLANK IS NOT AN ERASURE: the asked mark survived the save.
      const { data: both } = await admin
        .from('member_whole_body_signal_question_actions')
        .select('asked_at, saved_at')
        .eq('session_id', stored.id)
        .not('asked_at', 'is', null);
      check('and marking one does not clear the other mark on it', (both?.length ?? 0) >= 1);
    }

    const hideButton = panel.getByRole('button', { name: /^hide$/i }).first();
    if (await hideButton.count()) {
      await hideButton.click();
      let hidden = null;
      for (let attempt = 0; attempt < 40 && !hidden; attempt += 1) {
        const { data } = await admin
          .from('member_whole_body_signal_question_actions')
          .select('hidden_at')
          .eq('session_id', stored.id)
          .not('hidden_at', 'is', null);
        hidden = data && data.length ? data : null;
        if (!hidden) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      check('hiding one is stored', Boolean(hidden));
    }
  }

  // A COACHING FOCUS DIFFERENT FROM THE RECOMMENDATION.
  const recommended = stored.results.sections
    .filter((s) => s.possible > 0 && s.percent > 0)
    .slice(0, 2)
    .map((s) => s.sectionKey);
  const different = SECTIONS.map((s) => s.section_key).find((key) => !recommended.includes(key));
  const differentName = SECTIONS.find((s) => s.section_key === different).display_name;

  /*
    ADDRESS THE FOCUS OPTION BY WHAT IT IS, not by its name alone.

    Every section's name appears twice on this panel: once on its own
    why-this-scored-high toggle and once in the focus list. Those are
    different controls, and a first-match on the name presses the fold
    rather than making the choice, which is exactly the failure a
    copy-based locator produces: it clicks something, so it does not throw,
    and the check then fails for a reason nobody can see. The focus options
    are the aria-pressed buttons.
  */
  const changePriority = panel.getByRole('button', { name: /change priority/i }).first();
  check('Change Priority opens the list of every section', await press(changePriority));
  const focusOption = panel.locator('button[aria-pressed]').filter({ hasText: differentName }).first();
  const focusOptionAppeared = await focusOption
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    'the focus list offers every section by name',
    focusOptionAppeared,
    focusOptionAppeared
      ? differentName
      : `${differentName} missing. aria-pressed controls: ${(
          await panel.locator('button[aria-pressed]').allInnerTexts()
        )
          .join(' / ')
          .slice(0, 200)}`
  );
  if (!focusOptionAppeared) throw new Error('the focus list never opened');

  /*
    CONFIRMED BY THE ROW, NOT BY THE BUTTON.

    Choosing a focus closes the list, so the control that was pressed is
    gone a moment later and reading its aria-pressed back times out on a
    choice that worked perfectly. What actually proves the tap landed is
    the row it wrote, so this presses and then waits on the database, and
    presses again if the first one arrived before hydration.
  */
  let focus = null;
  for (let round = 0; round < 6 && !focus; round += 1) {
    if (round > 0) {
      const again = panel.locator('button[aria-pressed]').filter({ hasText: differentName }).first();
      if ((await again.count()) === 0) {
        await press(changePriority);
      }
    }
    await panel
      .locator('button[aria-pressed]')
      .filter({ hasText: differentName })
      .first()
      .click({ timeout: 10000 })
      .catch(() => {});

    for (let attempt = 0; attempt < 15 && !focus; attempt += 1) {
      const { data } = await admin
        .from('member_whole_body_signal_focus')
        .select('section_key, session_id')
        .eq('session_id', stored.id)
        .maybeSingle();
      focus = data ?? null;
      if (!focus) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  check('the coach can choose a focus different from the recommendation', focus?.section_key === different,
    `${focus?.section_key} vs recommended ${recommended.join(',')}`);

  await coachPage.reload({ waitUntil: 'domcontentloaded' });
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  await openFolds(coachPage);
  const afterFocus = await coachPage.locator('#detail-card-whole-body-signal').innerText();
  check('BOTH are shown: what the assessment recommended', /recommended by this assessment/i.test(afterFocus));
  /*
    READ IT OUT OF THE FOCUS BLOCK. Every section name appears in the
    signal map too, so searching the whole panel for it would pass whatever
    the coach had chosen, including nothing.
  */
  const chosenBlock = afterFocus.slice(afterFocus.search(/chosen by you/i));
  check(
    'and what the coach chose, beside it rather than instead of it',
    /chosen by you/i.test(afterFocus) && chosenBlock.slice(0, 200).includes(differentName),
    chosenBlock.replace(/\n/g, ' ').slice(0, 120)
  );

  // ------------------------------------------------------------------
  // 4. A RETAKE, ANSWERED DIFFERENTLY.
  // ------------------------------------------------------------------
  await admin.from('assessment_assignments').insert({
    member_id: MEMBER,
    assessment_definition_id: DEFINITION,
    assigned_by: COACH,
    is_required: true,
    stage: 'standard',
    due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z',
  });

  await page.goto(`${BASE}/whole-body-signal`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`text=/${MEMBER_COPY['member.intro_button']}/i`, { timeout: 90000 });
  await page.getByRole('button', { name: MEMBER_COPY['member.intro_button'] }).click();
  /*
    ANSWERED AT THE QUIET END, AND DOWN THE OTHER BRANCH.

    "None of these apply to me" is the branch the universal four had to be
    reworded for: she has just said none of these life stages apply, and
    the four questions that follow may not then ask her about hormones, a
    cycle or menopause.
  */
  const retake = await walk({
    label: 'retake',
    answerFor: quietAnswer,
    routingLabel: 'None of these apply to me',
  });

  const askedOnNone = retake.branchScreens;
  check(
    'answering "None of these apply to me" asks exactly the universal four',
    askedOnNone.length === UNIVERSAL_PROMPTS.length &&
      UNIVERSAL_PROMPTS.every((prompt) => askedOnNone.some((screen) => screen.heading === prompt)),
    `${askedOnNone.length} asked: ${askedOnNone.map((s) => s.heading.slice(0, 30)).join(' | ')}`
  );
  const LIFE_STAGE = /hormone|hormonal|menopause|menstrual|\bcycle\b|perimenopause/i;
  for (const screen of askedOnNone) {
    check(
      `on this branch it reads neutral: "${screen.heading.slice(0, 50)}"`,
      !LIFE_STAGE.test(screen.heading)
    );
    check(
      `and still offers Prefer not to answer: "${screen.heading.slice(0, 40)}"`,
      screen.options.includes(MEMBER_COPY['member.pnta_label']),
      screen.options.join(' / ')
    );
  }
  check(
    'and the reworded universal is the approved sentence',
    askedOnNone.some(
      (screen) =>
        screen.heading ===
        'I notice shifts in my energy, mood, or body that seem to follow a pattern over time.'
    ),
    askedOnNone.map((s) => s.heading).join(' | ').slice(0, 200)
  );
  await awaitResults('the retake finishes and shows her a fresh picture');
  await noPractitionerWord(page, 'the retake results');

  await coachPage.reload({ waitUntil: 'domcontentloaded' });
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  await openFolds(coachPage);
  const retakeCoach = await coachPage.locator('#detail-card-whole-body-signal').innerText();
  check('the coach now has two sittings to choose between',
    (await coachPage.locator('#detail-card-whole-body-signal button').filter({ hasText: /\d{4}$/ }).count()) >= 2);
  check('the reassessment block is drawn', /reassessment/i.test(retakeCoach));
  check('with a per-section change stated as two numbers and a signed difference',
    /\d+ to \d+, [+-]\d+/.test(retakeCoach), (retakeCoach.match(/\d+ to \d+, [+-]\d+/) ?? [''])[0]);
  check('the Zone shift is stated plainly, or said not to have moved',
    /previous primary:/i.test(retakeCoach) || /primary zone has not moved/i.test(retakeCoach));
  check('the Signal Load trend is printed', /signal load trend/i.test(retakeCoach));
  check('and the priority chosen last time sits beside what changed',
    /priority chosen last time/i.test(retakeCoach));

  check('zero console or page errors on every screen either account saw',
    consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed without throwing', false, String(e).slice(0, 500));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passing`);
  if (failed.length) console.log('FAILED:\n' + failed.map((f) => `  ${f.name} ${f.note}`).join('\n'));

  // Only the dismissals THIS RUN wrote, and only if it got far enough to
  // read what was there before it started.
  if (knownDismissals) {
    const { data: after } = await admin
      .from('member_root_popup_dismissals')
      .select('message_key')
      .eq('member_id', MEMBER);
    const added = (after ?? [])
      .map((row) => row.message_key)
      .filter((key) => !knownDismissals.has(key));
    if (added.length > 0) {
      await admin
        .from('member_root_popup_dismissals')
        .delete()
        .eq('member_id', MEMBER)
        .in('message_key', added);
      console.log(`removed ${added.length} dismissal row(s) this run created`);
    }
  }

  if (coach) await retireSession(coach);
  if (minted) await retireSession(minted);
  await browser.close();

  // STATE LEFT BEHIND: NONE. Removed, then confirmed absent by an
  // independent read rather than by trusting the delete.
  await clean();
  const [{ data: leftSittings }, { data: leftAssignments }, { data: leftAttempts }] =
    await Promise.all([
      admin.from('member_whole_body_signal_sessions').select('id').eq('member_id', MEMBER),
      admin
        .from('assessment_assignments')
        .select('id')
        .eq('member_id', MEMBER)
        .eq('assessment_definition_id', DEFINITION),
      admin
        .from('assessment_attempts')
        .select('id')
        .eq('member_id', MEMBER)
        .eq('assessment_definition_id', DEFINITION),
    ]);
  const leftovers =
    (leftSittings?.length ?? 0) + (leftAssignments?.length ?? 0) + (leftAttempts?.length ?? 0);
  console.log(leftovers === 0 ? 'cleanup: nothing left behind' : `cleanup: ${leftovers} rows REMAIN`);
  process.exitCode = failed.length === 0 && leftovers === 0 ? 0 : 1;
}
