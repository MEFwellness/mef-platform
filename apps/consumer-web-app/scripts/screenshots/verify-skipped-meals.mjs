#!/usr/bin/env node
// Verification for the 2026-08-14 "Your body" screen fix: the meals-skipped
// count and its "Which meal(s) did you skip?" follow-up.
//
// WHAT IT PROVES, by driving the real app rather than by asserting.
//   1. The follow-up is a TRUE multi-select. Tapping a second meal does not
//      deselect the first, which was the reported symptom.
//   2. "More than one" is gone from the options.
//   3. Count 2 needs exactly two meals: with one selected, Continue is
//      disabled AND a helper line says "Select 2 meals." With two, Continue
//      advances the screen.
//   4. Count 3 needs all three, and advances once all three are tapped.
//   5. Count 0 hides the follow-up entirely.
//   6. Changing the count re-validates without discarding selections that
//      are still valid.
//   7. A disabled Continue anywhere in the flow always shows a reason.
//   8. The matched answer round-trips to the database in the new array
//      shape, alongside the count it has to agree with.
//
// THE ONE STATE IT ARRANGES, and why that is not cheating. Which rotating
// probes a member is asked on a given day is chosen by the adaptive picker
// and then FROZEN for that day (member_daily_probe_selections, migration
// 106) — a repeat visit gets the same plan back, deliberately. So a pass
// cannot wait for "How many meals did you skip today?" to come up on its
// own without re-rolling the day. This script writes today's plan for the
// signed-in test account through that account's OWN session and RLS
// policy, using the exact table and row shape the app itself writes. It
// does not fabricate an answer, a driver state, or a validation result:
// every answer below is typed into the real screen and every verdict is
// read back off the real DOM or the real database.
//
// Usage:
//   node scripts/screenshots/verify-skipped-meals.mjs                    # local
//   SCREENSHOT_TARGET=live \
//     LIVE_SUPABASE_URL=... LIVE_SUPABASE_ANON_KEY=... \
//     node scripts/screenshots/verify-skipped-meals.mjs                  # production
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { ACCOUNTS, BASE_URL, TARGET } from './config.mjs';
import { answerVisibleQuestions, login, wizardAdvanceButton } from './lib.mjs';

const COUNT_PROMPT = 'How many meals did you skip today?';
const WHICH_PROMPT = 'Which meal(s) did you skip?';
const COUNT_KEY = 'checkin_probe.meals_skipped_today';
const WHICH_KEY = 'checkin_probe.skipped_meal_which';

// The fixed core is recorded alongside the rotating picks by
// lib/daily-checkin-adaptive/plan.ts; mirrored here (verbatim from
// lib/daily-checkin-adaptive/constants.ts's FIXED_CORE_QUESTION_KEYS,
// which this .mjs script cannot import from TypeScript) so the plan row
// set written below is the same shape the app itself writes, not a
// partial one. Only the rotating_probe row actually affects which
// questions render; these six are the audit trail.
const FIXED_CORE = [
  'checkin.pain',
  'checkin.energy',
  'checkin.sleep_quality',
  'checkin.sleep_duration',
  'checkin.stress',
  'checkin.mood',
];

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function supabaseConfig() {
  if (TARGET === 'live') {
    const url = process.env.LIVE_SUPABASE_URL;
    const anon = process.env.LIVE_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      throw new Error(
        'SCREENSHOT_TARGET=live needs LIVE_SUPABASE_URL and LIVE_SUPABASE_ANON_KEY (the production project URL and its PUBLISHABLE anon key, the one the browser already ships). Refusing to guess.'
      );
    }
    return { url, anon };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || LOCAL_ANON_KEY,
  };
}

/** Signs in as the account under test and returns its client plus its own local date. */
async function memberClient(account) {
  const { url, anon } = supabaseConfig();
  const db = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`Supabase sign-in failed for ${account.label}: ${error.message}`);
  const memberId = data.user.id;

  const { data: profile } = await db.from('profiles').select('timezone').eq('id', memberId).maybeSingle();
  const timezone = profile?.timezone || 'America/New_York';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  return { db, memberId, localDate, timezone };
}

/** Freezes today's plan so the question under test is actually asked. See the header note on why this is arranged rather than waited for. */
async function seedTodaysPlan({ db, memberId, localDate }, rotatingKey) {
  await db.from('member_daily_probe_selections').delete().eq('member_id', memberId).eq('local_date', localDate);
  const { error } = await db.from('member_daily_probe_selections').insert([
    ...FIXED_CORE.map((questionKey) => ({
      member_id: memberId,
      local_date: localDate,
      question_key: questionKey,
      kind: 'fixed_core',
    })),
    { member_id: memberId, local_date: localDate, question_key: rotatingKey, kind: 'rotating_probe' },
  ]);
  if (error) throw new Error(`Could not write today's plan: ${error.message}`);
}

/**
 * Clears only today's answers to the two questions this pass types into.
 *
 * Not cosmetic, and found by running this script twice: the second run
 * opened the screen with Breakfast and Lunch ALREADY selected, because
 * resuming a day correctly restores what she answered earlier (that is the
 * "never discard answers" rule working). A pass that assumes a blank
 * follow-up then reads its own first tap as a DESELECTION and reports a
 * multi-select failure that is not real. Starting from a known-empty
 * state is what makes each run mean the same thing.
 */
async function clearTodaysMealAnswers({ db, memberId, localDate }) {
  const { error } = await db
    .from('daily_checkin_probe_answers')
    .delete()
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .in('question_key', [COUNT_KEY, WHICH_KEY, 'checkin_probe.digestive_symptom_type']);
  if (error) throw new Error(`Could not clear today's meal answers: ${error.message}`);
}

const countGroup = (page) => page.locator(`[role="group"][aria-label="${COUNT_PROMPT}"]`);
const whichGroup = (page) => page.locator(`[role="group"][aria-label="${WHICH_PROMPT}"]`);
const helperLine = (page) => page.locator('#checkin-continue-reason');

async function setCount(page, n) {
  await countGroup(page).locator(`button[aria-label="${n}"]`).click();
  await page.waitForTimeout(250);
}

async function tapMeal(page, label) {
  await whichGroup(page).locator('button', { hasText: new RegExp(`^${label}$`) }).click();
  await page.waitForTimeout(250);
}

async function selectedMeals(page) {
  return whichGroup(page)
    .locator('button[aria-pressed="true"]')
    .evaluateAll((els) => els.map((el) => el.textContent.trim()));
}

async function helperText(page) {
  const line = helperLine(page);
  if ((await line.count()) === 0) return null;
  if (!(await line.first().isVisible())) return null;
  return (await line.first().innerText()).trim();
}

async function currentStep(page) {
  return Number(await page.locator('[role="progressbar"]').first().getAttribute('aria-valuenow'));
}

/** Advances screen by screen, answering whatever is required, until the "Your body" section is on screen. */
async function walkToBodyScreen(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.getByText('Your body', { exact: true }).first().isVisible().catch(() => false)) return true;
    const button = wizardAdvanceButton(page);
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await answerVisibleQuestions(page);
    if (await button.isDisabled()) {
      const reason = await helperText(page);
      throw new Error(
        `Stuck before reaching "Your body": Continue disabled with reason ${reason ? `"${reason}"` : 'MISSING (the bug this fix is about)'}`
      );
    }
    await button.click();
    await page.waitForTimeout(500);
  }
  throw new Error('Never reached the "Your body" screen');
}

async function main() {
  const account = ACCOUNTS.memberPopulated;
  console.log(`target=${TARGET} base=${BASE_URL} account=${account.label}`);

  const session = await memberClient(account);
  console.log(`member local date ${session.localDate} (${session.timezone})`);
  await seedTodaysPlan(session, COUNT_KEY);
  await clearTodaysMealAnswers(session);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  try {
    await login(page, BASE_URL, account);
    await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
    await walkToBodyScreen(page);

    check('the meals-skipped count question is on the "Your body" screen', (await countGroup(page).count()) > 0);

    // The discomfort gate is the screen's other blocking unit. Answering it
    // first isolates the meals follow-up as the only thing that can hold
    // Continue, so a disabled button later is unambiguous.
    const gate = page.locator('[role="group"][aria-label="Any discomfort today?"]');
    if ((await gate.count()) > 0) {
      await gate.locator('button', { hasText: /^No$/ }).click();
      await page.waitForTimeout(250);
    }

    // ---- the follow-up appears only once a meal was skipped ----
    await setCount(page, 0);
    check('count 0 shows no meal follow-up at all', (await whichGroup(page).count()) === 0);
    check(
      'count 0 leaves Continue usable',
      !(await wizardAdvanceButton(page).isDisabled()),
      `helper line: ${(await helperText(page)) ?? 'none'}`
    );

    await setCount(page, 2);
    check('count 2 reveals the meal follow-up', (await whichGroup(page).count()) > 0);
    check(
      'it opens with nothing selected, so every tap below is unambiguous',
      (await selectedMeals(page)).length === 0,
      JSON.stringify(await selectedMeals(page))
    );

    const optionLabels = await whichGroup(page)
      .locator('button')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    check(
      'the follow-up offers exactly Breakfast, Lunch, Dinner',
      JSON.stringify(optionLabels) === JSON.stringify(['Breakfast', 'Lunch', 'Dinner']),
      JSON.stringify(optionLabels)
    );
    check(
      '"More than one" is gone',
      !optionLabels.some((l) => /more than one/i.test(l)),
      JSON.stringify(optionLabels)
    );

    // ---- count 2 with only one meal: disabled, with a visible reason ----
    await tapMeal(page, 'Breakfast');
    const oneSelected = await selectedMeals(page);
    const disabledWithOne = await wizardAdvanceButton(page).isDisabled();
    const reasonWithOne = await helperText(page);
    check('count 2 with one meal keeps Continue disabled', disabledWithOne, `selected: ${JSON.stringify(oneSelected)}`);
    check(
      'and a visible helper line says what is missing',
      reasonWithOne === 'Select 2 meals.',
      `saw: ${reasonWithOne ?? 'NOTHING (the reported bug)'}`
    );

    // ---- the reported symptom: a second tap must not deselect the first ----
    await tapMeal(page, 'Lunch');
    const twoSelected = await selectedMeals(page);
    check(
      'tapping a second meal keeps the first selected (true multi-select)',
      twoSelected.length === 2 && twoSelected.includes('Breakfast') && twoSelected.includes('Lunch'),
      JSON.stringify(twoSelected)
    );
    check('with two of two selected, no helper line remains', (await helperText(page)) === null);

    const stepBefore = await currentStep(page);
    check('count 2 with two meals enables Continue', !(await wizardAdvanceButton(page).isDisabled()));
    await wizardAdvanceButton(page).click();
    await page.waitForTimeout(700);
    check('and Continue actually advances the screen', (await currentStep(page)) === stepBefore + 1, `step ${stepBefore} -> ${await currentStep(page)}`);

    // ---- back, then raise the count to 3 ----
    await page.getByRole('button', { name: 'Back to previous screen' }).click();
    await page.waitForTimeout(700);
    const survived = await selectedMeals(page);
    check(
      'coming back keeps both selections',
      survived.length === 2,
      JSON.stringify(survived)
    );

    await setCount(page, 3);
    const keptOnRaise = await selectedMeals(page);
    check(
      'raising the count to 3 keeps the two meals already picked',
      keptOnRaise.length === 2,
      JSON.stringify(keptOnRaise)
    );
    check(
      'and asks for the third rather than silently accepting two',
      (await helperText(page)) === 'Select 3 meals.',
      `saw: ${(await helperText(page)) ?? 'nothing'}`
    );
    check('Continue is disabled at two of three', await wizardAdvanceButton(page).isDisabled());

    await tapMeal(page, 'Dinner');
    const allThree = await selectedMeals(page);
    check('all three meals can be selected at once', allThree.length === 3, JSON.stringify(allThree));
    const stepBeforeThree = await currentStep(page);
    check('count 3 with three meals enables Continue', !(await wizardAdvanceButton(page).isDisabled()));
    await wizardAdvanceButton(page).click();
    await page.waitForTimeout(700);
    check('and Continue advances', (await currentStep(page)) === stepBeforeThree + 1);

    // ---- lowering the count re-validates the other direction ----
    await page.getByRole('button', { name: 'Back to previous screen' }).click();
    await page.waitForTimeout(700);
    await setCount(page, 2);
    check(
      'dropping the count to 2 with three meals picked blocks with the other way out offered',
      (await helperText(page)) === 'Select only 2 meals, or change the number above.',
      `saw: ${(await helperText(page)) ?? 'nothing'}`
    );
    await tapMeal(page, 'Dinner'); // untick, back to two
    check('untapping one satisfies it again', (await helperText(page)) === null);

    // ---- finish the reset so the matched answer really persists ----
    for (let i = 0; i < 8; i++) {
      const button = wizardAdvanceButton(page);
      const label = (await button.textContent())?.trim();
      await answerVisibleQuestions(page);
      if (await button.isDisabled()) {
        const reason = await helperText(page);
        check(`no dead Continue while finishing (screen showing "${label}")`, !!reason, `reason: ${reason ?? 'NONE'}`);
        break;
      }
      await button.click();
      if (label !== 'Continue') {
        await page.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 20000 });
        await page.getByRole('button', { name: 'Continue' }).click();
        break;
      }
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(1500);

    // ---- what actually landed in the database ----
    const { data: answers } = await session.db
      .from('daily_checkin_probe_answers')
      .select('question_key, value')
      .eq('local_date', session.localDate)
      .in('question_key', [COUNT_KEY, WHICH_KEY]);
    const stored = Object.fromEntries((answers ?? []).map((row) => [row.question_key, row.value]));
    check('the count was stored', stored[COUNT_KEY] === 2, JSON.stringify(stored[COUNT_KEY]));
    check(
      'the two meals were stored as an array, matching the count',
      Array.isArray(stored[WHICH_KEY]) && stored[WHICH_KEY].length === 2,
      JSON.stringify(stored[WHICH_KEY])
    );

    // ---- PHASE B: the other question the sweep found ----
    // checkin_probe.digestive_symptom_type had the same fake "More than
    // one" option under a number-type parent (the 1-5 digestion rating).
    // It has no count to match, so the only thing to prove is that it can
    // now hold more than one symptom and never blocks anything.
    await seedTodaysPlan(session, 'checkin_probe.digestion_rating');
    await clearTodaysMealAnswers(session);
    await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
    await walkToBodyScreen(page);

    const digestionGroup = page.locator('[role="group"][aria-label="How was your digestion today?"]');
    const digestionPresent = (await digestionGroup.count()) > 0;
    check('the digestion rating question is on the "Your body" screen', digestionPresent);

    if (digestionPresent) {
      // A `scale` question renders ShortOptionRow tiles labelled by their
      // visible text, not an aria-label (that is DotsCount's shape).
      await digestionGroup.locator('button', { hasText: /^2$/ }).click();
      await page.waitForTimeout(400);
      const symptomGroup = page.locator('[role="group"][aria-label="What kind of discomfort?"]');
      check('a low digestion rating reveals the symptom follow-up', (await symptomGroup.count()) > 0);

      const symptomLabels = await symptomGroup
        .locator('button')
        .evaluateAll((els) => els.map((el) => el.textContent.trim()));
      check(
        'the symptom follow-up offers the five real symptoms with no "More than one"',
        symptomLabels.length === 5 && !symptomLabels.some((l) => /more than one/i.test(l)),
        JSON.stringify(symptomLabels)
      );

      await symptomGroup.locator('button', { hasText: /^Bloating$/ }).click();
      await page.waitForTimeout(200);
      await symptomGroup.locator('button', { hasText: /^Gas$/ }).click();
      await page.waitForTimeout(200);
      const symptomsSelected = await symptomGroup
        .locator('button[aria-pressed="true"]')
        .evaluateAll((els) => els.map((el) => el.textContent.trim()));
      check(
        'two symptoms can be selected at once',
        symptomsSelected.length === 2,
        JSON.stringify(symptomsSelected)
      );
      check(
        'and it never blocks Continue, since no count has to be matched',
        !(await wizardAdvanceButton(page).isDisabled()),
        `helper line: ${(await helperText(page)) ?? 'none'}`
      );
    }

    check('no page errors anywhere in the run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

await main();
