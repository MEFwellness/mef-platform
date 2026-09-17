#!/usr/bin/env node
/**
 * Build 3 of the Rooted Reset Fuel Pattern Assessment, driven end to end
 * on production: the meal cards, the rotation, the two kinds of no, the
 * saved collection and the coach's block.
 *
 * WHAT ONLY A LIVE RUN CAN PROVE. The source tests prove the library, the
 * picker, the fence and the rendered section. They cannot prove that the
 * deployed page draws four cards in the right place, that the committed
 * photographs actually load over the network, that Show me another really
 * does cycle all six before repeating when a browser is doing it, that a
 * standing preference survives a reload AND a retake, that a saved meal
 * from an old pattern is still in her collection after the reading
 * changes, or that a coach opening her real client page sees what she
 * recorded. Every one of those is driven here.
 *
 * THE EXPECTATIONS COME FROM THE REAL ENGINES. The answer plans are the
 * ones scripts/print-fuel-pattern-expectations.mjs builds, and the meal
 * rules are read from the library and the picker themselves, so a content
 * edit is an edit to what this run expects rather than a second copy of
 * it that can drift.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not, then confirmed absent by an
 * independent query. That includes the standing preferences, which are
 * the rows this build adds that outlive a session.
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
import { selectAllRows, listAllAuthUsers } from '../lib/data/pagedSelect.ts';
import { FPA_MEALS, fpaMealById } from '../lib/fuel-pattern/meals/library.ts';
import { FPA_MEAL_TYPES } from '../lib/fuel-pattern/meals/types.ts';
import { mealPatternFor, mealsForSlot } from '../lib/fuel-pattern/meals/selection.ts';
import {
  FPA_MEALS_SECTION_HEADER,
  FPA_MEAL_CARD_COPY,
  FPA_MY_MEALS,
  FPA_REASON_LABEL,
} from '../lib/fuel-pattern/meals/copy.ts';
import { FPA_SECTION_HEADERS } from '../lib/fuel-pattern/copy.ts';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const COACH_EMAIL = process.env.TEST_COACH_EMAIL;
const EXPECT = JSON.parse(readFileSync(process.env.FPA_EXPECT_FILE, 'utf8'));
/* Under .verify/, which .gitignore covers: these are pictures of a real
   member's screens and are never committed. */
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/fuel-pattern-meals';

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

/** The meal id on each of the four cards, keyed by the slot it is in. */
async function cardIds(page) {
  const ids = {};
  for (const type of FPA_MEAL_TYPES) {
    const card = page.locator(`article[data-fpa-meal-type="${type}"]`).first();
    ids[type] = (await card.getAttribute('data-fpa-meal-id').catch(() => null)) ?? null;
  }
  return ids;
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

  // The reveal, then the finished page. The meals are below the plate, so
  // waiting on the watch-for header is waiting on the whole page.
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

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured, see CLAUDE.md.');
  mkdirSync(SHOTS, { recursive: true });

  const service = serviceClient();
  const { data: users } = await listAllAuthUsers(service.auth.admin);
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
  let declinedMealId = null;
  let savedIds = [];

  try {
    mintedMember = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 414, height: 900 },
    });
    if (!mintedMember) throw new Error('Could not mint a session for the test member.');
    const context = mintedMember.context;

    // =================================================================
    // 1. A SITTING, AND THE FOUR CARDS IT PRODUCES
    // =================================================================
    const page = await runSitting(context, runA, errors, 'RUN A');
    const text = await mainText(page);

    check(
      'the meals section is on the result page',
      text.includes(FPA_MEALS_SECTION_HEADER),
      FPA_MEALS_SECTION_HEADER
    );
    const platePos = text.indexOf(FPA_SECTION_HEADERS.plate);
    const mealsPos = text.indexOf(FPA_MEALS_SECTION_HEADER);
    const watchPos = text.indexOf(FPA_SECTION_HEADERS.watchFor);
    check(
      'it sits between Your Starting Plate and What Rooted Reset Will Watch For',
      platePos > -1 && mealsPos > platePos && watchPos > mealsPos,
      `${platePos} / ${mealsPos} / ${watchPos}`
    );

    const first = await cardIds(page);
    const four = FPA_MEAL_TYPES.every((type) => Boolean(first[type]));
    check('one card per part of the day, four in all', four, JSON.stringify(first));

    const expectedMealPattern = mealPatternFor(runA.pattern);
    const allFromHerPattern = FPA_MEAL_TYPES.every((type) => {
      const meal = fpaMealById(first[type]);
      return meal && meal.type === type && meal.pattern === expectedMealPattern;
    });
    check(
      `every card is a ${expectedMealPattern} meal of its own slot`,
      allFromHerPattern,
      JSON.stringify(first)
    );

    const whyCount = await page.getByText(FPA_MEAL_CARD_COPY.whyHeader).count();
    check('every card carries WHY THIS FITS YOUR PATTERN', whyCount === 4, String(whyCount));
    for (const type of FPA_MEAL_TYPES) {
      const meal = fpaMealById(first[type]);
      if (!meal) continue;
      check(
        `the ${type} card prints its own why-it-fits copy`,
        text.includes(meal.whyItFits.slice(0, 60)),
        meal.name
      );
    }

    const prepTimes = await page.locator('[data-fpa-prep]').allInnerTexts();
    check(
      'each card shows its preparation time, and that is the only number on them',
      prepTimes.length === 4 && prepTimes.every((t) => /^\d+ min$/.test(t.trim())),
      prepTimes.join(' | ')
    );


    /*
      A FULL PAGE SCREENSHOT OF A REVEAL PAGE IS A PICTURE OF NOTHING.
      Everything below the hero is wrapped in RevealOnScroll, which starts
      at opacity zero and only fades in once the section has actually been
      scrolled to. The first run of this script produced four blank
      screenshots for exactly that reason. So each card is scrolled into
      view, given a moment to arrive, and photographed as an element.
    */
    for (const type of FPA_MEAL_TYPES) {
      await page.locator(`article[data-fpa-meal-type="${type}"]`).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(600);
    for (const type of FPA_MEAL_TYPES) {
      await page
        .locator(`article[data-fpa-meal-type="${type}"]`)
        .first()
        .screenshot({ path: `${SHOTS}/01-card-${type}.png` });
    }
    /* EFFECTIVE opacity, not the card's own. The reveal wrapper is several
       ancestors up, and reading only the article would report 1 for a card
       nobody can see. */
    // ---------- THE PHOTOGRAPHS REALLY LOAD, ONCE SHE REACHES THEM ----------
    /*
      ASKED AFTER THE SCROLL, ON PURPOSE. Meal photographs are lazy, so a
      card four screens below the fold has deliberately not fetched its
      image yet and a check taken before the scroll reports complete:false
      about a card that is working exactly as intended. The first run of
      this script failed here for that reason. What a member actually
      experiences is the image being there when she arrives at the card,
      and that is what is asserted.
    */
    const imageReport = await page.evaluate(
      `(() => {
        const out = [];
        for (const img of Array.from(document.querySelectorAll('article[data-fpa-meal-id] img'))) {
          out.push({ src: img.getAttribute('src'), complete: img.complete, w: img.naturalWidth });
        }
        return out;
      })()`
    );
    const withPhotos = FPA_MEAL_TYPES.filter((type) => fpaMealById(first[type])?.image).length;
    check(
      'every card whose meal has a photograph actually loaded it',
      imageReport.length === withPhotos &&
        imageReport.every((i) => i.complete && i.w > 0 && !/^https?:/.test(i.src ?? '')),
      JSON.stringify(imageReport).slice(0, 200)
    );
    note(`${withPhotos} of the four meals on screen carry a photograph; the rest draw the plate`);

    const revealed = await page.evaluate(
      `(() => {
        const out = [];
        for (const card of Array.from(document.querySelectorAll('article[data-fpa-meal-id]'))) {
          let node = card;
          let opacity = 1;
          while (node && node !== document.documentElement) {
            opacity = opacity * Number(getComputedStyle(node).opacity || 1);
            node = node.parentElement;
          }
          out.push({
            id: card.getAttribute('data-fpa-meal-id'),
            h: Math.round(card.getBoundingClientRect().height),
            opacity: Number(opacity.toFixed(3)),
          });
        }
        return out;
      })()`
    );
    check(
      'every card is fully revealed once it has been scrolled to',
      revealed.length === 4 && revealed.every((r) => r.h > 300 && Number(r.opacity) === 1),
      JSON.stringify(revealed)
    );

    // ---------- THE PAGE STILL HOLDS ----------
    const urlBefore = page.url();
    await page.waitForTimeout(5000);
    check(
      'the reveal still holds with the meals section on it',
      page.url() === urlBefore && (await mainText(page)).includes(runA.patternLabel),
      page.url()
    );

    // =================================================================
    // 2. SHOW ME ANOTHER
    // =================================================================
    const lunchCard = () => page.locator('article[data-fpa-meal-type="lunch"]').first();
    const seen = [first.lunch];
    for (let i = 0; i < 7; i++) {
      const before = (await cardIds(page)).lunch;
      await lunchCard().locator('[data-fpa-another]').click();
      await page.waitForFunction(
        `document.querySelector('article[data-fpa-meal-type="lunch"]')?.getAttribute('data-fpa-meal-id') !== ${JSON.stringify(before)}`,
        { timeout: 10000 }
      );
      seen.push((await cardIds(page)).lunch);
    }
    const sixSet = new Set(seen.slice(0, 6));
    check(
      'the first six replacements are all six lunches of her pattern, with no repeat',
      sixSet.size === 6 &&
        [...sixSet].every((id) => {
          const meal = fpaMealById(id);
          return meal && meal.type === 'lunch' && meal.pattern === expectedMealPattern;
        }),
      seen.slice(0, 6).join(', ')
    );
    check(
      'the whole set is exactly the authored six',
      sixSet.size === mealsForSlot(expectedMealPattern, 'lunch').length &&
        mealsForSlot(expectedMealPattern, 'lunch').every((m) => sixSet.has(m.id)),
      String(sixSet.size)
    );
    check('the seventh starts the six again rather than stopping', Boolean(seen[6]), seen[6] ?? '');
    const otherSlotsHeld = ['breakfast', 'dinner', 'snack'].every(
      async () => true
    );
    const after = await cardIds(page);
    check(
      'rotating lunch moved nothing else',
      after.breakfast === first.breakfast &&
        after.dinner === first.dinner &&
        after.snack === first.snack,
      JSON.stringify(after)
    );
    void otherSlotsHeld;

    // =================================================================
    // 3. I DO NOT EAT THIS, WITH A REASON THAT STANDS
    // =================================================================
    /* A breakfast that actually contains dairy, so "No dairy" has
       something to exclude and the check cannot pass by accident. */
    let breakfastId = (await cardIds(page)).breakfast;
    for (let i = 0; i < 8 && !fpaMealById(breakfastId)?.allergens.includes('dairy'); i++) {
      const before = breakfastId;
      await page.locator('article[data-fpa-meal-type="breakfast"]').first()
        .locator('[data-fpa-another]').click();
      await page.waitForFunction(
        `document.querySelector('article[data-fpa-meal-type="breakfast"]')?.getAttribute('data-fpa-meal-id') !== ${JSON.stringify(before)}`,
        { timeout: 10000 }
      );
      breakfastId = (await cardIds(page)).breakfast;
    }
    const dairyMeal = fpaMealById(breakfastId);
    check(
      'a breakfast carrying dairy is on the screen, so No dairy has work to do',
      Boolean(dairyMeal?.allergens.includes('dairy')),
      dairyMeal?.name ?? ''
    );

    await page.locator('article[data-fpa-meal-type="breakfast"]').first()
      .locator('[data-fpa-reject]').click();
    await page.waitForSelector('[data-testid="fpa-meal-reason-sheet"]', { timeout: 10000 });
    const swappedAtOnce = (await cardIds(page)).breakfast !== breakfastId;
    check('the card swaps the instant she taps I do not eat this', swappedAtOnce);
    await page.locator('[data-testid="fpa-meal-reason-sheet"]').screenshot({
      path: `${SHOTS}/02-reason-sheet.png`,
    });

    await page.getByRole('button', { name: FPA_REASON_LABEL.no_dairy, exact: true }).click();
    await page.waitForSelector('[data-testid="fpa-meal-reason-sheet"]', {
      state: 'detached',
      timeout: 10000,
    });

    const afterNoDairy = await cardIds(page);
    const noDairyEverywhere = FPA_MEAL_TYPES.every((type) =>
      fpaMealById(afterNoDairy[type])?.flags.includes('dairy_free')
    );
    check(
      'dairy leaves every one of the four cards in the same moment',
      noDairyEverywhere,
      JSON.stringify(afterNoDairy)
    );

    // ---------- IT SURVIVES A RELOAD ----------
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(FPA_MEALS_SECTION_HEADER).first().waitFor({ timeout: 30000 });
    const afterReload = await cardIds(page);
    check(
      'no dairy holds after a reload, in every slot',
      FPA_MEAL_TYPES.every((type) => fpaMealById(afterReload[type])?.flags.includes('dairy_free')),
      JSON.stringify(afterReload)
    );

    // ---------- AND IT HOLDS THROUGH TWENTY MORE TAPS ----------
    let brokeDairy = null;
    for (const type of FPA_MEAL_TYPES) {
      for (let i = 0; i < 5; i++) {
        const before = (await cardIds(page))[type];
        await page.locator(`article[data-fpa-meal-type="${type}"]`).first()
          .locator('[data-fpa-another]').click();
        await page.waitForFunction(
          `document.querySelector('article[data-fpa-meal-type="${type}"]')?.getAttribute('data-fpa-meal-id') !== ${JSON.stringify(before)}`,
          { timeout: 10000 }
        ).catch(() => {});
        const now = fpaMealById((await cardIds(page))[type]);
        if (now && !now.flags.includes('dairy_free')) brokeDairy = now.name;
      }
    }
    check('twenty more taps never produce a dairy meal', brokeDairy === null, brokeDairy ?? '');

    // =================================================================
    // 4. I DO NOT LIKE THIS FOOD
    // =================================================================
    declinedMealId = (await cardIds(page)).dinner;
    await page.locator('article[data-fpa-meal-type="dinner"]').first()
      .locator('[data-fpa-reject]').click();
    await page.waitForSelector('[data-testid="fpa-meal-reason-sheet"]', { timeout: 10000 });
    await page.getByRole('button', { name: FPA_REASON_LABEL.dislike, exact: true }).click();
    await page.waitForSelector('[data-testid="fpa-meal-reason-sheet"]', {
      state: 'detached',
      timeout: 10000,
    });

    let returned = false;
    for (let i = 0; i < 10; i++) {
      if ((await cardIds(page)).dinner === declinedMealId) returned = true;
      const before = (await cardIds(page)).dinner;
      await page.locator('article[data-fpa-meal-type="dinner"]').first()
        .locator('[data-fpa-another]').click();
      await page.waitForFunction(
        `document.querySelector('article[data-fpa-meal-type="dinner"]')?.getAttribute('data-fpa-meal-id') !== ${JSON.stringify(before)}`,
        { timeout: 10000 }
      ).catch(() => {});
    }
    check(
      'the meal she said she does not like never comes back',
      !returned,
      fpaMealById(declinedMealId)?.name ?? ''
    );

    // =================================================================
    // 5. SAVE, AND MY MEALS
    // =================================================================
    const toSave = await cardIds(page);
    savedIds = [toSave.breakfast, toSave.snack];
    for (const type of ['breakfast', 'snack']) {
      await page.locator(`article[data-fpa-meal-type="${type}"]`).first()
        .locator('[data-fpa-save]').click();
      await page.waitForFunction(
        `document.querySelector('article[data-fpa-meal-type="${type}"] [data-fpa-save]')?.getAttribute('aria-pressed') === 'true'`,
        { timeout: 8000 }
      );
    }
    check('Save fills in on both cards', true, savedIds.join(', '));
    await page.waitForTimeout(1500);

    const myMeals = await context.newPage();
    watch(myMeals, errors);
    const onMyMeals = await goTo(myMeals, '/food-lens/my-meals');
    check('My Meals is reachable at its own address', onMyMeals, myMeals.url());
    let myMealsText = await mainText(myMeals);
    const bothThere = savedIds.every((id) => myMealsText.includes(fpaMealById(id)?.name ?? '@@'));
    check('both saved meals are in the collection', bothThere, myMealsText.slice(0, 200));
    const groupedRight =
      myMealsText.indexOf('BREAKFAST') > -1 && myMealsText.indexOf('SNACK') > -1;
    check('they are grouped by the part of the day', groupedRight);
    check(
      'the collection offers no Show me another, because there is nothing to rotate',
      (await myMeals.locator('[data-fpa-another]').count()) === 0
    );
    await myMeals.locator('main').screenshot({ path: `${SHOTS}/03-my-meals.png` });

    // ---------- UNSAVE FROM THE COLLECTION ----------
    const removeId = savedIds[1];
    await myMeals.locator(`article[data-fpa-meal-id="${removeId}"] [data-fpa-save]`).click();
    await myMeals.waitForSelector(`article[data-fpa-meal-id="${removeId}"]`, {
      state: 'detached',
      timeout: 8000,
    });
    await myMeals.waitForTimeout(1500);
    await myMeals.reload({ waitUntil: 'domcontentloaded' });
    await myMeals.waitForLoadState('networkidle').catch(() => {});
    myMealsText = await mainText(myMeals);
    check(
      'the meal she unsaved is gone, and stays gone after a reload',
      !myMealsText.includes(fpaMealById(removeId)?.name ?? '@@') &&
        myMealsText.includes(fpaMealById(savedIds[0])?.name ?? '@@'),
      myMealsText.slice(0, 200)
    );
    savedIds = [savedIds[0]];
    await myMeals.close();
    await page.close();

    // =================================================================
    // 6. A RETAKE THAT CHANGES HER PATTERN
    // =================================================================
    const pageC = await runSitting(context, runC, errors, 'RUN C');
    check(
      'the retake produced a different reading',
      runC.pattern !== runA.pattern && (await mainText(pageC)).includes(runC.patternLabel),
      `${runA.pattern} then ${runC.pattern}`
    );

    const newPattern = mealPatternFor(runC.pattern);
    const retakeCards = await cardIds(pageC);
    check(
      'every card now comes from the new pattern',
      FPA_MEAL_TYPES.every((type) => fpaMealById(retakeCards[type])?.pattern === newPattern),
      JSON.stringify(retakeCards)
    );
    check(
      'the no dairy preference still holds after the retake',
      FPA_MEAL_TYPES.every((type) => fpaMealById(retakeCards[type])?.flags.includes('dairy_free')),
      JSON.stringify(retakeCards)
    );
    for (const type of FPA_MEAL_TYPES) {
      await pageC.locator(`article[data-fpa-meal-type="${type}"]`).first().scrollIntoViewIfNeeded();
      await pageC.waitForTimeout(800);
    }
    await pageC
      .locator('article[data-fpa-meal-type="dinner"]')
      .first()
      .screenshot({ path: `${SHOTS}/04-after-retake.png` });
    await pageC.close();

    const myMeals2 = await context.newPage();
    watch(myMeals2, errors);
    await goTo(myMeals2, '/food-lens/my-meals');
    const keptText = await mainText(myMeals2);
    const keptMeal = fpaMealById(savedIds[0]);
    check(
      'the meal saved under the old pattern is still in her collection',
      keptText.includes(keptMeal?.name ?? '@@'),
      keptMeal?.name ?? ''
    );
    check(
      'and it is quietly labelled with the pattern she saved it under',
      keptText.includes(`${FPA_MY_MEALS.patternLabelPrefix} ${runA.patternLabel}`),
      keptText.slice(0, 200)
    );
    await myMeals2.locator('main').screenshot({ path: `${SHOTS}/05-my-meals-after-retake.png` });
    await myMeals2.close();

    // =================================================================
    // 7. WHAT THE COACH SEES
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

    /*
      A CLOSED FOLD HAS NO CHILDREN TO READ. The Fuel Pattern card lives
      inside the Assessments and Findings section, and that section is a
      fold: reading the page without opening it reports the block missing
      while it is perfectly fine. Build 2's rig learned the same thing,
      and this addresses the card by its own id rather than by copy.
    */
    const header = coachPage.locator('#detail-section-assessments button').first();
    const opened = await pressUntil(coachPage, header, async () => {
      await coachPage.locator('#detail-card-fuel-pattern').waitFor({ state: 'visible', timeout: 6000 });
    });
    check('the Fuel Pattern card is inside Assessments and Findings', opened);

    const card = coachPage.locator('#detail-card-fuel-pattern');
    await card.scrollIntoViewIfNeeded();
    const coachText = flat(await card.innerText());

    check('the card carries a Meal preferences block', /meal preferences/i.test(coachText));
    check(
      'it names her standing preference',
      /no dairy/i.test(coachText),
      coachText.slice(coachText.toLowerCase().indexOf('meal preferences'), coachText.toLowerCase().indexOf('meal preferences') + 220)
    );
    check(
      'it lists the meal she said she does not like, with the reason',
      coachText.includes(fpaMealById(declinedMealId)?.name ?? '@@') &&
        /does not like this food/i.test(coachText),
      fpaMealById(declinedMealId)?.name ?? ''
    );
    check(
      'it counts her saved meals',
      /saved meals:\s*1/i.test(coachText),
      coachText.slice(coachText.toLowerCase().indexOf('saved meals'), coachText.toLowerCase().indexOf('saved meals') + 60)
    );
    const expand = card.getByRole('button', { name: /Saved meals: \d+/ }).first();
    const expanded = await pressUntil(coachPage, expand, async () => {
      const t = flat(await card.innerText());
      if (!t.includes(keptMeal?.name ?? '@@')) throw new Error('not open yet');
    });
    check('and names them on expand', expanded, keptMeal?.name ?? '');

    await card.screenshot({ path: `${SHOTS}/06-coach-meal-preferences.png` });
    check(
      'no console or page errors on the coach page',
      coachErrors.length === 0,
      coachErrors.slice(0, 3).join(' | ')
    );
    await coachPage.close();

    // =================================================================
    // 8. NO EM DASH, ANYWHERE IN THE SEVENTY TWO
    // =================================================================
    const emDashed = FPA_MEALS.filter((meal) =>
      [meal.name, meal.summary, meal.whyItFits, ...meal.ingredients].join(' ').includes('—')
    );
    check('not one of the seventy two meals holds an em dash', emDashed.length === 0,
      emDashed.map((m) => m.id).join(', '));

    check(
      'no console or page errors anywhere on the member journey',
      errors.length === 0,
      errors.slice(0, 3).join(' | ')
    );
  } finally {
    // ---------- Cleanup, then an independent query that says it worked ----------
    const service2 = serviceClient();
    const { data: users2 } = await listAllAuthUsers(service2.auth.admin);
    const member2 = users2.users.find((u) => u.email === MEMBER_EMAIL);
    const { data: definition2 } = await service2
      .from('unified_assessment_definitions')
      .select('id')
      .eq('key', 'fuel-pattern')
      .maybeSingle();

    if (member2) {
      // THE ROWS THIS BUILD ADDS OUTLIVE A SESSION, so they are the ones
      // most easily left behind. All four tables, every time.
      await service2.from('fuel_meal_exclusions').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_rejections').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_saves').delete().eq('member_id', member2.id);
      await service2.from('fuel_meal_slot_state').delete().eq('member_id', member2.id);

      if (definition2) {
        const { rows: sessions } = await selectAllRows(() =>
          service2
            .from('unified_assessment_sessions')
            .select('id')
            .eq('member_id', member2.id)
            .eq('assessment_definition_id', definition2.id)
            .order('id', { ascending: true })
        );
        await service2.from('fuel_pattern_results').delete().eq('member_id', member2.id);
        for (const s of sessions ?? []) {
          await service2.from('assessment_attempts').delete().eq('source_id', s.id);
          await service2.from('health_timeline_events').delete().eq('source_record_id', s.id);
          await service2.from('unified_assessment_sessions').delete().eq('id', s.id);
        }
      }

      for (const table of [
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
        const { rows: leftoverSessions } = await selectAllRows(() =>
          service2
            .from('unified_assessment_sessions')
            .select('id')
            .eq('member_id', member2.id)
            .eq('assessment_definition_id', definition2.id)
            .order('id', { ascending: true })
        );
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
