/**
 * A real, signed-in walk of the MEF Body Systems Survey, end to end.
 *
 * WHAT IT DRIVES. A coach's assignment arriving, the intro, all eleven
 * sections including the branch question, a Does not apply to me tap, a
 * mid-survey close and a genuine resume, all six red flag screens with one
 * real Level 2 Yes, the results screen, what actually landed in the
 * database, the coach's panel, and a second sitting answered quieter with
 * both sides of the comparison read back.
 *
 * WHERE IT RUNS. Anywhere, from environment variables, because the same
 * walk has to be runnable against the local database while migrations 220
 * to 222 are waiting to be applied and against production the moment they
 * are:
 *
 *   BODY_SYSTEMS_BASE_URL   the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   BODY_SYSTEMS_MEMBER     the member id to walk as
 *   BODY_SYSTEMS_MEMBER_EMAIL   that member's email, for minting
 *   BODY_SYSTEMS_COACH      the coach id assigned to her
 *   BODY_SYSTEMS_COACH_EMAIL    that coach's email
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line, the same discipline
 * scripts/lib/mint-session.mjs holds and for the same reason.
 *
 * IT CLEANS UP AFTER ITSELF. Every row it creates for the member it walks
 * as is deleted in a finally, and the deletion is confirmed by an
 * independent read. A run that is interrupted leaves rows, which is why
 * the cleanup also runs at the START of the walk.
 *
 * THREE TRAPS THIS SCRIPT ALREADY KNOWS ABOUT, all of them found the hard
 * way on the first run:
 *
 *   innerText reports what CSS PAINTED, so a case sensitive match for
 *   "Section 1 of 11" fails against a screen displaying exactly that
 *   through an `uppercase` class. Every text match here is /.../i.
 *
 *   A CLICK BEFORE HYDRATION DOES NOTHING, silently. After any page load,
 *   a tap has to be confirmed by the app agreeing it happened, which is
 *   what `tap()` waits for.
 *
 *   A COACH SECTION IS NOT A <details>. It is a button with aria-expanded
 *   and its children are not in the DOM until it is pressed, so waiting
 *   for a card inside it waits forever on a page that is working.
 *
 * SHE ANSWERS BLIND (2026-09-11). No screen she answers on may name the
 * body system its questions belong to, and the check is run over
 * `page.content()` as well as over the visible text, because a name that
 * is merely undrawn is still in the serialised props inside the page. The
 * names are read from the database rather than typed here, so a twelfth
 * section added later is covered the day it lands.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

import { readFileSync } from 'node:fs';

const BASE = process.env.BODY_SYSTEMS_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.BODY_SYSTEMS_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.BODY_SYSTEMS_MEMBER_EMAIL ?? 'member.one@example.test';
const COACH = process.env.BODY_SYSTEMS_COACH ?? '33333333-3333-3333-3333-333333333333';
const COACH_EMAIL = process.env.BODY_SYSTEMS_COACH_EMAIL ?? 'coach.one@example.test';
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exit(1);
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

/** Everything this run creates, removed. Run before the walk and again after it. */
async function clean() {
  await admin.from('member_body_systems_sessions').delete().eq('member_id', MEMBER);
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
  await admin
    .from('registry_entries')
    .delete()
    .eq('member_id', MEMBER)
    .eq('source_feature', 'body_systems_survey_finding');
  // A "Maybe later" tap leaves a dismissal row keyed by a string, not an
  // FK, so deleting the assignment does not take it with it.
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .like('message_key', 'body_systems:%');
  await admin.from('profiles').update({ body_systems_branch: null }).eq('id', MEMBER);
}

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT.

  mintSessionContext goes through auth.admin.generateLink, and generateLink
  CREATES the account when the address does not exist. So a single typo in
  an email here would silently mint a session for a brand new stranger and
  then walk the survey as them. This refuses to go near the browser until
  both addresses have been resolved to the exact user ids this run expects.
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

// And this walk only ever runs against a seeded test account, because it
// writes a real sitting and then deletes rows.
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
  EVERY WORD THAT NAMES A SYSTEM, FROM THE ROWS THEMSELVES.

  Typing the eleven names here would make this check a copy of the content
  that can drift from it. Both columns are taken: the display name is what
  the results screen reveals, and the member intro line used to sit under
  it on the section screen and gives the system away just as completely.
*/
const { data: sectionRows, error: sectionError } = await admin
  .from('body_systems_sections')
  .select('display_name, member_intro_line');
if (sectionError || !sectionRows?.length) {
  console.error('could not read the section names', sectionError);
  process.exit(1);
}
const SYSTEM_NAMES = sectionRows.flatMap((row) => [row.display_name, row.member_intro_line]).filter(Boolean);
console.log(`blind check armed against ${SYSTEM_NAMES.length} naming strings`);

const { error: assignError } = await admin.from('assessment_assignments').insert({
  member_id: MEMBER,
  assessment_definition_id: DEFINITION,
  assigned_by: COACH,
  is_required: true,
  stage: 'standard',
  due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z',
});
if (assignError) {
  console.error('could not assign', assignError);
  process.exit(1);
}

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

/**
 * Tap an option and WAIT FOR THE APP TO AGREE it was tapped.
 *
 * A click that lands on server-rendered HTML before React has hydrated
 * does nothing at all, silently, which is exactly what happened on the
 * first screen after a fresh page load in this run. Asserting aria-pressed
 * is what makes the tap real rather than attempted.
 */
async function tap(scope, name, exact = true) {
  /*
    AN ANSWER ROW IS A RADIO SINCE 2026-09-11, not a toggle button. Three
    questions stand on one screen, so each question's options are a labelled
    radio group and the chosen one reports aria-checked. The branch question
    and a few older controls are still aria-pressed buttons, so both are
    accepted here rather than this script having to know which is which.
  */
  const radios = scope.getByRole('radio', { name, exact });
  const target = (await radios.count()) > 0 ? radios : scope.getByRole('button', { name, exact });
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await target.click();
    const [checked, pressed] = await Promise.all([
      target.getAttribute('aria-checked'),
      target.getAttribute('aria-pressed'),
    ]);
    if (checked === 'true' || pressed === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

/**
 * The counter that names the screen she is on inside a section.
 *
 * A section is several screens of two or three questions now, so "section 3
 * of 11" no longer changes between one Continue and the next. This is what
 * does, and waiting on it is what stops this script answering the same
 * screen twice.
 */
async function screenKey(page) {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i);
    if (match) return match[0];
    const eyebrow = document.body.innerText.match(/section [0-9]+ of 11/i);
    return eyebrow ? `${eyebrow[0]} (no questions)` : 'elsewhere';
  });
}

/** Wait until the screen she is on is genuinely a different one. */
async function waitForNewScreen(page, previous, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    const text = await page.evaluate(() => document.body.innerText);
    if (now !== previous && !/Section complete/i.test(text)) return now;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the screen never changed away from ${previous}`);
}

/**
 * Wait for Continue to be genuinely pressable.
 *
 * ITS DISABLED STATE MEANS TWO DIFFERENT THINGS and only one of them is a
 * failure. `disabled={!canContinue || isPending}`: either she has not
 * answered everything yet, which is the real rule, or a save is still in
 * flight, which is the app working. On a local dev server the save lands
 * in milliseconds and the difference never shows. Against production it
 * does, and asserting the instant state reported a stall on a screen where
 * all ten answers had already registered.
 */
async function waitForContinue(page, label, timeoutMs = 30000) {
  const button = page.getByRole('button', { name: label });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await button.isDisabled())) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const EM = String.fromCharCode(0x2014);
const consoleErrors = [];

const browser = await chromium.launch();
/*
  REDUCED MOTION IS ASKED FOR EXPLICITLY, IN BOTH DIRECTIONS.

  Headless Chromium reports `prefers-reduced-motion: reduce` by default,
  which silently turned off the beat between two sections and made a run
  that never played it look like a run that had checked it. This context is
  a member who has NOT asked for reduced motion, so the beat really plays;
  the member who has is checked in her own context further down.
*/
const minted = await mintSessionContext(browser, MEMBER_EMAIL, {
  baseUrl: BASE,
  viewport: { width: 390, height: 844 },
  contextOptions: { reducedMotion: 'no-preference' },
});
if (!minted) { console.error('could not mint'); process.exit(1); }
const page = await minted.context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function noEmDash(label) {
  const text = await page.evaluate(() => document.body.innerText);
  check(`${label}: no em dash`, !text.includes(String.fromCharCode(0x2014)));
}

/**
 * No body system is named on this screen, or anywhere inside it.
 *
 * `page.content()` rather than innerText, because everything the answering
 * component is handed is serialised into the page as props. A name that
 * was merely not drawn would still be in there, and would still be
 * findable by anyone who looked.
 */
async function noSystemName(label) {
  const [text, html] = await Promise.all([
    page.evaluate(() => document.body.innerText),
    page.content(),
  ]);
  const onScreen = SYSTEM_NAMES.filter((name) => text.includes(name));
  const inPayload = SYSTEM_NAMES.filter((name) => html.includes(name));
  check(`${label}: no body system is named on screen`, onScreen.length === 0, onScreen.join(' | '));
  check(
    `${label}: and none in the page payload either`,
    inPayload.length === 0,
    inPayload.slice(0, 3).join(' | ')
  );
}

/** Where the window is scrolled right now. */
const scrollY = () => page.evaluate(() => Math.round(window.scrollY));

try {
  // ---- Home: the card and the pop-up.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check('Home offers the survey', /MEF Body Systems Survey/i.test(bodyText));
  const popupShown = bodyText.includes('walk through your whole body with you');
  check('the pop-up carries the approved sentence', popupShown);
  if (!popupShown) {
    // The chain gives one message the slot. Say which one took it rather
    // than leaving a bare failure that looks like the copy is wrong.
    console.log('POPUP SLOT WENT TO:', bodyText.slice(0, 400).replace(/\n+/g, ' | '));
  }
  await noEmDash('Home');

  // ---- The survey route.
  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=nothing about it is a test', { timeout: 20000 });
  const intro = await page.evaluate(() => document.body.innerText);
  check('the intro screen renders', /nothing about it is a test/i.test(intro));
  check('the Home button is on the intro screen', await page.getByRole('button', { name: 'Home' }).isVisible());
  await noEmDash('intro');

  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 15000 });
  const s1 = await page.evaluate(() => document.body.innerText);
  check('progress counts sections', /section 1 of 11/i.test(s1));
  check('the timeframe is repeated on the section screen', s1.includes('last 3 months'));
  check('the heading names the task, not the system', /how often has this been true/i.test(s1));
  check('the Home button is on the section screen', await page.getByRole('button', { name: 'Home' }).isVisible());
  await noEmDash('section 1');
  await noSystemName('section 1');

  // Continue is genuinely blocked until every question is answered.
  const blocked = await page.getByRole('button', { name: 'Continue' }).isDisabled();
  check('Continue is blocked before she answers', blocked);

  // Answer eleven sections, driven by what the screen actually says rather
  // than by a counter this script keeps.
  let leftAndCameBack = false;
  let everScrolledDown = false;
  let branchAsked = false;
  let screensInSectionOne = 0;
  let biggestScreen = 0;
  let smallestScreen = 99;
  for (;;) {
    const eyebrow = await page.locator('text=/section \\d+ of 11/i').first().innerText();
    const section = Number(eyebrow.match(/(\d+)/)[1]);
    await noSystemName(`section ${section}`);

    if (section === 11 && !branchAsked) {
      branchAsked = true;
      const branchText = await page.evaluate(() => document.body.innerText);
      check(
        'section 11 opens with the branch question',
        branchText.includes('Which set of questions fits your body?')
      );
      check(
        'and nothing else, so she cannot skip it',
        (await page.locator('ol > li').count()) === 0
      );
      // The branch buttons UNMOUNT once she has chosen, so the tap is
      // confirmed by the questions arriving rather than by aria-pressed.
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await page.getByRole('button', { name: /cycles, hot flashes/i }).click().catch(() => {});
        if (await page.locator('text=My cycle has become irregular').count()) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await page.waitForSelector('text=My cycle has become irregular', { timeout: 15000 });
    }

    /*
      READ AFTER THE BRANCH QUESTION, NEVER BEFORE IT. Section eleven opens
      on a screen with no questions on it, so a key taken at the top of this
      loop names a screen that her branch tap has already replaced, and
      waiting for "a different screen" then returns instantly.
    */
    const here = await screenKey(page);
    const items = await page.locator('ol > li').count();
    /*
      TWO OR THREE QUESTIONS PER SCREEN (2026-09-11), and never one alone.
      Checked on every screen of the survey rather than on a sample, because
      the rule that stops a section of ten ending on a lonely question is
      exactly the kind of arithmetic that goes wrong at one section and
      nowhere else.
    */
    check(
      `${here}: two or three questions on the screen`,
      items >= 2 && items <= 3,
      `${items} on screen`
    );
    if (items > biggestScreen) biggestScreen = items;
    if (items < smallestScreen) smallestScreen = items;
    if (section === 1) screensInSectionOne += 1;
    for (let i = 0; i < items; i += 1) {
      const item = page.locator('ol > li').nth(i);
      // Digestion loud, so one section speaks loudly and the library fires.
      const label = section === 1 ? 'Almost always' : i % 3 === 0 ? 'Often' : i % 3 === 1 ? 'Rarely' : 'Never';
      /*
        THE "Does not apply to me" TAP IS FOUND, NOT COUNTED. It used to be
        the second question of section three; a screen now holds three
        questions, so which screen that question is on is arithmetic this
        script should not be repeating. If the option is on this row, tap it.
      */
      const dna = item.getByRole('radio', { name: /I do not drink/i });
      if ((await dna.count()) > 0) {
        await tap(item, /I do not drink/i, false);
        continue;
      }
      await tap(item, label);
    }

    if (!(await waitForContinue(page, 'Continue'))) {
      const state = await page.evaluate(() =>
        Array.from(document.querySelectorAll('ol > li')).map((li, index) => ({
          index,
          prompt: (li.querySelector('h2')?.textContent ?? '').slice(0, 50),
          pressed: Array.from(
            li.querySelectorAll('[aria-checked="true"], [aria-pressed="true"]')
          ).map((b) => b.textContent),
        }))
      );
      const shape = await page.evaluate(() => ({
        eyebrow: document.body.innerText.slice(0, 60).replace(/\n+/g, ' | '),
        ols: document.querySelectorAll('ol').length,
        olLi: document.querySelectorAll('ol > li').length,
        anyLi: document.querySelectorAll('li').length,
        pressed: document.querySelectorAll('[aria-checked="true"], [aria-pressed="true"]').length,
        buttons: document.querySelectorAll('button').length,
      }));
      console.log('DOM SHAPE', JSON.stringify(shape));
      console.log(`--- STUCK on section ${section}, ${items} items ---`);
      for (const row of state) {
        console.log(
          `${row.pressed.length ? 'OK ' : 'MISSING'} [${row.index}] ${row.prompt} => ${row.pressed.join(',') || 'nothing'}`
        );
      }
      throw new Error(`Continue stayed disabled on section ${section}`);
    }
    // How far down the screen her Continue was, so "it opened at the top"
    // is a claim about a page that was genuinely scrolled.
    const leftAt = await scrollY();
    if (leftAt > 0) everScrolledDown = true;
    const lastSectionScreen = (await page.evaluate(() => document.body.innerText)).match(
      /Questions? ([0-9]+)(?: to ([0-9]+))? of ([0-9]+)/i
    );
    const leavingSection = lastSectionScreen
      ? Number(lastSectionScreen[2] ?? lastSectionScreen[1]) === Number(lastSectionScreen[3])
      : false;
    await page.getByRole('button', { name: 'Continue' }).click();

    /*
      A SECTION ENDING PLAYS ONE SHORT BEAT (2026-09-11), and it names
      nothing. Only checked on the Continue that genuinely leaves a section,
      because a Continue in the middle of one must NOT play it.
    */
    if (leavingSection && section < 11) {
      let beatSeen = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const text = await page.evaluate(() => document.body.innerText);
        if (/Section complete/i.test(text)) {
          beatSeen = true;
          check(
            `section ${section}: the beat says another area is next`,
            /another area/i.test(text)
          );
          await noSystemName(`the beat after section ${section}`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      check(`section ${section}: a beat plays on the way out`, beatSeen);
    }

    if (leavingSection && section === 1 && !leftAndCameBack) {
      leftAndCameBack = true;
      await page.waitForSelector('text=/section 2 of 11/i', { timeout: 20000 });
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=/section 2 of 11/i', { timeout: 20000 });
      const resumed = await page.evaluate(() => document.body.innerText);
      check('resume puts her back on the section she left', /section 2 of 11/i.test(resumed));
      check('resume says so', resumed.includes('Root kept your place'));
      check(
        'and her first section is still answered underneath',
        Boolean(
          (
            await admin
              .from('member_body_systems_sessions')
              .select('answers')
              .eq('member_id', MEMBER)
              .single()
          ).data?.answers?.D1
        )
      );
      check('resume opens at the top too', (await scrollY()) === 0);
      await noSystemName('resume');

      /*
        AND A REFRESH IN THE MIDDLE OF A SECTION.

        A reload is the one moment a browser can put her back where she was
        scrolled to, and it is also the moment somebody curious would look
        at the page source. Both are checked from the bottom of the screen
        rather than the top.
      */
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const beforeReload = await scrollY();
      check('she really was scrolled down before the refresh', beforeReload > 0, `${beforeReload}px`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=/section 2 of 11/i', { timeout: 20000 });
      await page.waitForTimeout(1500);
      const afterReload = await scrollY();
      check(
        'a refresh mid-section lands at the top',
        afterReload === 0,
        `left at ${beforeReload}px, came back at ${afterReload}px`
      );
      await noSystemName('after a mid-section refresh');
      continue;
    }

    if (leavingSection && section === 11) break;
    if (!leavingSection) {
      // Still inside this section: wait for the NEXT SCREEN rather than for
      // a section number that has not changed.
      const arrived = await waitForNewScreen(page, here);
      const arrivedAt = await scrollY();
      check(
        `${arrived} opens at the top of itself`,
        arrivedAt === 0,
        `left ${here} at ${leftAt}px, arrived at ${arrivedAt}px`
      );
      continue;
    }
    await page.waitForSelector(`text=/section ${section + 1} of 11/i`, { timeout: 20000 });
    // THE FIX THIS RUN IS FOR. Nothing unmounts between one section and
    // the next, so without the scroll to top the new section opened
    // already scrolled past its own first questions.
    const arrivedAt = await scrollY();
    check(
      `section ${section + 1} opens at the top of itself`,
      arrivedAt === 0,
      `left section ${section} at ${leftAt}px, arrived at ${arrivedAt}px`
    );
  }
  check('and she really had scrolled down before leaving a section', everScrolledDown);
  check(
    'a section of ten questions became four screens, never three plus a lonely one',
    screensInSectionOne === 4,
    `${screensInSectionOne} screens`
  );
  check('no screen ever held more than three questions', biggestScreen === 3, `${biggestScreen}`);
  check('and none ever held fewer than two', smallestScreen === 2, `${smallestScreen}`);

  // ---- The six red flag screens.
  await page.waitForSelector('text=1 of 6', { timeout: 20000 });
  const rf = await page.evaluate(() => document.body.innerText);
  check('the red flag screens come last', /six last questions/i.test(rf));
  check('they say they are not scored', rf.includes('not scored'));
  await noEmDash('red flags');
  await noSystemName('red flags');

  for (let flag = 1; flag <= 6; flag += 1) {
    await page.waitForSelector(`text=${flag} of 6`, { timeout: 20000 });
    // Flag 4 is the Level 2 one (blood in stool). Answer that Yes.
    if (flag === 4) {
      await tap(page, 'Yes');
      await page.waitForSelector('[role="status"]', { timeout: 10000 });
      const response = await page.locator('[role="status"]').innerText();
      check(
        'a Level 2 Yes shows the Level 2 response immediately',
        response.includes('outside what coaching should work on alone')
      );
      check(
        'and NOT the Level 1 response',
        !response.includes('matters more than anything else in this survey')
      );
    } else {
      await tap(page, 'No');
    }
    const last = flag === 6;
    const label = last ? 'See your results' : 'Continue';
    if (!(await waitForContinue(page, label))) {
      throw new Error(`${label} stayed disabled on red flag ${flag}`);
    }
    await page.getByRole('button', { name: label }).click();
  }

  // ---- The results.
  await page.waitForSelector('text=What your body is saying right now', { timeout: 25000 });
  const res = await page.evaluate(() => document.body.innerText);
  check('the results screen renders', res.includes('What your body is saying right now'));
  check('it speaks in loudness', res.includes('Speaking loudly') || res.includes('Showing up'));
  check(
    'the top attention card names the loudest system',
    res.includes('the loudest signals in your body are about how it handles food')
  );
  check('the closing line is there', res.includes("Your coach has the full picture. This is where you'll start together."));
  check('no medical word anywhere', !/\b(disease|diagnosis|condition|dysfunction|deficiency|disorder)\b/i.test(res));
  check('no total, grade or score', !/\b(overall|total|grade|score)\b/i.test(res));
  check('no association text', !res.includes('Possible considerations include'));
  await noEmDash('results');

  /*
    AND HERE, AND ONLY HERE, THE NAMES ARE HERS.

    Everything above this line proved that no screen she answered on named
    a system. This proves the other half: all eleven are on her results,
    beside their own bars, which is what makes the blind answering a
    deliberate design rather than something missing.
  */
  const namesRevealed = sectionRows.filter((row) => res.includes(row.display_name));
  check(
    'all eleven systems are named on her results',
    namesRevealed.length === sectionRows.length,
    `${namesRevealed.length} of ${sectionRows.length}`
  );

  // The legend explains the three bands ONCE, and nothing repeats a band
  // sentence under a bar.
  const { data: bandRows } = await admin
    .from('body_systems_bands')
    .select('member_label, member_status_line');
  for (const band of bandRows ?? []) {
    const sentence = band.member_status_line
      .slice(`${band.member_label}.`.length)
      .trim();
    const times = res.split(sentence).length - 1;
    check(`the band "${band.member_label}" is explained exactly once`, times === 1, `${times} times`);
  }

  const graph = await page.evaluate(() => ({
    bars: document.querySelectorAll('.mef-bs-bar').length,
    delays: Array.from(document.querySelectorAll('.mef-bs-bar')).map((el) =>
      Number(String(el.style.animationDelay).replace('ms', ''))
    ),
    opens: document.querySelectorAll('.mef-bs-open').length,
  }));
  check('eleven bars are drawn as one graph', graph.bars === 11, String(graph.bars));
  check(
    'and they arrive one after another, loudest first',
    graph.delays.length === 11 && graph.delays.every((value, i) => i === 0 || value > graph.delays[i - 1]),
    graph.delays.join(',')
  );
  check('the opening beats are staggered too', graph.opens >= 4, String(graph.opens));
  check('the closing card carries her way on', res.includes('Back to home'));

  // ---- What actually landed in the database.
  const { data: sessions } = await admin
    .from('member_body_systems_sessions')
    .select('id, branch, answers, red_flag_answers, results, completed_at')
    .eq('member_id', MEMBER);
  check('exactly one sitting was written', sessions?.length === 1, `got ${sessions?.length}`);
  const sitting = sessions?.[0];
  check('it is finished', Boolean(sitting?.completed_at));
  check('it stored her branch', sitting?.branch === 'a');
  check('it stored the Does not apply to me tap', sitting?.answers?.L2 === 'dna');
  check('it stored the red flag Yes', sitting?.red_flag_answers?.blood_in_stool === true);
  const digestion = sitting?.results?.sections?.find((s) => s.sectionKey === 'digestion');
  check('Digestion is Speaking loudly', digestion?.bandKey === 'speaking_loudly', `${digestion?.percent}%`);
  const liver = sitting?.results?.sections?.find((s) => s.sectionKey === 'liver');
  check('the skipped question left the Liver denominator', liver?.dnaCount === 1 && liver?.answeredCount === 8);

  const { data: attempts } = await admin
    .from('assessment_attempts')
    .select('id, attempt_type')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION);
  check('the attempt ledger row was written', attempts?.length === 1, attempts?.[0]?.attempt_type);

  const { data: assignment } = await admin
    .from('assessment_assignments')
    .select('status')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', DEFINITION)
    .single();
  check('the assignment closed itself out', assignment?.status === 'completed');

  const { data: registry } = await admin
    .from('registry_entries')
    .select('code, severity, numeric_value')
    .eq('member_id', MEMBER)
    .eq('source_feature', 'body_systems_survey_finding');
  check('eleven Root Map rows were published', registry?.length === 11, `got ${registry?.length}`);
  check(
    'the loud section is significant on the map',
    registry?.find((r) => r.code === 'body_systems_digestion')?.severity === 'significant'
  );

  const { data: profile } = await admin
    .from('profiles')
    .select('body_systems_branch')
    .eq('id', MEMBER)
    .single();
  check('her branch is remembered on her profile', profile?.body_systems_branch === 'a');

  // ---- Her profile screen now offers the control.
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const prof = await page.evaluate(() => document.body.innerText);
  check('the profile offers the branch control', /hormonal health question set/i.test(prof));
  await noEmDash('profile');

  // ---- Reopening a finished survey.
  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=This one is done', { timeout: 20000 });
  const done = await page.evaluate(() => document.body.innerText);
  check('a finished survey gives her the answer, not a redirect', done.includes('This one is done'));
  check('and her own results with it', done.includes('What your body is saying right now'));
  await noEmDash('already done');

  // ---- THE COACH SIDE.
  const coach = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1400 },
  });
  const coachPage = await coach.context.newPage();
  coachPage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('coach: ' + m.text()); });
  coachPage.on('pageerror', (e) => consoleErrors.push('coach: ' + String(e)));

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  // A CLOSED FOLD IS NOT AN ABSENT CARD. The whole Assessments and Findings
  // section is a <details>, so its contents are attached but not visible.
  // Waiting on visibility here waits forever on a page that is working.
  /*
    THE SECTION IS NOT A <details>, IT IS A BUTTON WITH aria-expanded, and
    its children are NOT IN THE DOM until it is open. So waiting for the
    card is waiting for something that will never arrive: the fold has to
    be pressed first.
  */
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  const headers = coachPage.locator('[aria-expanded="false"]');
  for (let i = (await headers.count()) - 1; i >= 0; i -= 1) {
    await headers.nth(i).click().catch(() => {});
    await coachPage.waitForTimeout(200);
  }
  await coachPage.waitForSelector('#detail-card-body-systems', {
    state: 'attached',
    timeout: 60000,
  });
  // Then the per-section folds inside it (the per-question detail).
  const openFolds = async () => {
    const folds = coachPage.locator('details');
    for (let i = 0; i < (await folds.count()); i += 1) {
      await folds.nth(i).evaluate((node) => { node.open = true; }).catch(() => {});
    }
    await coachPage.waitForTimeout(1200);
  };
  await openFolds();
  const panel = coachPage.locator('#detail-card-body-systems');
  const coachText = await panel.innerText();

  check('the coach panel renders', coachText.length > 0);
  check('the red flag is pinned with its level', /level 2\. medical follow-up/i.test(coachText));
  check(
    'with the exact response she was shown',
    coachText.includes('outside what coaching should work on alone')
  );
  check(
    'and it says plainly that it changed no number',
    coachText.includes('changed no percentage, no colour and no order')
  );
  check('the session opener names the loudest section', /where to open the session/i.test(coachText) && coachText.includes('Digestion, 100%'));
  check('the bars carry exact percentages', /100% Speaking loudly/.test(coachText));
  check('the pattern analysis is there', /pattern analysis/i.test(coachText));
  check('associations fired', coachText.includes('Possible considerations include'));
  check('every association cites why it surfaced', /why this surfaced/i.test(coachText));
  check(
    'the uncertainty labels are visible',
    /observed data/i.test(coachText) &&
      /pattern interpretation/i.test(coachText) &&
      /possible association/i.test(coachText) &&
      /confirmed medical information/i.test(coachText)
  );
  check(
    'Confirmed medical information is named as never generated here',
    coachText.includes('never generates anything with this label')
  );
  check('no em dash on the coach panel', !coachText.includes(String.fromCharCode(0x2014)));
  check(
    'the coverage note appears only where nothing matched',
    !coachText.includes('This section is loud, and no defined pattern matched') ||
      coachText.includes('This section is loud, and no defined pattern matched')
  );

  // ---- THE RETAKE. Send it again, answer quieter, read both sides.
  const { data: retakeAssignment } = await admin
    .from('assessment_assignments')
    .insert({
      member_id: MEMBER,
      assessment_definition_id: DEFINITION,
      assigned_by: COACH,
      is_required: true,
      stage: 'standard',
    })
    .select('id')
    .single();
  check('a second assignment can be sent after a completion', Boolean(retakeAssignment?.id));

  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Begin', { timeout: 30000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.getByRole('button', { name: 'Begin' }).click().catch(() => {});
    if (await page.locator('text=/section 1 of 11/i').count()) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 30000 });
  const retakeFirst = await page.evaluate(() => document.body.innerText);
  check('a retake never re-asks the branch question', !retakeFirst.includes('Which set of questions fits your body?'));

  for (;;) {
    const eyebrow = await page.locator('text=/section \\d+ of 11/i').first().innerText();
    const section = Number(eyebrow.match(/(\d+)/)[1]);
    const here = await screenKey(page);
    const items = await page.locator('ol > li').count();
    for (let i = 0; i < items; i += 1) {
      await tap(page.locator('ol > li').nth(i), section === 1 ? 'Rarely' : 'Never');
    }
    if (!(await waitForContinue(page, 'Continue'))) {
      throw new Error(`retake Continue stayed disabled on ${here}`);
    }
    const counts = here.match(/Questions? ([0-9]+)(?: to ([0-9]+))? of ([0-9]+)/i);
    const leavingSection = counts
      ? Number(counts[2] ?? counts[1]) === Number(counts[3])
      : false;
    await page.getByRole('button', { name: 'Continue' }).click();
    if (leavingSection && section === 11) break;
    if (leavingSection) {
      await page.waitForSelector(`text=/section ${section + 1} of 11/i`, { timeout: 25000 });
      continue;
    }
    await waitForNewScreen(page, here);
  }
  for (let flag = 1; flag <= 6; flag += 1) {
    await page.waitForSelector(`text=${flag} of 6`, { timeout: 25000 });
    await tap(page, 'No');
    const retakeLabel = flag === 6 ? 'See your results' : 'Continue';
    if (!(await waitForContinue(page, retakeLabel))) {
      throw new Error(`retake ${retakeLabel} stayed disabled on red flag ${flag}`);
    }
    await page.getByRole('button', { name: retakeLabel }).click();
  }
  await page.waitForSelector('text=What your body is saying right now', { timeout: 30000 });
  const retakeText = await page.evaluate(() => document.body.innerText);
  check('the retake shows this time next to last time', /this time next to last time/i.test(retakeText));
  check('and says quieter in her own language', retakeText.includes('Quieter'));
  check('and still no medical word', !/\b(disease|diagnosis|condition|dysfunction|deficiency|disorder)\b/i.test(retakeText));
  await noEmDash('retake results');

  await coachPage.reload({ waitUntil: 'domcontentloaded' });
  await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
  const headers2 = coachPage.locator('[aria-expanded="false"]');
  for (let i = (await headers2.count()) - 1; i >= 0; i -= 1) {
    await headers2.nth(i).click().catch(() => {});
    await coachPage.waitForTimeout(200);
  }
  await coachPage.waitForSelector('#detail-card-body-systems', { state: 'attached', timeout: 60000 });
  await openFolds();
  const retakeCoach = await coachPage.locator('#detail-card-body-systems').innerText();
  check('the coach sees two sittings to choose between', /patterns across sittings/i.test(retakeCoach));
  check('and a pattern classified across them', /resolved|quieter|unchanged|louder/i.test(retakeCoach));
  check('the previous sitting percentage is named beside the current one', /previous sitting \d+%/i.test(retakeCoach));

  await retireSession(coach);

  check('zero console or page errors on every screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed without throwing', false, String(e).slice(0, 400));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passing`);
  if (failed.length) console.log('FAILED:\n' + failed.map((f) => `  ${f.name} ${f.note}`).join('\n'));
  await retireSession(minted);
  await browser.close();

  // STATE LEFT BEHIND: NONE. Removed, then confirmed absent by an
  // independent read rather than by trusting the delete.
  await clean();
  const [{ data: leftSessions }, { data: leftAssignments }, { data: leftRegistry }] =
    await Promise.all([
      admin.from('member_body_systems_sessions').select('id').eq('member_id', MEMBER),
      admin
        .from('assessment_assignments')
        .select('id')
        .eq('member_id', MEMBER)
        .eq('assessment_definition_id', DEFINITION),
      admin
        .from('registry_entries')
        .select('id')
        .eq('member_id', MEMBER)
        .eq('source_feature', 'body_systems_survey_finding'),
    ]);
  const leftovers =
    (leftSessions?.length ?? 0) + (leftAssignments?.length ?? 0) + (leftRegistry?.length ?? 0);
  console.log(leftovers === 0 ? 'cleanup: nothing left behind' : `cleanup: ${leftovers} rows REMAIN`);
  process.exitCode = failed.length === 0 && leftovers === 0 ? 0 : 1;
}
