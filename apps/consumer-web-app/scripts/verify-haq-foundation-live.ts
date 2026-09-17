#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the HAQ foundation (Prompt 1 of 3).
 *
 * TWO MODES, run either side of `supabase db push` and the deploy.
 *
 *   HAQ_LIVE_MODE=snapshot   BEFORE migration 262 reaches production. Reads
 *                            every existing assessment's content (hashed)
 *                            and walks the test member's screens, recording
 *                            what each questionnaire route shows. Writes it
 *                            to HAQ_SNAPSHOT_FILE, which must be outside the
 *                            repository.
 *   HAQ_LIVE_MODE=verify     AFTER. Checks the seeded HAQ against the
 *                            specification in the database, re-reads the
 *                            same content and compares it with the
 *                            snapshot, and walks the same screens: nothing
 *                            HAQ related may appear, and every existing
 *                            questionnaire route must show what it showed
 *                            before.
 *
 * READ ONLY. Nothing is inserted, updated or deleted. The member session is
 * minted (Turnstile blocks a scripted form sign-in by design) and retired
 * with scope 'local' when the walk ends. No page render writes, per the
 * standing rule, so walking the screens leaves no row behind.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   HAQ_LIVE_MODE=verify HAQ_SNAPSHOT_FILE=/outside/the/repo/haq-snapshot.json \
 *   npx tsx scripts/verify-haq-foundation-live.ts
 */
import { chromium, type Page } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { selectAllRows } from '../lib/data/pagedSelect';
import { listMemberFacingAssessments } from '../lib/assessment-registry/registry';
import { HAQ_QUESTIONS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import { SPEC_BOUNDARIES, SPEC_HIDDEN_VALUES, SPEC_SPOT_CHECKS } from '../tests/haq-spec';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.HAQ_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MODE = process.env.HAQ_LIVE_MODE === 'snapshot' ? 'snapshot' : 'verify';
const SNAPSHOT_FILE = process.env.HAQ_SNAPSHOT_FILE;
if (!SNAPSHOT_FILE) throw new Error('HAQ_SNAPSHOT_FILE is required');
if (SNAPSHOT_FILE.startsWith(process.cwd())) throw new Error('HAQ_SNAPSHOT_FILE must be outside the repository');

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

function hash(rows: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
}

/** Content tables whose every row must be byte identical before and after. */
const CONTENT_TABLES: Array<{ table: string; order: string }> = [
  { table: 'assessment_definitions', order: 'id' },
  { table: 'assessment_definition_versions', order: 'id' },
  { table: 'body_systems_sections', order: 'section_key' },
  { table: 'body_systems_questions', order: 'question_ref' },
  { table: 'body_systems_scale_options', order: 'value_key' },
  { table: 'body_systems_bands', order: 'band_key' },
  { table: 'body_systems_red_flags', order: 'flag_key' },
  { table: 'body_systems_safety_levels', order: 'level' },
  { table: 'body_systems_copy', order: 'copy_key' },
  { table: 'body_systems_settings', order: 'setting_key' },
  { table: 'body_systems_associations', order: 'entry_code' },
];

type ContentSnapshot = Record<string, { count: number; hash: string }>;

async function readContent(): Promise<ContentSnapshot> {
  const out: ContentSnapshot = {};
  for (const { table, order } of CONTENT_TABLES) {
    const { rows, error } = await selectAllRows<Record<string, unknown>>(() =>
      service.from(table).select('*').order(order, { ascending: true })
    );
    if (error) throw new Error(`${table}: ${(error as { message?: string }).message}`);
    out[table] = { count: rows.length, hash: hash(rows) };
  }

  // Every unified definition other than the HAQ, with its sections and questions.
  const { rows: definitions } = await selectAllRows<Record<string, unknown>>(() =>
    service.from('unified_assessment_definitions').select('*').neq('key', 'haq').order('id', { ascending: true })
  );
  out['unified_assessment_definitions (not haq)'] = { count: definitions.length, hash: hash(definitions) };
  for (const definition of definitions) {
    const id = definition.id as string;
    const { rows: sections } = await selectAllRows<Record<string, unknown>>(() =>
      service.from('unified_assessment_sections').select('*').eq('assessment_definition_id', id).order('id', { ascending: true })
    );
    const { rows: questions } = await selectAllRows<Record<string, unknown>>(() =>
      service.from('unified_assessment_questions').select('*').eq('assessment_definition_id', id).order('id', { ascending: true })
    );
    out[`${definition.key} sections`] = { count: sections.length, hash: hash(sections) };
    out[`${definition.key} questions`] = { count: questions.length, hash: hash(questions) };
  }
  return out;
}

type RouteReading = { route: string; finalPath: string; status: number; heading: string; errorPage: boolean };
type WalkSnapshot = {
  routes: RouteReading[];
  questionnaireHeadings: string[];
  visibleHaqWordCount: Record<string, number>;
};

const SCREENS = ['/dashboard', '/questionnaires', '/today', '/progress'];

function questionnaireRoutes(): string[] {
  const fromRegistry = listMemberFacingAssessments().map((entry) => entry.route);
  return [...new Set([...fromRegistry, '/body-systems', '/breathing-check-in', '/health-intake', '/whole-body-signal'])]
    .filter((route) => route !== '/questionnaires')
    .sort();
}

async function go(page: Page, route: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return response?.status() ?? 0;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  return 0;
}

async function walkMember(): Promise<{ snapshot: WalkSnapshot; haqLeaks: string[]; consoleErrors: string[]; loginLanded: string[] }> {
  const browser = await chromium.launch();
  const minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 } });
  if (!minted) throw new Error('Could not mint a member session');

  const haqLeaks: string[] = [];
  const consoleErrors: string[] = [];
  const loginLanded: string[] = [];
  const snapshot: WalkSnapshot = { routes: [], questionnaireHeadings: [], visibleHaqWordCount: {} };

  try {
    const page = await minted.context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text().slice(0, 160)}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${page.url()}: ${String(error).slice(0, 160)}`));
    page.on('response', async (response) => {
      try {
        if (!response.url().startsWith(BASE)) return;
        const type = response.headers()['content-type'] ?? '';
        if (!/text|json|x-component/.test(type)) return;
        const body = await response.text();
        for (const needle of ['Health Appraisal', 'haq_p', 'haq_v1', 'haq_section', 'haq_question', 'haq_member']) {
          if (body.includes(needle)) haqLeaks.push(`${response.url()} carries "${needle}"`);
        }
      } catch {
        /* an unreadable body carried nothing */
      }
    });

    for (const route of [...SCREENS, ...questionnaireRoutes()]) {
      const status = await go(page, route);
      const finalPath = new URL(page.url()).pathname;
      if (finalPath.startsWith('/login')) loginLanded.push(route);
      const heading = ((await page.locator('h1').first().textContent({ timeout: 3000 }).catch(() => '')) ?? '').trim();
      const text = await page.locator('body').innerText().catch(() => '');
      const errorPage = /Something went wrong/.test(text) || /could not be found|404/i.test(heading);
      snapshot.routes.push({ route, finalPath, status, heading, errorPage });
      snapshot.visibleHaqWordCount[route] = (text.match(/\bHAQ\b/g) ?? []).length;

      const links = await page.locator('a[href]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''));
      for (const href of links) {
        if (/haq/i.test(href) && !/short-haq/.test(href)) haqLeaks.push(`${route} links to ${href}`);
      }
      if (/Health Appraisal/i.test(text)) haqLeaks.push(`${route} shows "Health Appraisal"`);

      if (route === '/questionnaires') {
        snapshot.questionnaireHeadings = (
          await page.locator('h2, h3').evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? '').trim()))
        ).filter(Boolean);
      }
    }
  } finally {
    await retireSession(minted);
    await browser.close();
  }
  return { snapshot, haqLeaks, consoleErrors, loginLanded };
}

async function verifyDatabase(): Promise<void> {
  const { data: definition } = await service.from('unified_assessment_definitions').select('*').eq('key', 'haq').maybeSingle();
  record(
    'DB: HAQ definition exists on the shared runtime, version 1, haq_v1, with no catalog bridge',
    Boolean(definition) &&
      definition!.version === 1 &&
      definition!.catalog_definition_id === null &&
      (definition!.scoring_profile as { haq_version?: string })?.haq_version === 'haq_v1',
    definition ? `version ${definition.version}, catalog ${definition.catalog_definition_id}` : 'missing'
  );
  if (!definition) return;

  const { data: catalog } = await service.from('assessment_definitions').select('id').eq('key', 'haq');
  record('DB: no catalog row for haq (nothing in the member catalog)', (catalog ?? []).length === 0);

  const { rows: questions } = await selectAllRows<Record<string, unknown>>(() =>
    service
      .from('unified_assessment_questions')
      .select('id, question_key, version, prompt, haq_questions(response_type, section_id)')
      .eq('assessment_definition_id', definition.id as string)
      .order('id', { ascending: true })
  );
  const { rows: haqQuestions } = await selectAllRows<Record<string, unknown>>(() =>
    service.from('haq_questions').select('question_key').order('question_id', { ascending: true })
  );
  record('DB: 260 seeded HAQ questions', questions.length === 260 && haqQuestions.length === 260, `${questions.length} runtime rows, ${haqQuestions.length} haq_questions rows`);

  // scale-exempt: the instrument's 21 sections
  const { data: sections } = await service.from('haq_sections').select('section_id, display_order').order('display_order');
  const { count: unifiedSections } = await service
    .from('unified_assessment_sections')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_definition_id', definition.id as string);
  record(
    'DB: 21 sections, in the specified order',
    (sections ?? []).length === 21 &&
      unifiedSections === 21 &&
      JSON.stringify((sections ?? []).map((s) => s.section_id)) === JSON.stringify(HAQ_SECTIONS.map((s) => s.id)),
    `${(sections ?? []).length} haq_sections, ${unifiedSections} runtime sections`
  );

  // scale-exempt: the instrument's 21 sections
  const { data: cutoffs } = await service.from('haq_section_cutoffs').select('section_id, green_max, yellow_max');
  const mismatched = SPEC_BOUNDARIES.filter(([sectionId, greenTop, , yellowTop]) => {
    const row = (cutoffs ?? []).find((c) => c.section_id === sectionId);
    return !row || row.green_max !== greenTop || row.yellow_max !== yellowTop;
  }).map(([id]) => id);
  record('DB: cutoffs match the prompt for all 21 sections', (cutoffs ?? []).length === 21 && mismatched.length === 0, mismatched.join(', '));

  // scale-exempt: the locked response scale, six rows
  const { data: scale } = await service.from('haq_response_scale').select('response_type, response_value, hidden_value');
  const scaleRows = (scale ?? []).map((r) => `${r.response_type}/${r.response_value}=${r.hidden_value}`).sort();
  const expectedScale = SPEC_HIDDEN_VALUES.map(([t, v, n]) => `${t}/${v}=${n}`).sort();
  record('DB: response values 0/1/4/8 and 0/8, nothing else', JSON.stringify(scaleRows) === JSON.stringify(expectedScale), scaleRows.join(' '));

  const byKey = new Map(questions.map((q) => [q.question_key as string, q]));
  const wrongWording = HAQ_QUESTIONS.filter((q) => byKey.get(q.key)?.prompt !== q.prompt).map((q) => q.key);
  const wrongType = HAQ_QUESTIONS.filter((q) => {
    const meta = byKey.get(q.key)?.haq_questions as { response_type: string } | Array<{ response_type: string }> | undefined;
    const resolved = Array.isArray(meta) ? meta[0] : meta;
    return resolved?.response_type !== q.responseType;
  }).map((q) => q.key);
  record('DB: all 260 wordings and response types match the authored bank', wrongWording.length === 0 && wrongType.length === 0, [...wrongWording, ...wrongType].join(', '));

  for (const [key, prompt, responseType] of SPEC_SPOT_CHECKS) {
    const row = byKey.get(key);
    const meta = row?.haq_questions as { response_type: string } | Array<{ response_type: string }> | undefined;
    const resolved = Array.isArray(meta) ? meta[0] : meta;
    record(
      `DB spot check: ${key}`,
      row?.prompt === prompt && resolved?.response_type === responseType && row?.version === 1,
      `"${row?.prompt}" [${resolved?.response_type}]`
    );
  }

  const { count: sessions } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_definition_id', definition.id as string);
  record('DB: no HAQ instance exists for anybody', sessions === 0, `${sessions} sessions`);
}

/** Home greets by time of day, which is not a change to the screen. */
function timeless(heading: string): string {
  return heading.replace(/^Good (morning|afternoon|evening)/, 'Good <time of day>');
}

async function main(): Promise<void> {
  if (MODE === 'snapshot') {
    const content = await readContent();
    const walk = await walkMember();
    writeFileSync(SNAPSHOT_FILE!, JSON.stringify({ takenAt: new Date().toISOString(), content, walk: walk.snapshot }, null, 2));
    console.log(`snapshot written: ${Object.keys(content).length} content sets, ${walk.snapshot.routes.length} routes`);
    console.log(`login landings: ${walk.loginLanded.length}, console errors: ${walk.consoleErrors.length}`);
    return;
  }

  if (!existsSync(SNAPSHOT_FILE!)) throw new Error('No snapshot to compare with');
  const before = JSON.parse(readFileSync(SNAPSHOT_FILE!, 'utf8')) as {
    content: ContentSnapshot;
    walk: WalkSnapshot;
  };

  await verifyDatabase();

  const after = await readContent();
  const changed = Object.keys({ ...before.content, ...after }).filter(
    (key) => JSON.stringify(before.content[key]) !== JSON.stringify(after[key])
  );
  record(
    `DB: every existing assessment's content is unchanged (${Object.keys(after).length} content sets, Body Systems Survey included)`,
    changed.length === 0,
    changed.join(', ')
  );

  const walk = await walkMember();
  record('Member: every screen opened signed in (none landed on login)', walk.loginLanded.length === 0, walk.loginLanded.join(', '));
  for (const screen of SCREENS) {
    const reading = walk.snapshot.routes.find((r) => r.route === screen)!;
    const screenLeaks = walk.haqLeaks.filter((leak) => leak.includes(screen));
    record(
      `Member: nothing HAQ related on ${screen}`,
      !reading.errorPage && screenLeaks.length === 0 && walk.snapshot.visibleHaqWordCount[screen] === before.walk.visibleHaqWordCount[screen],
      `landed ${reading.finalPath}, "HAQ" shown ${walk.snapshot.visibleHaqWordCount[screen]} times (before ${before.walk.visibleHaqWordCount[screen]})`
    );
  }
  record('Member: no response body anywhere in the walk carries HAQ content', walk.haqLeaks.length === 0, walk.haqLeaks.slice(0, 5).join(' | '));
  record(
    'Member: the questionnaire list shows the same headings as before',
    JSON.stringify(walk.snapshot.questionnaireHeadings) === JSON.stringify(before.walk.questionnaireHeadings),
    walk.snapshot.questionnaireHeadings.join(' | ')
  );

  for (const reading of walk.snapshot.routes.filter((r) => !SCREENS.includes(r.route))) {
    const previous = before.walk.routes.find((r) => r.route === reading.route);
    record(
      `Member: ${reading.route} opens as before`,
      Boolean(previous) &&
        !reading.errorPage &&
        reading.status < 400 &&
        reading.finalPath === previous!.finalPath &&
        timeless(reading.heading) === timeless(previous!.heading),
      `landed ${reading.finalPath}, heading "${reading.heading}" (before: ${previous?.finalPath}, "${previous?.heading}")`
    );
  }

  record('Member: zero console or page errors across the walk', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 5).join(' | '));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
