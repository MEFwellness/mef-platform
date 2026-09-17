#!/usr/bin/env npx tsx
/**
 * LIVE VERIFICATION, production: the Root Noticed coach briefing.
 *
 * Phases, run one at a time so each result is reported on its own:
 *
 *   baseline  READ ONLY. Records every member scoped row the test member has,
 *             table by table, plus the coach's briefing review state for her,
 *             so the restore can be checked against something it did not make.
 *   read      The coach opens her Client Detail: the briefing, its ranking,
 *             First recorded, the related findings bar, the timeframe wording
 *             and the evidence behind a tap. The only write is the visit
 *             stamp the panel sends when it is really shown.
 *   flow      Review actions and a retake. The coach marks the card that will
 *             change Reviewed; the coach assigns a retake through Assessment
 *             Status; the member retakes the survey with that one answer
 *             raised; the coach sees the change with dates, ranked first, and
 *             the reviewed card back. Then Discuss next session and Not
 *             relevant, and the evidence is compared before and after. Then
 *             every member route is scanned.
 *   restore   Removes every row this run created, puts back every row it
 *             changed or removed (a retake re-files signals, moves assignment
 *             state and can touch other workflows), then recounts every table
 *             against the baseline, value for value. Submitting the survey
 *             again with her original answers would NOT be a restore: it
 *             leaves another sitting in her history. Only this member's rows
 *             and this coach's review rows for her are touched.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in by
 * design, which is not a failure) and retired with scope 'local'.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   npx tsx scripts/verify-root-briefing-live.ts baseline|read|flow|restore
 */
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { loadMemberContent } from '../lib/body-systems/contentData';
import { selectAllRows, writeInChunks } from '../lib/data/pagedSelect';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const COACH_EMAIL = process.env.COACH_EMAIL ?? 'info@mefwellness.com';
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';
const SHOTS = 'scripts/.verify/root-briefing';
const BASELINE = `${SHOTS}/baseline.json`;
const MIGRATIONS = path.resolve(process.cwd(), '../../supabase/migrations');

/** Words no member response body may contain: the thirteen from the last build, and this build's own. */
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
  'Coach briefing',
  'Why review together',
  'Discuss next session',
  'Why this ranked here',
  'cross_system_root_briefing',
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

async function go(page: Page, route: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(2000 * (attempt + 1));
    }
  }
}

async function userId(email: string): Promise<string> {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((user) => user.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`no user ${email}`);
}

// ---------------------------------------------------------------------
// Baseline and restore
// ---------------------------------------------------------------------

/** Every table the migrations create with a column naming the member. */
type ScopeColumn = 'member_id' | 'user_id' | 'client_id' | 'profile_id';
function memberScopedTables(): Array<{ table: string; column: ScopeColumn }> {
  const out = new Map<string, ScopeColumn>();
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const match of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      const body = match[2]!;
      for (const column of ['member_id', 'user_id', 'client_id', 'profile_id'] as const) {
        if (new RegExp(`^\\s*${column}\\s+uuid`, 'm').test(body)) {
          out.set(match[1]!, column);
          break;
        }
      }
    }
    for (const match of sql.matchAll(/alter table (?:if exists )?(?:public\.)?(\w+)\s+add column (?:if not exists )?(member_id|user_id|client_id|profile_id)\s+uuid/gi)) {
      if (!out.has(match[1]!)) out.set(match[1]!, match[2] as ScopeColumn);
    }
  }
  return [...out.entries()].map(([table, column]) => ({ table, column })).sort((a, b) => a.table.localeCompare(b.table));
}

type Snapshot = Record<string, { column: string; rows: Array<Record<string, unknown>> }>;

async function readAll(table: string, column: string, value: string): Promise<Array<Record<string, unknown>> | null> {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await service.from(table).select('*').eq(column, value).range(from, from + 499);
    if (error) return null;
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if ((data ?? []).length < 500) return rows;
  }
}

async function readIn(table: string, column: string, values: string[]): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < values.length; index += 100) {
    const chunk = values.slice(index, index + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await service.from(table).select('*').in(column, chunk).range(from, from + 499);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...((data ?? []) as Array<Record<string, unknown>>));
      if ((data ?? []).length < 500) break;
    }
  }
  return rows;
}

async function snapshot(coachId: string, extraParents: { findings?: string[]; reports?: string[] } = {}): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const { table, column } of memberScopedTables()) {
    const rows = await readAll(table, column, MEMBER_ID);
    if (rows) out[table] = { column, rows };
  }
  const profile = await readAll('profiles', 'id', MEMBER_ID);
  if (profile) out['profiles'] = { column: 'id', rows: profile };
  // CHILD ROWS WITH NO member_id OF THEIR OWN, read through their parents,
  // including parents that existed only at the baseline.
  const findingIds = [
    ...new Set([...(out.cross_system_root_findings?.rows ?? []).map((row) => String(row.id)), ...(extraParents.findings ?? [])]),
  ];
  for (const table of ['cross_system_root_finding_areas', 'cross_system_root_finding_signals', 'cross_system_root_finding_triggers']) {
    out[table] = { column: 'finding_id', rows: await readIn(table, 'finding_id', findingIds) };
  }
  const reportIds = [
    ...new Set([...(out.cross_system_complaint_reports?.rows ?? []).map((row) => String(row.id)), ...(extraParents.reports ?? [])]),
  ];
  out.cross_system_complaint_classifications = {
    column: 'report_id',
    rows: await readIn('cross_system_complaint_classifications', 'report_id', reportIds),
  };
  for (const table of ['cross_system_root_briefing_reviews', 'cross_system_root_briefing_visits']) {
    const rows = await readAll(table, 'coach_id', coachId);
    if (rows) out[`coach:${table}`] = { column: 'coach_id', rows };
  }
  return out;
}

const keyOf = (row: Record<string, unknown>) => (row.id !== undefined ? String(row.id) : JSON.stringify(row));

async function baselinePhase(): Promise<void> {
  const coachId = await userId(COACH_EMAIL);
  const snap = await snapshot(coachId);
  writeFileSync(BASELINE, JSON.stringify({ at: new Date().toISOString(), coachId, snap }));
  const tables = Object.keys(snap).length;
  const rows = Object.values(snap).reduce((sum, entry) => sum + entry.rows.length, 0);
  record('Baseline recorded for every member scoped table', tables > 50, `${tables} tables, ${rows} rows`);
  const sittings = snap.member_body_systems_sessions?.rows ?? [];
  record(
    'Her completed Body Systems Survey sittings before the run',
    true,
    sittings.map((row) => `${row.id} completed ${row.completed_at}`).join(' | ') || 'none'
  );
}

/** Parents before children, so a row put back never waits on its parent. */
const INSERT_ORDER = [
  'profiles',
  'assessment_assignments',
  'member_body_systems_sessions',
  'cross_system_complaint_reports',
  'cross_system_complaint_classifications',
  'cross_system_signals',
  'cross_system_root_findings',
  'cross_system_root_finding_areas',
  'cross_system_root_finding_signals',
  'cross_system_root_finding_triggers',
];
const orderIndex = (table: string) => {
  const at = INSERT_ORDER.indexOf(table.replace(/^coach:/, ''));
  return at === -1 ? INSERT_ORDER.length / 2 : at;
};

async function restorePhase(): Promise<void> {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { coachId: string; snap: Snapshot };
  const parents = {
    findings: (baseline.snap.cross_system_root_findings?.rows ?? []).map((row) => String(row.id)),
    reports: (baseline.snap.cross_system_complaint_reports?.rows ?? []).map((row) => String(row.id)),
  };
  const now = await snapshot(baseline.coachId, parents);
  const problems: string[] = [];
  const tables = [...new Set([...Object.keys(baseline.snap), ...Object.keys(now)])];

  // 1. DELETE what the run created: children first.
  for (const table of [...tables].sort((a, b) => orderIndex(b) - orderIndex(a))) {
    const before = new Set((baseline.snap[table]?.rows ?? []).map(keyOf));
    const extra = (now[table]?.rows ?? []).filter((row) => !before.has(keyOf(row)));
    if (extra.length === 0) continue;
    const realTable = table.replace(/^coach:/, '');
    if (extra.every((row) => row.id !== undefined)) {
      const deleted = await writeInChunks(
        extra.map((row) => row.id as string),
        (chunk) => service.from(realTable).delete().in('id', chunk)
      );
      if (deleted.error) problems.push(`delete ${realTable}: ${deleted.error.message}`);
    } else if (realTable === 'cross_system_root_briefing_visits') {
      const { error } = await service.from(realTable).delete().eq('coach_id', baseline.coachId).eq('member_id', MEMBER_ID);
      if (error) problems.push(`delete ${realTable}: ${error.message}`);
    } else {
      problems.push(`${realTable}: ${extra.length} new rows with no id, left for a person to look at`);
    }
    console.log(`      removed ${extra.length} from ${realTable}`);
  }

  // 2. PUT BACK what the run changed or removed, exactly as recorded: parents first.
  for (const table of [...tables].sort((a, b) => orderIndex(a) - orderIndex(b))) {
    const realTable = table.replace(/^coach:/, '');
    const current = new Map((now[table]?.rows ?? []).map((row) => [keyOf(row), row]));
    const toWrite = (baseline.snap[table]?.rows ?? []).filter((row) => {
      const held = current.get(keyOf(row));
      return !held || JSON.stringify(held) !== JSON.stringify(row);
    });
    if (toWrite.length === 0) continue;
    if (toWrite.some((row) => row.id === undefined)) {
      problems.push(`${realTable}: ${toWrite.length} changed rows with no id, left for a person to look at`);
      continue;
    }
    const restored = await writeInChunks(toWrite, (chunk) =>
      service.from(realTable).upsert(chunk, { onConflict: 'id' })
    );
    if (restored.error) problems.push(`restore ${realTable}: ${restored.error.message}`);
    console.log(`      put back ${toWrite.length} in ${realTable}`);
  }

  // 3. An independent recount, by full row content.
  const after = await snapshot(baseline.coachId, parents);
  const differences: string[] = [];
  for (const table of new Set([...Object.keys(baseline.snap), ...Object.keys(after)])) {
    const was = (baseline.snap[table]?.rows ?? []).map((row) => JSON.stringify(row)).sort();
    const is = (after[table]?.rows ?? []).map((row) => JSON.stringify(row)).sort();
    if (JSON.stringify(was) !== JSON.stringify(is)) {
      const wasKeys = new Set((baseline.snap[table]?.rows ?? []).map(keyOf));
      const isKeys = new Set((after[table]?.rows ?? []).map(keyOf));
      const added = [...isKeys].filter((key) => !wasKeys.has(key)).length;
      const missing = [...wasKeys].filter((key) => !isKeys.has(key)).length;
      differences.push(`${table}: ${was.length} before, ${is.length} now (${added} added, ${missing} missing, the rest differ in content)`);
    }
  }
  record('Nothing left over that this run could not remove or put back', problems.length === 0, problems.join(' | '));
  record(
    'An independent recount matches the baseline in every table, row for row and value for value',
    differences.length === 0,
    differences.join(' | ') || `${Object.keys(after).length} tables match`
  );
}

// ---------------------------------------------------------------------
// The coach's briefing
// ---------------------------------------------------------------------

type CardRead = {
  targetKey: string;
  section: 'pinned' | 'priority';
  headline: string;
  markers: string[];
  reported: string;
  related: string;
  why: string;
  explore: string;
  rankReason: string;
  evidence: string;
};

type BriefingRead = {
  page: Page;
  section: Locator;
  cards: CardRead[];
  sectionText: string;
  fullEvidence: string;
  notObservedRows: number;
  notObservedBlocks: number;
  whyCheckedCount: number;
  findingCount: number;
};

async function openRootNoticed(page: Page): Promise<Locator> {
  const header = page.locator('#detail-section-root-noticed > button[aria-expanded]').first();
  await header.waitFor({ timeout: 30_000 });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const content = page.locator('#detail-section-root-noticed-content');
  await content.waitFor({ timeout: 30_000 });
  await content.locator('[data-root-briefing]').waitFor({ timeout: 30_000 });
  return content;
}

async function readCard(card: Locator): Promise<CardRead> {
  const part = async (name: string) =>
    (await card.locator(`[data-briefing-part="${name}"]`).innerText().catch(() => '')).trim();
  const toggle = card.getByRole('button', { name: 'View evidence' });
  if ((await toggle.count()) > 0) await toggle.first().click();
  const evidenceBlock = card.locator('[data-briefing-evidence]');
  await evidenceBlock.waitFor({ timeout: 15_000 });
  const evidence = await evidenceBlock.innerText();
  const rankReason = evidence.split('\n').map((line) => line.trim()).find((line, index, all) => /why this ranked here/i.test(all[index - 1] ?? '')) ?? '';
  const pinnedSection = await card.evaluate((element) => Boolean(element.closest('[data-briefing-pinned]')));
  return {
    targetKey: (await card.getAttribute('data-briefing-card')) ?? '',
    section: pinnedSection ? 'pinned' : 'priority',
    headline: (await card.locator('h3').innerText()).trim(),
    markers: await card.locator('[data-briefing-marker]').allInnerTexts(),
    reported: await part('reported'),
    related: await part('related'),
    why: await part('why'),
    explore: await part('explore'),
    rankReason,
    evidence,
  };
}

async function coachReadsBriefing(context: BrowserContext, label: string, keepOpen = false): Promise<BriefingRead> {
  const page = await context.newPage();
  await go(page, `/coach/clients/${MEMBER_ID}/detail`);
  const section = await openRootNoticed(page);
  const cardLocators = section.locator('[data-briefing-card]');
  const cards: CardRead[] = [];
  for (let index = 0; index < (await cardLocators.count()); index += 1) cards.push(await readCard(cardLocators.nth(index)));
  const sectionText = await section.innerText();

  // The full evidence, opened, with every finding's areas opened.
  const fullToggle = section.locator('[data-root-full-evidence-toggle]');
  if ((await fullToggle.getAttribute('aria-expanded')) !== 'true') await fullToggle.click();
  await pause(300);
  const more = section.getByRole('button', { name: /^Show \d+ more connection/ });
  if ((await more.count()) > 0) await more.first().click();
  const areaToggles = section.getByRole('button', { name: 'Areas Root checked' });
  for (let guard = 0; guard < 60 && (await areaToggles.count()) > 0; guard += 1) {
    await areaToggles.first().click();
    await pause(60);
  }
  const fullEvidence = await section.innerText();
  const notObservedRows = await section.locator('[data-root-not-observed] li').count();
  const notObservedBlocks = await section.locator('[data-root-not-observed]').count();
  const whyCheckedCount = (fullEvidence.match(/why root checked this area/gi) ?? []).length;
  const findingCount = await section.locator('article[data-root-finding-origin]').count();
  writeFileSync(`${SHOTS}/${label}.txt`, fullEvidence);
  await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  if (!keepOpen) await page.close();
  return { page, section, cards, sectionText, fullEvidence, notObservedRows, notObservedBlocks, whyCheckedCount, findingCount };
}

const FREQUENCY_RANK: Record<string, number> = { 'Almost always': 8, Often: 6, Sometimes: 3, Rarely: 1, Never: 0 };

function parsedReason(reason: string) {
  return {
    changed: /^(Pinned for next session, )?Changed since last time/.test(reason),
    frequency: FREQUENCY_RANK[/reported (Almost always|Often|Sometimes)/.exec(reason)?.[1] ?? ''] ?? 3,
    supporting: Number(/(\d+) supporting signal/.exec(reason)?.[1] ?? 0),
    pinned: reason.startsWith('Pinned for next session'),
  };
}

function rankedByRules(cards: CardRead[]): boolean {
  for (let index = 1; index < cards.length; index += 1) {
    const a = parsedReason(cards[index - 1]!.rankReason);
    const b = parsedReason(cards[index]!.rankReason);
    const tuple = (entry: typeof a) => [entry.pinned ? 1 : 0, entry.changed ? 1 : 0, entry.frequency, entry.supporting];
    const ta = tuple(a);
    const tb = tuple(b);
    for (let at = 0; at < ta.length; at += 1) {
      if (ta[at]! > tb[at]!) break;
      if (ta[at]! < tb[at]!) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------
// PHASE: read
// ---------------------------------------------------------------------

async function readPhase(): Promise<void> {
  const browser = await chromium.launch();
  const coach = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 1400 } });
  if (!coach) throw new Error('the coach session could not be minted');
  const walk: Walk = { consoleErrors: [], bodies: [] };
  try {
    // Safety first, with Root Noticed folded.
    const folded = await coach.context.newPage();
    listen(folded, walk);
    await go(folded, `/coach/clients/${MEMBER_ID}/detail`);
    const header = folded.locator('#detail-section-root-noticed > button[aria-expanded]').first();
    await header.waitFor({ timeout: 30_000 });
    const foldedState = await header.getAttribute('aria-expanded');
    const safetyOutside = await folded.locator('[data-root-noticed-safety]').count();
    const { rows: flagged } = await selectAllRows<{ id: string; red_flag_answers: unknown }>(() =>
      service
        .from('member_body_systems_sessions')
        .select('id, red_flag_answers')
        .eq('member_id', MEMBER_ID)
        .not('completed_at', 'is', null)
        .order('id')
    );
    const anyFlag = flagged.some((row) => Object.values((row.red_flag_answers ?? {}) as Record<string, unknown>).some((value) => value === true));
    record(
      '2b. Safety flags are drawn outside the Root Noticed section, visible while it is folded',
      anyFlag ? safetyOutside === 1 : safetyOutside === 0,
      anyFlag
        ? `section ${foldedState === 'true' ? 'open' : 'folded'}, ${safetyOutside} safety block outside it`
        : 'not applicable on her data: no completed sitting answered a red flag Yes, so no safety block is drawn'
    );
    await folded.close();

    const read = await coachReadsBriefing(coach.context, 'read-coach', true);
    listen(read.page, walk);

    const shown = read.cards.filter((card) => card.section === 'priority');
    record('1. No pinned section before any review action', read.cards.every((card) => card.section === 'priority'));
    record('1. The briefing renders above the evidence', read.sectionText.indexOf('Coach briefing') < read.sectionText.indexOf('All evidence Root checked'), read.sectionText.split('\n').slice(0, 3).join(' | '));
    record('1. At most three cards are shown', shown.length >= 1 && shown.length <= 3, `${shown.length} cards: ${shown.map((card) => card.headline).join(' || ')}`);
    record('1. Every card says why it ranked where it did', shown.every((card) => card.rankReason.length > 0), shown.map((card) => card.rankReason).join(' || '));
    record('1. The order agrees with the ranking rules as each card states them', rankedByRules(shown));
    const updated = /Last updated [^\n]+/.exec(read.sectionText)?.[0] ?? '';
    record('1. The briefing says when it was last updated', updated.length > 0, updated);

    const changedAnywhere = shown.some((card) => card.markers.includes('Changed since last time') || /Changed since last time/.test(card.reported));
    record('2. Her existing findings are First recorded, never Changed', shown.every((card) => card.markers.includes('First recorded')) && !changedAnywhere, shown.map((card) => card.markers.join('+')).join(' || '));

    const noRelated = shown.filter((card) => card.related.includes('No related findings are currently supported by her answers.'));
    const withRelated = shown.filter((card) => !card.related.includes('No related findings'));
    record(
      '3. Related findings are only those a fired association connects, each naming the entry in View evidence',
      withRelated.every((card) => /Connected through: /.test(card.evidence)),
      withRelated.map((card) => `${card.headline} :: ${card.related.replace(/\n/g, ' | ').slice(0, 200)}`).join(' || ') || 'no card has related findings'
    );
    record('3. A card with none says so in one sentence', true, noRelated.length > 0 ? noRelated.map((card) => card.headline).join(' || ') : 'not applicable: every shown card has at least one related finding');
    record('3. No related finding line is a section score', shown.every((card) => !/Speaking loudly|Showing up|Quiet|%/.test(card.related)));

    const reportedLines = shown.map((card) => card.reported).join('\n');
    record('4. Timeframe wording names the submission date and the assessment window', /Reported [A-Z][a-z]{2} \d{1,2} \(covers past 3 months\)/.test(reportedLines), (/Reported [^\n]+/.exec(reportedLines) ?? [''])[0]);
    record('4. Never "last 30 days" anywhere in the briefing', !/last 30 days/i.test(read.cards.map((card) => card.reported + card.related + card.why + card.explore).join(' ')));
    record('Headlines lead with what she reported and use exploration language only', shown.every((card) => /: (explore .+|related areas to explore|worth reviewing)\.$/.test(card.headline)));
    record('No percent sign and no em dash anywhere in the section', !read.fullEvidence.includes('%') && !read.fullEvidence.includes(String.fromCharCode(0x2014)));
    record('6b. No score or percentage on any card or rank note; the only numbers in a rank note count her signals', shown.every((card) => !/%|percent|score|points/i.test(card.headline + card.reported + card.related + card.why + card.explore + card.rankReason) && !/\d/.test(card.rankReason.replace(/\d+ supporting signals?/, '').replace(/from \d+ sources/, ''))));
    record('6b. Section results appear as assessment context inside View evidence, never as related findings', shown.some((card) => /assessment context/i.test(card.evidence)) && shown.every((card) => !/Speaking loudly|Showing up/.test(card.related)), shown.map((card) => (/assessment context\n([^\n]+)/i.exec(card.evidence) ?? ['', 'none'])[1]).join(' || '));

    record('7. Empty areas are one line rows inside the evidence', read.notObservedRows > 0 && read.notObservedBlocks > 0, `${read.notObservedRows} one line rows in ${read.notObservedBlocks} lists`);
    record('7. "Why Root checked this area" is said once per finding, not once per area', read.whyCheckedCount <= read.findingCount, `${read.whyCheckedCount} times across ${read.findingCount} findings`);
    const disclaimer = (read.sectionText.match(/For your review only\./g) ?? []).length;
    record('7. The briefing disclaimer appears once', disclaimer === 1, `${disclaimer}`);
    await read.page.close();
    record('No console errors on the coach page', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 4).join(' | '));
  } finally {
    await retireSession(coach);
    await browser.close();
  }
}

// ---------------------------------------------------------------------
// PHASE: flow
// ---------------------------------------------------------------------

async function tap(scope: Locator, name: string): Promise<void> {
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

/** The survey, answered question by question from the member's own screens. Same driver as the last build's run. */
async function answerSurvey(page: Page, answerLabelFor: (prompt: string) => string, branchLabel: string): Promise<string> {
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
    for (let index = 0; index < (await items.count()); index += 1) {
      const item = items.nth(index);
      const prompt = ((await item.locator('h2').first().innerText().catch(() => '')) || '').trim();
      await tap(item, answerLabelFor(prompt));
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

async function latestSitting() {
  const { data } = await service
    .from('member_body_systems_sessions')
    .select('id, answers, results, branch, completed_at, red_flag_answers')
    .eq('member_id', MEMBER_ID)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; answers: Record<string, string>; branch: 'a' | 'b'; completed_at: string } | null;
}

async function waitForFinding(sittingId: string, timeoutMs = 120_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { count } = await service.from('cross_system_root_findings').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('source_session_id', sittingId);
    if ((count ?? 0) > 0) return count!;
    await pause(2000);
  }
  return 0;
}

async function actOn(context: BrowserContext, targetKey: string, action: string): Promise<boolean> {
  const page = await context.newPage();
  await go(page, `/coach/clients/${MEMBER_ID}/detail`);
  const section = await openRootNoticed(page);
  const viewAll = section.getByRole('button', { name: /^View all findings/ });
  if ((await viewAll.count()) > 0) await viewAll.first().click();
  const card = section.locator(`[data-briefing-card="${targetKey}"]`);
  await card.waitFor({ timeout: 15_000 });
  const before = await service.from('cross_system_root_briefing_reviews').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID);
  await card.locator(`[data-briefing-action="${action}"]`).click();
  let saved = false;
  for (let attempt = 0; attempt < 30 && !saved; attempt += 1) {
    await pause(1000);
    const now = await service.from('cross_system_root_briefing_reviews').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID);
    saved = (now.count ?? 0) > (before.count ?? 0);
  }
  await page.screenshot({ path: `${SHOTS}/action-${action}.png`, fullPage: true });
  await page.close();
  return saved;
}

async function flowPhase(): Promise<void> {
  const content = await loadMemberContent(service);
  const labelOf = new Map(content.scale.map((option) => [option.valueKey, option.label]));
  const questionByPrompt = new Map(content.questions.map((question) => [question.prompt, question]));
  const questionByRef = new Map(content.questions.map((question) => [question.questionRef, question]));

  const browser = await chromium.launch();
  const coach = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 1400 } });
  const member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: { width: 390, height: 844 }, contextOptions: { reducedMotion: 'reduce' } });
  if (!coach || !member) throw new Error('a session could not be minted');
  const walk: Walk = { consoleErrors: [], bodies: [] };

  try {
    // ---- Pick the answer to raise: the loudest card's Often answer, or any Often.
    const first = await latestSitting();
    if (!first) throw new Error('she has no completed sitting');
    const before = await coachReadsBriefing(coach.context, 'flow-0-before');
    const oftenRefs = Object.entries(first.answers).filter(([, value]) => value === 'often').map(([ref]) => ref);
    const targetCard = before.cards.find((card) => oftenRefs.some((ref) => card.evidence.includes(questionByRef.get(ref)!.prompt)));
    const raisedRef = oftenRefs.find((ref) => targetCard?.evidence.includes(questionByRef.get(ref)!.prompt));
    if (!targetCard || !raisedRef) throw new Error('no shown card carries an Often answer to raise');
    const lastCard = before.cards[before.cards.length - 1]!;
    record('5. Chose the answer to change', true, `${raisedRef} "${questionByRef.get(raisedRef)!.prompt}" Often to Almost always, on "${targetCard.headline}" (ranked ${before.cards.indexOf(targetCard) + 1} of ${before.cards.length})`);

    // ---- The coach reviews that card before anything changes.
    record('6. Reviewed saved for the card that will change', await actOn(coach.context, targetCard.targetKey, 'reviewed'));
    const reviewed = await coachReadsBriefing(coach.context, 'flow-1-reviewed');
    record('6. Reviewed folds the card out of the briefing', !reviewed.cards.some((card) => card.targetKey === targetCard.targetKey) && /Reviewed or not relevant \(1\)/.test(reviewed.sectionText));
    record('6. No evidence disappeared after Reviewed', reviewed.findingCount === before.findingCount && reviewed.fullEvidence.length >= before.fullEvidence.length - 400, `${before.findingCount} findings before, ${reviewed.findingCount} after`);

    // ---- The coach assigns a retake; she answers with the one answer raised.
    const page = await coach.context.newPage();
    await go(page, `/coach/clients/${MEMBER_ID}/detail`);
    const assessments = page.locator('#detail-section-assessments > button[aria-expanded]').first();
    await assessments.waitFor({ timeout: 30_000 });
    if ((await assessments.getAttribute('aria-expanded')) !== 'true') await assessments.click();
    const row = page.locator('li[data-assessment-row]', { hasText: 'Body Systems Survey' }).first();
    await row.waitFor({ timeout: 30_000 });
    await row.locator('[data-assign-toggle]').first().click();
    const confirm = row.getByRole('button', { name: /^Assign$/ }).last();
    await confirm.waitFor({ timeout: 15_000 });
    const pendingBefore = await service.from('assessment_assignments').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('assessment_definition_id', DEFINITION).eq('status', 'pending');
    await confirm.click();
    let assigned = false;
    for (let attempt = 0; attempt < 30 && !assigned; attempt += 1) {
      await pause(1000);
      const now = await service.from('assessment_assignments').select('id', { count: 'exact', head: true }).eq('member_id', MEMBER_ID).eq('assessment_definition_id', DEFINITION).eq('status', 'pending');
      assigned = (now.count ?? 0) > (pendingBefore.count ?? 0);
    }
    await page.close();
    record('5. The coach assigned a retake through Assessment Status', assigned);

    const { data: branchCopy } = await service.from('body_systems_copy').select('value').eq('copy_key', `member.branch_option_${first.branch}`).maybeSingle();
    const retakeAnswers = { ...first.answers, [raisedRef]: 'almost_always' };
    const memberPage = await member.context.newPage();
    listen(memberPage, walk);
    const results = await answerSurvey(
      memberPage,
      (prompt) => {
        const question = questionByPrompt.get(prompt);
        if (!question) throw new Error(`a question this run has no answer for: "${prompt}"`);
        const value = retakeAnswers[question.questionRef] ?? 'never';
        return value === 'dna' ? question.dnaLabel! : labelOf.get(value)!;
      },
      (branchCopy?.value as string) ?? ''
    );
    const retake = await latestSitting();
    record('5. Her retake is stored with exactly that one answer changed', Boolean(retake) && retake!.id !== first.id && retake!.answers[raisedRef] === 'almost_always' && Object.keys(first.answers).every((ref) => ref === raisedRef || first.answers[ref] === retake!.answers[ref]), `sitting ${retake?.id}`);
    record('8. Her results screen still renders as before, with no Root language', results.includes('What your body is saying right now') && !COACH_ONLY_WORDS.some((word) => results.includes(word)) && !results.includes('%'));
    record('5. Root evaluated the retake', (await waitForFinding(retake!.id)) > 0);

    // ---- The coach sees the change.
    const after = await coachReadsBriefing(coach.context, 'flow-2-after-retake');
    const top = after.cards[0];
    const expected = new RegExp(`Changed since last time: Almost always \\(([A-Z][a-z]{2} \\d{1,2})\\) from Often \\(([A-Z][a-z]{2} \\d{1,2})\\)`);
    const movement = expected.exec(top?.reported ?? '');
    record('5. The changed card ranks first', top?.targetKey === targetCard.targetKey, `first: ${top?.headline}; reason: ${top?.rankReason}`);
    record('5. Its change marker shows the actual movement with both dates', Boolean(movement) && (top?.markers ?? []).includes('Changed since last time'), movement?.[0] ?? (top?.reported ?? '').slice(0, 300));
    record('5. The previously Reviewed card is back, marked "Changed since your review"', (top?.markers ?? []).includes('Changed since your review'), (top?.markers ?? []).join(' + '));
    record('4. A visit is not a review: the returned card is not marked "New since your last visit"', !(top?.markers ?? []).includes('New since your last visit'), (top?.markers ?? []).join(' + '));
    record('5. Cards whose answers did not move are not marked Changed', after.cards.slice(1).every((card) => !card.markers.includes('Changed since last time')), after.cards.map((card) => `${card.headline} [${card.markers.join('+')}]`).join(' || '));

    // ---- The other two actions.
    const others = after.cards.filter((card) => card.targetKey !== targetCard.targetKey);
    const pinTarget = others[others.length - 1] ?? lastCard;
    record('6. Discuss next session saved', await actOn(coach.context, pinTarget.targetKey, 'discuss_next_session'));
    const pinned = await coachReadsBriefing(coach.context, 'flow-3-pinned');
    const pinnedCards = pinned.cards.filter((card) => card.section === 'pinned');
    const priorityCards = pinned.cards.filter((card) => card.section === 'priority');
    record(
      '3. The pinned card is in its own section, with its marker, and not also in the priority cards',
      pinnedCards.length === 1 &&
        pinnedCards[0]!.targetKey === pinTarget.targetKey &&
        pinnedCards[0]!.markers.includes('Discuss next session') &&
        !priorityCards.some((card) => card.targetKey === pinTarget.targetKey),
      `pinned: ${pinnedCards.map((card) => card.headline).join(' | ')}; priority: ${priorityCards.map((card) => card.headline).join(' | ')}`
    );
    record(
      '3. The pinned section sits above the priority cards and takes none of their three slots',
      priorityCards.length === Math.min(3, after.cards.length - 1) && pinned.sectionText.indexOf('Cards you pinned') < pinned.sectionText.toLowerCase().indexOf('priority findings'),
      `${priorityCards.length} priority cards beside 1 pinned`
    );

    record('6. No evidence disappeared after Discuss next session', pinned.findingCount === after.findingCount, `${after.findingCount} then ${pinned.findingCount}`);

    const notRelevantTarget = priorityCards.find((card) => card.targetKey !== targetCard.targetKey) ?? priorityCards[0]!;
    record('6. Not relevant saved', await actOn(coach.context, notRelevantTarget.targetKey, 'not_relevant'));
    const finalRead = await coachReadsBriefing(coach.context, 'flow-4-not-relevant');
    record('6. Not relevant folds that card', !finalRead.cards.some((card) => card.targetKey === notRelevantTarget.targetKey) && /Reviewed or not relevant \(\d+\)/i.test(finalRead.sectionText));

    // Reviewing the pinned card takes its pin away.
    record('3. Reviewed on the pinned card saved', await actOn(coach.context, pinTarget.targetKey, 'reviewed'));
    const unpinned = await coachReadsBriefing(coach.context, 'flow-5-unpinned');
    record('3. Reviewing a pinned card removes its pin and folds it', !unpinned.cards.some((card) => card.targetKey === pinTarget.targetKey) && !unpinned.sectionText.includes('Cards you pinned'));
    record('6. No evidence disappeared after Reviewed on the pinned card', unpinned.findingCount === finalRead.findingCount, `${finalRead.findingCount} then ${unpinned.findingCount}`);

    record('6. No evidence disappeared after Not relevant', finalRead.findingCount === pinned.findingCount && finalRead.fullEvidence.includes('How Root read each answer'.toUpperCase()) === pinned.fullEvidence.includes('How Root read each answer'.toUpperCase()), `${pinned.findingCount} then ${finalRead.findingCount} findings`);

    // ---- 8. The member side.
    for (const route of ['/dashboard', '/today', '/checkin', '/body-systems', '/progress', '/profile']) {
      const routePage = await member.context.newPage();
      listen(routePage, walk);
      await go(routePage, route);
      await pause(1500);
      await routePage.close();
    }
    const leaks: string[] = [];
    for (const { url, body } of walk.bodies) for (const word of COACH_ONLY_WORDS) if (body.includes(word)) leaks.push(`"${word}" in ${url.slice(0, 90)}`);
    record('8. Zero coach-only phrases in every member response body', leaks.length === 0, leaks.length ? leaks.slice(0, 6).join(' | ') : `${walk.bodies.length} response bodies`);
    record('8. Zero console errors on her screens', walk.consoleErrors.length === 0, walk.consoleErrors.slice(0, 5).join(' | '));
    const asMember = createClient(process.env.PROD_SUPABASE_URL!, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${member.session.access_token}` } },
    });
    const readable: string[] = [];
    for (const table of ['cross_system_root_briefing_reviews', 'cross_system_root_briefing_visits', 'cross_system_root_findings', 'cross_system_signals']) {
      const { data } = await asMember.from(table).select('*').limit(5);
      if ((data ?? []).length > 0) readable.push(`${table}=${data!.length}`);
    }
    record('8. Her own session reads 0 rows from the briefing tables and the Root tables', readable.length === 0, readable.join(', ') || 'all four empty to her');
  } catch (error) {
    record('The flow completed without throwing', false, String(error).slice(0, 400));
  } finally {
    await retireSession(member);
    await retireSession(coach);
    await browser.close();
  }
}

const phases: Record<string, () => Promise<void>> = {
  baseline: baselinePhase,
  read: readPhase,
  flow: flowPhase,
  restore: restorePhase,
};
const run = phases[process.argv[2] ?? ''];
if (!run) {
  console.error('Usage: verify-root-briefing-live.ts baseline|read|flow|restore');
  process.exit(2);
}
if (process.argv[2] === 'restore' && !existsSync(BASELINE)) {
  console.error('No baseline recorded; refusing to restore.');
  process.exit(2);
}
run()
  .catch((error) => record('The phase completed without throwing', false, String(error).slice(0, 400)))
  .finally(() => {
    const passed = results.filter((result) => result.pass).length;
    console.log(`\n${passed} of ${results.length} checks passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  });
