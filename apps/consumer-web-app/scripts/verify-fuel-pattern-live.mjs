#!/usr/bin/env node
/**
 * The Rooted Reset Fuel Pattern Assessment, driven end to end on
 * production, and Primal Pattern's retirement checked from the outside.
 *
 * WHAT ONLY A LIVE RUN CAN PROVE. The source tests prove the weight map,
 * the copy and the routes. They cannot prove that the twenty four
 * questions the deployed app actually serves are the twenty four in the
 * migration, that one and only one of them is on the screen at a time,
 * that tapping an answer moves nothing, that closing the tab and opening a
 * brand new page puts her back where she was, or that finishing writes a
 * row carrying the pattern she was shown. Every one of those is driven
 * here against the real site with a real session.
 *
 * TWO FULL SITTINGS.
 *   RUN A answers protein leaning throughout and must read
 *     Protein-Supportive. It is also where the two unscored questions are
 *     proved: Question 21's digestive discomfort answer and Question 23
 *     are both given, and the stored row must show the flag, the vitality
 *     answer, one fewer scored question, and the same pattern.
 *   RUN B answers "it varies" throughout and must read Flexible Fuel,
 *     which is a result and not an error state.
 *
 * THE QUESTIONS COME FROM THE AUTHORED CONTENT, not from a second
 * hand-typed copy: scripts/print-fuel-pattern-plan.mjs emits them and this
 * run reads that file, so a question edited in the product is a question
 * edited here.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and every write is undone in
 * a `finally` whether the run passes or not.
 *
 * Environment:
 *   BASE_URL     default https://app.mefwellness.com
 *   TEST_MEMBER_EMAIL      the seeded fixture
 *   FPA_PLAN_FILE          the JSON the plan printer wrote
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const PLAN = JSON.parse(readFileSync(process.env.FPA_PLAN_FILE, 'utf8'));
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-fuel-pattern';

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

/** Console and page errors on every screen this run touches, with the URL they happened on. */
function watch(page, sink) {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`console: ${page.url()} :: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => sink.push(`pageerror: ${page.url()} :: ${String(e).slice(0, 200)}`));
}

/**
 * PRESS UNTIL THE APP AGREES. A click before hydration does nothing at
 * all, silently, and a fixed wait is a guess. This presses, waits for the
 * screen to actually change, and presses again if it did not.
 */
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

/**
 * WAIT ON THE SERVER, NOT THE CLOCK. Every answer is saved by a Server
 * Action fired the moment she taps, so a rig that closes the tab a
 * fraction of a second later can close it over a write still in flight.
 * A human never moves that fast; this run does, so it asks the database
 * when the writes have actually landed rather than guessing with a sleep.
 */
async function waitForAnswersStored(service, memberId, definitionId, wanted, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let seen = -1;
  while (Date.now() < deadline) {
    const { data: sessions } = await service
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'in_progress');
    const id = sessions?.[0]?.id;
    if (id) {
      const { count } = await service
        .from('unified_assessment_answers')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', id);
      seen = count ?? 0;
      if (seen >= wanted) return seen;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return seen;
}

/** The one prompt on the screen right now. */
async function currentPrompt(page) {
  const heading = page.locator('main h2').first();
  await heading.waitFor({ state: 'visible', timeout: 20000 });
  return (await heading.textContent())?.trim() ?? '';
}

/** Answer the question on the screen and press Continue. Returns what it asserted. */
async function answerAndContinue(page, question, optionLabel, { last = false, expectNoAdvance = false }) {
  const prompt = await currentPrompt(page);
  const headings = await page.locator('main h2').count();
  /* Case-insensitive on purpose: innerText reports the CSS-transformed
     text, and this label is rendered uppercase. */
  const progressMatch = /question\s+(\d+)\s+of\s+(\d+)/i.exec(await page.locator('main').innerText());
  const progress = progressMatch ? progressMatch[0] : null;

  const row = page.locator('[role="radio"]', { hasText: optionLabel }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });

  const continueButton = page.getByRole('button', { name: last ? 'See your fuel pattern' : 'Continue' });
  const disabledBefore = await continueButton.isDisabled();

  await row.click();
  await page.waitForTimeout(250);
  const checked = await row.getAttribute('aria-checked');

  let promptAfterTap = null;
  if (expectNoAdvance) {
    await page.waitForTimeout(1200);
    promptAfterTap = await currentPrompt(page);
  }

  const enabledAfter = !(await continueButton.isDisabled());
  await continueButton.click();

  return { prompt, headings, progress, disabledBefore, checked, promptAfterTap, enabledAfter };
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured, see CLAUDE.md.');
  mkdirSync(SHOTS, { recursive: true });

  const service = serviceClient();
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const member = users.users.find((u) => u.email === MEMBER_EMAIL);
  if (!member) throw new Error('Test member not found on production.');
  const memberId = member.id;

  const { data: definition } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'fuel-pattern')
    .maybeSingle();
  if (!definition) throw new Error('Fuel Pattern definition missing on production, migration 236 not applied?');

  const primalBefore = await service
    .from('primal_pattern_assessments')
    .select('id', { count: 'exact', head: true });

  const browser = await chromium.launch();
  const errors = [];
  let minted = null;
  const createdSessionIds = new Set();

  try {
    minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: { width: 414, height: 900 } });
    if (!minted) throw new Error('Could not mint a session for the test member.');
    const context = minted.context;

    // ---------- Primal Pattern is gone ----------
    {
      const page = await context.newPage();
      watch(page, errors);

      await page.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const shelf = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check('the Questionnaires library names Primal Pattern nowhere', !/primal/i.test(shelf));
      await page.screenshot({ path: `${SHOTS}/01-library.png`, fullPage: true });

      const hasFuelCard = /Rooted Reset Fuel Pattern Assessment/i.test(shelf);
      note(`Fuel Pattern card on the shelf: ${hasFuelCard ? 'yes' : 'no, the visibility rule has not fired for this member'}`);

      await page.goto(`${BASE}/assessments/primal-pattern-diet-type`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      check('the old overview URL lands on the library instead', new URL(page.url()).pathname === '/questionnaires', page.url());

      await page.goto(`${BASE}/assessments/primal-pattern-diet-type/take`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      check('the old take URL lands on the library instead', new URL(page.url()).pathname === '/questionnaires', page.url());

      const { count: draftsMade } = await service
        .from('primal_pattern_assessments')
        .select('id', { count: 'exact', head: true });
      check('opening the old URLs created no Primal Pattern row', draftsMade === primalBefore.count, `${primalBefore.count} before, ${draftsMade} after`);

      await page.close();
    }

    // ---------- A full sitting ----------
    /**
     * Drives one whole sitting, from the overview to the dashboard.
     *
     * `pauseAfter` closes the tab entirely after that many questions and
     * comes back on a brand new page, which is the only honest test of
     * save and resume: a page kept open proves nothing about what was
     * stored.
     */
    async function runSitting(label, pickWeight, { pauseAfter = null, overrides = {} } = {}) {
      let page = await context.newPage();
      watch(page, errors);

      await page.goto(`${BASE}/assessments/fuel-pattern`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const overview = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check(
        `${label}: the overview names the assessment and its length`,
        /Rooted Reset Fuel Pattern Assessment/.test(overview) && /24 questions/.test(overview),
        overview.slice(0, 120)
      );
      await page.screenshot({ path: `${SHOTS}/${label}-10-overview.png`, fullPage: true });

      const begin = page.getByRole('button', { name: /^(Let's begin|Resume|Take it again)$/ }).first();
      const started = await pressUntil(page, begin, async () => {
        await page.waitForURL(/\/assessments\/fuel-pattern\/take/, { timeout: 8000 });
      });
      check(`${label}: Begin is a button that lands on the take screen`, started, page.url());

      await enterQuestions(page);

      const observed = [];
      for (let i = 0; i < PLAN.length; i++) {
        let question = PLAN[i];

        if (pauseAfter !== null && i === pauseAfter) {
          const stored = await waitForAnswersStored(service, memberId, definition.id, pauseAfter);
          check(
            `${label}: all ${pauseAfter} answers so far had reached the server before the tab closed`,
            stored === pauseAfter,
            `${stored} stored`
          );
          await page.close();
          page = await context.newPage();
          watch(page, errors);
          await page.goto(`${BASE}/assessments/fuel-pattern`, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle').catch(() => {});
          const resumeText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
          check(
            `${label}: a brand new page offers Resume and says how far she got`,
            /Resume/.test(resumeText) && new RegExp(`${pauseAfter} of 24 questions answered`).test(resumeText),
            resumeText.slice(0, 200)
          );
          await page.screenshot({ path: `${SHOTS}/${label}-20-resume.png`, fullPage: true });

          const resume = page.getByRole('button', { name: 'Resume' }).first();
          await pressUntil(page, resume, async () => {
            await page.waitForURL(/\/assessments\/fuel-pattern\/take/, { timeout: 8000 });
          });
          await enterQuestions(page);
          const back = await currentPrompt(page);
          check(
            `${label}: it put her back on the first question she had not answered`,
            back === question.prompt,
            back.slice(0, 80)
          );
          /*
            AND THE RUN CONTINUES FROM WHERE THE APP ACTUALLY PUT HER, not
            from where the rig assumed it would. A rig that carries on
            counting from its own index would answer the wrong question and
            report a failure about the app that was really about itself.
          */
          const resumedAt = PLAN.findIndex((q) => q.prompt === back);
          if (resumedAt >= 0 && resumedAt !== i) {
            note(`resumed at question ${resumedAt + 1}, continuing from there`);
            i = resumedAt;
            question = PLAN[i];
          }
        }

        /* Chosen AFTER the pause branch, because a resume can move which
           question the run is standing on. */
        const wanted = overrides[question.key] ?? pickWeight;
        const option =
          question.options.find((o) => o.weight === wanted) ??
          question.options.find((o) => o.value === wanted) ??
          question.options[0];

        if (i === 0) await page.screenshot({ path: `${SHOTS}/${label}-11-question-1.png`, fullPage: true });
        if (question.key === 'fpa_q24') await page.screenshot({ path: `${SHOTS}/${label}-12-plates.png`, fullPage: true });

        const seen = await answerAndContinue(page, question, option.label, {
          last: i === PLAN.length - 1,
          expectNoAdvance: i === 0 || i === 12,
        });
        observed.push({ key: question.key, ...seen, expected: question.prompt, chose: option.value });
        await page.waitForTimeout(120);
      }

      return await finish(page, label, observed);
    }

    /** The take screen opens on an intro card the first time. Step through it if it is there. */
    async function enterQuestions(page) {
      const intro = page.getByRole('button', { name: /^Let's begin$/ }).first();
      for (let i = 0; i < 12; i++) {
        if (await page.locator('[role="radio"]').first().isVisible().catch(() => false)) return;
        if (await intro.isVisible().catch(() => false)) {
          await intro.click().catch(() => {});
        }
        await page.waitForTimeout(700);
      }
    }

    async function finish(page, label, observed) {
      const oneAtATime = observed.every((o) => o.headings === 1);
      check(
        `${label}: exactly one question was on the screen, all the way through`,
        oneAtATime,
        `${observed.filter((o) => o.headings !== 1).length} screens carried more than one`
      );

      const inOrder = observed.every((o) => o.prompt === o.expected);
      check(
        `${label}: the screens asked the twenty four authored questions, in order`,
        inOrder && observed.length === PLAN.length,
        inOrder ? `${observed.length} screens` : (observed.find((o) => o.prompt !== o.expected)?.prompt ?? '').slice(0, 80)
      );

      const gatedContinue = observed.every((o) => o.disabledBefore === true && o.enabledAfter === true);
      check(
        `${label}: Continue was refused until the question had an answer, and offered after`,
        gatedContinue,
        `${observed.filter((o) => o.disabledBefore !== true).length} screens offered it too early`
      );

      const selectionShows = observed.every((o) => o.checked === 'true');
      check(`${label}: the answer she tapped reported itself selected`, selectionShows);

      const noAutoAdvance = observed
        .filter((o) => o.promptAfterTap !== null)
        .every((o) => o.promptAfterTap === o.prompt);
      check(`${label}: tapping an answer never advanced the screen by itself`, noAutoAdvance);

      const progressSeen = observed.every((o) => o.progress !== null);
      check(`${label}: the progress line said where she was on every screen`, progressSeen);

      /*
        WAIT FOR IT, DO NOT ASK WHETHER IT IS THERE YET. locator.isVisible()
        answers about this instant and ignores a timeout, so asking it while
        the completion is still in flight reports a FAIL the app was about
        to pass. The first run of this script did exactly that on both
        sittings. waitFor genuinely waits.
      */
      const complete = page.getByText('Assessment complete', { exact: false }).first();
      const sawComplete = await complete
        .waitFor({ state: 'visible', timeout: 25000 })
        .then(() => true)
        .catch(() => false);
      check(`${label}: the reveal opens on "Assessment complete"`, sawComplete);
      await page.screenshot({ path: `${SHOTS}/${label}-30-complete.png`, fullPage: true });

      await page.getByText('YOUR FUEL PATTERN', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
      const revealText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      await page.screenshot({ path: `${SHOTS}/${label}-31-pattern.png`, fullPage: true });

      const noNumbers = !/score|confidence/i.test(revealText);
      check(`${label}: the reveal shows her no raw score and no confidence level`, noNumbers, revealText.slice(0, 200));

      const continueHome = page.getByRole('button', { name: /^Continue$/ }).first();
      const wentHome = await pressUntil(page, continueHome, async () => {
        await page.waitForURL(/\/dashboard/, { timeout: 8000 });
      });
      check(`${label}: one Continue returns her to the dashboard`, wentHome, page.url());

      await page.close();
      return revealText;
    }

    // ---------- RUN A ----------
    note('RUN A: protein leaning, with the digestive discomfort answer and a real vitality answer.');
    const revealA = await runSitting('runA', 'protein', {
      pauseAfter: 8,
      overrides: { fpa_q21: 'discomfort_regardless', fpa_q23: 'comes_and_goes' },
    });
    check('RUN A: the reveal names Protein-Supportive', /Protein-Supportive/.test(revealA), revealA.slice(0, 120));
    check('RUN A: the reveal says the pattern is a suggestion, not an instruction', /Your responses suggest/.test(revealA));

    {
      const { data: rows } = await service
        .from('fuel_pattern_results')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });
      const row = rows?.[0];
      for (const r of rows ?? []) createdSessionIds.add(r.session_id);

      check('RUN A: a result row was stored', Boolean(row));
      if (row) {
        check('RUN A: the stored pattern is Protein-Supportive', row.pattern === 'protein_supportive', row.pattern);
        check('RUN A: the row carries a confidence level', ['high', 'moderate', 'low'].includes(row.confidence), row.confidence);
        check(
          'RUN A: the row carries all three raw scores, with protein ahead',
          row.protein_score > row.balanced_score && row.balanced_score > row.carb_score,
          `P ${row.protein_score} / B ${row.balanced_score} / C ${row.carb_score}`
        );
        check('RUN A: the row carries all twenty four of her answers', Object.keys(row.responses ?? {}).length === 24, String(Object.keys(row.responses ?? {}).length));
        check('RUN A: the digestive discomfort answer is stored as a flag', row.digestive_discomfort === true);
        check('RUN A: her vitality answer is stored as it was given', row.vitality_response === 'comes_and_goes', String(row.vitality_response));
        check(
          'RUN A: the discomfort answer left the scoring denominator entirely rather than counting as a zero',
          row.scored_question_count === 22 && row.zero_weight_count === 0,
          `scored ${row.scored_question_count}, zero weight ${row.zero_weight_count}`
        );
        note(`RUN A stored row: ${row.pattern} / ${row.confidence} / P ${row.protein_score} B ${row.balanced_score} C ${row.carb_score}`);
      }
    }

    // ---------- RUN B ----------
    note('RUN B: "it varies" throughout.');
    const revealB = await runSitting('runB', 'neutral');
    check('RUN B: the reveal names Flexible Fuel', /Flexible Fuel/.test(revealB), revealB.slice(0, 120));
    check('RUN B: Flexible Fuel is written as a result, not as a failure', !/unclear|inconclusive|not enough/i.test(revealB));

    {
      const { data: rows } = await service
        .from('fuel_pattern_results')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });
      for (const r of rows ?? []) createdSessionIds.add(r.session_id);
      const row = rows?.[0];
      check('RUN B: a second result row was stored, one per sitting', (rows ?? []).length === 2, `${(rows ?? []).length} rows`);
      if (row) {
        check('RUN B: the stored pattern is Flexible Fuel', row.pattern === 'flexible_fuel', row.pattern);
        check('RUN B: every scored answer carried zero weight', row.zero_weight_count === row.scored_question_count && row.scored_question_count > 0, `${row.zero_weight_count} of ${row.scored_question_count}`);
        note(`RUN B stored row: ${row.pattern} / ${row.confidence} / P ${row.protein_score} B ${row.balanced_score} C ${row.carb_score}`);
      }
    }

    check('no console or page errors on any screen this run touched', errors.length === 0, errors.slice(0, 3).join(' | '));

    // Primal Pattern's own rows are exactly as many as they were.
    const primalAfter = await service
      .from('primal_pattern_assessments')
      .select('id', { count: 'exact', head: true });
    check('every Primal Pattern row is still there, untouched', primalAfter.count === primalBefore.count, `${primalBefore.count} before, ${primalAfter.count} after`);
  } finally {
    // ---------- Cleanup ----------
    const service = serviceClient();
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
    const member = users.users.find((u) => u.email === MEMBER_EMAIL);
    if (member) {
      const { data: sessions } = await service
        .from('unified_assessment_sessions')
        .select('id, assessment_definition_id')
        .eq('member_id', member.id);
      const { data: definition } = await service
        .from('unified_assessment_definitions')
        .select('id')
        .eq('key', 'fuel-pattern')
        .maybeSingle();
      const mine = (sessions ?? []).filter((s) => s.assessment_definition_id === definition?.id).map((s) => s.id);

      await service.from('fuel_pattern_results').delete().eq('member_id', member.id);
      for (const id of mine) {
        await service.from('assessment_attempts').delete().eq('source_id', id);
        await service.from('health_timeline_events').delete().eq('source_record_id', id);
        await service.from('unified_assessment_sessions').delete().eq('id', id);
      }

      const { count: leftoverResults } = await service
        .from('fuel_pattern_results')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member.id);
      const { data: leftoverSessions } = await service
        .from('unified_assessment_sessions')
        .select('id')
        .eq('member_id', member.id)
        .eq('assessment_definition_id', definition?.id ?? '00000000-0000-0000-0000-000000000000');
      check('cleanup: no Fuel Pattern result row is left on production', (leftoverResults ?? 0) === 0, String(leftoverResults));
      check('cleanup: no Fuel Pattern session is left on production', (leftoverSessions ?? []).length === 0, String((leftoverSessions ?? []).length));
    }

    if (minted) await retireSession(minted);
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
