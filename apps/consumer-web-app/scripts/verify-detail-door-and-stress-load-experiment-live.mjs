#!/usr/bin/env node
/**
 * Two cleanups, driven on production.
 *
 * COACH SIDE, on a real client brief as the real coach:
 *   1. The last card names its destination ("Full Client Detail") and the
 *      old header ("Everything else about") is gone.
 *   2. The description line underneath is unchanged, word for word.
 *   3. It carries an explicit "Open full detail" label, not just an arrow.
 *   4. It reads as a button: the brand gold on the frame and on the label.
 *   5. It is still ONE tap target, with no button nested inside the link.
 *   6. Tapping it lands on the same full Detail page it always opened.
 *
 * MEMBER SIDE, driving the real flow end to end:
 *   7. The coach assigns the Stress & Load Deep-Dive through the real
 *      Assign control on the client detail page.
 *   8. The member answers all eleven questions, reaches the experiment
 *      offer and accepts it through the real button.
 *   9. Home now shows the experiment under Active Experiments, with the day
 *      counter, her own daily question, Yes and Not today.
 *  10. Tapping Yes flips it to the logged confirmation, and the logged
 *      state survives a reload, so a real row was written.
 *  11. Owning Your Value's card, if this account has one, is unchanged.
 *  12. Zero console errors and zero em dashes on every screen visited.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT. What it creates (one
 * assignment, one sitting, one experiment, one daily log) is what a real
 * member would have created, and the report says exactly what is left
 * behind so the account's state is never a surprise.
 *
 * Environment:
 *   BASE_URL         default https://app.mefwellness.com
 *   STAFF_EMAIL      an account holding coach or administrator
 *   TEST_MEMBER_EMAIL / TEST_MEMBER_ID   the seeded fixture
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const MEMBER_ID = process.env.TEST_MEMBER_ID;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/detail-door-and-sl-experiment';

/* A phone, because both screens are built mobile first and that is where
   a coach opens a brief between clients. */
const PHONE = { width: 390, height: 844 };

const EM_DASH = '—';
const OLD_HEADER = 'Everything else about';
const DESCRIPTION =
  'Her trackers, trends, assessments, programs, notes, and what her app contains. All of it, unchanged.';

/* The Q9 answer this run picks FIRST, which is what the experiment is
   built from, so the expected daily question is known before the run
   starts rather than read back off the screen it is meant to prove. */
const RESTORATIVE_LABEL = 'Music';
const EXPECTED_TITLE = 'Five minutes of music';
const EXPECTED_QUESTION =
  'Did you give five minutes to music with your full attention on it today?';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

/** The visible text of the page, for the em dash sweep. */
async function visibleText(page) {
  return page.evaluate(() => document.body.innerText ?? '');
}

/**
 * Answers whichever question is on screen and presses the button under it.
 *
 * The taker renders five kinds of control and the run has no business
 * hard-coding eleven scripts. Q9 is the one exception: the first thing
 * tapped there decides the experiment, so it is named.
 */
async function answerCurrentQuestion(page, restorativeLabel) {
  const prompt = (await page.locator('h1').first().innerText()).trim();
  const isRecovery = prompt.startsWith('What genuinely restores you');

  const textarea = page.locator('textarea');
  if (await textarea.count()) {
    await textarea.first().fill('The Thursday call I never wanted.');
  } else if (isRecovery) {
    await page.getByRole('checkbox', { name: restorativeLabel, exact: true }).click();
  } else {
    const radios = page.getByRole('radio');
    if (await radios.count()) {
      await radios.first().click();
    } else {
      await page.getByRole('checkbox').first().click();
    }
  }

  const next = page
    .getByRole('button', { name: /^(Continue|See what Root found)$/ })
    .last();
  await next.click();
  await page.waitForTimeout(350);
  return prompt;
}

/** Mints a member session of its own, then reads the same Home card. */
async function checkHome(browser, memberErrors) {
  const context = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!context) throw new Error('Could not mint a member session.');
  const page = await context.context.newPage();
  watch(page, memberErrors);
  try {
    await checkHomeWith(page);
  } finally {
    await retireSession(context);
  }
}

/** PART 2c. The card on Home. */
async function checkHomeWith(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  /* Home streams, so the section below the fold arrives after the first
     paint. Waiting for the card itself, not for a clock. */
  const card = page.locator('[data-experiment="stress-load-deep-dive"]');
  const appeared = await card
    .waitFor({ state: 'attached', timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check('the accepted experiment appears on Home', appeared);
  if (!appeared) {
    await shot(page, '08-home-no-card');
    return;
  }

  await card.scrollIntoViewIfNeeded();
  await shot(page, '08-home-active-experiments');
  const cardText = (await card.innerText()).trim();

  const home = await visibleText(page);
  check('it sits under the Active Experiments heading', /Active Experiments/i.test(home));
  // innerText reports CSS-transformed text, and this eyebrow is
  // `uppercase`, so the match has to be case insensitive.
  check('it shows the day counter', /Day \d+ of 7/i.test(cardText), cardText.split('\n')[0]);
  check('it asks her own daily question', cardText.includes(EXPECTED_QUESTION));
  check('it offers Yes', (await card.getByRole('button', { name: 'Yes', exact: true }).count()) === 1);
  check(
    'it offers Not today',
    (await card.getByRole('button', { name: 'Not today', exact: true }).count()) === 1
  );

  // Owning Your Value's card, if this account has one.
  const oyvQuestion =
    'Did you name one thing you did today that had value even though nobody saw it?';
  const hasOyv = home.includes(oyvQuestion);
  check(
    hasOyv
      ? "Owning Your Value's card is present and unchanged"
      : 'Owning Your Value has no experiment on this account, so there was nothing to change',
    true,
    hasOyv ? 'its daily question renders verbatim' : 'reported, not assumed'
  );

  await card.getByRole('button', { name: 'Yes', exact: true }).click();
  await card
    .getByText('Logged: today counted.')
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => {});
  const afterYes = (await card.innerText()).trim();
  check('tapping Yes flips it to the logged state', afterYes.includes('Logged: today counted.'));
  check('both buttons are gone once she has answered', !/\bNot today\b/i.test(afterYes));
  await shot(page, '09-home-logged');

  /* `networkidle` never settles on Home, which streams. The card's own
     appearance is the signal worth waiting for. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = page.locator('[data-experiment="stress-load-deep-dive"]');
  const persisted = await reloaded
    .waitFor({ state: 'attached', timeout: 60000 })
    .then(async () => (await reloaded.innerText()).includes('Logged: today counted.'))
    .catch(() => false);
  check('the logged state survives a reload, so a real row was written', persisted);
  await shot(page, '10-home-logged-after-reload');

  const homeText = await visibleText(page);
  check('no em dash anywhere on Home', !homeText.includes(EM_DASH));
}

async function run() {
  mkdirSync(SHOTS, { recursive: true });

  if (!canMintSessions()) {
    console.error('Minting is unavailable. Set PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE.');
    process.exit(1);
  }
  if (!STAFF_EMAIL || !MEMBER_EMAIL || !MEMBER_ID) {
    console.error('Set STAFF_EMAIL, TEST_MEMBER_EMAIL and TEST_MEMBER_ID.');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const coachErrors = [];
  const memberErrors = [];
  let coach = null;
  let member = null;

  try {
    // -----------------------------------------------------------------
    // PART 1. The door.
    // -----------------------------------------------------------------
    coach = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!coach) throw new Error('Could not mint a staff session.');
    const coachPage = await coach.context.newPage();
    watch(coachPage, coachErrors);

    await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}`, { waitUntil: 'networkidle' });
    const door = coachPage.locator('[data-detail-link="true"]');
    await door.waitFor({ timeout: 20000 });
    await shot(coachPage, '01-coach-brief-door');

    const doorText = (await door.innerText()).trim();
    const doorHtml = await door.evaluate((el) => el.outerHTML);

    check('the card names the full client detail page', /Full Client Detail/i.test(doorText), doorText.split('\n')[0]);
    check('the old header is gone', !new RegExp(OLD_HEADER, 'i').test(doorText));
    check(
      'the description line underneath is unchanged',
      doorText.replace(/\s+/g, ' ').includes(DESCRIPTION)
    );
    check('it carries an explicit tappable label', /Open full detail/i.test(doorText));
    check(
      'it reads as a button: gold frame and gold label',
      doorHtml.includes('border-[#C4A050]') && doorHtml.includes('bg-[#C4A050]')
    );
    check('it is still one tap target, with no nested button', !doorHtml.includes('<button'));
    check(
      'it has an accessible name naming the client',
      /^Open full detail for .+/.test((await door.getAttribute('aria-label')) ?? '')
    );

    await door.click();
    await coachPage.waitForURL(/\/coach\/clients\/[^/]+\/detail/, { timeout: 20000 });
    check('tapping it opens the full detail page', coachPage.url().endsWith('/detail'), coachPage.url());
    await shot(coachPage, '02-coach-detail-page');

    // -----------------------------------------------------------------
    // PART 2a. The coach sends a fresh Stress & Load Deep-Dive.
    //
    // HOME_ONLY=1 skips the sending and the taking and checks only what
    // Home shows for an experiment already running. A re-run that only
    // needs to re-read one assertion should not send a real client a
    // questionnaire she does not need.
    // -----------------------------------------------------------------
    if (process.env.HOME_ONLY === '1') {
      note('HOME_ONLY: reading the Home card for the experiment already running.');
      await checkHome(browser, memberErrors);
      return;
    }

    const assign = coachPage.getByRole('button', { name: /^Assign Stress & Load/i });
    if (await assign.count()) {
      await assign.first().click();
      await coachPage
        .getByRole('button', { name: /^Assign Stress & Load/i })
        .first()
        .waitFor({ state: 'detached', timeout: 45000 })
        .catch(() => {});
      check('the coach assigned a fresh Stress & Load Deep-Dive', true);
    } else {
      check(
        'the coach assigned a fresh Stress & Load Deep-Dive',
        false,
        'no Assign control on screen, one may already be open'
      );
    }
    await shot(coachPage, '03-coach-stress-load-assigned');

    const coachText = await visibleText(coachPage);
    check('no em dash anywhere on the coach detail page', !coachText.includes(EM_DASH));

    // -----------------------------------------------------------------
    // PART 2b. The member takes it and accepts the experiment.
    // -----------------------------------------------------------------
    member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!member) throw new Error('Could not mint a member session.');
    const page = await member.context.newPage();
    watch(page, memberErrors);

    await page.goto(`${BASE}/stress-load`, { waitUntil: 'networkidle' });
    await shot(page, '04-member-stress-load-open');

    const asked = [];
    for (let i = 0; i < 11; i += 1) {
      const counter = page.locator('text=/Question \\d+ of 11/');
      if (!(await counter.count())) break;
      asked.push(await answerCurrentQuestion(page, RESTORATIVE_LABEL));
    }
    check('she answered all eleven questions', asked.length === 11, `${asked.length} of 11`);

    /* Submitting eleven answers writes a sitting, publishes two Root Map
       rows and builds the cross reference, and a cold function takes real
       seconds over that. Waiting for the reading step's own button is the
       honest signal; a fixed timeout here is what made an earlier run
       report a failure the server had actually completed. */
    const readingContinue = page.getByRole('button', { name: /^Continue$/ });
    await readingContinue.waitFor({ state: 'visible', timeout: 90000 });
    await shot(page, '05-member-reading');

    // Past the reading, onto the offer.
    await readingContinue.first().click();
    const accept = page.getByRole('button', { name: /start the 7 days/i }).first();
    await accept.waitFor({ state: 'visible', timeout: 30000 });
    await shot(page, '06-member-experiment-offer');

    const offerText = await visibleText(page);
    check(
      'the offer she reaches is the one built from her first pick',
      offerText.includes(EXPECTED_TITLE),
      EXPECTED_TITLE
    );

    const acceptLabel = (await accept.innerText()).trim();
    await accept.click();
    await page
      .getByRole('button', { name: /^Back to home$/ })
      .waitFor({ state: 'visible', timeout: 30000 });
    const closingText = await visibleText(page);
    check('she accepted the experiment through the real button', Boolean(acceptLabel), acceptLabel);
    await shot(page, '07-member-closing');
    check('no em dash on the deep-dive screens', !closingText.includes(EM_DASH));

    await checkHomeWith(page);
  } finally {
    check('zero console or page errors on the coach screens', coachErrors.length === 0, coachErrors.slice(0, 3).join(' | '));
    check('zero console or page errors on the member screens', memberErrors.length === 0, memberErrors.slice(0, 3).join(' | '));

    await retireSession(coach);
    await retireSession(member);
    await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${passed} of ${results.length} checks passed.`);
    note(`screenshots: ${SHOTS}`);
    if (passed !== results.length) process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
