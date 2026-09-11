/**
 * A real, signed-in walk of the 2026-09-11 questionnaire experience.
 *
 * WHAT IT DRIVES, AND WHY IT IS A SEPARATE SCRIPT FROM
 * verify-body-systems-live.mjs. That one proves the Body Systems Survey's
 * own content, scoring, red flags, results and coach panel, end to end.
 * This one proves the ANSWERING EXPERIENCE both takers now share, and most
 * of its claims are about the generic points scored questionnaire, which
 * had no live walk of its own at all.
 *
 * THE CLAIMS
 *
 *   A screen carries two or three questions, never one alone at the end of
 *   a section, and each carries a muted gold ordinal.
 *   The progress line and the counter over them count the same thing.
 *   A chosen answer is a muted gold row with deep forest text and a tick,
 *   and an unchosen one is a layered green tint, checked against the real
 *   computed styles rather than against the class names.
 *   Continue is genuinely disabled until every question on the screen is
 *   answered, and says why.
 *   Back returns to the screen before with her answers still chosen.
 *   A refresh in the middle of a screen keeps the answers she has given on
 *   it, and lands her back on that screen.
 *   A section ending plays one short beat, and it is skipped entirely for a
 *   member who has asked for reduced motion.
 *   Every tap target is at least 44px tall.
 *
 * NOTHING IS COMPLETED AND NOTHING IS LEFT BEHIND. The walk abandons its
 * draft rather than submitting it, because a completion writes results,
 * registry rows and coach surfaces that this script has no business
 * creating. Every row it did create is deleted in a finally and the
 * deletion is confirmed by an independent read.
 *
 * ENVIRONMENT
 *   QUESTIONNAIRE_BASE_URL   the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL        the database behind it
 *   PROD_SERVICE_KEY_FILE    a PATH to the service role key
 *   PROD_ANON_KEY_FILE       a PATH to the anon key
 *   QUESTIONNAIRE_MEMBER       the member id to walk as
 *   QUESTIONNAIRE_MEMBER_EMAIL that member's email, for minting
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line, the same discipline
 * scripts/lib/mint-session.mjs holds and for the same reason.
 *
 * TWO TRAPS THIS SCRIPT ALREADY KNOWS ABOUT.
 *
 *   HEADLESS CHROMIUM REPORTS `prefers-reduced-motion: reduce` BY DEFAULT,
 *   which silently turns the beat off and makes a run that never played it
 *   look like a run that checked it. Both contexts here ask explicitly.
 *
 *   A CLICK BEFORE HYDRATION DOES NOTHING, silently, so every tap is
 *   confirmed by the app agreeing it happened.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.QUESTIONNAIRE_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.QUESTIONNAIRE_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.QUESTIONNAIRE_MEMBER_EMAIL ?? 'member.one@example.test';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exit(1);
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

/** The questionnaires this taker serves, tried in order until one opens. */
const CANDIDATES = [
  { slug: 'short-haq', id: 'short-haq' },
  { slug: 'nutrition-lifestyle', id: 'chek-hlc1-nutrition-lifestyle' },
  { slug: 'four-doctors', id: 'four-doctors' },
];

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

/** Only a seeded test account, because this walk writes rows. */
const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
console.log(`target is the test account "${targetProfile.display_name}"`);

/** Every draft this walk could have created, removed. Run before and after. */
async function clean() {
  const { data: rows } = await admin
    .from('wellness_assessments')
    .select('id')
    .eq('member_id', MEMBER)
    .eq('status', 'in_progress');
  for (const row of rows ?? []) {
    await admin.from('wellness_assessment_answers').delete().eq('assessment_id', row.id);
    await admin.from('wellness_assessments').delete().eq('id', row.id);
  }
}
/**
 * AND THE ROWS OPENING A TAKE PAGE WRITES ON ITS OWN.
 *
 * `getMyTakeAssessmentState` logs a Root Router decision, so simply
 * arriving on a take screen leaves a row. It is not a draft and `clean()`
 * would not know about it, so the ids that existed BEFORE this walk are
 * remembered and anything new is removed afterwards. Rows that were already
 * there are somebody else's and are never touched.
 */
const routerRowsBefore = new Set();
{
  const { data } = await admin
    .from('investigation_router_decisions')
    .select('id')
    .eq('member_id', MEMBER);
  for (const row of data ?? []) routerRowsBefore.add(row.id);
}

async function cleanRouterRows() {
  const { data } = await admin
    .from('investigation_router_decisions')
    .select('id')
    .eq('member_id', MEMBER);
  const mine = (data ?? []).filter((row) => !routerRowsBefore.has(row.id));
  for (const row of mine) {
    await admin.from('investigation_router_decisions').delete().eq('id', row.id);
  }
  return mine.length;
}

await clean();

const consoleErrors = [];
const browser = await chromium.launch();
const minted = await mintSessionContext(browser, MEMBER_EMAIL, {
  baseUrl: BASE,
  viewport: { width: 390, height: 844 },
  // She has NOT asked for reduced motion, so the beat really plays.
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

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

async function noDashes(label) {
  const text = await page.evaluate(() => document.body.innerText);
  check(`${label}: no em dash and no en dash`, !text.includes(EM_DASH) && !text.includes(EN_DASH));
}

/** Tap a row and wait for the app to agree it was tapped. */
async function tapRow(row) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await row.click();
    if ((await row.getAttribute('aria-checked')) === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('a tap never registered');
}

/** The counter over the questions, which is what names a screen. */
const screenKey = (target = page) =>
  target.evaluate(
    () =>
      document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? 'elsewhere'
  );

/** How many of her answers the database actually holds right now. */
async function storedAnswerCount() {
  const { data: rows } = await admin
    .from('wellness_assessments')
    .select('id')
    .eq('member_id', MEMBER)
    .eq('status', 'in_progress');
  if (!rows?.length) return 0;
  const { count } = await admin
    .from('wellness_assessment_answers')
    .select('assessment_id', { count: 'exact', head: true })
    .in(
      'assessment_id',
      rows.map((row) => row.id)
    );
  return count ?? 0;
}

async function waitForStoredAnswers(target, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await storedAnswerCount()) >= target) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function waitForContinue(target = page, label = 'Continue', timeoutMs = 30000) {
  const button = target.getByRole('button', { name: label });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await button.isDisabled())) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

try {
  // ---- Find a questionnaire this member may actually begin.
  let opened = null;
  for (const candidate of CANDIDATES) {
    await page.goto(`${BASE}/assessments/${candidate.slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const begin = page.getByRole('button', { name: /Begin assessment|Resume assessment/i });
    if ((await begin.count()) > 0) {
      opened = candidate;
      await begin.first().click();
      break;
    }
  }
  check('an ordinary questionnaire opens for this member', Boolean(opened), opened?.slug ?? 'none');
  if (!opened) throw new Error('no questionnaire was available to this member');
  console.log(`walking ${opened.slug}`);

  await page.waitForSelector('text=/Questions? [0-9]+/i', { timeout: 30000 });
  await noDashes('the first screen');

  // ---- Two or three questions, with ordinals.
  const firstScreen = await page.evaluate(() => ({
    questions: document.querySelectorAll('ol > li').length,
    ordinals: Array.from(document.querySelectorAll('ol > li')).map(
      (li) => li.querySelector('p[aria-hidden="true"]')?.textContent ?? ''
    ),
    counter: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
    progress: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
  }));
  check(
    'the first screen carries two or three questions',
    firstScreen.questions >= 2 && firstScreen.questions <= 3,
    `${firstScreen.questions}`
  );
  check(
    'each one carries its own muted gold ordinal',
    firstScreen.ordinals.join(',') === ['01', '02', '03'].slice(0, firstScreen.questions).join(','),
    firstScreen.ordinals.join(',')
  );
  check('a counter names the screen', /Questions? 1 to [0-9]+ of [0-9]+/i.test(firstScreen.counter), firstScreen.counter);

  /*
    AND IT NEVER BREAKS ACROSS TWO LINES. Found in a 390px screenshot:
    "Questions 33 to 35 of 52" wrapped with "52" alone underneath, which
    reads as a mistake. The counter is the sentence that has to survive
    intact, so the section name beside it is what gives way.
  */
  const counterShape = await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('span')).find((el) =>
      /^Questions? [0-9]+(?: to [0-9]+)? of [0-9]+$/i.test(el.textContent ?? '')
    );
    if (!span) return null;
    const sibling = span.parentElement?.querySelector('span:last-child');
    return {
      whiteSpace: getComputedStyle(span).whiteSpace,
      lines: span.getClientRects().length,
      sectionTruncates:
        sibling && sibling !== span
          ? getComputedStyle(sibling).textOverflow === 'ellipsis'
          : true,
    };
  });
  check('the counter is set never to wrap', counterShape?.whiteSpace === 'nowrap', String(counterShape?.whiteSpace));
  check('and it really is on one line', counterShape?.lines === 1, String(counterShape?.lines));
  check('the section name beside it is what gives way', counterShape?.sectionTruncates === true);
  check('and a progress line is drawn under it', firstScreen.progress !== null && firstScreen.progress !== undefined);

  // The line and the counter count the same thing.
  const counted = firstScreen.counter.match(/([0-9]+)(?: to ([0-9]+))? of ([0-9]+)/i);
  const expectedPercent = Math.round((Number(counted[2] ?? counted[1]) / Number(counted[3])) * 100);
  check(
    'the line is the counter drawn, not a second number',
    Number(firstScreen.progress) === expectedPercent,
    `line ${firstScreen.progress}%, counter implies ${expectedPercent}%`
  );

  // ---- Continue is blocked, and says why.
  check(
    'Continue is blocked before she answers',
    await page.getByRole('button', { name: 'Continue' }).isDisabled()
  );
  const blockedText = await page.evaluate(() => document.body.innerText);
  check('and the screen says what is missing', /Choose an answer/i.test(blockedText));

  // ---- Every tap target is comfortable.
  const shortRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ol > li [role="radio"]'))
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((height) => height < 44)
  );
  check('every answer row is at least 44px tall', shortRows.length === 0, shortRows.join(','));

  // ---- The chosen state.
  const rows = page.locator('ol > li').first().locator('[role="radio"]');
  const before = await rows.first().evaluate((el) => getComputedStyle(el).backgroundColor);
  await tapRow(rows.first());
  await page.waitForTimeout(600);
  const after = await rows.first().evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
    fill: getComputedStyle(el.querySelector('.mef-bleed-fill')).backgroundColor,
    tick: Boolean(el.querySelector('svg.mef-q-check-in')),
    weight: getComputedStyle(el).fontWeight,
  }));
  check('an unchosen row is a layered tint, not a white box', before !== 'rgb(255, 255, 255)', before);
  check('a chosen row fills muted gold', after.fill === 'rgb(196, 160, 80)', after.fill);
  check('its text is deep forest, not white', after.color === 'rgb(23, 48, 37)', after.color);
  check('it carries a tick', after.tick);
  check('and it gains weight', Number(after.weight) >= 600, after.weight);
  check('the chosen row really is chosen', (await rows.first().getAttribute('aria-checked')) === 'true');

  // ---- Answer the screen and move on.
  const firstKey = await screenKey();
  const firstPrompts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ol > li h2')).map((h) => h.textContent)
  );
  const blocks = await page.locator('ol > li').count();
  for (let i = 0; i < blocks; i += 1) {
    await tapRow(page.locator('ol > li').nth(i).locator('[role="radio"]').first());
  }
  check('Continue opens once every question on the screen is answered', await waitForContinue());
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(
    (previous) =>
      (document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '') !==
      previous,
    firstKey,
    { timeout: 30000 }
  );
  const secondKey = await screenKey();
  check('Continue moves her one screen', secondKey !== firstKey, `${firstKey} then ${secondKey}`);
  check('and the new screen opens at the top', (await page.evaluate(() => window.scrollY)) === 0);

  // ---- Back, with her answers still chosen.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForFunction(
    (previous) =>
      (document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '') ===
      previous,
    firstKey,
    { timeout: 20000 }
  );
  const backState = await page.evaluate(() => ({
    prompts: Array.from(document.querySelectorAll('ol > li h2')).map((h) => h.textContent),
    chosen: Array.from(document.querySelectorAll('ol > li')).map(
      (li) => li.querySelectorAll('[role="radio"][aria-checked="true"]').length
    ),
  }));
  check('Back returns to the screen before', backState.prompts.join('|') === firstPrompts.join('|'));
  check(
    'and every answer she gave is still chosen',
    backState.chosen.every((count) => count === 1),
    backState.chosen.join(',')
  );

  // ---- A refresh in the middle of a screen.
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(
    (previous) =>
      (document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '') !==
      previous,
    firstKey,
    { timeout: 30000 }
  );
  const midKey = await screenKey();
  // Every answer she has given so far: the first screen's, plus this one.
  const expectedStored = blocks + 1;
  await tapRow(page.locator('ol > li').first().locator('[role="radio"]').nth(1));
  /*
    WAIT FOR THE SERVER TO REALLY HAVE IT, rather than for a number of
    milliseconds. A fixed wait makes this check a measurement of the network
    instead of a claim about resume, and on production it was reporting a
    failure that was really "the round trip had not finished yet". What is
    being claimed is that once an answer has landed, a reload comes back to
    the screen she was on with that answer still chosen.
  */
  const landed = await waitForStoredAnswers(expectedStored);
  check(
    'every answer she has given reaches the server without a Continue',
    landed,
    `${await storedAnswerCount()} of ${expectedStored} stored`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/Questions? [0-9]+/i', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const afterReload = await page.evaluate(() => ({
    key: document.body.innerText.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i)?.[0] ?? '',
    chosenOnFirst: document.querySelectorAll(
      'ol > li:first-child [role="radio"][aria-checked="true"]'
    ).length,
    scroll: Math.round(window.scrollY),
  }));
  check(
    'a refresh mid screen comes back to the same screen',
    afterReload.key === midKey,
    `${midKey} then ${afterReload.key}`
  );
  check(
    'and the answer she gave on it is still chosen',
    afterReload.chosenOnFirst === 1,
    `${afterReload.chosenOnFirst}`
  );
  check('and it opens at the top', afterReload.scroll === 0, `${afterReload.scroll}px`);

  // ---- Walk to the end of this section and watch the beat.
  let beatSeen = false;
  let beatNames = '';
  let screensWalked = 0;
  const sizes = [];
  for (let guard = 0; guard < 30 && !beatSeen; guard += 1) {
    const here = await screenKey();
    const count = await page.locator('ol > li').count();
    sizes.push(count);
    screensWalked += 1;
    for (let i = 0; i < count; i += 1) {
      await tapRow(page.locator('ol > li').nth(i).locator('[role="radio"]').first());
    }
    if (!(await waitForContinue())) throw new Error(`Continue stayed shut on ${here}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const text = await page.evaluate(() => document.body.innerText);
      if (/Section complete/i.test(text)) {
        beatSeen = true;
        beatNames = text.replace(/\n+/g, ' | ').slice(0, 120);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!beatSeen) {
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
  check('a section ending plays one short beat', beatSeen, beatNames);
  check('the beat says what is next', /Next, we/i.test(beatNames), beatNames);
  check(
    'no screen on the way held more than three questions',
    Math.max(...sizes) <= 3,
    sizes.join(',')
  );
  check('and none held a single lonely question', Math.min(...sizes) >= 2, sizes.join(','));
  check('a section really was several screens', screensWalked >= 2, `${screensWalked}`);

  // The beat is over quickly, and the next section arrives.
  await page.waitForFunction(
    () => !/Section complete/i.test(document.body.innerText),
    undefined,
    { timeout: 10000 }
  );
  await noDashes('the next section');

  // ---- The member who asked for reduced motion never waits.
  const quiet = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'reduce' },
  });
  const quietPage = await quiet.context.newPage();
  await quietPage.goto(`${BASE}/assessments/${opened.slug}/take`, { waitUntil: 'domcontentloaded' });
  await quietPage.waitForSelector('text=/Questions? [0-9]+/i', { timeout: 30000 });
  let quietCrossed = false;
  let quietBeat = false;
  for (let guard = 0; guard < 30 && !quietCrossed; guard += 1) {
    const here = await screenKey(quietPage);
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
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const text = await quietPage.evaluate(() => document.body.innerText);
      if (/Section complete/i.test(text)) {
        quietBeat = true;
        quietCrossed = true;
        break;
      }
      const now = await screenKey(quietPage);
      if (now !== here && Number(now.match(/of ([0-9]+)/)?.[1]) !== Number(here.match(/of ([0-9]+)/)?.[1])) {
        quietCrossed = true;
        break;
      }
      if (now !== here) break;
      await new Promise((resolve) => setTimeout(resolve, 120));
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

  // STATE LEFT BEHIND: NONE, and the deletion is confirmed by an
  // independent read rather than by trusting the delete.
  await clean();
  const routerRemoved = await cleanRouterRows();
  console.log(`cleanup: ${routerRemoved} router decision row(s) this walk wrote, removed`);
  const { data: left } = await admin
    .from('wellness_assessments')
    .select('id')
    .eq('member_id', MEMBER)
    .eq('status', 'in_progress');
  console.log(
    left?.length ? `cleanup: ${left.length} draft(s) STILL PRESENT` : 'cleanup: nothing left behind'
  );
  process.exit(failed.length ? 1 : 0);
}
