#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the Health Appraisal member experience
 * (Prompt 2 of 3).
 *
 * TWO MODES.
 *
 *   HAQ_LIVE_MODE=baseline   BEFORE the deploy. Read only. Walks every
 *                            existing questionnaire route as the test member
 *                            and records where each lands and what heading
 *                            it shows, to HAQ_BASELINE_FILE (outside the
 *                            repository).
 *   HAQ_LIVE_MODE=journey    AFTER the deploy and migration 263. The whole
 *                            journey, in the order a member and her coach meet
 *                            it:
 *     1  before assignment: the card is on the shelf, LOCKED, Premium marker;
 *        tapping it says the coach sentence; the URL sends her away
 *     2  the coach opens his real client Detail page and presses the real
 *        Assign control on the Health Appraisal row
 *     3  after: unlocked; the intro (framing, definitions); Begin; the help
 *        control reopens the definitions; all 94 screens across ten Parts
 *        with the Part and Section header and "Part X of 10" read on every
 *        one; one section beat watched; one answer changed; Save and exit
 *        midway through Part III and resume to the exact screen with answers
 *        intact; the body map with marks on the front and the back in
 *        different categories and one removed; Complete; the completion
 *     4  the database: one completed instance, 260 responses matching what
 *        was tapped, 21 section results whose colours match the seeded
 *        cutoffs, body map rows matching the marks left, assignment closed
 *     5  no member facing response in the journey carried a hidden value
 *     6  every existing questionnaire route opens exactly as in the baseline
 *
 * WHAT IT LEAVES, ON PURPOSE. The assignment, the completed instance and its
 * marks stay for the owner's phone review and for Prompt 3. It refuses to run
 * if the test member already has a HAQ assignment or instance, so it can
 * never pile a second one on top.
 *
 * Sessions are minted (Turnstile blocks a scripted form sign-in by design)
 * and retired with scope 'local'. Keys arrive as file paths.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   HAQ_LIVE_MODE=journey HAQ_COACH_EMAIL=... HAQ_BASELINE_FILE=/outside/repo/haq-routes.json \
 *   npx tsx scripts/verify-haq-member-live.ts
 */
import { chromium, type Browser, type Page, type Response } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { listMemberFacingAssessments } from '../lib/assessment-registry/registry';
import { buildHaqScreens, haqPartHeading, type HaqScreen } from '../lib/haq/walk';
import { HAQ_DEFINITION_ID, HAQ_LABEL } from '../lib/haq/constants';
import { HAQ_RESPONSE_OPTIONS } from '../lib/haq/questionBank';
import type { HaqQuestion, HaqResponse } from '../lib/haq/types';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.HAQ_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const COACH_EMAIL = process.env.HAQ_COACH_EMAIL;
if (process.env.HAQ_LIVE_MODE !== 'baseline' && !COACH_EMAIL) {
  throw new Error('HAQ_COACH_EMAIL is required: the coach whose caseload the test member is on');
}
const MODE = process.env.HAQ_LIVE_MODE === 'baseline' ? 'baseline' : 'journey';
const BASELINE_FILE = process.env.HAQ_BASELINE_FILE;
if (!BASELINE_FILE) throw new Error('HAQ_BASELINE_FILE is required');
if (BASELINE_FILE.startsWith(process.cwd())) throw new Error('HAQ_BASELINE_FILE must be outside the repository');

const PHONE = { width: 390, height: 844 };
const EM = String.fromCharCode(0x2014);
const LOCK_SENTENCE = "This one opens once your coach assigns it to you. I'll let you know the moment it's ready.";
const FRAMING =
  'Think about how you have felt over the last four months. Choose the response that best describes how often you have experienced each symptom.';
const DEFINITIONS = [
  ['NEVER OR RARELY.', 'You do not normally experience this, or it happens very rarely.'],
  ['SOMETIMES.', 'It comes and goes occasionally.'],
  ['OFTEN.', 'You experience it regularly or several times per week.'],
  [
    'VERY OFTEN.',
    'You experience it very frequently, approximately four or more times per week, daily, or as part of a regular recurring pattern.',
  ],
];
const BODY_MAP_INSTRUCTION =
  'Use the body map to show any areas where you currently experience pain, swelling, discomfort, or noticeable changes in skin color or texture.';
const COMPLETION = 'Health Appraisal complete. Thank you for taking the time.';

const service = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results: Array<{ item: string; pass: boolean; detail: string }> = [];
function record(item: string, pass: boolean, detail = ''): void {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}${detail ? `\n      ${detail}` : ''}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!ok(value) && Date.now() < deadline) {
    await sleep(500);
    value = await read();
  }
  return value;
}

async function go(page: Page, route: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return response?.status() ?? 0;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  return 0;
}

const screenText = (page: Page) =>
  page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');

// ---------------------------------------------------------------------
// Existing questionnaire routes, before and after.
// ---------------------------------------------------------------------

type RouteReading = { route: string; finalPath: string; heading: string };

function questionnaireRoutes(): string[] {
  const fromRegistry = listMemberFacingAssessments().map((entry) => entry.route);
  return [...new Set([...fromRegistry, '/body-systems', '/breathing-check-in', '/health-intake', '/whole-body-signal'])]
    .filter((route) => route !== '/questionnaires')
    .sort();
}

async function readRoutes(page: Page): Promise<RouteReading[]> {
  const out: RouteReading[] = [];
  for (const route of questionnaireRoutes()) {
    await go(page, route);
    await sleep(800);
    const finalPath = new URL(page.url()).pathname;
    const heading = ((await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => '')) ?? '').trim();
    out.push({ route, finalPath, heading });
  }
  return out;
}

// ---------------------------------------------------------------------
// The shelf.
// ---------------------------------------------------------------------

async function haqCard(page: Page) {
  return page.evaluate((title) => {
    const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent?.trim() === title);
    if (!heading) return { found: false as const };
    const section = heading.closest('section');
    const grid = section ? section.querySelector('div.grid') : null;
    let scope: Element = heading;
    if (grid) {
      while (scope.parentElement && scope.parentElement !== grid) scope = scope.parentElement;
      if (scope.parentElement !== grid) scope = section ?? heading.parentElement!;
    } else {
      scope = section ?? heading.parentElement!;
    }
    return {
      found: true as const,
      locked: Boolean(scope.querySelector('button[aria-label*="locked"]')),
      hasMarker: Boolean(scope.querySelector('[aria-label="Locked"]')),
      sectionLabel: section ? (section.querySelector('p')?.textContent ?? '').trim() : '',
      links: Array.from(scope.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? ''),
      text: (scope as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    };
  }, HAQ_LABEL);
}

// ---------------------------------------------------------------------
// The planned answers: varied, so the sections land on different colours.
// ---------------------------------------------------------------------

const screens = buildHaqScreens();

function plannedAnswer(question: HaqQuestion, sectionOrder: number): HaqResponse {
  const options = HAQ_RESPONSE_OPTIONS[question.responseType].map((o) => o.value);
  const band = sectionOrder % 3;
  if (question.responseType === 'yes_no') return band === 2 ? 'yes' : 'no';
  if (band === 0) return options[question.order % 5 === 0 ? 1 : 0]!;
  if (band === 1) return options[question.order % 2 === 0 ? 2 : 1]!;
  return options[question.order % 3 === 0 ? 2 : 3]!;
}

const PLAN = new Map<string, HaqResponse>();
for (const screen of screens) {
  for (const question of screen.questions) PLAN.set(question.key, plannedAnswer(question, screen.section.order));
}

function labelFor(question: HaqQuestion, value: HaqResponse): string {
  return HAQ_RESPONSE_OPTIONS[question.responseType].find((o) => o.value === value)!.label;
}

async function header(page: Page) {
  return page.evaluate(() => ({
    part: document.querySelector('[data-testid="haq-part-heading"]')?.textContent?.trim() ?? '',
    section: document.querySelector('[data-testid="haq-section-title"]')?.textContent?.trim() ?? '',
    progress: document.querySelector('[role="progressbar"]')?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    prompts: Array.from(document.querySelectorAll('ol > li h2')).map((h) => h.textContent?.trim() ?? ''),
    intro: document.querySelector('[data-testid="haq-section-intro"]')?.textContent?.trim() ?? null,
  }));
}

async function waitForScreen(page: Page, screen: HaqScreen) {
  await page.waitForFunction(
    (first) => Array.from(document.querySelectorAll('ol > li h2')).some((h) => h.textContent?.trim() === first),
    screen.questions[0]!.prompt,
    { timeout: 30_000 }
  );
}

async function chooseOption(page: Page, question: HaqQuestion, value: HaqResponse) {
  const block = page.locator('ol > li').filter({ has: page.locator('h2', { hasText: question.prompt }) }).first();
  await block.getByRole('radio', { name: labelFor(question, value), exact: true }).click({ timeout: 15_000 });
}

async function chosenOn(page: Page, question: HaqQuestion): Promise<string | null> {
  const block = page.locator('ol > li').filter({ has: page.locator('h2', { hasText: question.prompt }) }).first();
  const chosen = block.locator('button[aria-checked="true"]');
  return (await chosen.count()) > 0 ? ((await chosen.first().textContent()) ?? '').trim() : null;
}

async function storedResponse(sessionId: string, key: string): Promise<string | null> {
  const { data } = await service
    .from('haq_question_responses')
    .select('selected_response')
    .eq('session_id', sessionId)
    .eq('question_key', key)
    .maybeSingle();
  return (data?.selected_response as string | undefined) ?? null;
}

// ---------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------

async function runBaseline(browser: Browser) {
  const minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!minted) throw new Error('Could not mint a member session');
  try {
    const page = await minted.context.newPage();
    const routes = await readRoutes(page);
    writeFileSync(BASELINE_FILE!, JSON.stringify({ takenAt: new Date().toISOString(), routes }, null, 2));
    for (const reading of routes) console.log(`${reading.route} -> ${reading.finalPath} "${reading.heading}"`);
    record(`baseline: ${routes.length} questionnaire routes recorded`, routes.length > 10);
  } finally {
    await retireSession(minted);
  }
}

async function runJourney(browser: Browser) {
  if (!existsSync(BASELINE_FILE!)) throw new Error('Run HAQ_LIVE_MODE=baseline before the deploy first');
  const baseline = JSON.parse(readFileSync(BASELINE_FILE!, 'utf8')) as { routes: RouteReading[] };

  const member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: PHONE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!member) throw new Error('Could not mint the member session');
  const MEMBER = member.session.user.id as string;
  const { data: profile } = await service.from('profiles').select('is_test').eq('id', MEMBER).maybeSingle();
  if (profile?.is_test !== true) {
    await retireSession(member);
    throw new Error('REFUSING TO RUN: the member is not a test account');
  }

  const { data: runtimeDefinition } = await service
    .from('unified_assessment_definitions')
    .select('id, catalog_definition_id')
    .eq('key', 'haq')
    .single();
  record('0: migration 263 is live: the runtime definition is bridged to the catalog row', runtimeDefinition?.catalog_definition_id === HAQ_DEFINITION_ID);
  const definitionId = runtimeDefinition!.id as string;

  const { count: existingAssignments } = await service
    .from('assessment_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID);
  const { count: existingInstances } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', definitionId);
  if ((existingAssignments ?? 0) > 0 || (existingInstances ?? 0) > 0) {
    await retireSession(member);
    throw new Error('REFUSING TO RUN: the test member already has a HAQ assignment or instance');
  }

  // Every member facing response in the journey, kept for step 5.
  const memberBodies: Array<{ url: string; body: string }> = [];
  const consoleErrors: string[] = [];
  const watch = (page: Page, who: string) => {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${who} ${page.url()}: ${message.text().slice(0, 200)}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${who} ${page.url()}: ${String(error).slice(0, 200)}`));
  };
  const collect = (page: Page) =>
    page.on('response', async (response: Response) => {
      try {
        const url = response.url();
        if (!url.startsWith(BASE)) return;
        const type = response.headers()['content-type'] ?? '';
        if (!/text|json|x-component/.test(type)) return;
        memberBodies.push({ url, body: await response.text() });
      } catch {
        /* a body that could not be read carried nothing */
      }
    });

  let coach: Awaited<ReturnType<typeof mintSessionContext>> = null;

  try {
    const page = await member.context.newPage();
    watch(page, 'member');
    collect(page);

    // -----------------------------------------------------------------
    // 1. Before assignment.
    // -----------------------------------------------------------------
    await go(page, '/questionnaires');
    await page.waitForSelector('h3', { timeout: 30_000 });
    const locked = await haqCard(page);
    record('1: the Health Appraisal card is on the shelf', locked.found);
    if (locked.found) {
      record('1: it is LOCKED', locked.locked, locked.sectionLabel);
      record('1: it carries the gold Premium corner marker', locked.hasMarker);
      record('1: it is filed under Premium', /premium/i.test(locked.sectionLabel), locked.sectionLabel);
      record('1: it offers no way in', !locked.links.includes('/health-appraisal'), locked.links.join(' '));
      record('1: no em dash on the card', !locked.text.includes(EM));
    }
    await page
      .locator(`button[aria-label="${HAQ_LABEL}, locked. Tap to hear from Root about it."]`)
      .first()
      .click({ timeout: 20_000 });
    const sheet = page.getByRole('dialog').first();
    await sheet.waitFor({ state: 'visible', timeout: 15_000 });
    const sheetText = (await sheet.innerText()).replace(/\s+/g, ' ');
    record('1: tapping it shows the coach assignment sentence, word for word', sheetText.includes(LOCK_SENTENCE), sheetText.slice(0, 160));
    record('1: the sheet names no plan and offers no way to buy past it', !/Monthly|24 week|upgrade/i.test(sheetText) && (await page.locator('a[href="/membership"]:visible').count()) === 0);
    await page.keyboard.press('Escape').catch(() => {});

    await go(page, '/health-appraisal');
    await page.waitForURL((url) => url.pathname !== '/health-appraisal', { timeout: 30_000 }).catch(() => {});
    const refusedAt = new URL(page.url()).pathname;
    record('1: a direct URL does not open it', refusedAt !== '/health-appraisal', `landed on ${refusedAt}`);

    // -----------------------------------------------------------------
    // 2. The coach assigns it through his own Detail page.
    // -----------------------------------------------------------------
    coach = await mintSessionContext(browser, COACH_EMAIL!, { baseUrl: BASE, viewport: PHONE });
    if (!coach) throw new Error('Could not mint the coach session');
    const coachPage = await coach.context.newPage();
    watch(coachPage, 'coach');
    await go(coachPage, `/coach/clients/${MEMBER}/detail`);
    const fold = coachPage.getByRole('button', { name: /assessments and findings/i }).first();
    await fold.waitFor({ state: 'visible', timeout: 40_000 });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await coachPage.locator('[data-assessment-row="haq"]').count()) > 0) break;
      await fold.click({ timeout: 10_000 }).catch(() => {});
      await coachPage.waitForSelector('[data-assessment-row="haq"]', { timeout: 2500 }).catch(() => {});
    }
    const row = coachPage.locator('[data-assessment-row="haq"]').first();
    record('2: the Health Appraisal is in the coach\'s assignable list', (await row.count()) > 0);
    record('2: under its own name', ((await row.textContent()) ?? '').includes(HAQ_LABEL));
    await coachPage.locator('[data-assign-toggle="haq"]').first().click({ timeout: 15_000 });
    const form = coachPage.locator('[data-assign-form="haq"]').first();
    await form.waitFor({ state: 'visible', timeout: 25_000 });
    await form.getByRole('button', { name: /^assign$/i }).click({ timeout: 15_000 });
    const assignment = await until(
      async () =>
        (
          // scale-exempt: one test member's HAQ assignments; the run refuses to start unless there are none and writes exactly one
          await service
            .from('assessment_assignments')
            .select('id, status, assigned_by')
            .eq('member_id', MEMBER)
            .eq('assessment_definition_id', HAQ_DEFINITION_ID)
        ).data ?? [],
      (rows) => rows.some((r) => r.status === 'pending')
    );
    record('2: the coach\'s Assign wrote one pending assignment', assignment.length === 1 && assignment[0]!.status === 'pending');

    // -----------------------------------------------------------------
    // 3. After assignment: the whole journey.
    // -----------------------------------------------------------------
    await go(page, '/questionnaires');
    await page.waitForSelector('h3', { timeout: 30_000 });
    const open = await haqCard(page);
    record('3: the card is unlocked', open.found && !open.locked, open.found ? open.sectionLabel : '');
    record('3: filed under Assigned, with a way in', open.found && /assigned/i.test(open.sectionLabel) && open.links.includes('/health-appraisal'));

    await go(page, '/health-appraisal');
    await page.waitForSelector('[data-testid="haq-intro"]', { timeout: 30_000 });
    const intro = await screenText(page);
    record('3: the intro screen shows before question one, with the approved framing', intro.includes(FRAMING) && !intro.includes(screens[0]!.questions[0]!.prompt));
    record('3: the intro carries the four definitions exactly', DEFINITIONS.every(([term, meaning]) => intro.includes(term!) && intro.includes(meaning!)));
    record('3: the intro says there are no right or wrong answers', /no right or wrong answers and nothing to calculate/.test(intro));

    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await waitForScreen(page, screens[0]!);

    await page.locator('[data-testid="haq-definitions-control"]').click();
    const definitions = page.locator('[data-testid="haq-definitions-sheet"]');
    await definitions.waitFor({ state: 'visible', timeout: 15_000 });
    const definitionsText = ((await definitions.innerText()) ?? '').replace(/\s+/g, ' ');
    record('3: the help control reopens the definitions on a question screen', DEFINITIONS.every(([term, meaning]) => definitionsText.includes(term!) && definitionsText.includes(meaning!)));
    await definitions.getByRole('button', { name: 'Got it' }).click();
    await definitions.waitFor({ state: 'detached', timeout: 15_000 });

    const { data: instanceRow } = await service
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'in_progress')
      .single();
    const sessionId = instanceRow!.id as string;

    const partThree = screens.filter((s) => s.partNumber === 3);
    const exitScreen = partThree[Math.floor(partThree.length / 2)]!;
    const changeScreen = screens[1]!;
    const headerFailures: string[] = [];
    const partsSeen = new Set<number>();
    let beatWatched = false;
    let resumed = false;

    for (let index = 0; index < screens.length; index += 1) {
      const screen = screens[index]!;
      await waitForScreen(page, screen);
      const seen = await header(page);
      const expectedPart = haqPartHeading(screen.section);
      if (
        seen.part !== expectedPart ||
        seen.section !== screen.section.title ||
        !seen.progress.includes(`Part ${screen.partNumber} of 10`) ||
        /Question|of 260|remaining/.test(seen.progress) ||
        JSON.stringify(seen.prompts) !== JSON.stringify(screen.questions.map((q) => q.prompt)) ||
        (screen.section.intro ? seen.intro !== screen.section.intro : seen.intro !== null)
      ) {
        headerFailures.push(`screen ${index}: ${JSON.stringify(seen).slice(0, 240)}`);
      }
      partsSeen.add(screen.partNumber);

      for (const question of screen.questions) {
        if (index === changeScreen.index && question === screen.questions[0]) {
          const other = HAQ_RESPONSE_OPTIONS[question.responseType].find((o) => o.value !== PLAN.get(question.key))!.value;
          await chooseOption(page, question, other);
          const first = await until(() => storedResponse(sessionId, question.key), (v) => v === other);
          record('3: an answer is stored the moment it is tapped', first === other, `${question.key} = ${first}`);
        }
        await chooseOption(page, question, PLAN.get(question.key)!);

        if (index === exitScreen.index && !resumed) {
          // Midway through Part III: one answer on this screen, then Save and exit.
          const target = await until(() => storedResponse(sessionId, question.key), (v) => v === PLAN.get(question.key));
          record('3: before exiting, her answer on the Part III screen is stored', target === PLAN.get(question.key));
          await page.getByRole('button', { name: 'Save and exit' }).click();
          await page.waitForURL((url) => url.pathname === '/questionnaires', { timeout: 30_000 });
          record('3: Save and exit leaves for the questionnaires', new URL(page.url()).pathname === '/questionnaires');

          await go(page, '/health-appraisal');
          await waitForScreen(page, screen);
          const back = await header(page);
          record(
            '3: resume lands on the exact screen: Part III, the same Section, the same questions',
            back.part === expectedPart &&
              back.section === screen.section.title &&
              back.progress.includes('Part 3 of 10') &&
              JSON.stringify(back.prompts) === JSON.stringify(screen.questions.map((q) => q.prompt)),
            JSON.stringify(back).slice(0, 200)
          );
          record('3: resume did not show the intro again', (await page.locator('[data-testid="haq-intro"]').count()) === 0);
          record('3: the answer she gave on that screen is still chosen', (await chosenOn(page, question)) === labelFor(question, PLAN.get(question.key)!));
          await page.getByRole('button', { name: 'Back', exact: true }).click();
          const previous = screens[index - 1]!;
          await waitForScreen(page, previous);
          const previousIntact = await Promise.all(previous.questions.map(async (q) => (await chosenOn(page, q)) === labelFor(q, PLAN.get(q.key)!)));
          record('3: and the screen before it still has every answer chosen', previousIntact.every(Boolean));
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          await waitForScreen(page, screen);
          resumed = true;
        }
      }

      const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
      await page.waitForFunction(
        () => {
          const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Continue');
          return button ? !(button as HTMLButtonElement).disabled : false;
        },
        undefined,
        { timeout: 15_000 }
      );
      await continueButton.click();

      const next = screens[index + 1];
      const crosses = !next || next.section.id !== screen.section.id;
      if (crosses && !beatWatched) {
        const beat = page.locator('[data-testid="section-transition"]');
        await beat.waitFor({ state: 'visible', timeout: 10_000 });
        const beatText = ((await beat.textContent()) ?? '').replace(/\s+/g, ' ');
        record(
          '3: a section transition names the real sections',
          beatText.includes(`${screen.section.title} complete`) && beatText.includes(`Next: ${next!.section.title}`),
          beatText
        );
        beatWatched = true;
      }
    }

    record('3: the Part and Section header and "Part X of 10" were right on all 94 screens', headerFailures.length === 0, headerFailures.slice(0, 3).join(' | '));
    record('3: all ten Parts were walked', partsSeen.size === 10);

    // The changed answer ended as the final choice.
    const changedKey = changeScreen.questions[0]!.key;
    const changed = await until(() => storedResponse(sessionId, changedKey), (v) => v === PLAN.get(changedKey));
    record('3: changing an answer replaced the stored response', changed === PLAN.get(changedKey), `${changedKey} = ${changed}`);

    // Body map.
    await page.waitForSelector('[data-testid="haq-body-map"]', { timeout: 30_000 });
    const mapText = await screenText(page);
    record('3: the body map shows the approved instruction', mapText.includes(BODY_MAP_INSTRUCTION));

    const markArea = async (location: string, category: string) => {
      await page.locator(`[data-location="${location}"]`).first().click({ timeout: 15_000 });
      const categorySheet = page.locator('[data-testid="haq-body-category-sheet"]');
      await categorySheet.waitFor({ state: 'visible', timeout: 15_000 });
      await categorySheet.getByRole('button', { name: category, exact: true }).click();
      await categorySheet.waitFor({ state: 'detached', timeout: 15_000 });
      await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('[data-testid="haq-body-map"] button')).some((b) => (b as HTMLButtonElement).disabled),
        undefined,
        { timeout: 20_000 }
      );
    };
    await markArea('left_knee', 'Swelling');
    await markArea('abdomen', 'Discomfort');
    await page.getByRole('group', { name: 'Body view' }).getByRole('button', { name: 'Back', exact: true }).click();
    await markArea('lower_back', 'Pain');
    await markArea('right_shoulder_back', 'Skin change');

    // scale-exempt: one instance's marks, capped at HAQ_BODY_MAP_MARK_LIMIT (80) by the add route
    const marksBefore = await service.from('haq_body_map_entries').select('id').eq('session_id', sessionId);
    record('3: four marks were stored, on the front and the back', (marksBefore.data ?? []).length === 4);

    const lowerBack = page.locator('[data-testid="haq-body-marks"] li').filter({ hasText: 'Lower back (back)' }).first();
    await lowerBack.getByRole('button', { name: 'Remove' }).click();
    await page.locator('[data-testid="haq-body-marks"] li').filter({ hasText: 'Lower back (back)' }).waitFor({ state: 'detached', timeout: 20_000 });
    const marksAfter = await until(
      // scale-exempt: one instance's marks, capped at HAQ_BODY_MAP_MARK_LIMIT (80) by the add route
      async () => (await service.from('haq_body_map_entries').select('id').eq('session_id', sessionId)).data ?? [],
      (rows) => rows.length === 3
    );
    record('3: removing a mark removed it', marksAfter.length === 3);

    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await page.waitForSelector('[data-testid="haq-completion"]', { timeout: 60_000 });
    const done = await screenText(page);
    record('3: the completion screen shows the approved statement', done.includes(COMPLETION));
    record('3: and that her coach can now see her responses', done.includes('Your coach can now see your responses.'));
    const completionCard = ((await page.locator('[data-testid="haq-completion"]').innerText()) ?? '').replace(/\s+/g, ' ');
    record('3: with no result, colour or number on it', !/\d|Doing Well|Needs Attention|High Attention/.test(completionCard), completionCard);

    // -----------------------------------------------------------------
    // 4. The database.
    // -----------------------------------------------------------------
    // scale-exempt: one test member's HAQ instances; the run refuses to start unless there are none and opens one
    const { data: instances } = await service
      .from('unified_assessment_sessions')
      .select('id, status')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', definitionId);
    record('4: exactly one instance, and it is completed', instances?.length === 1 && instances[0]!.status === 'completed', JSON.stringify(instances));

    // scale-exempt: one instance's responses, at most 260, one per question
    const { data: responses } = await service
      .from('haq_question_responses')
      .select('question_key, section_id, selected_response, hidden_value')
      .eq('session_id', sessionId)
      .order('question_key');
    record('4: 260 responses', responses?.length === 260, `${responses?.length}`);
    const mismatched = (responses ?? []).filter((r) => PLAN.get(r.question_key as string) !== r.selected_response);
    record('4: every stored response is the answer that was tapped', mismatched.length === 0, mismatched.slice(0, 3).map((m) => m.question_key).join(', '));

    const [{ data: sectionResults }, { data: cutoffs }] = await Promise.all([
      // scale-exempt: one instance's section results, exactly 21, one per section
      service.from('haq_section_results').select('section_id, raw_total, result_color, member_result_label').eq('session_id', sessionId),
      // scale-exempt: 21 rows, one per section, fixed by migration 262
      service.from('haq_section_cutoffs').select('section_id, green_max, yellow_max'),
    ]);
    record('4: 21 section results', sectionResults?.length === 21, `${sectionResults?.length}`);
    const colourProblems: string[] = [];
    const colours: Record<string, number> = {};
    for (const result of sectionResults ?? []) {
      const total = (responses ?? [])
        .filter((r) => r.section_id === result.section_id)
        .reduce((sum, r) => sum + (r.hidden_value as number), 0);
      const cutoff = (cutoffs ?? []).find((c) => c.section_id === result.section_id)!;
      const expected = total <= cutoff.green_max ? 'green' : total <= cutoff.yellow_max ? 'yellow' : 'red';
      colours[result.result_color as string] = (colours[result.result_color as string] ?? 0) + 1;
      if (result.raw_total !== total || result.result_color !== expected) {
        colourProblems.push(`${result.section_id}: stored ${result.raw_total}/${result.result_color}, expected ${total}/${expected}`);
      }
    }
    record('4: every section colour matches the seeded cutoffs for its own total', colourProblems.length === 0, colourProblems.join(' | ') || JSON.stringify(colours));

    // scale-exempt: one instance's marks, capped at HAQ_BODY_MAP_MARK_LIMIT (80) by the add route
    const { data: marks } = await service
      .from('haq_body_map_entries')
      .select('body_location, body_side, issue_type')
      .eq('session_id', sessionId)
      .order('body_location');
    const expectedMarks = [
      { body_location: 'abdomen', body_side: 'front', issue_type: 'discomfort' },
      { body_location: 'left_knee', body_side: 'front', issue_type: 'swelling' },
      { body_location: 'right_shoulder_back', body_side: 'back', issue_type: 'skin_change' },
    ];
    record('4: body map rows match the marks left in place', JSON.stringify(marks) === JSON.stringify(expectedMarks), JSON.stringify(marks));

    // scale-exempt: one test member's HAQ assignments; the run refuses to start unless there are none and writes exactly one
    const { data: closed } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', HAQ_DEFINITION_ID);
    record('4: the assignment closed on completion', closed?.length === 1 && closed[0]!.status === 'completed');

    // -----------------------------------------------------------------
    // 5. No member facing payload carried a hidden value.
    // -----------------------------------------------------------------
    const haqBodies = memberBodies.filter((b) => /\/health-appraisal|\/api\/haq\/|\/questionnaires/.test(b.url));
    const leaks = haqBodies.filter((b) =>
      /hidden_value|hiddenValue|raw_total|green_max|yellow_max|result_color|member_result_label|Doing Well|Needs Attention|High Attention|Moderate Priority/.test(b.body)
    );
    record(`5: none of the ${haqBodies.length} member facing responses carried a value, total, cutoff or result`, haqBodies.length > 100 && leaks.length === 0, leaks.slice(0, 2).map((l) => l.url).join(' '));
    const apiBodies = memberBodies.filter((b) => b.url.includes('/api/haq/'));
    const numericApi = apiBodies.filter((b) => /:\s*-?\d/.test(b.body));
    record(`5: none of the ${apiBodies.length} answer and body map responses carried any number`, apiBodies.length >= 260 && numericApi.length === 0, numericApi.slice(0, 2).map((n) => n.body).join(' '));

    // -----------------------------------------------------------------
    // 6. Every existing questionnaire route opens as before.
    // -----------------------------------------------------------------
    const after = await readRoutes(page);
    const changedRoutes = baseline.routes.filter((before) => {
      const now = after.find((r) => r.route === before.route);
      if (!now || now.finalPath !== before.finalPath) return true;
      // Home's heading is a greeting that changes with the time of day, so a
      // route that sends her Home is compared by where it sent her.
      return before.finalPath !== '/dashboard' && now.heading !== before.heading;
    });
    record(`6: all ${baseline.routes.length} existing questionnaire routes open exactly as before`, changedRoutes.length === 0 && after.length === baseline.routes.length, changedRoutes.map((r) => r.route).join(', '));

    record('no console or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    await retireSession(member);
    if (coach) await retireSession(coach);
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (MODE === 'baseline') await runBaseline(browser);
    else await runJourney(browser);
  } catch (error) {
    record('the run completed without throwing', false, String(error).slice(0, 400));
  } finally {
    await browser.close();
    const passed = results.filter((r) => r.pass).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  }
}

void main();
