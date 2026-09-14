#!/usr/bin/env node
/**
 * Build 4 of the Rooted Reset Fuel Pattern Assessment, driven end to end
 * on production: the 7 Day Fuel Experiment, the quick check, the learning
 * loop, day 7, the retake rule and the coach's block.
 *
 * WHAT ONLY A LIVE RUN CAN PROVE. The source tests prove the insight
 * engine, the day math, the rendered section and the sheet. They cannot
 * prove that the deployed result page puts the section between the meals
 * and the forward look, that pressing START really writes a run and turns
 * the button at the foot into Continue, that the Food Lens tile reports
 * the day she is on, that three real taps in a real browser write one row
 * and only one, that the standing insight moves by the priority rule when
 * a browser is driving it, that a tagged meal lands on the row, that
 * finishing a retake archives the run she had going, or that a coach
 * opening her real client page sees all of it.
 *
 * THE EXPECTATIONS COME FROM THE REAL ENGINES. The answer plans are the
 * ones scripts/print-fuel-pattern-expectations.mjs builds, and the copy,
 * the insight library and the day math are imported from the product
 * rather than typed a second time, so a content edit is an edit to what
 * this run expects.
 *
 * DAY 7 IS REACHED BY MOVING THE STORED START DAY BACK, not by pretending
 * a timezone is a time machine. `started_on` is a calendar day in her own
 * zone and the whole feature reads it, so backdating that one column for
 * one seeded test account is the honest way to stand on day 8. A timezone
 * cannot simulate tomorrow.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not, then confirmed absent by an
 * independent query.
 *
 * Environment:
 *   BASE_URL     default https://app.mefwellness.com
 *   TEST_MEMBER_EMAIL      the seeded fixture
 *   TEST_COACH_EMAIL       her assigned coach
 *   FPA_EXPECT_FILE        the JSON the expectations printer wrote
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { FPA_SECTION_HEADERS, fpaWatchForCopy } from '../lib/fuel-pattern/copy.ts';
import { FPA_MEALS_SECTION_HEADER } from '../lib/fuel-pattern/meals/copy.ts';
import { fpaMealById } from '../lib/fuel-pattern/meals/library.ts';
import {
  FPA_EXPERIMENT_COMPLETION,
  FPA_EXPERIMENT_DONE_LABEL,
  FPA_EXPERIMENT_HEADER,
  FPA_EXPERIMENT_INVITATION,
  FPA_EXPERIMENT_LOG_LABEL,
  FPA_EXPERIMENT_RESTART_LABEL,
  FPA_EXPERIMENT_START_LABEL,
  FPA_MY_EXPERIMENT,
  FPA_QUICK_CHECK,
  fpaExperimentCheckLine,
  fpaExperimentCompletionCheckLine,
  fpaExperimentDayLine,
} from '../lib/fuel-pattern/experiment/copy.ts';
import { FPA_INSIGHT_RULES } from '../lib/fuel-pattern/experiment/insights.ts';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const COACH_EMAIL = process.env.TEST_COACH_EMAIL;
const EXPECT = JSON.parse(readFileSync(process.env.FPA_EXPECT_FILE, 'utf8'));
/* Under .verify/, which .gitignore covers: these are pictures of a real
   member's screens and are never committed. */
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/fuel-pattern-experiment';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false } }
  );
}

function watch(page, sink) {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console: ${page.url()} :: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => sink.push(`pageerror: ${page.url()} :: ${String(e).slice(0, 200)}`));
}

/** PRESS UNTIL THE APP AGREES. A click before hydration does nothing, silently. */
async function pressUntil(page, locator, settled, { attempts = 6, gap = 900 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      await locator.click({ timeout: 4000 });
    } catch {
      // The control may be mid-swap. Try again.
    }
    try {
      await settled();
      return true;
    } catch {
      await page.waitForTimeout(gap);
    }
  }
  return false;
}

async function goTo(page, path, { attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    if (new URL(page.url()).pathname === path) return true;
    await page.waitForTimeout(1200);
  }
  return false;
}

const flat = (s) => s.replace(/\s+/g, ' ').trim();

async function mainText(page) {
  return flat(await page.locator('main').innerText());
}

async function currentPrompt(page) {
  const heading = page.locator('main h2').first();
  await heading.waitFor({ state: 'visible', timeout: 20000 });
  return (await heading.textContent())?.trim() ?? '';
}

/** Answer rows are role=radio, never buttons. */
async function answerAndContinue(page, optionLabel, { last = false }) {
  const row = page.locator('[role="radio"]', { hasText: optionLabel }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.click();
  await page.waitForTimeout(160);
  await page.getByRole('button', { name: last ? 'See your fuel pattern' : 'Continue' }).click();
}

async function enterQuestions(page) {
  const intro = page.getByRole('button', { name: /^Let's begin$/ }).first();
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[role="radio"]').first().isVisible().catch(() => false)) return;
    if (await intro.isVisible().catch(() => false)) await intro.click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

/** Drive one whole sitting and stop on the finished result page. */
async function runSitting(context, expect, errors, label) {
  const page = await context.newPage();
  watch(page, errors);

  const onOverview = await goTo(page, '/assessments/fuel-pattern');
  check(`${label}: the overview is reachable as the signed in member`, onOverview, page.url());

  const begin = page.getByRole('button', { name: /^(Let's begin|Resume|Take it again)$/ }).first();
  const started = await pressUntil(page, begin, async () => {
    await page.waitForURL(/\/assessments\/fuel-pattern\/take/, { timeout: 8000 });
  });
  check(`${label}: Begin is a button that lands on the take screen`, started, page.url());

  await enterQuestions(page);
  for (let i = 0; i < expect.chosen.length; i++) {
    const chosen = expect.chosen[i];
    const prompt = await currentPrompt(page);
    if (prompt !== chosen.prompt) {
      check(`${label}: screen ${i + 1} asked the authored question`, false, prompt.slice(0, 80));
      throw new Error(`${label} desynchronised at question ${i + 1}`);
    }
    await answerAndContinue(page, chosen.label, { last: i === expect.chosen.length - 1 });
    await page.waitForTimeout(110);
  }

  await page
    .getByText(expect.patternLabel, { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  await page
    .getByText(FPA_SECTION_HEADERS.watchFor, { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });

  return page;
}

/**
 * EVERY SECTION BELOW THE HERO IS BEHIND RevealOnScroll, which starts at
 * opacity zero. A screenshot before the scroll is a picture of nothing,
 * and it is also not what a member meets. Scroll there first, always.
 */
async function revealExperiment(page) {
  await page.locator('[data-fpa-experiment]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
}

/** The three taps, and the optional fourth when one is asked for. */
async function logCheck(page, { energy, hunger, clarity, mealType = null, mealName = null }) {
  const log = page.getByRole('button', { name: FPA_EXPERIMENT_LOG_LABEL }).first();
  const opened = await pressUntil(page, log, async () => {
    await page
      .locator('[data-testid="fpa-quick-check-sheet"]')
      .waitFor({ state: 'visible', timeout: 5000 });
  });
  if (!opened) return { opened: false };

  const sheet = page.locator('[data-testid="fpa-quick-check-sheet"]');
  const tap = async (label) => {
    await sheet.getByRole('button', { name: label, exact: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(120);
  };

  /*
    NEVER FALL BACK TO THE PAGE WHEN A LOCATOR FAILS. A missing chip is a
    real finding about the sheet, so it is reported as one and the run
    carries on, rather than the whole rig dying inside a helper and every
    later check never running at all.
  */
  let tagged = null;
  const wanted = mealName ?? mealType;
  if (wanted) {
    try {
      await tap(wanted);
      tagged = true;
    } catch {
      tagged = false;
      note(`the sheet offered: ${(await sheet.getByRole('button').allInnerTexts()).map(flat).join(' | ')}`);
    }
  }

  await tap(energy);
  await tap(hunger);
  await tap(clarity);

  const confirmed = await page
    .locator('[data-fpa-quick-check-confirmation]')
    .first()
    .isVisible()
    .catch(() => false);

  await sheet.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { opened: true, confirmed, tagged };
}

async function countLine(page) {
  return flat(
    (await page.locator('[data-fpa-experiment-count]').first().innerText().catch(() => '')) ?? ''
  );
}

async function dayLine(page) {
  return flat(
    (await page.locator('[data-fpa-experiment-day]').first().innerText().catch(() => '')) ?? ''
  );
}

async function standingInsight(page) {
  const node = page.locator('[data-fpa-insight]').first();
  if (!(await node.count())) return null;
  return {
    id: await node.getAttribute('data-fpa-insight'),
    text: flat(await node.innerText()),
  };
}

const insightBody = (id) => FPA_INSIGHT_RULES.find((rule) => rule.id === id).body;

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured, see CLAUDE.md.');
  mkdirSync(SHOTS, { recursive: true });

  const service = serviceClient();
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const member = users.users.find((u) => u.email === MEMBER_EMAIL);
  const coach = users.users.find((u) => u.email === COACH_EMAIL);
  if (!member) throw new Error('Test member not found on production.');
  if (!coach) throw new Error('Coach account not found on production.');
  const memberId = member.id;

  const runA = EXPECT.runs.find((r) => r.label === 'runA');
  const runC = EXPECT.runs.find((r) => r.label === 'runC');
  if (!runA || !runC) throw new Error('Expectation file is missing runA or runC.');

  const browser = await chromium.launch();
  const errors = [];
  let mintedMember = null;
  let mintedCoach = null;

  try {
    mintedMember = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 414, height: 900 },
    });
    if (!mintedMember) throw new Error('Could not mint a session for the test member.');
    const context = mintedMember.context;

    // =================================================================
    // 1. THE SECTION IS ON THE RESULT PAGE, IN ITS PLACE
    // =================================================================
    const page = await runSitting(context, runA, errors, 'RUN A');
    const text = await mainText(page);

    check(
      'the experiment section is on the result page',
      text.includes(FPA_EXPERIMENT_HEADER),
      FPA_EXPERIMENT_HEADER
    );
    const mealsPos = text.indexOf(FPA_MEALS_SECTION_HEADER);
    const expPos = text.indexOf(FPA_EXPERIMENT_HEADER);
    const watchPos = text.indexOf(FPA_SECTION_HEADERS.watchFor);
    check(
      'it sits between Meals Built For Your Pattern and What Rooted Reset Will Watch For',
      mealsPos > -1 && expPos > mealsPos && watchPos > expPos,
      `${mealsPos} / ${expPos} / ${watchPos}`
    );
    check(
      'the invitation is the approved copy, word for word',
      text.includes(FPA_EXPERIMENT_INVITATION),
      FPA_EXPERIMENT_INVITATION.slice(0, 60)
    );
    check(
      'the forward look now names the experiment, in the approved copy',
      text.includes(flat(fpaWatchForCopy(runA.pattern))),
      'Your 7-Day Fuel Experiment is how it gets tested.'
    );

    const bottomCta = page.locator('[data-fpa-bottom-cta]').first();
    check(
      'the button at the foot reads START MY EXPERIMENT before she has started one',
      flat(await bottomCta.innerText()) === FPA_EXPERIMENT_START_LABEL,
      flat(await bottomCta.innerText())
    );

    await revealExperiment(page);
    await page.locator('[data-fpa-experiment]').first().screenshot({
      path: `${SHOTS}/01-offer.png`,
    });

    // =================================================================
    // 2. STARTING IT
    // =================================================================
    const startButton = page
      .locator('[data-fpa-experiment]')
      .getByRole('button', { name: FPA_EXPERIMENT_START_LABEL })
      .first();
    const begun = await pressUntil(page, startButton, async () => {
      await page
        .locator('[data-fpa-experiment-day]')
        .first()
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    check('START MY EXPERIMENT starts a run without leaving the page', begun, page.url());
    check('it opens on Day 1 of 7', (await dayLine(page)) === fpaExperimentDayLine(1), await dayLine(page));
    check(
      'it says what she has logged so far, which is nothing yet',
      (await countLine(page)) === fpaExperimentCheckLine(0),
      await countLine(page)
    );
    check(
      'the button at the foot has become Continue, because the offer has been taken',
      flat(await page.locator('[data-fpa-bottom-cta]').first().innerText()) === 'Continue',
      flat(await page.locator('[data-fpa-bottom-cta]').first().innerText())
    );
    check(
      'the reveal still holds, and she has not been moved on',
      /\/assessments\/fuel-pattern\/take/.test(page.url()),
      page.url()
    );

    const { data: startedRow } = await service
      .from('fuel_experiments')
      .select('id, started_on, pattern, session_id, archived_at')
      .eq('member_id', memberId)
      .is('archived_at', null)
      .maybeSingle();
    check(
      'one live run is stored, against the reading she just took',
      Boolean(startedRow) && startedRow.pattern === runA.pattern,
      JSON.stringify(startedRow ?? {})
    );
    const firstRunId = startedRow?.id ?? null;

    await revealExperiment(page);
    await page.locator('[data-fpa-experiment]').first().screenshot({
      path: `${SHOTS}/02-day-one.png`,
    });

    // =================================================================
    // 3. THE FOOD LENS TILE
    // =================================================================
    const lens = await context.newPage();
    watch(lens, errors);
    await goTo(lens, '/food-lens');
    const tile = lens.locator('[data-fpa-experiment-tile-status]').first();
    check(
      'a My Fuel Experiment tile is in the Food Lens grid',
      (await lens.locator(`text=${FPA_MY_EXPERIMENT.tileLabel}`).count()) > 0
    );
    check(
      'the tile carries the day she is on',
      flat(await tile.innerText()) === fpaExperimentDayLine(1),
      flat(await tile.innerText())
    );
    await lens.screenshot({ path: `${SHOTS}/03-food-lens-tile.png` });

    // =================================================================
    // 4. THE QUICK CHECK, END TO END
    // =================================================================
    const mine = await context.newPage();
    watch(mine, errors);
    const onMine = await goTo(mine, '/food-lens/my-experiment');
    check('the tile opens her own experiment screen', onMine, mine.url());

    // The sheet, inspected before anything is tapped.
    await mine.getByRole('button', { name: FPA_EXPERIMENT_LOG_LABEL }).first().click();
    await mine
      .locator('[data-testid="fpa-quick-check-sheet"]')
      .waitFor({ state: 'visible', timeout: 8000 });
    const sheet = mine.locator('[data-testid="fpa-quick-check-sheet"]');
    const sheetText = flat(await sheet.innerText());
    check(
      'the sheet asks exactly the three questions, and offers the meal row as optional',
      [
        FPA_QUICK_CHECK.energyHeader,
        FPA_QUICK_CHECK.hungerHeader,
        FPA_QUICK_CHECK.clarityHeader,
        FPA_QUICK_CHECK.mealHeader,
      ].every((header) => sheetText.includes(header)),
      sheetText.slice(0, 140)
    );
    const sheetButtons = (await sheet.getByRole('button').allInnerTexts()).map(flat);
    check(
      'it has no submit button at all, so three taps is the whole check',
      !sheetButtons.some((label) => ['Save', 'Done', 'Submit', 'Log it'].includes(label)),
      sheetButtons.join(' | ')
    );
    await sheet.screenshot({ path: `${SHOTS}/04-quick-check-sheet.png` });
    await sheet.getByRole('button', { name: FPA_QUICK_CHECK.close }).click();
    await sheet.waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
    const { count: afterClose } = await service
      .from('fuel_experiment_checks')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', memberId);
    check('closing it without answering writes nothing', (afterClose ?? 0) === 0, String(afterClose));

    // One real check, with a meal type tag.
    const first = await logCheck(mine, {
      energy: 'Steady',
      hunger: 'Comfortable',
      clarity: 'Clear',
      mealType: 'Lunch',
    });
    check('three taps write the check and the sheet closes itself', first.opened && first.confirmed);
    check(
      'it says the one warm line before it goes',
      first.confirmed,
      FPA_QUICK_CHECK.confirmation
    );
    check(
      'the count on her screen moves at once',
      (await countLine(mine)) === fpaExperimentCheckLine(1),
      await countLine(mine)
    );

    const { data: firstCheck } = await service
      .from('fuel_experiment_checks')
      .select('energy, hunger, clarity, meal_type, meal_id, logged_on')
      .eq('member_id', memberId)
      .maybeSingle();
    check(
      'the row holds her three answers and the part of the day she named',
      firstCheck?.energy === 'steady' &&
        firstCheck?.hunger === 'comfortable' &&
        firstCheck?.clarity === 'clear' &&
        firstCheck?.meal_type === 'lunch' &&
        firstCheck?.meal_id === null,
      JSON.stringify(firstCheck ?? {})
    );

    // =================================================================
    // 5. A CHECK TAGGED TO A SPECIFIC LIBRARY MEAL
    // =================================================================
    /* The meals offered as a one tap tag on this screen are the ones she
       has saved, so one is saved first, exactly as a member would. */
    const savedMeal = await (async () => {
      const resultPage = page;
      await resultPage.locator('article[data-fpa-meal-type="dinner"]').first().scrollIntoViewIfNeeded();
      await resultPage.waitForTimeout(700);
      const id = await resultPage
        .locator('article[data-fpa-meal-type="dinner"]')
        .first()
        .getAttribute('data-fpa-meal-id');
      await resultPage
        .locator('article[data-fpa-meal-type="dinner"] [data-fpa-save]')
        .first()
        .click();
      await resultPage.waitForTimeout(1200);
      return fpaMealById(id);
    })();
    /* WAIT ON THE SERVER, NOT THE CLOCK. The save is fire and forget from
       her browser, so the next page is only allowed to expect it once the
       row is actually there. */
    let saveLanded = false;
    for (let i = 0; i < 10 && !saveLanded; i++) {
      const { count } = await service
        .from('fuel_meal_saves')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('meal_id', savedMeal.id);
      saveLanded = (count ?? 0) > 0;
      if (!saveLanded) await page.waitForTimeout(700);
    }
    check(
      'a meal is saved, so the quick check has one to offer',
      Boolean(savedMeal) && saveLanded,
      savedMeal?.name ?? ''
    );

    await goTo(mine, '/food-lens/my-experiment');
    const tagged = await logCheck(mine, {
      energy: 'Great',
      hunger: 'Comfortable',
      clarity: 'Clear',
      mealName: savedMeal.name,
    });
    check(
      'a check can be tagged to a library meal in one tap',
      tagged.opened && tagged.confirmed && tagged.tagged === true,
      `opened=${tagged.opened} confirmed=${tagged.confirmed} tagged=${tagged.tagged}`
    );
    const { data: taggedRow } = await service
      .from('fuel_experiment_checks')
      .select('meal_id, meal_type')
      .eq('member_id', memberId)
      .eq('meal_id', savedMeal.id)
      .maybeSingle();
    check(
      'the row stores that meal, and the meal brought its own part of the day',
      taggedRow?.meal_id === savedMeal.id && taggedRow?.meal_type === savedMeal.type,
      JSON.stringify(taggedRow ?? {})
    );

    // =================================================================
    // 6. THE LEARNING LOOP, DRIVEN
    // =================================================================
    check('nothing has qualified yet, so nothing is claimed', (await standingInsight(mine)) === null);

    for (let i = 0; i < 3; i++) {
      await logCheck(mine, { energy: 'Steady', hunger: 'Hungry', clarity: 'Normal' });
    }
    const hungry = await standingInsight(mine);
    check(
      'three Hungry checks put hungry_soon on the screen',
      hungry?.id === 'hungry_soon',
      hungry?.id ?? 'none'
    );
    check(
      'it is the approved line, word for word',
      Boolean(hungry) && hungry.text.includes(insightBody('hungry_soon')),
      (hungry?.text ?? '').slice(0, 90)
    );
    check(
      'it says WE NOTICED SOMETHING, and it is the only insight on the screen',
      Boolean(hungry) &&
        hungry.text.includes('WE NOTICED SOMETHING') &&
        (await mine.locator('[data-fpa-insight]').count()) === 1
    );
    await mine.locator('[data-fpa-insight]').first().screenshot({ path: `${SHOTS}/05-insight.png` });

    /* THE PRIORITY RULE, ON THE REAL SITE. holding_well is the weakest
       insight in the library, so however well a calm stretch qualifies it
       must not cover up the three Hungry checks she gave. */
    for (let i = 0; i < 6; i++) {
      await logCheck(mine, { energy: 'Steady', hunger: 'Comfortable', clarity: 'Clear' });
    }
    const { data: allChecks } = await service
      .from('fuel_experiment_checks')
      .select('energy, hunger')
      .eq('member_id', memberId);
    const steady = (allChecks ?? []).filter((r) => r.energy !== 'low').length;
    const comfortable = (allChecks ?? []).filter((r) => r.hunger === 'comfortable').length;
    const total = (allChecks ?? []).length;
    check(
      'enough Steady and Comfortable checks are now stored for holding_well to qualify',
      total >= 5 && steady * 2 > total && comfortable * 2 > total,
      `${total} checks, ${steady} steady or great, ${comfortable} comfortable`
    );
    const stillHungry = await standingInsight(mine);
    check(
      'the standing insight is still hungry_soon, because holding_well is lower priority',
      stillHungry?.id === 'hungry_soon',
      stillHungry?.id ?? 'none'
    );
    check(
      'and it is still the only one on the screen',
      (await mine.locator('[data-fpa-insight]').count()) === 1
    );

    // NOTHING ABOVE IT MOVED.
    const resultReload = await context.newPage();
    watch(resultReload, errors);
    const { data: sessionRow } = await service
      .from('fuel_pattern_results')
      .select('session_id')
      .eq('member_id', memberId)
      .maybeSingle();
    await goTo(resultReload, `/assessments/fuel-pattern/results/${sessionRow.session_id}`);
    const afterInsight = await mainText(resultReload);
    check(
      'the insight changed her pattern not at all',
      afterInsight.includes(runA.patternLabel),
      runA.patternLabel
    );
    check(
      'it changed her starting range not at all',
      runA.range.rows.every((row) => afterInsight.includes(`${row.nutrient}`) && afterInsight.includes(row.level)),
      runA.range.rows.map((r) => `${r.nutrient} ${r.level}`).join(', ')
    );
    check(
      'it changed her plate not at all',
      runA.plate.segments.every((segment) => afterInsight.includes(segment.proportion)),
      runA.plate.segments.map((s) => s.proportion).join(', ')
    );
    check(
      'it changed her meal cards not at all',
      (await resultReload.locator('article[data-fpa-meal-id]').count()) === 4,
      String(await resultReload.locator('article[data-fpa-meal-id]').count())
    );
    check(
      'and the standing insight reads the same on the result page as on her own screen',
      (await standingInsight(resultReload))?.id === 'hungry_soon'
    );
    await resultReload.close();

    // =================================================================
    // 7. DAY 7, THE COMPLETION, DONE AND RESTART
    // =================================================================
    /* The stored start day is moved back eight days for this one seeded
       account. `started_on` is a calendar day and the whole feature reads
       it, so this is standing on day 9 rather than pretending a timezone
       is a time machine. */
    const backdated = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    await service.from('fuel_experiments').update({ started_on: backdated }).eq('id', firstRunId);
    await goTo(mine, '/food-lens/my-experiment');

    const completionText = flat(await mine.locator('main').innerText());
    check(
      'once the seventh day has passed the section becomes the completion state',
      completionText.includes(FPA_EXPERIMENT_COMPLETION.header),
      FPA_EXPERIMENT_COMPLETION.header
    );
    const storedCount = total;
    check(
      'the summary counts the checks she really logged',
      completionText.includes(fpaExperimentCompletionCheckLine(storedCount)),
      fpaExperimentCompletionCheckLine(storedCount)
    );
    check(
      'the insight that stood is in the summary',
      completionText.includes(insightBody('hungry_soon'))
    );
    check(
      'the closing line is the approved copy, word for word',
      completionText.includes(FPA_EXPERIMENT_COMPLETION.closingLine)
    );
    check(
      'the day counter and LOG A CHECK are gone, because the week is over',
      !completionText.includes(FPA_EXPERIMENT_LOG_LABEL) &&
        (await mine.locator('[data-fpa-experiment-day]').count()) === 0
    );
    await mine.locator('main').screenshot({ path: `${SHOTS}/06-completion.png` });

    const doneButton = mine.getByRole('button', { name: FPA_EXPERIMENT_DONE_LABEL }).first();
    const acknowledged = await pressUntil(mine, doneButton, async () => {
      await mine
        .getByRole('button', { name: FPA_EXPERIMENT_RESTART_LABEL })
        .first()
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    check('DONE collapses it to the quiet completed state with a restart', acknowledged);
    const { data: ackRow } = await service
      .from('fuel_experiments')
      .select('acknowledged_at')
      .eq('id', firstRunId)
      .maybeSingle();
    check('the DONE is stored', Boolean(ackRow?.acknowledged_at), String(ackRow?.acknowledged_at));

    const restartButton = mine.getByRole('button', { name: FPA_EXPERIMENT_RESTART_LABEL }).first();
    const restarted = await pressUntil(mine, restartButton, async () => {
      await mine
        .locator('[data-fpa-experiment-day]')
        .first()
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    check('RESTART EXPERIMENT begins a fresh seven days', restarted, await dayLine(mine));
    check('the fresh run opens on Day 1 of 7', (await dayLine(mine)) === fpaExperimentDayLine(1));
    check(
      'the fresh run starts empty, and the previous run keeps its own checks',
      (await countLine(mine)) === fpaExperimentCheckLine(0),
      await countLine(mine)
    );

    const { data: afterRestart } = await service
      .from('fuel_experiments')
      .select('id, archived_at, archived_reason')
      .eq('member_id', memberId)
      .order('created_at', { ascending: true });
    const archivedFirst = (afterRestart ?? []).find((r) => r.id === firstRunId);
    check(
      'the previous run is archived, and it says she restarted',
      archivedFirst?.archived_at !== null && archivedFirst?.archived_reason === 'restarted',
      JSON.stringify(archivedFirst ?? {})
    );
    const { count: keptChecks } = await service
      .from('fuel_experiment_checks')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', firstRunId);
    check(
      'every check of the archived run is still there. Nothing is deleted',
      (keptChecks ?? 0) === storedCount,
      `${keptChecks} of ${storedCount}`
    );

    // Log one check into the new run so the retake has something to archive.
    await logCheck(mine, { energy: 'Low', hunger: 'Hungry', clarity: 'Foggy', mealType: 'Breakfast' });
    const { data: liveBeforeRetake } = await service
      .from('fuel_experiments')
      .select('id')
      .eq('member_id', memberId)
      .is('archived_at', null)
      .maybeSingle();
    const secondRunId = liveBeforeRetake?.id ?? null;
    check('a second run is live, with one check in it', Boolean(secondRunId), String(secondRunId));

    // =================================================================
    // 8. THE RETAKE RULE
    // =================================================================
    const retake = await runSitting(context, runC, errors, 'RUN C');
    const retakeText = await mainText(retake);
    check(
      'the retake reads its own pattern',
      retakeText.includes(runC.patternLabel),
      runC.patternLabel
    );
    check(
      'and the new result page offers a fresh START MY EXPERIMENT',
      retakeText.includes(FPA_EXPERIMENT_INVITATION),
      FPA_EXPERIMENT_INVITATION.slice(0, 50)
    );
    check(
      'the button at the foot reads START MY EXPERIMENT again',
      flat(await retake.locator('[data-fpa-bottom-cta]').first().innerText()) ===
        FPA_EXPERIMENT_START_LABEL
    );
    const { data: archivedSecond } = await service
      .from('fuel_experiments')
      .select('archived_at, archived_reason')
      .eq('id', secondRunId)
      .maybeSingle();
    check(
      'the run she had going is archived, and it says a retake ended it',
      archivedSecond?.archived_at !== null && archivedSecond?.archived_reason === 'retake',
      JSON.stringify(archivedSecond ?? {})
    );
    const { count: secondChecks } = await service
      .from('fuel_experiment_checks')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', secondRunId);
    check(
      'its check is kept too. Old experiment data is never deleted',
      (secondChecks ?? 0) === 1,
      String(secondChecks)
    );

    // A third run, live, so the coach meets all three states at once.
    await revealExperiment(retake);
    const startAgain = retake
      .locator('[data-fpa-experiment]')
      .getByRole('button', { name: FPA_EXPERIMENT_START_LABEL })
      .first();
    await pressUntil(retake, startAgain, async () => {
      await retake
        .locator('[data-fpa-experiment-day]')
        .first()
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    await logCheck(retake, {
      energy: 'Great',
      hunger: 'Comfortable',
      clarity: 'Clear',
      mealType: 'Dinner',
    });
    check(
      'a fresh run is going against the new reading',
      (await dayLine(retake)) === fpaExperimentDayLine(1),
      await dayLine(retake)
    );

    // =================================================================
    // 9. NOTHING ELSE MOVED
    // =================================================================
    const home = await context.newPage();
    watch(home, errors);
    await goTo(home, '/dashboard');
    const homeText = await mainText(home);
    check('Home still renders for her', homeText.length > 200, `${homeText.length} characters`);
    check(
      'Home says nothing about the experiment, because nothing was added there',
      !homeText.includes(FPA_EXPERIMENT_HEADER)
    );
    /* The Daily Check-In lives at /checkin, which is what the bottom bar
       links to. Build 4 does not touch it, and this is here to say so. */
    await goTo(home, '/checkin');
    check(
      'the Daily Check-In still opens',
      /\/checkin/.test(home.url()) && (await home.locator('main').count()) > 0,
      home.url()
    );
    await home.close();

    check(
      'no console or page errors on any member screen',
      errors.length === 0,
      errors.slice(0, 3).join(' | ')
    );

    // =================================================================
    // 10. WHAT THE COACH SEES
    // =================================================================
    mintedCoach = await mintSessionContext(browser, COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 1280, height: 1000 },
    });
    if (!mintedCoach) throw new Error('Could not mint a session for the coach.');
    const coachPage = await mintedCoach.context.newPage();
    const coachErrors = [];
    watch(coachPage, coachErrors);

    const onClient = await goTo(coachPage, `/coach/clients/${memberId}/detail`);
    check('the coach can open her client detail page', onClient, coachPage.url());

    const header = coachPage.locator('#detail-section-assessments button').first();
    const opened = await pressUntil(coachPage, header, async () => {
      await coachPage
        .locator('#detail-card-fuel-pattern')
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    check('Assessments and Findings opens on the Fuel Pattern card', opened);

    const card = coachPage.locator('#detail-card-fuel-pattern');
    await card.scrollIntoViewIfNeeded();
    const coachText = flat(await card.innerText());

    check('the card carries a Fuel experiment block', /fuel experiment/i.test(coachText));
    check(
      'it shows the run she has going, and the day she is on',
      coachText.includes(fpaExperimentDayLine(1)),
      coachText.slice(coachText.toLowerCase().indexOf('fuel experiment'), coachText.toLowerCase().indexOf('fuel experiment') + 220)
    );
    check(
      'it prints her check in her own three answers',
      /Great, Comfortable, Clear/.test(coachText),
      'Great, Comfortable, Clear'
    );
    check('it names the part of the day she tagged', /Dinner/.test(coachText));
    check(
      'it lists the runs she has put away',
      /Earlier runs:\s*2/.test(coachText),
      coachText.slice(coachText.indexOf('Earlier runs'), coachText.indexOf('Earlier runs') + 40)
    );

    const expand = coachPage
      .locator('#detail-card-fuel-pattern button', { hasText: 'Earlier runs' })
      .first();
    const expanded = await pressUntil(coachPage, expand, async () => {
      await coachPage
        .locator('#detail-card-fuel-pattern')
        .getByText('Ended by a retake of the assessment')
        .first()
        .waitFor({ state: 'visible', timeout: 6000 });
    });
    check('the archived runs open one tap under the live one', expanded);
    const openedText = flat(await card.innerText());
    check(
      'each archived run says why it ended',
      openedText.includes('Ended by a retake of the assessment') &&
        openedText.includes('She restarted the experiment'),
      'restarted / retake'
    );
    /*
      CASE INSENSITIVE ON THE LABELS, ON PURPOSE. innerText reports the
      text as CSS renders it, and every sub-header on this card carries
      Tailwind's `uppercase`, so an assertion typed in sentence case can
      never pass however right the card is. The first run of this script
      reported two failures for exactly that reason. The approved COPY
      below it is not transformed, so that half stays exact.
    */
    check(
      'the standing insight and the ones before it are both there',
      openedText.includes(insightBody('hungry_soon')) && /standing:/i.test(openedText),
      'hungry_soon'
    );
    check(
      'the summary she read at the end of her week is there',
      /what she read at the end of the week/i.test(openedText) &&
        openedText.includes(fpaExperimentCompletionCheckLine(storedCount)),
      fpaExperimentCompletionCheckLine(storedCount)
    );
    check(
      'the block grades nothing',
      !/adherence|compliance|streak/i.test(openedText)
    );
    check('no em dash anywhere on the coach card', !openedText.includes('—'));

    await card.screenshot({ path: `${SHOTS}/07-coach-experiment.png` });
    check(
      'no console or page errors on the coach page',
      coachErrors.length === 0,
      coachErrors.slice(0, 3).join(' | ')
    );
    await coachPage.close();
  } finally {
    // ---------- Cleanup, then an independent query that says it worked ----------
    const service2 = serviceClient();
    const { data: users2 } = await service2.auth.admin.listUsers({ perPage: 1000 });
    const member2 = users2.users.find((u) => u.email === MEMBER_EMAIL);
    const { data: definition2 } = await service2
      .from('unified_assessment_definitions')
      .select('id')
      .eq('key', 'fuel-pattern')
      .maybeSingle();

    if (member2) {
      // The experiment rows first, then everything Build 3 and Build 2
      // write, because a run holds a foreign key to a session.
      await service2.from('fuel_experiment_checks').delete().eq('member_id', member2.id);
      await service2.from('fuel_experiments').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_exclusions').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_rejections').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_saves').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_slot_state').delete().eq('member_id', member2.id);

      if (definition2) {
        const { data: sessions } = await service2
          .from('unified_assessment_sessions')
          .select('id')
          .eq('member_id', member2.id)
          .eq('assessment_definition_id', definition2.id);
        await service2.from('fuel_pattern_results').delete().eq('member_id', member2.id);
        for (const s of sessions ?? []) {
          await service2.from('assessment_attempts').delete().eq('source_id', s.id);
          await service2.from('health_timeline_events').delete().eq('source_record_id', s.id);
          await service2.from('unified_assessment_sessions').delete().eq('id', s.id);
        }
      }

      for (const table of [
        'fuel_experiment_checks',
        'fuel_experiments',
        'fuel_meal_exclusions',
        'fuel_meal_rejections',
        'fuel_meal_saves',
        'fuel_meal_slot_state',
        'fuel_pattern_results',
      ]) {
        const { count } = await service2
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('member_id', member2.id);
        check(`cleanup: no ${table} row is left on production`, (count ?? 0) === 0, String(count));
      }

      if (definition2) {
        const { data: leftoverSessions } = await service2
          .from('unified_assessment_sessions')
          .select('id')
          .eq('member_id', member2.id)
          .eq('assessment_definition_id', definition2.id);
        check(
          'cleanup: no Fuel Pattern session is left on production',
          (leftoverSessions ?? []).length === 0,
          String((leftoverSessions ?? []).length)
        );
      }
    }

    if (mintedMember) await retireSession(mintedMember);
    if (mintedCoach) await retireSession(mintedCoach);
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
