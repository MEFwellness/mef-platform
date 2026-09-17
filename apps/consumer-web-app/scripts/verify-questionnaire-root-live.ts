#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: Root reads the Body Systems Survey.
 *
 * Phases, run one at a time so each result is reported on its own:
 *
 *   existing   READ ONLY. The coach opens the test member whose sittings were
 *              stored before this build, after the backfill. Her stored
 *              answers must show up as survey signals and Root Noticed must
 *              read them, with her survey results untouched.
 *   flow       The whole new-survey flow, driven through the real screens:
 *              the coach assigns through Assessment Status, the member answers
 *              the survey, the coach reads Signals and Root Noticed, the member
 *              writes a headache note in the Daily Reset, the coach assigns a
 *              retake, the member answers headaches Never. Then every member
 *              route is scanned for coach-only words.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in by
 * design, which is not a failure) and retired with scope 'local'.
 *
 * CLEANUP IS NOT IN HERE ON PURPOSE. The flow's rows are removed by a
 * separate, independently checked restore against a baseline recorded before
 * anything ran, so a crash mid-flow cannot skip it and the check is not made
 * by the same code that made the rows.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   npx tsx scripts/verify-questionnaire-root-live.ts existing|flow
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { loadMemberContent } from '../lib/body-systems/contentData';
import { buildResults } from '../lib/body-systems/scoring';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const COACH_EMAIL = 'oakomah66@gmail.com';
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';
const SHOTS = 'scripts/.verify/questionnaire-root';
const SURVEY_LABEL = 'Rooted Reset Body Systems Survey';
const NOTE = 'My headaches have been bad this week';

/** The thirteen words no member response body may contain. */
const COACH_ONLY_WORDS = [
  'Root Noticed',
  'Whole-Body Association Map',
  'Areas Root checked',
  'Coaching considerations',
  'Possible Association',
  'surfaces_on_complaint',
  'matched_phrase',
  'is_resolution',
  'complaint_surface',
  'cross_system_relationship',
  'cross_system_root_finding',
  'worth reviewing',
  'observed alongside',
];

mkdirSync(SHOTS, { recursive: true });
const service = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const anonKey = readFileSync(process.env.PROD_ANON_KEY_FILE!, 'utf8').trim();

const results: Array<{ item: string; pass: boolean; detail: string }> = [];
function record(item: string, pass: boolean, detail = ''): void {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}${detail ? `\n      ${detail}` : ''}`);
}

const text = (page: Page) => page.evaluate('document.body.innerText') as Promise<string>;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Walk = { consoleErrors: string[]; bodies: Array<{ url: string; body: string }> };
function listen(page: Page, walk: Walk): void {
  page.on('console', (message) => {
    if (message.type() === 'error') walk.consoleErrors.push(`${page.url()}: ${message.text().slice(0, 160)}`);
  });
  page.on('pageerror', (error) => walk.consoleErrors.push(`${page.url()}: ${String(error).slice(0, 160)}`));
  page.on('response', async (response) => {
    try {
      const type = response.headers()['content-type'] ?? '';
      if (!/text|json|javascript|x-component/.test(type)) return;
      if (!response.url().startsWith(BASE)) return;
      walk.bodies.push({ url: response.url(), body: await response.text() });
    } catch {
      /* a body that cannot be read carried nothing */
    }
  });
}

async function go(page: Page, path: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(2000 * (attempt + 1));
    }
  }
}

// ---------------------------------------------------------------------
// The coach's Client Detail.
// ---------------------------------------------------------------------

async function openSection(page: Page, id: string): Promise<string> {
  const header = page.locator(`#${id} > button[aria-expanded]`).first();
  await header.waitFor({ timeout: 30_000 });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const content = page.locator(`#${id}-content`);
  await content.waitFor({ timeout: 30_000 });
  return content.innerText();
}

type CoachRead = {
  signals: string;
  noticed: string;
  noticedHtml: string;
  /** Finding cards by origin that name the headaches map entry, counted as elements. */
  headacheCards: { complaint: number; questionnaire: number };
};

async function coachReads(coach: BrowserContext, label: string): Promise<CoachRead> {
  const page = await coach.newPage();
  await go(page, `/coach/clients/${MEMBER_ID}/detail`);
  const signals = await openSection(page, 'detail-section-cross-system-signals');
  const noticedSection = page.locator('#detail-section-root-noticed-content');
  await openSection(page, 'detail-section-root-noticed');
  // Open the trace and every one of its sections, so the per question lines
  // are on the page to read.
  const traceToggle = noticedSection.getByRole('button', { name: /How Root read each answer/i });
  if ((await traceToggle.count()) > 0) {
    await traceToggle.first().click();
    const sectionToggles = noticedSection.locator('[data-root-noticed-questionnaire] button[aria-expanded="false"]');
    for (let guard = 0; guard < 20 && (await sectionToggles.count()) > 0; guard += 1) {
      await sectionToggles.first().click();
      await pause(80);
    }
  }
  // Every survey connection, not only the first five.
  const more = noticedSection.getByRole('button', { name: /^Show \d+ more connection/ });
  if ((await more.count()) > 0) await more.first().click();
  const entry = 'Headache signals, whole-body areas worth reviewing';
  const headacheCards = {
    complaint: await noticedSection.locator('article[data-root-finding-origin="complaint"]', { hasText: entry }).count(),
    questionnaire: await noticedSection.locator('article[data-root-finding-origin="questionnaire"]', { hasText: entry }).count(),
  };
  const noticed = await noticedSection.innerText();
  const noticedHtml = await noticedSection.innerHTML();
  writeFileSync(`${SHOTS}/${label}-signals.txt`, signals);
  writeFileSync(`${SHOTS}/${label}-noticed.txt`, noticed);
  await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  await page.close();
  return { signals, noticed, noticedHtml, headacheCards };
}

/** The block of text for one signal row on the Signals section, by its name. */
function signalRowText(signals: string, name: string): string[] {
  const lines = signals.split('\n');
  const out: string[] = [];
  lines.forEach((line, index) => {
    // The whole row: from its name to the next "earlier entries" control or
    // the next twenty lines, whichever comes first.
    if (line.trim() !== name) return;
    const rest = lines.slice(index, index + 20);
    const end = rest.findIndex((entry, at) => at > 0 && /earlier entr/.test(entry));
    out.push((end === -1 ? rest : rest.slice(0, end + 1)).join(' | '));
  });
  return out;
}

/** One trace entry, found by the question's own prompt. */
function traceText(noticed: string, prompt: string): string {
  // Only inside the trace: an open finding card prints the same prompts on
  // its own area rows, above it. The heading is matched without case,
  // because innerText reports it the way CSS uppercases it.
  const start = noticed.toLowerCase().indexOf('how root read each answer');
  if (start === -1) return '';
  const trace = noticed.slice(start);
  const at = trace.indexOf(prompt);
  return at === -1 ? '' : trace.slice(at, at + 400);
}

// ---------------------------------------------------------------------
// The member's survey.
// ---------------------------------------------------------------------

async function tap(scope: ReturnType<Page['locator']>, name: string): Promise<void> {
  const radios = scope.getByRole('radio', { name, exact: true });
  const target = (await radios.count()) > 0 ? radios.first() : scope.getByRole('button', { name, exact: true }).first();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await target.click().catch(() => {});
    const checked = await target.getAttribute('aria-checked').catch(() => null);
    const pressed = await target.getAttribute('aria-pressed').catch(() => null);
    if (checked === 'true' || pressed === 'true') return;
    await pause(200);
  }
  throw new Error(`tap never registered: ${name}`);
}

async function enabled(page: Page, name: string | RegExp, timeoutMs = 30_000): Promise<boolean> {
  const button = page.getByRole('button', { name }).first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await button.count()) > 0 && !(await button.isDisabled())) return true;
    await pause(250);
  }
  return false;
}

/**
 * Answers the whole survey, choosing each answer by the question's own
 * prompt, then the six red flag screens with No. Returns the results text.
 */
async function answerSurvey(
  page: Page,
  answerFor: (questionRef: string) => string,
  promptToRef: Map<string, string>,
  branchLabel: string,
  labelOf: Map<string, string>
): Promise<string> {
  await go(page, '/body-systems');
  const begin = page.getByRole('button', { name: 'Begin' });
  await begin.waitFor({ timeout: 30_000 }).catch(() => {});
  for (let attempt = 0; attempt < 20 && (await begin.count()) > 0; attempt += 1) {
    await begin.click().catch(() => {});
    await pause(500);
    if (/section 1 of 11/i.test(await text(page))) break;
  }
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 30_000 });

  for (let screen = 0; screen < 80; screen += 1) {
    const now = await text(page);
    if (/1 of 6/i.test(now) && !/section \d+ of 11/i.test(now)) break;

    if (/Which set of questions fits your body\?/.test(now) && (await page.locator('ol > li').count()) === 0) {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await page.getByRole('button', { name: branchLabel }).first().click().catch(() => {});
        await pause(400);
        if ((await page.locator('ol > li').count()) > 0) break;
      }
    }

    const before = (now.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i) ?? [''])[0] + (now.match(/section [0-9]+ of 11/i) ?? [''])[0];
    const items = page.locator('ol > li');
    const count = await items.count();
    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const prompt = ((await item.locator('h2').first().innerText().catch(() => '')) || '').trim();
      const ref = promptToRef.get(prompt);
      if (!ref) throw new Error(`a question this run has no answer for: "${prompt}"`);
      await tap(item, labelOf.get(answerFor(ref))!);
    }
    if (!(await enabled(page, 'Continue'))) throw new Error(`Continue stayed disabled at ${before}`);
    await page.getByRole('button', { name: 'Continue' }).first().click();

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const after = await text(page);
      const key = (after.match(/Questions? [0-9]+(?: to [0-9]+)? of [0-9]+/i) ?? [''])[0] + (after.match(/section [0-9]+ of 11/i) ?? [''])[0];
      if (/1 of 6/i.test(after) && !/section \d+ of 11/i.test(after)) break;
      if (key !== before && !/Section complete/i.test(after) && key !== '') break;
      await pause(200);
    }
  }

  for (let flag = 1; flag <= 6; flag += 1) {
    await page.waitForSelector(`text=${flag} of 6`, { timeout: 30_000 });
    await tap(page.locator('main'), 'No');
    const label = flag === 6 ? 'See your results' : 'Continue';
    if (!(await enabled(page, label))) throw new Error(`${label} stayed disabled on red flag ${flag}`);
    await page.getByRole('button', { name: label }).first().click();
  }
  await page.waitForSelector('text=What your body is saying right now', { timeout: 60_000 });
  await pause(1500);
  return text(page);
}

// ---------------------------------------------------------------------
// The member's Daily Reset, with only the notes box written in.
// ---------------------------------------------------------------------

/**
 * Answers every question on a Daily Reset screen that has no answer yet,
 * one question at a time: "No" where it is offered, otherwise the first
 * option. Clicking every option on a screen does not work here, because a
 * multi-select or a conditional group re-opens itself and the screen never
 * becomes valid.
 */
async function answerCheckinScreen(page: Page): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    const groups = page.locator('main [role="group"], main [role="radiogroup"]');
    const count = await groups.count();
    let acted = 0;
    for (let index = 0; index < count; index += 1) {
      const group = groups.nth(index);
      if (!(await group.isVisible().catch(() => false))) continue;
      if ((await group.locator('[aria-pressed="true"], [aria-checked="true"]').count()) > 0) continue;
      const options = group.locator('button:not([disabled]), [role="radio"], [role="button"], [role="checkbox"]');
      if ((await options.count()) === 0) continue;
      const no = group.getByRole('button', { name: /^(No|None)$/i });
      await ((await no.count()) > 0 ? no.first() : options.first()).click().catch(() => {});
      acted += 1;
      await pause(250);
    }
    if (acted === 0) return;
    await pause(400);
  }
}

async function writeDailyResetNote(page: Page): Promise<boolean> {
  await go(page, '/checkin');
  let typed = false;
  for (let screen = 0; screen < 25; screen += 1) {
    await pause(400);
    const notes = page.locator('#notes');
    if ((await notes.count()) > 0 && (await notes.first().isVisible().catch(() => false))) {
      await notes.first().fill(NOTE);
      typed = true;
    }
    const save = page.getByRole('button', { name: /Save check-in|Update check-in/ }).first();
    const cont = page.getByRole('button', { name: 'Continue', exact: true }).first();
    const onLast = (await save.count()) > 0;
    const target = onLast ? save : cont;
    if ((await target.count()) === 0) break;
    await answerCheckinScreen(page);
    if (await target.isDisabled().catch(() => true)) break;
    if (onLast && !typed && (await page.locator('#notes').count()) > 0) {
      await page.locator('#notes').first().fill(NOTE);
      typed = true;
    }
    /*
      WAIT FOR THE SCREEN TO CHANGE, not for a fixed time. A Continue saves
      before it moves on, and answering the still-visible screen during that
      save fires a second save that cancels the first, which is how the
      previous attempt looped on "Your night" forever.
    */
    const key = async () => (await text(page)).split('\n').filter(Boolean).slice(0, 14).join('|');
    const before = await key();
    await target.click();
    if (onLast) break;
    const deadline = Date.now() + 30_000;
    let moved = false;
    while (Date.now() < deadline) {
      await pause(400);
      if ((await key()) !== before || (await page.getByRole('button', { name: /Save check-in|Update check-in/ }).count()) > 0) {
        moved = true;
        break;
      }
    }
    // A click that landed before hydration did nothing at all; one retry.
    if (!moved && !(await cont.isDisabled().catch(() => true))) await cont.click().catch(() => {});
    await pause(600);
  }
  return typed;
}

// ---------------------------------------------------------------------
// Shared reads.
// ---------------------------------------------------------------------

async function waitForFinding(sittingId: string, timeoutMs = 90_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { count } = await service
      .from('cross_system_root_findings')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID)
      .eq('source_session_id', sittingId);
    if ((count ?? 0) > 0) return count!;
    await pause(2000);
  }
  return 0;
}

async function latestSitting(): Promise<{ id: string; answers: Record<string, string>; results: unknown; branch: 'a' | 'b'; completed_at: string } | null> {
  const { data } = await service
    .from('member_body_systems_sessions')
    .select('id, answers, results, branch, completed_at')
    .eq('member_id', MEMBER_ID)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as never) ?? null;
}

function noPercentOnRootCards(read: CoachRead): boolean {
  return !read.noticed.includes('%') && !/\d+\s*percent/i.test(read.noticed);
}

// ---------------------------------------------------------------------
// PHASE: existing.
// ---------------------------------------------------------------------

async function existingPhase(): Promise<void> {
  const browser = await chromium.launch();
  const coach = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 1400 } });
  try {
    const sitting = await latestSitting();
    record('Her newest stored sitting predates this build', Boolean(sitting) && sitting!.completed_at < '2026-09-17T07:00:00Z', `${sitting?.id} completed ${sitting?.completed_at}`);
    const { data: findings } = await service
      .from('cross_system_root_findings')
      .select('id, triggered_by, source_key, rule_revision')
      .eq('member_id', MEMBER_ID)
      .eq('source_session_id', sitting!.id);
    record(
      'The backfill stored Root findings under that sitting',
      (findings ?? []).length > 0 && (findings ?? []).every((row) => row.triggered_by === 'backfill' && row.source_key === 'body_systems_survey'),
      `${(findings ?? []).length} findings, triggered_by backfill, rule ${findings?.[0]?.rule_revision}`
    );

    const read = await coachReads(coach!.context, 'existing-coach');
    record('Root Noticed carries her latest Body Systems Survey', read.noticed.toLowerCase().includes('from her latest body systems survey'), read.noticed.split('\n').slice(0, 4).join(' | '));
    const supports = read.noticed.split('\n').find((line) => line.includes('currently supports:')) ?? '';
    record('It says which signals her stored answers currently support, naming the survey', supports.startsWith(SURVEY_LABEL), supports.slice(0, 300));
    record('Root Noticed shows association findings from those answers', read.noticedHtml.includes('data-root-finding-origin="questionnaire"'));
    record('No percent sign or survey percentage on any Root card', noPercentOnRootCards(read));
    const surveyRows = (read.signals.match(new RegExp(SURVEY_LABEL, 'g')) ?? []).length;
    record('The Signals section names the survey as the source of her stored answers', surveyRows > 0, `${surveyRows} rows name ${SURVEY_LABEL}`);
  } finally {
    if (coach) await retireSession(coach);
    await browser.close();
  }
}

// ---------------------------------------------------------------------
// PHASE: flow.
// ---------------------------------------------------------------------

async function flowPhase(): Promise<void> {
  const content = await loadMemberContent(service);
  const promptToRef = new Map(content.questions.map((question) => [question.prompt, question.questionRef]));
  const labelOf = new Map(content.scale.map((option) => [option.valueKey, option.label]));
  const { data: branchCopy } = await service
    .from('body_systems_copy')
    .select('value')
    .eq('copy_key', 'member.branch_option_b')
    .maybeSingle();
  const branchLabel = (branchCopy?.value as string) ?? '';
  const questionPrompt = (ref: string) => content.questions.find((question) => question.questionRef === ref)!.prompt;

  /** Headaches Often, bloating Almost always, sleep Often, frequent urination Sometimes, two Rarely, the rest Never. */
  const first: Record<string, string> = { N4: 'often', D1: 'almost_always', HB7: 'often', K2: 'sometimes', N1: 'rarely', D2: 'rarely' };
  const retake: Record<string, string> = { ...first, N4: 'never' };

  const browser = await chromium.launch();
  const coach = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 1400 } });
  const member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'reduce' },
  });
  const walk: Walk = { consoleErrors: [], bodies: [] };

  async function coachAssigns(label: string): Promise<boolean> {
    const page = await coach!.context.newPage();
    await go(page, `/coach/clients/${MEMBER_ID}/detail`);
    // Assessment Status sits inside the folded Assessments section.
    await openSection(page, 'detail-section-assessments');
    const row = page.locator('li[data-assessment-row]', { hasText: 'Body Systems Survey' }).first();
    await row.waitFor({ timeout: 30_000 });
    const toggle = row.locator('[data-assign-toggle]').first();
    await toggle.click();
    const confirm = row.getByRole('button', { name: /^Assign$/ }).last();
    await confirm.waitFor({ timeout: 15_000 });
    const before = await service.from('assessment_assignments').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('assessment_definition_id', DEFINITION).eq('status', 'pending');
    await confirm.click();
    const deadline = Date.now() + 30_000;
    let pending = before.count ?? 0;
    while (Date.now() < deadline) {
      const now = await service.from('assessment_assignments').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('assessment_definition_id', DEFINITION).eq('status', 'pending');
      pending = now.count ?? 0;
      if (pending > (before.count ?? 0)) break;
      await pause(1000);
    }
    await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
    await page.close();
    return pending > (before.count ?? 0);
  }

  try {
    // ---- 1. The coach assigns a fresh survey through Assessment Status.
    record('1. The coach assigned a fresh Body Systems Survey through Assessment Status', await coachAssigns('1-assign'));

    // ---- 2 and 3. She answers it, and her results behave as before.
    const memberPage = await member!.context.newPage();
    listen(memberPage, walk);
    const resultsText = await answerSurvey(memberPage, (ref) => first[ref] ?? 'never', promptToRef, branchLabel, labelOf);
    await memberPage.screenshot({ path: `${SHOTS}/3-member-results.png`, fullPage: true });
    const sitting = await latestSitting();
    record('2. Her sitting is stored complete with exactly the answers she gave', Boolean(sitting) && Object.entries(first).every(([ref, value]) => sitting!.answers[ref] === value) && sitting!.branch === 'b', `sitting ${sitting?.id}`);
    const recomputed = buildResults({ ...content, answers: sitting!.answers, branch: 'b' });
    record('3. Her stored results are exactly what the survey\'s own scoring computes', isDeepStrictEqual(recomputed, sitting!.results));
    const sectionsNamed = content.sections.filter((section) => resultsText.includes(section.displayName)).length;
    record('3. Her results screen renders as designed: eleven systems, loudness words', resultsText.includes('What your body is saying right now') && sectionsNamed === 11 && /Speaking loudly|Showing up|Quiet/.test(resultsText), `${sectionsNamed} of 11 systems named`);
    record('3. No percentage and no score on her results', !resultsText.includes('%') && !/\b(overall|total|grade|score)\b/i.test(resultsText));
    const rootWords = COACH_ONLY_WORDS.filter((word) => resultsText.includes(word)).concat(['currently supports', 'Active: answered', 'Not active', 'Association Map', 'Root checked'].filter((word) => resultsText.includes(word)));
    record('3. No Root language anywhere on her results', rootWords.length === 0, rootWords.join(', '));

    // ---- 4. The coach reads Signals and Root Noticed.
    const findingCount = await waitForFinding(sitting!.id);
    record('4. Root stored findings for the new sitting', findingCount > 0, `${findingCount} findings`);
    const read = await coachReads(coach!.context, '4-coach');
    const supports = read.noticed.split('\n').find((line) => line.includes('currently supports:')) ?? '';
    record(
      '4. Signals were created at the question level: headaches, bloating and sleep are current',
      ['Headaches', 'Bloating after eating', 'Lighter or broken sleep'].every((name) => signalRowText(read.signals, name).some((row) => row.includes('Current'))),
      ['Headaches', 'Bloating after eating', 'Lighter or broken sleep'].map((name) => signalRowText(read.signals, name)[0]?.slice(0, 160)).join(' || ')
    );
    record('4. Their source reads Body Systems Survey', signalRowText(read.signals, 'Headaches').some((row) => row.includes(SURVEY_LABEL)));
    record('4. Root Noticed names the survey and the signals it currently supports', supports.startsWith(SURVEY_LABEL) && ['Headaches', 'Bloating after eating', 'Lighter or broken sleep'].every((name) => supports.includes(name)), supports);
    record('4. Root Noticed surfaces association findings from those signals', read.noticedHtml.includes('data-root-finding-origin="questionnaire"') && /Headache signals|Digestive signals|Sleep signals/.test(read.noticed));
    const k2 = traceText(read.noticed, questionPrompt('K2'));
    record('4. The unsupported Sometimes did NOT become active', !supports.includes('Frequent urination') && k2.includes('Not active: answered Sometimes, with nothing supporting it.'), k2.slice(0, 260).replace(/\n/g, ' | '));
    record('4. The Rarely answers did not become active either', traceText(read.noticed, questionPrompt('N1')).includes('Not active: answered Rarely or Never.'));
    const { data: headacheRows } = await service.from('cross_system_signals').select('id').eq('member_id', MEMBER_ID).eq('source_session_id', sitting!.id).eq('signal_slug', 'headaches');
    record('4. No duplicate signals: one headache row for the sitting, one Headaches row on the list', (headacheRows ?? []).length === 1 && signalRowText(read.signals, 'Headaches').length === 1, `${(headacheRows ?? []).length} stored, ${signalRowText(read.signals, 'Headaches').length} listed`);
    record('4. No percent sign on any Root card', noPercentOnRootCards(read));

    // ---- 5. She writes a headache note in the Daily Reset.
    const checkinPage = await member!.context.newPage();
    listen(checkinPage, walk);
    const typed = await writeDailyResetNote(checkinPage);
    record('5. She typed the note into the Daily Reset notes box and saved', typed);
    let reportId: string | null = null;
    for (let attempt = 0; attempt < 45 && !reportId; attempt += 1) {
      const { data } = await service.from('cross_system_complaint_reports').select('id, lookup_completed_at').eq('member_id', MEMBER_ID).eq('raw_text', NOTE).maybeSingle();
      if (data?.lookup_completed_at) reportId = data.id as string;
      else await pause(2000);
    }
    record('5. Root heard the note', Boolean(reportId));
    const afterNote = await coachReads(coach!.context, '5-coach');
    const headacheList = signalRowText(afterNote.signals, 'Headaches');
    record('5. One coherent Headaches signal, not two', headacheList.length === 1, headacheList[0]?.slice(0, 240));
    record('5. Both sources are visible and both support it now', (headacheList[0] ?? '').includes('Currently supported by:') && (headacheList[0] ?? '').includes(SURVEY_LABEL) && (headacheList[0] ?? '').includes('Reported by the member'), headacheList[0]?.slice(0, 300));
    record('5. The complaint card says the survey supports the same entry', afterNote.noticed.includes(`Also currently supported by: ${SURVEY_LABEL}.`));
    record(
      '5. And no second survey card for the headaches entry beside it',
      afterNote.headacheCards.complaint === 1 && afterNote.headacheCards.questionnaire === 0,
      `${afterNote.headacheCards.complaint} complaint card, ${afterNote.headacheCards.questionnaire} survey cards for the headaches entry`
    );

    // ---- 6. A retake with headaches Never.
    record('6. The coach assigned a retake through Assign Again', await coachAssigns('6-assign-again'));
    const retakePage = await member!.context.newPage();
    listen(retakePage, walk);
    await answerSurvey(retakePage, (ref) => retake[ref] ?? 'never', promptToRef, branchLabel, labelOf);
    const retakeSitting = await latestSitting();
    record('6. The retake is stored with headaches Never', retakeSitting?.id !== sitting!.id && retakeSitting?.answers.N4 === 'never');
    await waitForFinding(retakeSitting!.id);
    const afterRetake = await coachReads(coach!.context, '6-coach');
    const retakeSupports = afterRetake.noticed.split('\n').find((line) => line.includes('currently supports:')) ?? '';
    const headacheAfter = signalRowText(afterRetake.signals, 'Headaches')[0] ?? '';
    record('6. The questionnaire headache is no longer presented as current', !retakeSupports.includes('Headaches') && headacheAfter.includes('Reported before, not current'), `${retakeSupports} || ${headacheAfter.slice(0, 200)}`);
    record('6. The trace says why', traceText(afterRetake.noticed, questionPrompt('N4')).includes('Not active: answered Rarely or Never.'));
    const { data: allHeadache } = await service.from('cross_system_signals').select('value_label, source_key').eq('member_id', MEMBER_ID).eq('signal_slug', 'headaches').in('source_session_id', [sitting!.id, retakeSitting!.id]);
    const { count: oldFindings } = await service.from('cross_system_root_findings').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('source_session_id', sitting!.id);
    record('6. History is preserved: the Often and the Never are both stored, and the first sitting\'s findings remain', (allHeadache ?? []).map((row) => row.value_label).sort().join(',') === 'Never,Often' && (oldFindings ?? 0) > 0, `${(allHeadache ?? []).map((row) => row.value_label).join(',')}; ${oldFindings} findings still on the first sitting`);
    record('6. Bloating and sleep are still current after the retake', ['Bloating after eating', 'Lighter or broken sleep'].every((name) => retakeSupports.includes(name)));

    // ---- 9. Every member route, scanned.
    const ROUTES = ['/dashboard', '/today', '/checkin', '/checkin/evening', '/body-systems', '/progress', '/profile'];
    for (const route of ROUTES) {
      const page = await member!.context.newPage();
      listen(page, walk);
      await go(page, route);
      await pause(1500);
      await page.close();
    }
    const leaks: string[] = [];
    for (const { url, body } of walk.bodies) {
      for (const word of COACH_ONLY_WORDS) if (body.includes(word)) leaks.push(`"${word}" in ${url.slice(0, 90)}`);
    }
    record('9. Zero hits for the thirteen coach-only phrases in every member response body', leaks.length === 0, leaks.length ? leaks.slice(0, 6).join(' | ') : `${walk.bodies.length} response bodies from the survey, its results, the Daily Reset and ${ROUTES.length} routes`);
    record('9. Zero console errors on her screens', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 5).join(' | '));

    const asMember = createClient(process.env.PROD_SUPABASE_URL!, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${member!.session.access_token}` } },
    });
    const fenced = ['cross_system_signals', 'cross_system_root_findings', 'cross_system_root_finding_triggers', 'cross_system_signal_source_map_revisions', 'cross_system_signal_source_map'];
    const readable: string[] = [];
    for (const table of fenced) {
      const { data } = await asMember.from(table).select('*').limit(5);
      if ((data ?? []).length > 0) readable.push(`${table}=${data!.length}`);
    }
    record('9. Her own session reads 0 rows from every table this build writes or reads', readable.length === 0, readable.join(', ') || fenced.join(', '));
  } catch (error) {
    record('The flow completed without throwing', false, String(error).slice(0, 400));
  } finally {
    if (member) await retireSession(member);
    if (coach) await retireSession(coach);
    await browser.close();
  }
}

const phase = process.argv[2];
const run = phase === 'existing' ? existingPhase : phase === 'flow' ? flowPhase : null;
if (!run) {
  console.error('Usage: verify-questionnaire-root-live.ts existing|flow');
  process.exit(2);
}
run()
  .catch((error) => record('The phase completed without throwing', false, String(error).slice(0, 400)))
  .finally(() => {
    const passed = results.filter((result) => result.pass).length;
    console.log(`\n${passed} of ${results.length} checks passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  });
