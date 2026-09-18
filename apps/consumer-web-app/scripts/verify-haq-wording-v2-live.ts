#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the 2026-09-18 HAQ wording revision
 * (migration 265, eleven questions reworded at question version 2).
 *
 * TWO MODES.
 *
 *   HAQ_LIVE_MODE=snapshot   BEFORE migration 265. Read only. Fingerprints
 *                            every completed HAQ sitting of the test member
 *                            (the session row, its answers, its response
 *                            records, its section results) to
 *                            HAQ_SNAPSHOT_FILE, outside the repository.
 *   HAQ_LIVE_MODE=journey    AFTER migration 265 and the deploy.
 *     0  the database: eleven version 2 rows active, version 1 kept inactive
 *     1  if she has no open assignment, her coach assigns one on his real
 *        client Detail page
 *     2  she opens the real Health Appraisal and walks every question screen
 *        from the first: each of the eleven shows its NEW words on its own
 *        screen, in its own Part, Section and position, and no screen shows
 *        an old wording. The eleven are answered Yes (Very often for
 *        haq_p1_b_q4, which has always been a frequency question), every
 *        other unanswered question No or Never or rarely. Then Complete.
 *     3  the database: the new sitting holds 260 records; each of the eleven
 *        is version 2 and worth 8; a No elsewhere is worth 0; every section
 *        colour matches its own cutoffs
 *     4  every completed sitting in the snapshot is byte for byte the same
 *     5  the coach Deep Dive renders every sitting, the old ones in the old
 *        words and the new one in the new words, with the stored totals
 *
 * Sessions are minted (Turnstile blocks a scripted form sign-in by design)
 * and retired with scope 'local'. Keys arrive as file paths.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   HAQ_LIVE_MODE=snapshot|journey HAQ_SNAPSHOT_FILE=/outside/repo/haq-v2.json \
 *   npx tsx scripts/verify-haq-wording-v2-live.ts
 */
import { chromium, type Browser, type Page } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { selectAllRows } from '../lib/data/pagedSelect';
import { buildHaqScreens, haqScreenHeading, type HaqScreen } from '../lib/haq/walk';
import { HAQ_DEFINITION_ID } from '../lib/haq/constants';
import { HAQ_PRIOR_WORDINGS, HAQ_QUESTIONS, HAQ_RESPONSE_OPTIONS } from '../lib/haq/questionBank';
import type { HaqQuestion, HaqResponse } from '../lib/haq/types';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.HAQ_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MODE = process.env.HAQ_LIVE_MODE === 'journey' ? 'journey' : 'snapshot';
const SNAPSHOT_FILE = process.env.HAQ_SNAPSHOT_FILE;
if (!SNAPSHOT_FILE) throw new Error('HAQ_SNAPSHOT_FILE is required, and must be outside the repository');
const PHONE = { width: 390, height: 844 };

const REVISED = new Map(HAQ_PRIOR_WORDINGS.map((prior) => [prior.key, prior.prompt]));

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

// ---------------------------------------------------------------------
// Fingerprints of a completed sitting.
// ---------------------------------------------------------------------

async function memberId(): Promise<string> {
  for (let page = 1; page < 200; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.email === MEMBER_EMAIL);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error('Test member not found');
}

async function runtimeDefinitionId(): Promise<string> {
  const { data } = await service.from('unified_assessment_definitions').select('id').eq('key', 'haq').single();
  return data!.id as string;
}

async function sittings(member: string, definitionId: string) {
  // scale-exempt: one test member's HAQ instances, a handful by the product
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('*')
    .eq('member_id', member)
    .eq('assessment_definition_id', definitionId)
    .order('started_at')
    .limit(50);
  return (data ?? []) as Array<Record<string, unknown>>;
}

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fingerprint(session: Record<string, unknown>) {
  const id = session.id as string;
  const read = (table: string) =>
    selectAllRows<Record<string, unknown>>(() => service.from(table).select('*').eq('session_id', id).order('id'));
  const [answers, responses, sectionResults] = await Promise.all([
    read('unified_assessment_answers'),
    read('haq_question_responses'),
    read('haq_section_results'),
  ]);
  return {
    sessionId: id,
    session: sha(session),
    answers: { count: answers.rows.length, hash: sha(answers.rows) },
    responses: { count: responses.rows.length, hash: sha(responses.rows) },
    results: { count: sectionResults.rows.length, hash: sha(sectionResults.rows) },
  };
}

async function runSnapshot() {
  const member = await memberId();
  const definitionId = await runtimeDefinitionId();
  const all = await sittings(member, definitionId);
  const completed = all.filter((s) => s.status === 'completed');
  const prints = await Promise.all(completed.map(fingerprint));
  writeFileSync(SNAPSHOT_FILE!, JSON.stringify({ takenAt: new Date().toISOString(), completed: prints }, null, 2));
  record(`snapshot: ${prints.length} completed sittings fingerprinted`, prints.length > 0, prints.map((p) => `${p.sessionId.slice(0, 8)} ${p.responses.count} records`).join(', '));
  record(
    `snapshot: ${all.length - completed.length} open sitting(s) noted, not fingerprinted (an open sitting is expected to change)`,
    true
  );
}

// ---------------------------------------------------------------------
// The walk.
// ---------------------------------------------------------------------

const screens = buildHaqScreens();

function labelFor(question: HaqQuestion, value: HaqResponse): string {
  return HAQ_RESPONSE_OPTIONS[question.responseType].find((o) => o.value === value)!.label;
}

/** Yes on the eleven (Very often on the one frequency question), the lowest answer everywhere else. */
function plannedAnswer(question: HaqQuestion): HaqResponse {
  if (REVISED.has(question.key)) return question.responseType === 'yes_no' ? 'yes' : 'very_often';
  return question.responseType === 'yes_no' ? 'no' : 'never_or_rarely';
}

async function header(page: Page) {
  return page.evaluate(() => ({
    part: document.querySelector('[data-testid="haq-part-heading"]')?.textContent?.trim() ?? null,
    section: document.querySelector('[data-testid="haq-section-title"]')?.textContent?.trim() ?? '',
    progress: document.querySelector('[role="progressbar"]')?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    prompts: Array.from(document.querySelectorAll('ol > li h2')).map((h) => h.textContent?.trim() ?? ''),
    body: document.body.innerText,
  }));
}

async function currentScreenIndex(page: Page): Promise<number> {
  await page.waitForSelector('ol > li h2', { timeout: 30_000 });
  const { prompts } = await header(page);
  return screens.findIndex((screen) => JSON.stringify(screen.questions.map((q) => q.prompt)) === JSON.stringify(prompts));
}

async function waitForScreen(page: Page, screen: HaqScreen) {
  await page.waitForFunction(
    (first) => Array.from(document.querySelectorAll('ol > li h2')).some((h) => h.textContent?.trim() === first),
    screen.questions[0]!.prompt,
    { timeout: 30_000 }
  );
}

async function chosenOn(page: Page, question: HaqQuestion): Promise<string | null> {
  const block = page.locator('ol > li').filter({ has: page.locator('h2', { hasText: question.prompt }) }).first();
  const chosen = block.locator('button[aria-checked="true"]');
  return (await chosen.count()) > 0 ? ((await chosen.first().textContent()) ?? '').trim() : null;
}

async function choose(page: Page, question: HaqQuestion, value: HaqResponse) {
  const block = page.locator('ol > li').filter({ has: page.locator('h2', { hasText: question.prompt }) }).first();
  await block.getByRole('radio', { name: labelFor(question, value), exact: true }).click({ timeout: 15_000 });
}

async function runJourney(browser: Browser) {
  if (!existsSync(SNAPSHOT_FILE!)) throw new Error('Run HAQ_LIVE_MODE=snapshot before migration 265 first');
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE!, 'utf8')) as {
    completed: Array<Awaited<ReturnType<typeof fingerprint>>>;
  };

  const MEMBER = await memberId();
  const { data: profile } = await service.from('profiles').select('is_test').eq('id', MEMBER).maybeSingle();
  if (profile?.is_test !== true) throw new Error('REFUSING TO RUN: the member is not a test account');
  const definitionId = await runtimeDefinitionId();

  // -------------------------------------------------------------------
  // 0. The database holds both versions, the right one active.
  // -------------------------------------------------------------------
  const { rows: questionRows } = await selectAllRows<Record<string, unknown>>(() =>
    service
      .from('unified_assessment_questions')
      .select('id, question_key, version, active, prompt, section_id, display_order, answer_type, haq_questions(question_version, section_id, part_id, response_type)')
      .eq('assessment_definition_id', definitionId)
      .order('id')
  );
  const active = questionRows.filter((row) => row.active === true);
  record('0: 260 active HAQ questions, one per id', active.length === 260 && new Set(active.map((r) => r.question_key)).size === 260, `${active.length} active of ${questionRows.length}`);
  const versionProblems: string[] = [];
  for (const question of HAQ_QUESTIONS) {
    const rows = questionRows.filter((row) => row.question_key === question.key);
    if (REVISED.has(question.key)) {
      const v1 = rows.find((r) => r.version === 1);
      const v2 = rows.find((r) => r.version === 2);
      const m1 = (Array.isArray(v1?.haq_questions) ? v1!.haq_questions[0] : v1?.haq_questions) as Record<string, unknown> | undefined;
      const m2 = (Array.isArray(v2?.haq_questions) ? v2!.haq_questions[0] : v2?.haq_questions) as Record<string, unknown> | undefined;
      if (
        rows.length !== 2 || !v1 || !v2 || v1.active !== false || v2.active !== true ||
        v1.prompt !== REVISED.get(question.key) || v2.prompt !== question.prompt ||
        v1.section_id !== v2.section_id || v1.display_order !== v2.display_order || v1.answer_type !== v2.answer_type ||
        m2?.question_version !== 2 || m1?.section_id !== m2?.section_id || m1?.part_id !== m2?.part_id ||
        m1?.response_type !== m2?.response_type || m2?.response_type !== question.responseType
      ) {
        versionProblems.push(question.key);
      }
    } else if (rows.length !== 1 || rows[0]!.version !== 1 || rows[0]!.active !== true || rows[0]!.prompt !== question.prompt) {
      versionProblems.push(question.key);
    }
  }
  record('0: the eleven are version 2 in the new words, version 1 kept inactive in the old; every other question untouched', versionProblems.length === 0, versionProblems.join(', '));

  const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
  if (!member) throw new Error('Could not mint the member session');
  let coach: Awaited<ReturnType<typeof mintSessionContext>> | null = null;
  const consoleErrors: string[] = [];
  const watch = (page: Page, who: string) => {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${who} ${page.url()}: ${message.text().slice(0, 200)}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${who} ${page.url()}: ${String(error).slice(0, 200)}`));
  };

  // scale-exempt: one member's active coach assignments, one row by the product
  const { data: coachLink } = await service
    .from('coach_client_assignments')
    .select('coach_id')
    .eq('client_id', MEMBER)
    .eq('status', 'active')
    .limit(5);
  const coachId = (coachLink ?? [])[0]?.coach_id as string | undefined;
  if (!coachId) throw new Error('The test member has no active coach');
  const { data: coachUser } = await service.auth.admin.getUserById(coachId);
  const coachEmail = coachUser?.user?.email;
  if (!coachEmail) throw new Error('Could not read the assigned coach email');

  try {
    // -----------------------------------------------------------------
    // 1. An open assignment, through the coach's own Detail page if needed.
    // -----------------------------------------------------------------
    const pendingAssignments = async () =>
      (
        // scale-exempt: one test member's HAQ assignments, a handful by the product
        await service
          .from('assessment_assignments')
          .select('id, status')
          .eq('member_id', MEMBER)
          .eq('assessment_definition_id', HAQ_DEFINITION_ID)
          .limit(50)
      ).data ?? [];
    const before = await pendingAssignments();
    if (before.some((row) => row.status === 'pending')) {
      record('1: the test member already had an open Health Appraisal assignment; none added', true);
    } else {
      coach = await mintSessionContext(browser, coachEmail, { baseUrl: BASE, viewport: PHONE });
      if (!coach) throw new Error('Could not mint the coach session');
      const coachPage = await coach.context.newPage();
      watch(coachPage, 'coach');
      await go(coachPage, `/coach/clients/${MEMBER}/detail`);
      const fold = coachPage.getByRole('button', { name: /assessments and findings/i }).first();
      await fold.waitFor({ state: 'visible', timeout: 40_000 });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if ((await coachPage.locator('[data-assign-toggle="haq"]').count()) > 0) break;
        await fold.click({ timeout: 10_000 }).catch(() => {});
        await coachPage.waitForSelector('[data-assign-toggle="haq"]', { timeout: 2500 }).catch(() => {});
      }
      await coachPage.locator('[data-assign-toggle="haq"]').first().click({ timeout: 15_000 });
      const form = coachPage.locator('[data-assign-form="haq"]').first();
      await form.waitFor({ state: 'visible', timeout: 25_000 });
      await form.getByRole('button', { name: /^assign$/i }).click({ timeout: 15_000 });
      const after = await until(pendingAssignments, (rows) => rows.some((r) => r.status === 'pending'));
      record('1: the coach assigned the Health Appraisal on his real Detail page', after.some((r) => r.status === 'pending'));
    }

    // -----------------------------------------------------------------
    // 2. The real question screens.
    // -----------------------------------------------------------------
    const page = await member.context.newPage();
    watch(page, 'member');
    await go(page, '/health-appraisal');
    await page.waitForSelector('[data-testid="haq-intro"], ol > li h2', { timeout: 30_000 });
    if ((await page.locator('[data-testid="haq-intro"]').count()) > 0) {
      await page.getByRole('button', { name: 'Begin', exact: true }).click();
    }
    const resumedAt = await currentScreenIndex(page);
    record('2: the Health Appraisal opened on a question screen', resumedAt >= 0, `screen ${resumedAt} of ${screens.length}`);

    const open = (await sittings(MEMBER, definitionId)).filter((s) => s.status === 'in_progress');
    record('2: exactly one open sitting', open.length === 1);
    const sessionId = open[0]!.id as string;

    // Back to the first screen, so every screen is read from the start.
    for (let index = resumedAt; index > 0; index -= 1) {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await waitForScreen(page, screens[index - 1]!);
    }

    const seenRevised = new Map<string, { screen: number; position: number; part: string | null; section: string; progress: string }>();
    const oldWordingSeen: string[] = [];
    const screenProblems: string[] = [];
    const tappedRevised = new Set<string>();
    const oldWordings = [...REVISED.values()];

    for (let index = 0; index < screens.length; index += 1) {
      const screen = screens[index]!;
      await waitForScreen(page, screen);
      const seen = await header(page);
      const expected = haqScreenHeading(screen);
      if (
        seen.part !== expected.eyebrow ||
        seen.section !== expected.title ||
        !seen.progress.includes(`Part ${screen.partNumber} of 10`) ||
        JSON.stringify(seen.prompts) !== JSON.stringify(screen.questions.map((q) => q.prompt))
      ) {
        screenProblems.push(`screen ${index}: ${JSON.stringify({ ...seen, body: undefined }).slice(0, 240)}`);
      }
      for (const wording of oldWordings) if (seen.body.includes(wording)) oldWordingSeen.push(`screen ${index}: ${wording.slice(0, 50)}`);

      for (const [position, question] of screen.questions.entries()) {
        if (REVISED.has(question.key)) {
          seenRevised.set(question.key, { screen: index, position, part: seen.part, section: seen.section, progress: seen.progress });
          const planned = plannedAnswer(question);
          await choose(page, question, planned);
          const stored = await until(
            async () =>
              (
                await service
                  .from('haq_question_responses')
                  .select('selected_response')
                  .eq('session_id', sessionId)
                  .eq('question_key', question.key)
                  .maybeSingle()
              ).data?.selected_response,
            (value) => value === planned
          );
          if (stored === planned) tappedRevised.add(question.key);
        } else if ((await chosenOn(page, question)) === null) {
          await choose(page, question, plannedAnswer(question));
        }
      }

      await page.waitForFunction(
        () => {
          const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Continue');
          return button ? !(button as HTMLButtonElement).disabled : false;
        },
        undefined,
        { timeout: 15_000 }
      );
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }

    record('2: all 94 question screens showed the bank\'s current words, with the right Part, Section and "Part X of 10"', screenProblems.length === 0, screenProblems.slice(0, 3).join(' | '));
    record('2: no screen showed any of the eleven old wordings', oldWordingSeen.length === 0, oldWordingSeen.slice(0, 3).join(' | '));
    for (const question of HAQ_QUESTIONS.filter((q) => REVISED.has(q.key))) {
      const where = seenRevised.get(question.key);
      const expectedScreen = screens.findIndex((screen) => screen.questions.some((q) => q.key === question.key));
      const expectedPosition = screens[expectedScreen]!.questions.findIndex((q) => q.key === question.key);
      const heading = haqScreenHeading(screens[expectedScreen]!);
      record(
        `2: ${question.key} shows its new words on its own screen, in its own Part, Section and position, and its answer stored`,
        !!where &&
          where.screen === expectedScreen &&
          where.position === expectedPosition &&
          where.part === heading.eyebrow &&
          where.section === heading.title &&
          tappedRevised.has(question.key),
        where ? `screen ${where.screen} position ${where.position + 1}, ${where.part ?? ''} / ${where.section} / ${where.progress}: "${question.prompt}"` : 'not seen'
      );
    }

    await page.waitForSelector('[data-testid="haq-body-map"]', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await page.waitForSelector('[data-testid="haq-completion"]', { timeout: 60_000 });
    record('2: Complete reached the completion screen', true);

    // -----------------------------------------------------------------
    // 3. What was stored.
    // -----------------------------------------------------------------
    const { data: finished } = await service.from('unified_assessment_sessions').select('status').eq('id', sessionId).single();
    record('3: the sitting is completed', finished?.status === 'completed');
    // scale-exempt: one sitting's response records, exactly 260 by the instrument
    const { data: responses } = await service
      .from('haq_question_responses')
      .select('question_id, question_key, question_version, response_type, selected_response, hidden_value, section_id, part_id')
      .eq('session_id', sessionId)
      .limit(300);
    const rows = responses ?? [];
    record('3: 260 response records, one per question', rows.length === 260 && new Set(rows.map((r) => r.question_key)).size === 260, `${rows.length}`);
    const activeIds = new Set(active.map((r) => r.id as string));
    record('3: every record points at an active (current version) question row', rows.every((r) => activeIds.has(r.question_id as string)));
    for (const question of HAQ_QUESTIONS.filter((q) => REVISED.has(q.key))) {
      const row = rows.find((r) => r.question_key === question.key);
      const expectedResponse = question.responseType === 'yes_no' ? 'yes' : 'very_often';
      record(
        `3: ${question.key} stored ${expectedResponse === 'yes' ? 'Yes' : 'Very often'} = 8 at version 2`,
        row?.selected_response === expectedResponse && row?.hidden_value === 8 && row?.question_version === 2 && row?.response_type === question.responseType && row?.section_id === question.sectionId,
        JSON.stringify(row)
      );
    }
    const aNo = rows.find((r) => !REVISED.has(r.question_key as string) && r.selected_response === 'no');
    record('3: a No elsewhere stored 0', aNo?.hidden_value === 0, aNo ? `${aNo.question_key} = no = ${aNo.hidden_value}` : 'no No found');

    const [{ data: sectionResults }, { data: cutoffs }] = await Promise.all([
      // scale-exempt: one sitting's section results, exactly 21
      service.from('haq_section_results').select('section_id, raw_total, result_color').eq('session_id', sessionId).limit(21),
      // scale-exempt: 21 rows, one per section
      service.from('haq_section_cutoffs').select('section_id, green_max, yellow_max').limit(21),
    ]);
    const colourProblems: string[] = [];
    for (const result of sectionResults ?? []) {
      const total = rows.filter((r) => r.section_id === result.section_id).reduce((sum, r) => sum + (r.hidden_value as number), 0);
      const cutoff = (cutoffs ?? []).find((c) => c.section_id === result.section_id)!;
      const expected = total <= cutoff.green_max ? 'green' : total <= cutoff.yellow_max ? 'yellow' : 'red';
      if (result.raw_total !== total || result.result_color !== expected) colourProblems.push(`${result.section_id} ${result.raw_total}/${result.result_color} vs ${total}/${expected}`);
    }
    record('3: 21 section results, each total the sum of its own records and each colour from its own cutoffs', (sectionResults ?? []).length === 21 && colourProblems.length === 0, colourProblems.join(' | '));

    // -----------------------------------------------------------------
    // 4. Earlier completed sittings, unchanged.
    // -----------------------------------------------------------------
    const now = await Promise.all(
      (await sittings(MEMBER, definitionId)).filter((s) => snapshot.completed.some((p) => p.sessionId === s.id)).map(fingerprint)
    );
    for (const earlier of snapshot.completed) {
      const current = now.find((p) => p.sessionId === earlier.sessionId);
      record(
        `4: completed sitting ${earlier.sessionId.slice(0, 8)} is byte for byte unchanged (session, ${earlier.answers.count} answers, ${earlier.responses.count} records, ${earlier.results.count} results)`,
        JSON.stringify(current) === JSON.stringify(earlier)
      );
    }

    // -----------------------------------------------------------------
    // 5. The coach Deep Dive, for every sitting.
    // -----------------------------------------------------------------
    if (!coach) coach = await mintSessionContext(browser, coachEmail, { baseUrl: BASE, viewport: { width: 1280, height: 900 } });
    if (!coach) throw new Error('Could not mint the coach session');
    const coachPage = await coach.context.newPage();
    watch(coachPage, 'coach');
    const completedNow = (await sittings(MEMBER, definitionId)).filter((s) => s.status === 'completed');
    for (const sitting of completedNow) {
      const id = sitting.id as string;
      const isNew = id === sessionId;
      const status = await go(coachPage, `/coach/clients/${MEMBER}/health-appraisal/${id}`);
      await coachPage.waitForSelector('[data-testid^="haq-coach-section-"]', { timeout: 30_000 }).catch(() => {});
      const reading = await coachPage.evaluate(() => ({
        sections: document.querySelectorAll('section[data-testid^="haq-coach-section-"]').length,
        totals: Array.from(document.querySelectorAll('[data-testid^="haq-coach-total-"]')).map(
          (el): [string, string] => [el.getAttribute('data-testid')!.replace('haq-coach-total-', ''), el.textContent?.trim() ?? '']
        ),
        text: document.body.textContent ?? '',
      }));
      // scale-exempt: one sitting's section results, exactly 21
      const { data: stored } = await service.from('haq_section_results').select('section_id, raw_total').eq('session_id', id).limit(21);
      const totalsMatch = (stored ?? []).every((row) => reading.totals.some(([section, text]) => section === row.section_id && text.includes(String(row.raw_total))));
      const wordingProblems: string[] = [];
      for (const question of HAQ_QUESTIONS.filter((q) => REVISED.has(q.key))) {
        const want = isNew ? question.prompt : REVISED.get(question.key)!;
        const not = isNew ? REVISED.get(question.key)! : question.prompt;
        if (!reading.text.includes(want) || reading.text.includes(not)) wordingProblems.push(question.key);
      }
      record(
        `5: coach Deep Dive for the ${isNew ? 'NEW' : 'earlier'} sitting ${id.slice(0, 8)} renders all 21 sections with the stored totals, in the ${isNew ? 'new' : 'old'} words`,
        status === 200 && reading.sections === 21 && totalsMatch && wordingProblems.length === 0,
        `HTTP ${status}, ${reading.sections} sections, totals ${totalsMatch ? 'match' : 'DIFFER'}${wordingProblems.length ? `, wording wrong on ${wordingProblems.join(', ')}` : ''}`
      );
    }

    await go(page, '/health-appraisal/results');
    const resultsRows = await page.locator('[data-testid^="haq-result-row"], li').count();
    record('5: her own results page opens after the new sitting', resultsRows > 0);

    record('no console or page errors on any screen visited', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } finally {
    await retireSession(member);
    if (coach) await retireSession(coach);
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (MODE === 'snapshot') await runSnapshot();
    else await runJourney(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
