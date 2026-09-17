#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the Health Appraisal results, the coach's
 * reading, a real retake and the history (Prompt 3 of 3).
 *
 * FOUR MODES, RUN IN THIS ORDER.
 *
 *   HAQ3_MODE=before   Read only, and the only one that may run before the
 *                      retake. Her results page for the sitting she already
 *                      has, the coach's card and his full reading of that
 *                      sitting, and a FINGERPRINT of everything the database
 *                      holds about it, written to HAQ3_STATE_FILE outside the
 *                      repository. That fingerprint is what "byte for byte
 *                      identical" is measured against afterwards.
 *   HAQ3_MODE=retake   Writes. The coach assigns the Health Appraisal again
 *                      through his own real control, she walks all 94 screens
 *                      reading the new Part name and Section name headers,
 *                      marks at least three areas across the front and the
 *                      back, removes one, and completes.
 *   HAQ3_MODE=after    Read only. Her results page with its trend chips and
 *                      comparison line, the coach's two sittings with their
 *                      per section previous versus current comparison, the
 *                      first sitting still byte for byte what it was, no
 *                      hidden number in any member facing payload, and every
 *                      existing questionnaire route unchanged.
 *   HAQ3_MODE=routes   Read only. Records where every existing questionnaire
 *                      route lands, for the `after` comparison. Run it once,
 *                      before the retake.
 *
 * IT REFUSES TO RUN ON A REAL MEMBER. Every mode checks profiles.is_test.
 * `retake` additionally refuses unless she already has exactly one completed
 * sitting and no open assignment or instance, so it can never pile a second
 * open instance on top of one.
 *
 * WHAT IT LEAVES, ON PURPOSE: both sittings, for the owner's phone review.
 *
 * Sessions are minted (Turnstile blocks a scripted form sign-in by design)
 * and retired with scope 'local'. Keys arrive as file paths.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   HAQ3_MODE=before HAQ3_STATE_FILE=/outside/repo/haq3-state.json \
 *   npx tsx scripts/verify-haq-results-live.ts
 */
import { chromium, type Browser, type Page, type Response } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { listMemberFacingAssessments } from '../lib/assessment-registry/registry';
import { buildHaqScreens, haqScreenHeading, type HaqScreen } from '../lib/haq/walk';
import { HAQ_DEFINITION_ID, HAQ_LABEL } from '../lib/haq/constants';
import { HAQ_PARTS, HAQ_RESPONSE_OPTIONS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import type { HaqQuestion, HaqResponse } from '../lib/haq/types';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.HAQ_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MODE = (process.env.HAQ3_MODE ?? 'before') as 'before' | 'retake' | 'finish' | 'after' | 'routes';
const STATE_FILE = process.env.HAQ3_STATE_FILE;
if (!STATE_FILE) throw new Error('HAQ3_STATE_FILE is required');
if (STATE_FILE.startsWith(process.cwd())) throw new Error('HAQ3_STATE_FILE must be outside the repository');

const PHONE = { width: 390, height: 844 };
const EM = String.fromCharCode(0x2014);

/* THE APPROVED WORDING, a second copy, so a reworded constant fails here. */
const RESULTS_TITLE = 'HEALTH APPRAISAL RESULTS';
const RESULTS_INTRO =
  'Your answers help show which areas are currently quieter and which may deserve more attention.';
const EXPLANATIONS: Record<'green' | 'yellow' | 'red', string> = {
  green: 'This area is currently showing fewer reported concerns.',
  yellow: 'This area is showing enough reported signals to be worth paying attention to.',
  red: 'This area is showing a stronger group of reported concerns and may be worth reviewing more closely with your coach or healthcare professional.',
};
const COMPARISON_LINE = 'Compared with your previous Health Appraisal, based on what you reported.';
const LABELS: Record<'green' | 'yellow' | 'red', string> = {
  green: 'Doing Well',
  yellow: 'Needs Attention',
  red: 'High Attention',
};

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

async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 45_000): Promise<T> {
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
// The database, through the service role: what the screens are checked against.
// ---------------------------------------------------------------------

type StoredResult = {
  section_id: string;
  raw_total: number;
  result_color: 'green' | 'yellow' | 'red';
  member_result_label: string;
  original_priority: string;
};

async function runtimeDefinitionId(): Promise<string> {
  const { data } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'haq')
    .single();
  return data!.id as string;
}

async function completedSittings(memberId: string, definitionId: string) {
  // scale-exempt: one test member's completed HAQ instances, at most two in this run
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  return (data ?? []) as Array<{ id: string; completed_at: string | null }>;
}

async function storedResults(sessionId: string): Promise<StoredResult[]> {
  // scale-exempt: one sitting's section results, exactly 21 rows, fixed by the instrument
  const { data } = await service
    .from('haq_section_results')
    .select('section_id, raw_total, result_color, member_result_label, original_priority')
    .eq('session_id', sessionId)
    .limit(21);
  return (data ?? []) as StoredResult[];
}

/** Everything the database holds about one sitting, ordered, as one string. */
async function fingerprint(sessionId: string): Promise<string> {
  const [session, responses, sections, marks, answers] = await Promise.all([
    service
      .from('unified_assessment_sessions')
      .select('id, member_id, assessment_definition_id, assessment_version, status, started_at, completed_at')
      .eq('id', sessionId)
      .single(),
    // scale-exempt: one sitting's answer records, exactly 260 rows, fixed by the instrument
    service
      .from('haq_question_responses')
      .select('question_key, part_id, section_id, question_version, response_type, selected_response, hidden_value, answered_at')
      .eq('session_id', sessionId)
      .order('question_key')
      .limit(260),
    // scale-exempt: one sitting's section results, exactly 21 rows, fixed by the instrument
    service
      .from('haq_section_results')
      .select('section_id, raw_total, result_color, member_result_label, original_priority, haq_version, computed_at')
      .eq('session_id', sessionId)
      .order('section_id')
      .limit(21),
    // scale-exempt: one sitting's body map marks, capped at 80 by lib/haq/data.ts
    service
      .from('haq_body_map_entries')
      .select('body_location, body_side, issue_type, created_at')
      .eq('session_id', sessionId)
      .order('created_at')
      .order('id')
      .limit(80),
    // scale-exempt: one sitting's runtime answers, exactly 260 rows, fixed by the instrument
    service
      .from('unified_assessment_answers')
      .select('question_id, value')
      .eq('session_id', sessionId)
      .order('question_id')
      .limit(260),
  ]);
  return JSON.stringify({
    session: session.data,
    responses: responses.data,
    sections: sections.data,
    marks: marks.data,
    answers: answers.data,
  });
}

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
    await sleep(700);
    const finalPath = new URL(page.url()).pathname;
    const heading = ((await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => '')) ?? '').trim();
    out.push({ route, finalPath, heading });
  }
  return out;
}

// ---------------------------------------------------------------------
// The state file.
// ---------------------------------------------------------------------

type State = {
  takenAt: string;
  memberId: string;
  firstSessionId: string;
  firstFingerprint: string;
  firstCounts: Record<'green' | 'yellow' | 'red', number>;
  firstColors: Record<string, 'green' | 'yellow' | 'red'>;
  routes?: RouteReading[];
};

function readState(): State {
  if (!existsSync(STATE_FILE!)) throw new Error('Run HAQ3_MODE=before first');
  return JSON.parse(readFileSync(STATE_FILE!, 'utf8')) as State;
}

function writeState(next: Partial<State>): void {
  const current = existsSync(STATE_FILE!) ? (JSON.parse(readFileSync(STATE_FILE!, 'utf8')) as State) : ({} as State);
  writeFileSync(STATE_FILE!, JSON.stringify({ ...current, ...next }, null, 2));
}

// ---------------------------------------------------------------------
// Her results page, read from the screen.
// ---------------------------------------------------------------------

async function readResultsPage(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="haq-result-card-"]')).map((node) => ({
      sectionId: (node.getAttribute('data-testid') ?? '').replace('haq-result-card-', ''),
      text: (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      trend: (node.querySelector('[data-testid^="haq-trend-"]')?.textContent ?? '').trim() || null,
    }));
    return {
      title: (document.querySelector('h1')?.textContent ?? '').trim(),
      body: document.body.innerText.replace(/\s+/g, ' ').trim(),
      summary: (
        document.querySelector('[data-testid="haq-results-summary"]') as HTMLElement | null
      )?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      comparisonLine:
        (document.querySelector('[data-testid="haq-results-comparison-line"]')?.textContent ?? '').trim() || null,
      cards,
    };
  });
}

function checkResultsPage(
  seen: Awaited<ReturnType<typeof readResultsPage>>,
  expected: Record<string, 'green' | 'yellow' | 'red'>,
  options: { withTrend: boolean; step: string }
) {
  const { step } = options;
  record(`${step}: the page title is exactly "${RESULTS_TITLE}"`, seen.title === RESULTS_TITLE, seen.title);
  record(`${step}: the approved intro line, word for word`, seen.body.includes(RESULTS_INTRO));

  const counts = { red: 0, yellow: 0, green: 0 };
  for (const color of Object.values(expected)) counts[color] += 1;
  const areas = (n: number) => (n === 1 ? '1 area' : `${n} areas`);
  record(
    `${step}: the summary reads High Attention ${areas(counts.red)}, Needs Attention ${areas(counts.yellow)}, Doing Well ${areas(counts.green)}`,
    seen.summary.includes(`${LABELS.red} ${areas(counts.red)}`) &&
      seen.summary.includes(`${LABELS.yellow} ${areas(counts.yellow)}`) &&
      seen.summary.includes(`${LABELS.green} ${areas(counts.green)}`),
    seen.summary
  );
  record(`${step}: the three counts sum to 21`, counts.red + counts.yellow + counts.green === 21);

  record(`${step}: one card per section, 21 of them`, seen.cards.length === 21, `${seen.cards.length} cards`);

  const rank = { red: 0, yellow: 1, green: 2 } as const;
  const order = seen.cards.map((card) => rank[expected[card.sectionId] ?? 'green']);
  record(
    `${step}: the cards stand Red, then Yellow, then Green`,
    order.every((value, index) => index === 0 || order[index - 1]! <= value),
    seen.cards.map((c) => `${c.sectionId}:${expected[c.sectionId]}`).join(' ')
  );

  /*
    CASE INSENSITIVE, AND ONLY FOR THAT REASON. The member label is drawn as
    a small uppercase eyebrow, so innerText reports "HIGH ATTENTION" while
    the DOM and the database both hold "High Attention". The words are what
    is being checked, not the letter case a stylesheet chose.
  */
  const wrong: string[] = [];
  for (const card of seen.cards) {
    const color = expected[card.sectionId];
    const title = HAQ_SECTIONS.find((section) => section.id === card.sectionId)?.title ?? '';
    const flat = card.text.toLowerCase();
    if (
      !color ||
      !flat.includes(title.toLowerCase()) ||
      !flat.includes(LABELS[color].toLowerCase()) ||
      !flat.includes(EXPLANATIONS[color].toLowerCase())
    ) {
      wrong.push(card.sectionId);
    }
  }
  record(
    `${step}: every card carries its section name, its own label and the approved explanation for its colour`,
    wrong.length === 0,
    wrong.join(' ')
  );

  // NO NUMBER BUT THE THREE COUNTS. A raw total, a percentage or a grade
  // would show up here as a digit that is not one of them.
  const digits = (seen.body.match(/\d+/g) ?? []).filter((value) => value !== '');
  const allowed = new Set([String(counts.red), String(counts.yellow), String(counts.green)]);
  const strays = digits.filter((value) => !allowed.has(value));
  record(`${step}: no number on the page but her own three counts`, strays.length === 0, strays.join(' '));
  record(
    `${step}: no percentage, total, overall result or priority word`,
    !/%|overall|out of|total|Low Priority|Moderate Priority|High Priority|grade/i.test(seen.body)
  );
  record(`${step}: it describes reported areas, never a condition`, !/diagnos|disease|disorder|you have /i.test(seen.body));
  record(`${step}: no em dash anywhere on it`, !seen.body.includes(EM));

  if (options.withTrend) {
    record(`${step}: the comparison line stands at the top, word for word`, seen.comparisonLine === COMPARISON_LINE, seen.comparisonLine ?? 'missing');
    // The chip is an uppercase pill too, so it is read case insensitively.
    const chips = seen.cards.map((card) => (card.trend === null ? null : card.trend.toLowerCase()));
    record(`${step}: every card carries a trend chip`, chips.every((chip) => chip !== null), `${chips.filter(Boolean).length} of ${chips.length}`);
    record(
      `${step}: each chip is Quieter, Unchanged or Louder`,
      chips.every((chip) => chip === null || ['quieter', 'unchanged', 'louder'].includes(chip)),
      [...new Set(chips)].join(' ')
    );
    record(`${step}: never framed as improvement or deterioration`, !/improv|worse|better|deteriorat|recover|relaps/i.test(seen.body));
  } else {
    record(`${step}: no trend chip, because she has only one sitting`, seen.cards.every((card) => card.trend === null));
    record(`${step}: and no comparison line`, seen.comparisonLine === null);
  }
}

// ---------------------------------------------------------------------
// The coach's reading, read from the screen.
// ---------------------------------------------------------------------

async function openCoachDetail(page: Page, memberId: string) {
  await go(page, `/coach/clients/${memberId}/detail`);
  const fold = page.getByRole('button', { name: /assessments and findings/i }).first();
  await fold.waitFor({ state: 'visible', timeout: 60_000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await page.locator('[data-testid="haq-sitting-list"]').count()) > 0) break;
    if ((await page.locator('[data-assessment-row="haq"]').count()) === 0) {
      await fold.click({ timeout: 10_000 }).catch(() => {});
    }
    await page.waitForSelector('[data-testid="haq-sitting-list"]', { timeout: 2500 }).catch(() => {});
  }
}

async function readCoachSitting(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="haq-coach-section-"]')).map((node) => {
      const sectionId = (node.getAttribute('data-testid') ?? '').replace('haq-coach-section-', '');
      const previous = node.querySelector(`[data-testid="haq-coach-previous-${sectionId}"]`);
      return {
        sectionId,
        total: (node.querySelector(`[data-testid="haq-coach-total-${sectionId}"]`)?.textContent ?? '').trim(),
        text: (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        previous: previous ? (previous as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : null,
        answers: Array.from(node.querySelectorAll('ol > li')).map((li) =>
          (li as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
        ),
      };
    })
  );
}

// ---------------------------------------------------------------------
// The walk, for the retake.
// ---------------------------------------------------------------------

const screens = buildHaqScreens();

/** A different plan from the first sitting, so the retake really moves some sections. */
function plannedAnswer(question: HaqQuestion, sectionOrder: number): HaqResponse {
  const options = HAQ_RESPONSE_OPTIONS[question.responseType].map((option) => option.value);
  const band = (sectionOrder + 1) % 3;
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
  return HAQ_RESPONSE_OPTIONS[question.responseType].find((option) => option.value === value)!.label;
}

async function waitForScreen(page: Page, screen: HaqScreen) {
  await page.waitForFunction(
    (first) => Array.from(document.querySelectorAll('ol > li h2')).some((h) => h.textContent?.trim() === first),
    screen.questions[0]!.prompt,
    { timeout: 40_000 }
  );
}

async function header(page: Page) {
  return page.evaluate(() => ({
    part: document.querySelector('[data-testid="haq-part-heading"]')?.textContent?.trim() ?? null,
    section: document.querySelector('[data-testid="haq-section-title"]')?.textContent?.trim() ?? '',
    progress:
      document.querySelector('[role="progressbar"]')?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }));
}

async function chooseOption(page: Page, question: HaqQuestion, value: HaqResponse) {
  const block = page.locator('ol > li').filter({ has: page.locator('h2', { hasText: question.prompt }) }).first();
  await block.getByRole('radio', { name: labelFor(question, value), exact: true }).click({ timeout: 20_000 });
}

// ---------------------------------------------------------------------
// Guards.
// ---------------------------------------------------------------------

async function requireTestMember(memberId: string) {
  const { data } = await service.from('profiles').select('is_test').eq('id', memberId).maybeSingle();
  if (data?.is_test !== true) throw new Error('REFUSING TO RUN: the member is not a test account');
}

async function assignedCoachOf(memberId: string): Promise<string> {
  // scale-exempt: one member's active coach assignments, one row by the product
  const { data } = await service
    .from('coach_client_assignments')
    .select('coach_id')
    .eq('client_id', memberId)
    .eq('status', 'active')
    .limit(5);
  const coachId = (data ?? [])[0]?.coach_id as string | undefined;
  if (!coachId) throw new Error('The test member has no active coach');
  const { data: user } = await service.auth.admin.getUserById(coachId);
  const email = user?.user?.email;
  if (!email) throw new Error('Could not read the assigned coach email');
  return email;
}

// ---------------------------------------------------------------------
// Modes.
// ---------------------------------------------------------------------

function watch(page: Page, who: string, consoleErrors: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${who} ${page.url()}: ${message.text().slice(0, 200)}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${who} ${page.url()}: ${String(error).slice(0, 200)}`));
}

function collect(page: Page, bodies: Array<{ url: string; body: string }>) {
  page.on('response', async (response: Response) => {
    try {
      const url = response.url();
      if (!url.startsWith(BASE)) return;
      const type = response.headers()['content-type'] ?? '';
      if (!/text|json|x-component/.test(type)) return;
      bodies.push({ url, body: await response.text() });
    } catch {
      /* a body that could not be read carried nothing */
    }
  });
}

async function runRoutes(browser: Browser) {
  const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!member) throw new Error('Could not mint a member session');
  try {
    await requireTestMember(member.session.user.id as string);
    const page = await member.context.newPage();
    const routes = await readRoutes(page);
    writeState({ routes });
    record(`routes: ${routes.length} existing questionnaire routes recorded`, routes.length > 10);
  } finally {
    await retireSession(member);
  }
}

async function runBefore(browser: Browser) {
  const consoleErrors: string[] = [];
  const bodies: Array<{ url: string; body: string }> = [];

  const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!member) throw new Error('Could not mint a member session');
  const memberId = member.session.user.id as string;
  await requireTestMember(memberId);

  let coach: Awaited<ReturnType<typeof mintSessionContext>> = null;
  try {
    const definitionId = await runtimeDefinitionId();
    const sittings = await completedSittings(memberId, definitionId);
    record('1: the test member has exactly one completed sitting to read', sittings.length === 1, `${sittings.length}`);
    const first = sittings[0]!;
    const stored = await storedResults(first.id);
    record('1: it has all 21 stored section results', stored.length === 21, `${stored.length}`);
    const expected = Object.fromEntries(stored.map((row) => [row.section_id, row.result_color])) as Record<
      string,
      'green' | 'yellow' | 'red'
    >;
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const row of stored) counts[row.result_color] += 1;
    console.log(`      the database says ${counts.red} Red, ${counts.yellow} Yellow, ${counts.green} Green`);

    // --- 2. Her results page.
    const page = await member.context.newPage();
    watch(page, 'member', consoleErrors);
    collect(page, bodies);

    await go(page, '/questionnaires');
    await page.waitForSelector('h3', { timeout: 40_000 });
    const cardHref = await page.evaluate((title) => {
      const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent?.trim() === title);
      const scope = heading?.closest('section');
      return Array.from(scope?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href') ?? '');
    }, HAQ_LABEL);
    record(
      '2: her finished card on the shelf points at the results page',
      cardHref.includes('/health-appraisal/results'),
      cardHref.join(' ')
    );

    /*
      THE SECOND NAVIGATION OF A RUN CAN LAND ON A COLD LAMBDA, so this asks
      again rather than reporting a missing button that is really a slow
      page. A screen that is genuinely absent still fails, after three tries.
    */
    let seeResultsHref: string | null = null;
    for (let attempt = 0; attempt < 3 && seeResultsHref === null; attempt += 1) {
      await go(page, '/health-appraisal');
      await page.waitForSelector('[data-testid="haq-completion"]', { timeout: 40_000 }).catch(() => {});
      seeResultsHref = await page
        .locator('[data-testid="haq-see-results"]')
        .first()
        .getAttribute('href', { timeout: 15_000 })
        .catch(() => null);
    }
    record(
      '2: the completion screen carries a "See your results" button, pointing at her results page',
      seeResultsHref === '/health-appraisal/results',
      seeResultsHref ?? 'no button found'
    );
    if (seeResultsHref !== null) {
      await page.locator('[data-testid="haq-see-results"]').first().click({ timeout: 20_000 });
      await page.waitForURL((url) => url.pathname === '/health-appraisal/results', { timeout: 40_000 }).catch(() => {});
    } else {
      await go(page, '/health-appraisal/results');
    }
    await page.waitForSelector('[data-testid="haq-results"]', { timeout: 40_000 });
    checkResultsPage(await readResultsPage(page), expected, { withTrend: false, step: '2' });

    // --- 3. The coach.
    const coachEmail = await assignedCoachOf(memberId);
    coach = await mintSessionContext(browser, coachEmail, { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
    if (!coach) throw new Error('Could not mint the coach session');
    const coachPage = await coach.context.newPage();
    watch(coachPage, 'coach', consoleErrors);

    await openCoachDetail(coachPage, memberId);
    const list = coachPage.locator('[data-testid="haq-sitting-list"]');
    record('3: the sitting is listed on the client Detail page', (await list.count()) > 0);
    const listText = (await list.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    record(
      `3: the list says ${counts.red} High Attention, ${counts.yellow} Needs Attention, ${counts.green} Doing Well`,
      listText.includes(`${counts.red} High Attention`) &&
        listText.includes(`${counts.yellow} Needs Attention`) &&
        listText.includes(`${counts.green} Doing Well`),
      listText.slice(0, 200)
    );

    await go(coachPage, `/coach/clients/${memberId}/health-appraisal/${first.id}`);
    await coachPage.waitForSelector('[data-testid="haq-coach-sitting-meta"]', { timeout: 40_000 });
    const meta = (await coachPage.locator('[data-testid="haq-coach-sitting-meta"]').innerText()).replace(/\s+/g, ' ');
    record('3: the sitting names its completion date and haq_v1', /haq_v1/.test(meta) && /Completed/.test(meta), meta);

    // Open every disclosure, so the question detail is really on the page.
    await coachPage.evaluate(() => {
      document.querySelectorAll('details').forEach((node) => node.setAttribute('open', 'open'));
    });
    await sleep(500);
    const sections = await readCoachSitting(coachPage);
    record('3: all 21 sections are on the sitting', sections.length === 21, `${sections.length}`);

    const byId = new Map(stored.map((row) => [row.section_id, row]));
    const mismatched: string[] = [];
    for (const section of sections) {
      const row = byId.get(section.sectionId);
      // Case insensitive for the label and the priority only: both are drawn
      // as small uppercase chips, so innerText reports them in capitals while
      // the DOM and the database hold the real words. The raw total is
      // compared exactly, because a number has no case.
      const flat = section.text.toLowerCase();
      if (
        !row ||
        section.total !== String(row.raw_total) ||
        !flat.includes(row.member_result_label.toLowerCase()) ||
        !flat.includes(row.original_priority.toLowerCase())
      ) {
        mismatched.push(section.sectionId);
      }
    }
    record(
      '3: every raw total, label and priority on his screen equals the database row',
      mismatched.length === 0,
      mismatched.join(' ')
    );

    const rank = { red: 0, yellow: 1, green: 2 } as const;
    const coachOrder = sections.map((section) => rank[byId.get(section.sectionId)!.result_color]);
    record(
      '3: the sections stand Red, then Yellow, then Green',
      coachOrder.every((value, index) => index === 0 || coachOrder[index - 1]! <= value)
    );

    // The highest scoring responses first, read from the rendered list.
    const outOfOrder: string[] = [];
    let totalAnswers = 0;
    for (const section of sections) {
      totalAnswers += section.answers.length;
      const values = section.answers.map((line) => {
        const match = line.match(/(\d+)\s*$/);
        return match ? Number(match[1]) : Number.NaN;
      });
      if (values.some(Number.isNaN)) {
        outOfOrder.push(`${section.sectionId} (unreadable)`);
      } else if (values.some((value, index) => index > 0 && values[index - 1]! < value)) {
        outOfOrder.push(section.sectionId);
      } else {
        const sum = values.reduce((a, b) => a + b, 0);
        if (sum !== byId.get(section.sectionId)!.raw_total) outOfOrder.push(`${section.sectionId} (sum ${sum})`);
      }
    }
    record('3: every section expands to all 260 answers between them', totalAnswers === 260, `${totalAnswers}`);
    record(
      '3: the answers stand highest value first, and add up to the stored total',
      outOfOrder.length === 0,
      outOfOrder.join(' ')
    );

    // scale-exempt: one sitting's body map marks, capped at 80 by lib/haq/data.ts
    const { data: marks } = await service
      .from('haq_body_map_entries')
      .select('body_location, body_side, issue_type')
      .eq('session_id', first.id)
      .limit(80);
    const bodyMapText = (await coachPage.locator('[data-testid="haq-coach-body-map"]').innerText()).replace(/\s+/g, ' ');
    record('3: the body map shows both of her marks from the first sitting', (marks ?? []).length === 2, `${(marks ?? []).length} marks`);
    record(
      '3: the front and the back views are both drawn',
      (await coachPage.locator('[data-testid="haq-body-reading-front"]').count()) === 1 &&
        (await coachPage.locator('[data-testid="haq-body-reading-back"]').count()) === 1
    );
    record(
      '3: and it is said to be not scored, apart from the sections',
      /not scored/i.test(bodyMapText),
      bodyMapText.slice(0, 160)
    );

    record('2 and 3: no console or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    writeState({
      takenAt: new Date().toISOString(),
      memberId,
      firstSessionId: first.id,
      firstFingerprint: await fingerprint(first.id),
      firstCounts: counts,
      firstColors: expected,
    });
    record('1: the first sitting is fingerprinted, for the retake check', true);
  } finally {
    await retireSession(member);
    if (coach) await retireSession(coach);
  }
}

async function runRetake(browser: Browser) {
  const state = readState();
  const consoleErrors: string[] = [];
  const bodies: Array<{ url: string; body: string }> = [];

  const member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: PHONE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!member) throw new Error('Could not mint a member session');
  const memberId = member.session.user.id as string;
  await requireTestMember(memberId);

  const definitionId = await runtimeDefinitionId();
  // scale-exempt: one test member's open HAQ instances, at most one by migration 99's unique index
  const { count: open } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .eq('status', 'in_progress');
  // scale-exempt: one test member's pending HAQ assignments
  const { count: pending } = await service
    .from('assessment_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID)
    .eq('status', 'pending');
  if ((open ?? 0) > 0 || (pending ?? 0) > 0) {
    await retireSession(member);
    throw new Error('REFUSING TO RUN: the test member already has an open HAQ assignment or instance');
  }

  let coach: Awaited<ReturnType<typeof mintSessionContext>> = null;
  try {
    // --- 4a. The coach re-assigns through his own real control.
    const coachEmail = await assignedCoachOf(memberId);
    coach = await mintSessionContext(browser, coachEmail, { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
    if (!coach) throw new Error('Could not mint the coach session');
    const coachPage = await coach.context.newPage();
    watch(coachPage, 'coach', consoleErrors);
    await go(coachPage, `/coach/clients/${memberId}/detail`);
    const fold = coachPage.getByRole('button', { name: /assessments and findings/i }).first();
    await fold.waitFor({ state: 'visible', timeout: 60_000 });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await coachPage.locator('[data-assessment-row="haq"]').count()) > 0) break;
      await fold.click({ timeout: 10_000 }).catch(() => {});
      await coachPage.waitForSelector('[data-assessment-row="haq"]', { timeout: 2500 }).catch(() => {});
    }
    await coachPage.locator('[data-assign-toggle="haq"]').first().click({ timeout: 20_000 });
    const form = coachPage.locator('[data-assign-form="haq"]').first();
    await form.waitFor({ state: 'visible', timeout: 30_000 });
    await form.getByRole('button', { name: /^assign$/i }).click({ timeout: 20_000 });
    const assignment = await until(
      async () =>
        (
          // scale-exempt: one test member's pending HAQ assignments
          await service
            .from('assessment_assignments')
            .select('id, status')
            .eq('member_id', memberId)
            .eq('assessment_definition_id', HAQ_DEFINITION_ID)
            .eq('status', 'pending')
            .limit(5)
        ).data ?? [],
      (rows) => rows.length > 0
    );
    record('4: the coach re-assigned it through his own Assign control', assignment.length === 1);

    // --- 4b. She walks the whole thing again.
    const page = await member.context.newPage();
    watch(page, 'member', consoleErrors);
    collect(page, bodies);

    await go(page, '/health-appraisal');
    await page.waitForSelector('[data-testid="haq-intro"]', { timeout: 40_000 });
    await page.getByRole('button', { name: 'Begin', exact: true }).click();
    await waitForScreen(page, screens[0]!);

    const newSession = await until(
      async () =>
        (
          // scale-exempt: one test member's open HAQ instances, at most one by migration 99's unique index
          await service
            .from('unified_assessment_sessions')
            .select('id')
            .eq('member_id', memberId)
            .eq('assessment_definition_id', definitionId)
            .eq('status', 'in_progress')
            .limit(5)
        ).data ?? [],
      (rows) => rows.length > 0
    );
    record('4: Begin opened a NEW instance, beside the first', newSession.length === 1 && newSession[0]!.id !== state.firstSessionId);
    const secondSessionId = newSession[0]!.id as string;

    const headerFailures: string[] = [];
    const partNamesSeen = new Set<string>();
    for (let index = 0; index < screens.length; index += 1) {
      const screen = screens[index]!;
      await waitForScreen(page, screen);
      const seen = await header(page);
      const expected = haqScreenHeading(screen);
      const printed = `${seen.part ?? ''} ${seen.section}`;
      if (
        seen.part !== expected.eyebrow ||
        seen.section !== expected.title ||
        // THE ROMAN NUMERAL HAS LEFT THE HEADER.
        /\bPart\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/.test(printed) ||
        /Section [A-D]/.test(printed) ||
        !seen.progress.includes(`Part ${screen.partNumber} of 10`)
      ) {
        headerFailures.push(`screen ${index}: ${JSON.stringify(seen)} wanted ${JSON.stringify(expected)}`);
      }
      partNamesSeen.add(screen.part.name);

      for (const question of screen.questions) await chooseOption(page, question, PLAN.get(question.key)!);
      await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 20_000 });
      if (index < screens.length - 1) await sleep(60);
    }
    record(
      `4: the Part name and Section name header is right on all ${screens.length} screens, with no roman numeral`,
      headerFailures.length === 0,
      headerFailures.slice(0, 3).join(' | ')
    );
    record('4: all ten Part names were read', partNamesSeen.size === 10, [...partNamesSeen].join(', '));
    record(
      '4: a Part holding one section is named once',
      HAQ_PARTS.filter((part) => HAQ_SECTIONS.filter((s) => s.partId === part.id).length === 1).every((part) =>
        partNamesSeen.has(part.name)
      )
    );

    await bodyMapOnwards(page, secondSessionId, bodies, consoleErrors);
  } finally {
    await retireSession(member);
    if (coach) await retireSession(coach);
  }
}

/**
 * THE BODY MAP, THE COMPLETION AND THE PAYLOAD CHECK, on an instance whose
 * 260 answers have already landed.
 *
 * Its own function because it is also the whole of `finish` mode: a run whose
 * answering half succeeded and whose body map half did not is not a reason to
 * sit a third instance on a real member's account.
 */
async function bodyMapOnwards(
  page: Page,
  secondSessionId: string,
  bodies: Array<{ url: string; body: string }>,
  consoleErrors: string[]
) {
  {
    // --- 4c. The body map: marks across front and back, and a removal.
    await page.waitForSelector('[data-testid="haq-body-map"]', { timeout: 60_000 });
    const marksToMake = [
      { view: 'front' as const, location: 'chest', category: 'Pain' },
      { view: 'front' as const, location: 'left_knee', category: 'Swelling' },
      { view: 'back' as const, location: 'lower_back', category: 'Discomfort' },
      { view: 'back' as const, location: 'right_shoulder_back', category: 'Skin change' },
    ];
    /*
      ONE MARK AT A TIME, AND EACH ONE CONFIRMED BEFORE THE NEXT.
      A first run marked four areas 600ms apart and found three: a tap that
      lands while the category sheet is still closing is a tap the sheet
      swallows, and the mark is then never even attempted. That is the
      automation's pacing, not the product's writing, and pacing that invents
      a lost mark is worse than no check at all. A mark that genuinely does
      not arrive within fifteen seconds is still reported.
    */
    const markFailures: string[] = [];
    for (const [index, mark] of marksToMake.entries()) {
      // SCOPED TO THE MAP'S OWN VIEW TOGGLE. The walk's Back button carries
      // the same accessible name, so an unscoped lookup is ambiguous.
      await page
        .locator('[role="group"][aria-label="Body view"]')
        .getByRole('button', { name: mark.view === 'front' ? 'Front' : 'Back', exact: true })
        .click({ timeout: 20_000 });
      await sleep(400);
      await page.locator(`[data-location="${mark.location}"]`).first().click({ timeout: 20_000 });
      await page.getByRole('button', { name: mark.category, exact: true }).click({ timeout: 20_000 });
      const landed = await until(
        async () =>
          (
            // scale-exempt: one sitting's body map marks, capped at 80 by lib/haq/data.ts
            await service.from('haq_body_map_entries').select('id').eq('session_id', secondSessionId).limit(80)
          ).data ?? [],
        (rows) => rows.length >= index + 1,
        15_000
      );
      if (landed.length < index + 1) markFailures.push(`${mark.view}/${mark.location}`);
      await sleep(300);
    }
    const afterAdds = await until(
      async () =>
        (
          // scale-exempt: one sitting's body map marks, capped at 80 by lib/haq/data.ts
          await service.from('haq_body_map_entries').select('id').eq('session_id', secondSessionId).limit(80)
        ).data ?? [],
      (rows) => rows.length >= marksToMake.length
    );
    record('4: every mark landed as it was made', markFailures.length === 0, markFailures.join(' '));
    record(
      `4: all ${marksToMake.length} marks across the front and the back were stored (the Prompt 2 fix, live)`,
      afterAdds.length === marksToMake.length,
      `${afterAdds.length} stored`
    );
    const failureLine = await page.locator('text=/didn\\u2019t save|didn\'t save/').count();
    record('4: and no mark reported a failure on screen', failureLine === 0);

    /*
      ONE REMOVAL, COUNTED DOWN FROM WHAT WAS REALLY THERE. Counting down
      from what was INTENDED let a stale first read satisfy the wait before
      the delete had even committed, which reported a pass on a number that
      was about to change.
    */
    const beforeRemove = afterAdds.length;
    await page.getByRole('button', { name: 'Remove', exact: true }).first().click({ timeout: 20_000 });
    const afterRemove = await until(
      async () =>
        (
          // scale-exempt: one sitting's body map marks, capped at 80 by lib/haq/data.ts
          await service.from('haq_body_map_entries').select('id').eq('session_id', secondSessionId).limit(80)
        ).data ?? [],
      (rows) => rows.length === beforeRemove - 1,
      20_000
    );
    record(
      '4: removing one mark removed exactly one',
      afterRemove.length === beforeRemove - 1,
      `${beforeRemove} before, ${afterRemove.length} after`
    );

    // --- 4d. Complete.
    await page.getByRole('button', { name: 'Complete', exact: true }).click({ timeout: 30_000 });
    await page.waitForSelector('[data-testid="haq-completion"]', { timeout: 90_000 });
    const completionText = await screenText(page);
    record('4: the completion screen shows, with no colour, label or number on it', !/Doing Well|Needs Attention|High Attention/.test(completionText) && !/\d/.test(completionText.replace(/Health Appraisal/g, '')));

    const finished = await until(
      async () =>
        (
          // scale-exempt: one instance by its own primary key
          await service.from('unified_assessment_sessions').select('status').eq('id', secondSessionId).limit(1)
        ).data ?? [],
      (rows) => rows[0]?.status === 'completed'
    );
    record('4: the second sitting is completed', finished[0]?.status === 'completed');
    const secondResults = await storedResults(secondSessionId);
    record('4: it wrote its own 21 section results', secondResults.length === 21, `${secondResults.length}`);

    record('4: no console or page errors during the retake', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    // --- 6. No hidden number in any member facing payload of the whole walk.
    const leaked = bodies.filter(({ body }) =>
      /"hidden_value"|"raw_total"|"green_max"|"yellow_max"|"original_priority"/.test(body)
    );
    record('6: no member facing payload in the retake carried a hidden value', leaked.length === 0, leaked.slice(0, 2).map((b) => b.url).join(' '));

    writeState({ secondSessionId } as unknown as Partial<State>);
  }
}

/**
 * `finish` mode: her open instance already holds all 260 answers, so this
 * opens the route (which resumes her at the body map) and runs from there.
 */
async function runFinish(browser: Browser) {
  const consoleErrors: string[] = [];
  const bodies: Array<{ url: string; body: string }> = [];
  const member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: PHONE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!member) throw new Error('Could not mint a member session');
  const memberId = member.session.user.id as string;
  await requireTestMember(memberId);
  try {
    const definitionId = await runtimeDefinitionId();
    // scale-exempt: one test member's open HAQ instances, at most one by migration 99's unique index
    const { data: open } = await service
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'in_progress')
      .limit(5);
    const secondSessionId = (open ?? [])[0]?.id as string | undefined;
    if (!secondSessionId) throw new Error('There is no open instance to finish');
    record('4: her open instance is the one to finish', true, secondSessionId);

    const page = await member.context.newPage();
    watch(page, 'member', consoleErrors);
    collect(page, bodies);
    await go(page, '/health-appraisal');
    await bodyMapOnwards(page, secondSessionId, bodies, consoleErrors);
  } finally {
    await retireSession(member);
  }
}

async function runAfter(browser: Browser) {
  const state = readState();
  const consoleErrors: string[] = [];
  const bodies: Array<{ url: string; body: string }> = [];

  const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!member) throw new Error('Could not mint a member session');
  const memberId = member.session.user.id as string;
  await requireTestMember(memberId);

  let coach: Awaited<ReturnType<typeof mintSessionContext>> = null;
  try {
    const definitionId = await runtimeDefinitionId();
    const sittings = await completedSittings(memberId, definitionId);
    record('5: she now has two completed sittings, neither replacing the other', sittings.length === 2, `${sittings.length}`);
    const second = sittings[0]!;
    const first = sittings.find((sitting) => sitting.id === state.firstSessionId)!;
    record('5: the first sitting is still there, by its own id', Boolean(first));

    const secondStored = await storedResults(second.id);
    const expected = Object.fromEntries(secondStored.map((row) => [row.section_id, row.result_color])) as Record<
      string,
      'green' | 'yellow' | 'red'
    >;

    // --- 5a. Her results page, now with trend.
    const page = await member.context.newPage();
    watch(page, 'member', consoleErrors);
    collect(page, bodies);
    await go(page, '/health-appraisal/results');
    await page.waitForSelector('[data-testid="haq-results"]', { timeout: 40_000 });
    const seen = await readResultsPage(page);
    checkResultsPage(seen, expected, { withTrend: true, step: '5' });

    // And the chips agree with the two sittings' stored colours.
    const rank = { green: 0, yellow: 1, red: 2 } as const;
    const wrongChips: string[] = [];
    for (const card of seen.cards) {
      const was = state.firstColors[card.sectionId];
      const now = expected[card.sectionId];
      if (!was || !now) continue;
      const want = rank[now] < rank[was] ? 'quieter' : rank[now] > rank[was] ? 'louder' : 'unchanged';
      if ((card.trend ?? '').toLowerCase() !== want) wrongChips.push(`${card.sectionId}: ${card.trend} wanted ${want}`);
    }
    record('5: every chip matches the two sittings\' own stored colours', wrongChips.length === 0, wrongChips.slice(0, 4).join(' | '));

    // --- 5b. The coach: both sittings, and the per section comparison.
    const coachEmail = await assignedCoachOf(memberId);
    coach = await mintSessionContext(browser, coachEmail, { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
    if (!coach) throw new Error('Could not mint the coach session');
    const coachPage = await coach.context.newPage();
    watch(coachPage, 'coach', consoleErrors);
    await openCoachDetail(coachPage, memberId);
    const listLinks = await coachPage.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="haq-sitting-list"] a')).map((a) => a.getAttribute('href') ?? '')
    );
    record('5: the coach\'s card lists BOTH sittings, newest first', listLinks.length === 2, listLinks.join(' '));
    record(
      '5: and the newest one is first',
      listLinks[0]?.endsWith(second.id) === true && listLinks[1]?.endsWith(first.id) === true
    );

    await go(coachPage, `/coach/clients/${memberId}/health-appraisal/${second.id}`);
    await coachPage.waitForSelector('[data-testid="haq-coach-sitting-meta"]', { timeout: 40_000 });
    record(
      '5: the newest sitting names the one it is compared with',
      (await coachPage.locator('[data-testid="haq-coach-previous-sitting"]').count()) === 1
    );
    const sections = await readCoachSitting(coachPage);
    const firstStored = await storedResults(first.id);
    const wasById = new Map(firstStored.map((row) => [row.section_id, row]));
    const wrongComparison: string[] = [];
    for (const section of sections) {
      const was = wasById.get(section.sectionId)!;
      const flatPrevious = (section.previous ?? '').toLowerCase();
      if (!section.previous || !flatPrevious.includes(String(was.raw_total)) || !flatPrevious.includes(was.member_result_label.toLowerCase())) {
        wrongComparison.push(section.sectionId);
      }
    }
    record('5: every section shows the previous raw total and label beside the current ones', wrongComparison.length === 0, wrongComparison.slice(0, 4).join(' '));
    record(
      '5: each comparison carries a Quieter, Unchanged or Louder chip',
      sections.every((section) => /Quieter|Unchanged|Louder/i.test(section.previous ?? '')),
      sections.filter((s) => !/Quieter|Unchanged|Louder/i.test(s.previous ?? '')).map((s) => s.sectionId).join(' ')
    );

    // The first sitting still has nothing to compare with.
    await go(coachPage, `/coach/clients/${memberId}/health-appraisal/${first.id}`);
    await coachPage.waitForSelector('[data-testid="haq-coach-sitting-meta"]', { timeout: 40_000 });
    record(
      '5: the first sitting still has no comparison, because nothing came before it',
      (await coachPage.locator('[data-testid="haq-coach-previous-sitting"]').count()) === 0
    );

    // --- 5c. BYTE FOR BYTE.
    const now = await fingerprint(first.id);
    record(
      '5: the first sitting\'s stored data is byte for byte identical to before the retake',
      now === state.firstFingerprint,
      now === state.firstFingerprint ? '' : 'the stored sitting changed'
    );

    // --- 6. No hidden number in any member facing payload.
    const leaked = bodies.filter(({ body }) =>
      /"hidden_value"|"raw_total"|"green_max"|"yellow_max"|"original_priority"/.test(body)
    );
    record('6: no member facing payload carried a hidden value', leaked.length === 0, leaked.slice(0, 2).map((b) => b.url).join(' '));

    // --- 6b. Every existing questionnaire route unchanged.
    if (state.routes) {
      const after = await readRoutes(page);
      const moved = after.filter((reading) => {
        const before = state.routes!.find((r) => r.route === reading.route);
        return !before || before.finalPath !== reading.finalPath || before.heading !== reading.heading;
      });
      record(`6: all ${after.length} existing questionnaire routes open exactly as before`, moved.length === 0, moved.map((m) => m.route).join(' '));
    } else {
      record('6: existing questionnaire routes were not recorded, so they could not be compared', false, 'run HAQ3_MODE=routes first');
    }

    record('5 and 6: no console or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    await retireSession(member);
    if (coach) await retireSession(coach);
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (MODE === 'routes') await runRoutes(browser);
    else if (MODE === 'before') await runBefore(browser);
    else if (MODE === 'retake') await runRetake(browser);
    else if (MODE === 'finish') await runFinish(browser);
    else await runAfter(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  if (failed.length > 0) {
    console.log('\nFAILED:');
    for (const failure of failed) console.log(`  ${failure.item}${failure.detail ? ` (${failure.detail})` : ''}`);
    process.exitCode = 1;
  }
}

void main();
