#!/usr/bin/env node
/**
 * Build 2 of the Rooted Reset Fuel Pattern Assessment, driven end to end
 * on production: the reveal, the result page and the coach card.
 *
 * WHAT ONLY A LIVE RUN CAN PROVE. The source tests prove the observation
 * engine, the copy and the payload fence. They cannot prove that the
 * deployed reveal actually holds on "Assessment complete." before her
 * pattern arrives, that nothing behind the page bounces her forward, that
 * the seven sections land in the brief's order on a real phone viewport,
 * that the observation lines on the screen are the ones her real stored
 * answers support, or that a coach opening her real client page sees the
 * card. Every one of those is driven here.
 *
 * THREE FULL SITTINGS, and the expectations come from the real engines
 * rather than from a second hand-typed copy: run
 * scripts/print-fuel-pattern-expectations.mjs first and point
 * FPA_EXPECT_FILE at what it wrote. The answers this run gives and the
 * expectations it asserts are built by the same rule in that one file.
 *
 *   RUN A  protein leaning, with two response tendencies, one "it
 *          varies", the digestive discomfort answer and a real vitality
 *          answer. Must read Protein-Supportive.
 *   RUN B  "it varies" on everything. Must read Flexible Fuel.
 *   RUN C  balanced leaning but genuinely mixed, vitality declined. Must
 *          read Balanced Fuel with a DIFFERENT observation set from A.
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
import { selectAllRows, listAllAuthUsers } from '../lib/data/pagedSelect.ts';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const COACH_EMAIL = process.env.TEST_COACH_EMAIL;
const EXPECT = JSON.parse(readFileSync(process.env.FPA_EXPECT_FILE, 'utf8'));
const PLAN = EXPECT.questions;
/* Under .verify/, which .gitignore covers: these are pictures of a real
   member's screens and are never committed. */
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/fuel-pattern-results';

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

/** GO THERE, AND BE SURE YOU ARRIVED: the first navigation can race the session cookie. */
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

/*
  INNERTEXT REPORTS THE CSS TRANSFORMED TEXT, which is the standing trap
  on any surface that styles a label `uppercase`. Every structural heading
  on the coach card is uppercase in CSS and sentence case in the source,
  so a case sensitive `includes` reports a FAIL about a heading that is
  plainly on the screen. The first run of this script did exactly that,
  four times. Member copy is compared exactly, because those strings are
  authored in the case they are rendered in.
*/
const hasLoosely = (haystack, needle) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

async function mainText(page) {
  return flat(await page.locator('main').innerText());
}

async function currentPrompt(page) {
  const heading = page.locator('main h2').first();
  await heading.waitFor({ state: 'visible', timeout: 20000 });
  return (await heading.textContent())?.trim() ?? '';
}

async function answerAndContinue(page, optionLabel, { last = false }) {
  const row = page.locator('[role="radio"]', { hasText: optionLabel }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.click();
  await page.waitForTimeout(160);
  const button = page.getByRole('button', {
    name: last ? 'See your fuel pattern' : 'Continue',
  });
  await button.click();
}

/** The take screen opens on an intro card the first time. Step through it if it is there. */
async function enterQuestions(page) {
  const intro = page.getByRole('button', { name: /^Let's begin$/ }).first();
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[role="radio"]').first().isVisible().catch(() => false)) return;
    if (await intro.isVisible().catch(() => false)) await intro.click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

/** Every approved observation line, so a line she should NOT be shown can be looked for. */
const ALL_OBSERVATION_LINES = [
  ...new Set(EXPECT.runs.flatMap((r) => r.observations.map((o) => o.text))),
];

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

  const { data: definition } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'fuel-pattern')
    .maybeSingle();
  if (!definition) throw new Error('Fuel Pattern definition missing on production.');

  const primalBefore = await service
    .from('primal_pattern_assessments')
    .select('id', { count: 'exact', head: true });

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

    /** One whole sitting, from the overview through the result page to the dashboard. */
    async function runSitting(expect) {
      const label = expect.label;
      const page = await context.newPage();
      watch(page, errors);

      const onOverview = await goTo(page, '/assessments/fuel-pattern');
      check(`${label}: the overview is reachable as the signed in member`, onOverview, page.url());

      const begin = page
        .getByRole('button', { name: /^(Let's begin|Resume|Take it again)$/ })
        .first();
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

      // ---------- BEAT ONE ----------
      const complete = page.getByText('Assessment complete.', { exact: false }).first();
      const sawComplete = await complete
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      check(`${label}: the reveal opens on "Assessment complete."`, sawComplete);
      const beatOne = await mainText(page);
      check(
        `${label}: her pattern name is NOT on the screen yet`,
        !beatOne.includes(expect.patternLabel),
        beatOne.slice(0, 120)
      );
      await page.screenshot({ path: `${SHOTS}/${label}-10-complete.png`, fullPage: true });

      // ---------- BEAT TWO ----------
      /*
        READ IT THE MOMENT THE NAME LANDS. The third beat is nearly two
        seconds behind the second, so a read taken as soon as the name is
        visible is comfortably inside the window where the name should be
        the focal point and the rest of the page should not exist yet.
        Asking afterwards would prove only that both eventually arrived.
      */
      await page
        .getByText(expect.patternLabel, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 40000 });
      const beatTwo = await mainText(page);
      check(
        `${label}: the eyebrow and her pattern name are the focal point`,
        beatTwo.includes('YOUR FUEL PATTERN') && beatTwo.includes(expect.patternLabel),
        beatTwo.slice(0, 160)
      );
      check(
        `${label}: the rest of the page is NOT on the screen yet`,
        !beatTwo.includes(EXPECT.headers.range) && !beatTwo.includes(EXPECT.headers.watchFor),
        beatTwo.slice(0, 200)
      );
      await page.screenshot({ path: `${SHOTS}/${label}-10b-pattern.png`, fullPage: true });

      // ---------- BEAT THREE ----------
      await page
        .getByText(EXPECT.headers.range, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 40000 });

      // ---------- THE PAGE HOLDS ----------
      const urlAtReveal = page.url();
      await page.waitForTimeout(6000);
      const stillThere = await mainText(page);
      check(
        `${label}: nothing behind the page moved her on, six seconds later`,
        page.url() === urlAtReveal && stillThere.includes(expect.patternLabel),
        page.url()
      );

      const text = await mainText(page);
      await page.screenshot({ path: `${SHOTS}/${label}-11-result-top.png`, fullPage: true });

      // ---------- THE ORDER ----------
      const marks = [
        ['pattern name', expect.patternLabel],
        ['interpretation', expect.interpretation],
        ['why this pattern fits you', EXPECT.headers.why],
        ['your starting range', EXPECT.headers.range],
        ['your starting plate', EXPECT.headers.plate],
        ['what Rooted Reset will watch for', EXPECT.headers.watchFor],
      ];
      const positions = marks.map(([, fragment]) => text.indexOf(fragment));
      const allPresent = positions.every((p) => p > -1);
      check(
        `${label}: every section of the result page is on the screen`,
        allPresent,
        marks.filter((_, i) => positions[i] === -1).map(([n]) => n).join(', ')
      );
      const inOrder =
        allPresent && positions.every((p, i) => i === 0 || p > positions[i - 1]);
      check(`${label}: the sections are in the brief's order, top to bottom`, inOrder, positions.join(','));

      // ---------- THE OBSERVATIONS ----------
      const expectedLines = expect.observations.map((o) => o.text);
      const shown = ALL_OBSERVATION_LINES.filter((line) => text.includes(line));
      check(
        `${label}: exactly the lines her answers support are shown, and no others`,
        shown.length === expectedLines.length && expectedLines.every((l) => shown.includes(l)),
        `${shown.length} shown, ${expectedLines.length} expected`
      );
      const shownInOrder =
        expectedLines.length < 2 ||
        expectedLines.every((l, i) => i === 0 || text.indexOf(l) > text.indexOf(expectedLines[i - 1]));
      check(`${label}: they are printed strongest first`, shownInOrder);
      check(
        `${label}: the section leads with "You told us:"`,
        expectedLines.length === 0 || text.indexOf(EXPECT.headers.whyLeadIn) > text.indexOf(EXPECT.headers.why),
        String(text.indexOf(EXPECT.headers.whyLeadIn))
      );
      for (const observation of expect.observations) {
        note(
          `${label} observation "${observation.id}" supported by ${observation.supporting
            .map((s) => `${s.questionKey}=${s.answer}`)
            .join('; ')}`
        );
      }

      // ---------- THE RANGE AND THE PLATE ----------
      const rangeOk = expect.range.rows.every(
        (row) => text.includes(row.nutrient) && text.includes(row.level)
      );
      check(
        `${label}: the starting range matches the pattern, in words`,
        rangeOk,
        expect.range.rows.map((r) => `${r.nutrient} ${r.level}`).join(', ')
      );
      check(
        `${label}: the range says it is a starting point and not a prescription`,
        text.includes(EXPECT.rangeFootnote)
      );
      if (expect.range.extraLine) {
        check(`${label}: Flexible Fuel carries its own extra line`, text.includes(expect.range.extraLine));
      }

      const plateOk =
        expect.plate.segments.every((s) => text.includes(s.label) && text.includes(s.proportion)) &&
        text.includes(expect.plate.addition);
      check(
        `${label}: the plate names every segment in words, plus healthy fat`,
        plateOk,
        expect.plate.segments.map((s) => `${s.proportion} ${s.label}`).join(', ')
      );
      /* The plate, by its own viewBox: `main svg` also counts the Home
         link's icon, which is not a plate and never was. */
      const plates = await page.locator('main svg[viewBox="0 0 100 100"]').count();
      check(`${label}: exactly one plate is drawn`, plates === 1, String(plates));
      if (expect.plate.caption) {
        check(`${label}: the Flexible plate is captioned`, text.includes(expect.plate.caption));
      }

      // ---------- WHAT IT WATCHES FOR, AND WHAT IT NEVER PROMISES ----------
      check(
        `${label}: the forward look is the shared block with her pattern name in it`,
        text.includes(expect.watchFor)
      );
      const lower = text.toLowerCase();
      const promised = [
        'experiment',
        'check-in',
        'check in',
        'coming soon',
        '7 day',
        '7-day',
        'seven day',
        'meal plan',
        'log your meals',
        'meal feedback',
      ].filter((w) => lower.includes(w));
      check(
        `${label}: it promises no experiment, no check-in and no meal feedback`,
        promised.length === 0,
        promised.join(', ')
      );

      // ---------- WHAT SHE IS NEVER SHOWN ----------
      const leaked = ['score', 'confidence', 'tendency'].filter((w) => lower.includes(w));
      check(`${label}: no raw score and no confidence level anywhere`, leaked.length === 0, leaked.join(', '));
      const digits = text.match(/[0-9]/g);
      check(
        `${label}: no number of any kind on the page`,
        digits === null,
        digits ? digits.join('') : ''
      );
      check(`${label}: no em dash anywhere on the page`, !text.includes('—'));

      /*
        AND THEY REALLY DO APPEAR WHEN SHE SCROLLS.

        THIS CHECK EXISTS BECAUSE THE ONE ABOVE IT CANNOT FAIL ON ITS OWN.
        The supporting sections mount at opacity 0 and fade in as they
        reach the viewport, and innerText reports the text of an element
        at opacity 0 exactly as it reports any other. So every assertion
        so far would pass against a page whose whole lower half never
        became visible, which the first full page screenshot of this run
        showed is a real state the page can be in. This scrolls the way a
        member scrolls and asks the browser what it actually painted.
      */
      for (let y = 0; y < 14; y++) {
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(1200);
      const painted = await page.evaluate(() => {
        /* The effective opacity of an element is the product of every
           opacity between it and the page, so the wrapper that is fading
           it in is accounted for wherever it sits. */
        function effectiveOpacity(node) {
          let value = 1;
          let current = node;
          while (current && current !== document.body) {
            value *= Number(getComputedStyle(current).opacity);
            current = current.parentElement;
          }
          return Number(value.toFixed(3));
        }
        return [...document.querySelectorAll('main section')].map((section) => ({
          head: (section.textContent ?? '').trim().slice(0, 28),
          opacity: effectiveOpacity(section),
        }));
      });
      check(
        `${label}: every section really is painted once she has scrolled past it`,
        painted.length >= 5 && painted.every((p) => p.opacity === 1),
        painted.map((p) => `${p.head}=${p.opacity}`).join(' | ')
      );

      await page.screenshot({ path: `${SHOTS}/${label}-12-result-full.png`, fullPage: true });

      // ---------- OUT ----------
      const continueHome = page.getByRole('button', { name: /^Continue$/ }).first();
      const wentHome = await pressUntil(page, continueHome, async () => {
        await page.waitForURL(/\/dashboard/, { timeout: 8000 });
      });
      check(`${label}: one Continue returns her to the dashboard`, wentHome, page.url());
      await page.close();
    }

    for (const expect of EXPECT.runs) {
      note(`${expect.label}: expecting ${expect.patternLabel}`);
      await runSitting(expect);

      const { rows } = await selectAllRows(() =>
        service
          .from('fuel_pattern_results')
          .select('*')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
      );
      const row = rows?.[0];
      check(`${expect.label}: the stored row carries the pattern she was shown`, row?.pattern === expect.pattern, String(row?.pattern));
      check(
        `${expect.label}: the stored scores and confidence are what the engine says`,
        row?.confidence === expect.coach.confidenceLabel.toLowerCase() &&
          row?.protein_score === expect.coach.scores.protein &&
          row?.balanced_score === expect.coach.scores.balanced &&
          row?.carb_score === expect.coach.scores.carb,
        `${row?.confidence} / P ${row?.protein_score} B ${row?.balanced_score} C ${row?.carb_score}`
      );
    }

    // ---------- A REVISIT SKIPS THE REVEAL ----------
    {
      const page = await context.newPage();
      watch(page, errors);
      await goTo(page, '/assessments/fuel-pattern');
      const seeResults = page.getByRole('link', { name: 'See your results' }).first();
      const opened = await pressUntil(page, seeResults, async () => {
        await page.waitForURL(/\/assessments\/fuel-pattern\/results\//, { timeout: 8000 });
      });
      check('a revisit through "See your results" opens her stored reading', opened, page.url());

      /*
        SAMPLE IT, DO NOT TAKE ONE READING. Reading once the instant the
        URL changes can land on the route's loading state and report an
        empty page, and waiting for the page to settle first would hide a
        reveal that played and finished in the meantime. So every frame
        from arrival to settled is sampled: "Assessment complete." must
        appear in NONE of them, and the finished page must be in the last.
      */
      const samples = [];
      const deadline = Date.now() + 12000;
      let settled = '';
      const latest = EXPECT.runs[EXPECT.runs.length - 1];
      while (Date.now() < deadline) {
        const now = await mainText(page).catch(() => '');
        samples.push(now);
        if (now.includes(latest.patternLabel) && now.includes(EXPECT.headers.watchFor)) {
          settled = now;
          break;
        }
        await page.waitForTimeout(150);
      }
      check(
        'the revisit never replays "Assessment complete.", in any frame from arrival to settled',
        samples.every((t) => !t.includes('Assessment complete.')),
        `${samples.length} frames sampled`
      );
      check(
        'the revisit renders the whole page, with no pause',
        settled.includes(latest.patternLabel) &&
          settled.includes(EXPECT.headers.range) &&
          settled.includes(EXPECT.headers.watchFor),
        settled.slice(0, 160) || 'never settled'
      );
      check(
        'the revisit shows the same observation lines as the sitting did',
        latest.observations.every((o) => settled.includes(o.text))
      );
      await page.screenshot({ path: `${SHOTS}/90-revisit.png`, fullPage: true });
      await page.close();
    }

    check('no console or page errors on any member screen this run touched', errors.length === 0, errors.slice(0, 3).join(' | '));

    // ---------- THE COACH ----------
    {
      mintedCoach = await mintSessionContext(browser, COACH_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 900, height: 1200 },
      });
      if (!mintedCoach) throw new Error('Could not mint a session for the coach.');
      const page = await mintedCoach.context.newPage();
      const coachErrors = [];
      watch(page, coachErrors);

      const onDetail = await goTo(page, `/coach/clients/${memberId}/detail`);
      check('the coach reaches his own client detail page', onDetail, page.url());

      const header = page.locator('#detail-section-assessments button').first();
      const opened = await pressUntil(page, header, async () => {
        await page
          .locator('#detail-card-fuel-pattern')
          .waitFor({ state: 'visible', timeout: 6000 });
      });
      check('the Fuel Pattern card is inside Assessments and Findings', opened);

      const card = page.locator('#detail-card-fuel-pattern');
      await card.scrollIntoViewIfNeeded();
      const cardText = flat(await card.innerText());
      await card.screenshot({ path: `${SHOTS}/95-coach-card.png` });

      const newest = EXPECT.runs[EXPECT.runs.length - 1];
      check('the card names the assessment', hasLoosely(cardText, 'Rooted Reset Fuel Pattern Assessment'));
      check(
        'the card shows the newest pattern and its confidence',
        cardText.includes(newest.patternLabel) &&
          cardText.includes(`Confidence: ${newest.coach.confidenceLabel}`),
        cardText.slice(0, 200)
      );
      check(
        'the card shows all three raw scores',
        cardText.includes(String(newest.coach.scores.protein)) &&
          cardText.includes(String(newest.coach.scores.balanced)) &&
          cardText.includes(String(newest.coach.scores.carb)),
        `P ${newest.coach.scores.protein} B ${newest.coach.scores.balanced} C ${newest.coach.scores.carb}`
      );

      // Pattern over time: every one of the three sittings, newest first.
      check(
        'every sitting is listed over time, newest first',
        hasLoosely(cardText, 'Pattern over time') &&
          EXPECT.runs.every((r) => cardText.includes(r.patternLabel)),
        cardText.slice(cardText.toLowerCase().indexOf('pattern over time')).slice(0, 220)
      );

      // The other sittings are reachable by their own chips, and RUN A is
      // where the tendencies, the ambiguous areas and the discomfort flag
      // actually live.
      const runA = EXPECT.runs[0];
      const chips = card.locator('button');
      const chipCount = await chips.count();
      check('each sitting has its own chip on the card', chipCount >= EXPECT.runs.length, String(chipCount));
      const switched = await pressUntil(page, chips.last(), async () => {
        const t = flat(await card.innerText());
        if (!t.includes(runA.patternLabel) || !hasLoosely(t, 'Digestive discomfort')) {
          throw new Error('not switched yet');
        }
      });
      check('the oldest sitting can be opened from its chip', switched);

      const aText = flat(await card.innerText());
      await card.screenshot({ path: `${SHOTS}/96-coach-card-runA.png` });
      check(
        'RUN A: the discomfort flag is shown as a coaching signal that moved nothing',
        aText.includes(runA.coach.digestiveDiscomfortNote),
        hasLoosely(aText, 'Digestive discomfort') ? 'flag and note both present' : 'no flag at all'
      );
      check(
        'RUN A: her response tendencies are shown in plain language',
        runA.coach.tendencyLines.every((line) => aText.includes(line)),
        runA.coach.tendencyLines.join(' | ')
      );
      check(
        'RUN A: the ambiguous and mixed areas are listed by question',
        hasLoosely(aText, 'Ambiguous and mixed areas') &&
          runA.coach.ambiguous.every((a) => aText.includes(`Q${a.order}.`)),
        runA.coach.ambiguous
          .map((a) => `Q${a.order} ${aText.includes(`Q${a.order}.`) ? 'found' : 'MISSING'}`)
          .join(', ')
      );
      check(
        'RUN A: her vitality answer is shown exactly as she gave it',
        aText.includes(runA.coach.vitalityLine),
        runA.coach.vitalityLine
      );

      const runC = EXPECT.runs[2];
      const backToC = await pressUntil(page, chips.first(), async () => {
        const t = flat(await card.innerText());
        if (!t.includes(runC.coach.vitalityLine)) throw new Error('not switched yet');
      });
      check(
        'RUN C: a declined vitality answer reads "Preferred not to answer"',
        backToC && runC.coach.vitalityLine === 'Preferred not to answer'
      );

      check('no console or page errors on the coach page', coachErrors.length === 0, coachErrors.slice(0, 3).join(' | '));
      await page.close();
    }

    const primalAfter = await service
      .from('primal_pattern_assessments')
      .select('id', { count: 'exact', head: true });
    check(
      'every Primal Pattern row is still there, untouched',
      primalAfter.count === primalBefore.count,
      `${primalBefore.count} before, ${primalAfter.count} after`
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

    if (member2 && definition2) {
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

      const { count: leftoverResults } = await service2
        .from('fuel_pattern_results')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member2.id);
      const { rows: leftoverSessions } = await selectAllRows(() =>
        service2
          .from('unified_assessment_sessions')
          .select('id')
          .eq('member_id', member2.id)
          .eq('assessment_definition_id', definition2.id)
          .order('id', { ascending: true })
      );
      check('cleanup: no Fuel Pattern result row is left on production', (leftoverResults ?? 0) === 0, String(leftoverResults));
      check('cleanup: no Fuel Pattern session is left on production', (leftoverSessions ?? []).length === 0, String((leftoverSessions ?? []).length));
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
