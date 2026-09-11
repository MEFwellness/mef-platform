/**
 * The 2026-09-11 answering experience, driven on the MEF Body Systems
 * Survey, which is the one a member answers BLIND.
 *
 * WHY IT IS SEPARATE FROM verify-body-systems-live.mjs. That script proves
 * the whole survey end to end and, to do that, it assigns itself a sitting,
 * completes it, reads the coach's panel and then deletes everything it
 * made. That is the right shape for a full feature walk and the wrong shape
 * for a production account somebody is really using: it would consume the
 * assignment she is waiting to answer.
 *
 * THIS ONE TOUCHES NOTHING IT DID NOT WRITE. It uses the pending assignment
 * she already has, refuses to create or delete one, answers two sections
 * and stops, and removes only the unfinished draft its own Continue wrote.
 * A finished sitting is somebody's real result and is never deleted.
 *
 * THE CLAIMS
 *   Two or three questions a screen, and a section of ten is four screens.
 *   No body system is named on any of them, on the beat between two
 *   sections, on a resume or after a refresh, on screen or in the payload.
 *   Back inside a section moves one screen and her answers are still chosen.
 *   A refresh in the middle of a screen keeps the answers she gave on it.
 *   The beat is short and neutral, and a reduced motion member never sees it.
 *
 * ENVIRONMENT
 *   BS_BASE_URL        the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL  the database behind it
 *   PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE   PATHS to the keys
 *   BS_MEMBER / BS_MEMBER_EMAIL                  the member to walk as
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BS_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;
const MEMBER = process.env.BS_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.BS_MEMBER_EMAIL ?? 'member.one@example.test';
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exit(1);
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
console.log(`target is the test account "${targetProfile.display_name}"`);

/** Only the unfinished draft this walk could have written. Never an assignment. */
async function clean() {
  const { data: sessions } = await admin
    .from('member_body_systems_sessions')
    .select('id, completed_at')
    .eq('member_id', MEMBER);
  for (const session of sessions ?? []) {
    if (session.completed_at) continue;
    await admin.from('member_body_systems_sessions').delete().eq('id', session.id);
  }
}

const { data: pending } = await admin
  .from('assessment_assignments')
  .select('id')
  .eq('member_id', MEMBER)
  .eq('assessment_definition_id', DEFINITION)
  .eq('status', 'pending')
  .maybeSingle();
if (!pending?.id) {
  console.error('REFUSING TO RUN: she has no pending Body Systems Survey, and this script will not create one.');
  process.exit(1);
}
console.log('using the assignment she already has');
await clean();

/** The eleven names, read from the database rather than typed here. */
const { data: sectionRows } = await admin
  .from('body_systems_sections')
  .select('display_name, member_intro_line');
const SYSTEM_NAMES = (sectionRows ?? [])
  .flatMap((row) => [row.display_name, row.member_intro_line])
  .filter(Boolean);

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const consoleErrors = [];

const browser = await chromium.launch();
const minted = await mintSessionContext(browser, MEMBER_EMAIL, {
  baseUrl: BASE,
  viewport: { width: 390, height: 844 },
  // Headless Chromium reports reduce by default, which would silently turn
  // the beat off and make a run that never played it look like a pass.
  contextOptions: { reducedMotion: 'no-preference' },
});
if (!minted) {
  console.error('could not mint');
  process.exit(1);
}
const page = await minted.context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function noSystemName(label) {
  const [text, html] = await Promise.all([
    page.evaluate(() => document.body.innerText),
    page.content(),
  ]);
  const onScreen = SYSTEM_NAMES.filter((name) => text.includes(name));
  const inPayload = SYSTEM_NAMES.filter((name) => html.includes(name));
  check(`${label}: no body system on screen`, onScreen.length === 0, onScreen.join(' | '));
  check(`${label}: and none in the payload`, inPayload.length === 0, inPayload.slice(0, 3).join(' | '));
}

async function noDashes(label) {
  const text = await page.evaluate(() => document.body.innerText);
  check(`${label}: no em dash and no en dash`, !text.includes(EM_DASH) && !text.includes(EN_DASH));
}

const screenKey = (target = page) =>
  target.evaluate(
    () => document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? 'elsewhere'
  );

async function tapRow(row) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await row.click();
    if ((await row.getAttribute('aria-checked')) === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('a tap never registered');
}

/** How many of her answers the draft in the database actually holds. */
async function storedAnswerCount() {
  const { data } = await admin
    .from('member_body_systems_sessions')
    .select('answers, completed_at')
    .eq('member_id', MEMBER);
  const draft = (data ?? []).find((row) => !row.completed_at);
  return Object.keys(draft?.answers ?? {}).length;
}

async function waitForStoredAnswers(target, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await storedAnswerCount()) >= target) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function waitForContinue(target = page, timeoutMs = 30000) {
  const button = target.getByRole('button', { name: 'Continue' });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await button.isDisabled())) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

try {
  check('the blind check is armed against real names', SYSTEM_NAMES.length >= 11, `${SYSTEM_NAMES.length} strings`);

  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Begin', { timeout: 30000 });
  await noSystemName('the intro');
  await noDashes('the intro');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.getByRole('button', { name: 'Begin' }).click().catch(() => {});
    if (await page.locator('text=/section 1 of 11/i').count()) break;
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 30000 });
  await noDashes('the first screen');

  const first = await page.evaluate(() => ({
    counter: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
    progress: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    ordinals: Array.from(document.querySelectorAll('ol > li')).map(
      (li) => li.querySelector('p[aria-hidden="true"]')?.textContent ?? ''
    ),
  }));
  check('a counter names the screen inside the section', /Questions? 1 to [0-9]+ of [0-9]+/i.test(first.counter), first.counter);
  check('with a progress line under it', first.progress !== null && first.progress !== undefined, String(first.progress));
  check('and each question carries its ordinal', first.ordinals.join(',') === '01,02,03', first.ordinals.join(','));
  check('Continue is blocked before she answers', await page.getByRole('button', { name: 'Continue' }).isDisabled());

  const chosenStyle = await (async () => {
    const row = page.locator('ol > li').first().locator('[role="radio"]').first();
    const before = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await tapRow(row);
    await page.waitForTimeout(600);
    const after = await row.evaluate((el) => ({
      color: getComputedStyle(el).color,
      fill: getComputedStyle(el.querySelector('.mef-bleed-fill')).backgroundColor,
      tick: Boolean(el.querySelector('svg.mef-q-check-in')),
      weight: getComputedStyle(el).fontWeight,
    }));
    return { before, after };
  })();
  check('an unchosen row is a layered lift of cream on forest', chosenStyle.before !== 'rgba(0, 0, 0, 0)', chosenStyle.before);
  check('a chosen row fills muted gold', chosenStyle.after.fill === 'rgb(196, 160, 80)', chosenStyle.after.fill);
  check('with deep forest text', chosenStyle.after.color === 'rgb(23, 48, 37)', chosenStyle.after.color);
  check('a tick', chosenStyle.after.tick);
  check('and more weight', Number(chosenStyle.after.weight) >= 600, chosenStyle.after.weight);

  const shortRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ol > li [role="radio"]'))
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((height) => height < 44)
  );
  check('every answer row is at least 44px tall', shortRows.length === 0, shortRows.join(','));

  const sizes = [];
  let screens = 0;
  let beat = '';
  let didBack = false;
  let didRefresh = false;
  /** Every answer this walk has given, so "the server has them" is countable. */
  let tapsSoFar = 1; // the one tapped above while checking the chosen state.

  for (let guard = 0; guard < 12 && !beat; guard += 1) {
    await noSystemName(`survey screen ${guard + 1}`);
    const here = await screenKey();
    sizes.push(await page.locator('ol > li').count());
    screens += 1;

    // A refresh in the middle of the second screen, one answer given and
    // Continue never pressed.
    if (guard === 1 && !didRefresh) {
      didRefresh = true;
      /*
        WAIT FOR THE SERVER TO REALLY HAVE IT, rather than for a number of
        milliseconds. A fixed wait makes this a measurement of the network
        instead of a claim about resume, and it reported a failure once that
        was really "the autosave had not been sent yet". What is claimed is
        that once an answer has landed, a reload comes back to the screen she
        was on with that answer still chosen.
      */
      const expectedStored = tapsSoFar + 1;
      await tapRow(page.locator('ol > li').first().locator('[role="radio"]').first());
      tapsSoFar += 1;
      const landed = await waitForStoredAnswers(expectedStored);
      check(
        'an answer reaches the server without a Continue',
        landed,
        `${await storedAnswerCount()} of ${expectedStored} stored`
      );
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=/section 1 of 11/i', { timeout: 30000 });
      await page.waitForTimeout(1500);
      const back = await page.evaluate(() => ({
        key: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
        chosen: document.querySelectorAll('ol > li:first-child [role="radio"][aria-checked="true"]').length,
        scroll: Math.round(window.scrollY),
      }));
      check('a refresh mid screen comes back to that screen', back.key === here, `${here} then ${back.key}`);
      check('with the answer she gave on it still chosen', back.chosen === 1, `${back.chosen}`);
      check('and it opens at the top', back.scroll === 0, `${back.scroll}px`);
      await noSystemName('after a mid screen refresh');
    }

    const count = await page.locator('ol > li').count();
    const alreadyChosen = await page.evaluate(
      () => document.querySelectorAll('ol > li [role="radio"][aria-checked="true"]').length
    );
    for (let i = 0; i < count; i += 1) {
      await tapRow(page.locator('ol > li').nth(i).locator('[role="radio"]').first());
    }
    tapsSoFar += count - alreadyChosen;

    // Back, one screen, with her answers still chosen.
    if (guard === 1 && !didBack) {
      didBack = true;
      const backButton = page.locator('button[aria-label]').first();
      const label = await backButton.getAttribute('aria-label');
      check('the survey offers a way back inside a section', /back/i.test(label ?? ''), String(label));
      await backButton.click();
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => ({
        key: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
        section: document.body.innerText.match(/section [0-9]+ of 11/i)?.[0] ?? '',
        chosen: Array.from(document.querySelectorAll('ol > li')).map(
          (li) => li.querySelectorAll('[role="radio"][aria-checked="true"]').length
        ),
      }));
      check('Back moves one screen, not one section', state.key !== here, `${here} then ${state.key}`);
      check('and stays inside the same section', /section 1 of 11/i.test(state.section), state.section);
      check(
        'every answer on the screen behind is still chosen',
        state.chosen.length > 0 && state.chosen.every((n) => n === 1),
        state.chosen.join(',')
      );
      await noSystemName('the screen she stepped back to');
      if (!(await waitForContinue())) throw new Error('Continue stayed shut after stepping back');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page
        .waitForFunction(
          (previous) =>
            (document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ??
              '') === previous,
          here,
          { timeout: 30000 }
        )
        .catch(() => {});
    }

    if (!(await waitForContinue())) throw new Error(`Continue stayed shut on ${here}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const text = await page.evaluate(() => document.body.innerText);
      if (/Section complete/i.test(text)) {
        beat = text.replace(/\n+/g, ' | ').slice(0, 160);
        await noSystemName('the beat between two sections');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!beat) {
      await page
        .waitForFunction(
          (previous) =>
            (document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ??
              '') !== previous,
          here,
          { timeout: 30000 }
        )
        .catch(() => {});
    }
  }

  check('two or three questions a screen, all the way', Math.max(...sizes) <= 3 && Math.min(...sizes) >= 2, sizes.join(','));
  check('a section of ten is four screens', screens === 4, `${screens}`);
  check('a section ending plays one short beat', Boolean(beat), beat);
  check('and the beat names nothing, it says another area', /another area/i.test(beat), beat);
  check('the beat says the section is complete', /Section complete/i.test(beat));

  await page.waitForFunction(() => !/Section complete/i.test(document.body.innerText), undefined, {
    timeout: 10000,
  });
  await page.waitForSelector('text=/section 2 of 11/i', { timeout: 25000 });
  check('the next section opens at the top', (await page.evaluate(() => Math.round(window.scrollY))) === 0);
  await noSystemName('section two');
  await noDashes('section two');

  // ---- Resume: leave and come back.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/section 2 of 11/i', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const resumed = await page.evaluate(() => ({
    text: document.body.innerText,
    scroll: Math.round(window.scrollY),
  }));
  check('resume puts her back on the section she left', /section 2 of 11/i.test(resumed.text));
  check('on its first screen', /Questions? 1 to [0-9]+ of/i.test(resumed.text));
  check('at the top of it', resumed.scroll === 0, `${resumed.scroll}px`);
  await noSystemName('the resume');
  await noDashes('the resume');

  // ---- The member who asked for reduced motion.
  const quiet = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'reduce' },
  });
  const quietPage = await quiet.context.newPage();
  await quietPage.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded' });
  await quietPage.waitForSelector('text=/section 2 of 11/i', { timeout: 30000 });
  let quietBeat = false;
  let quietCrossed = false;
  for (let guard = 0; guard < 8 && !quietCrossed; guard += 1) {
    const shape = await quietPage.evaluate(() => ({
      key: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
      section: document.body.innerText.match(/section [0-9]+ of 11/i)?.[0] ?? '',
    }));
    const count = await quietPage.locator('ol > li').count();
    for (let i = 0; i < count; i += 1) {
      const row = quietPage.locator('ol > li').nth(i).locator('[role="radio"]').first();
      for (let a = 0; a < 25; a += 1) {
        await row.click();
        if ((await row.getAttribute('aria-checked')) === 'true') break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!(await waitForContinue(quietPage))) break;
    await quietPage.getByRole('button', { name: 'Continue' }).click();
    /*
      WAIT FOR THE SCREEN TO GENUINELY CHANGE BEFORE ANSWERING AGAIN.
      Without this the next pass reads the screen she is leaving, re-taps
      rows that are already chosen, and presses a Continue that belongs to a
      screen that no longer exists. It is the same trap the main loop above
      already knows about.
    */
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const text = await quietPage.evaluate(() => document.body.innerText);
      if (/Section complete/i.test(text)) {
        quietBeat = true;
        quietCrossed = true;
        break;
      }
      const nowSection = text.match(/section [0-9]+ of 11/i)?.[0] ?? '';
      const nowKey = text.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '';
      if (nowSection && nowSection !== shape.section) {
        quietCrossed = true;
        break;
      }
      if (nowKey && nowKey !== shape.key) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  check('a member who asked for reduced motion is never shown the beat', !quietBeat);
  check('and she still crosses into the next section', quietCrossed);
  await retireSession(quiet);

  check('zero console or page errors on every screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the run completed without throwing', false, String(e).slice(0, 400));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passing`);
  if (failed.length) console.log('FAILED:\n' + failed.map((f) => `  ${f.name} ${f.note}`).join('\n'));
  await retireSession(minted);
  await browser.close();

  await clean();
  const [{ data: leftSessions }, { data: stillPending }] = await Promise.all([
    admin.from('member_body_systems_sessions').select('id, completed_at').eq('member_id', MEMBER),
    admin
      .from('assessment_assignments')
      .select('id')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', DEFINITION)
      .eq('status', 'pending'),
  ]);
  const drafts = (leftSessions ?? []).filter((row) => !row.completed_at);
  console.log(drafts.length ? `cleanup: ${drafts.length} draft(s) STILL PRESENT` : 'cleanup: nothing left behind');
  console.log(
    stillPending?.length
      ? 'her Body Systems Survey assignment is still waiting, untouched'
      : 'WARNING: her Body Systems Survey assignment is no longer pending'
  );
  process.exit(failed.length ? 1 : 0);
}
