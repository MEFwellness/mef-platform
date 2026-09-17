/**
 * Live verification for the data scale sweep, on app.mefwellness.com.
 *
 * THE SYMPTOM THIS SWEEP FIXES IS A NUMBER ON A SCREEN LOWER THAN THE TRUTH,
 * so every check here reads a number off the real screen and compares it
 * with the database, counted independently with the service role:
 *
 *   1. Exercise library: the library's own total, unfiltered and for its
 *      largest category, and the cards a coach can actually page through.
 *   2. Relationship Library: "N of N patterns", and the per-role link counts
 *      on EVERY entry, including the broad musculoskeletal entry opened in
 *      the editor.
 *   3. Coach question bank: its active question total.
 *   4. Admin Users and Assignment history, with the test-account toggle off
 *      and on.
 *   5. The test member's Signals list (coach view), her check-in History and
 *      her Health Timeline.
 *   6. The admin analytics member timeline, the one site that was short on
 *      production before this build, over 30 and 90 days.
 *   7. Her member screens walked for console errors, with every response
 *      body scanned for the thirteen coach-only phrases.
 *
 * READ ONLY. Sessions are minted and retired (scope 'local'). Page views do
 * write analytics events; those are removed by the separate, independently
 * checked baseline restore that runs after this, not by this script.
 *
 * Usage: PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   npx tsx scripts/verify-data-scale-live.ts
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';
import { selectAllRows } from '../lib/data/pagedSelect';

const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const MEMBER_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const STAFF_EMAIL = 'oakomah66@gmail.com';
const OUT = 'scripts/.verify/data-scale';
const TIMELINE_ROW_CAP = 2000;

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

mkdirSync(OUT, { recursive: true });
const service = createClient(process.env.PROD_SUPABASE_URL!, readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results: Array<{ item: string; pass: boolean; screen: string; database: string }> = [];
function record(item: string, pass: boolean, screen: unknown, database: unknown): void {
  results.push({ item, pass, screen: String(screen), database: String(database) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      screen: ${screen}\n      database: ${database}`);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const num = (text: string | undefined) => Number((text ?? '').replace(/,/g, ''));

type Query = ReturnType<ReturnType<typeof service.from>['select']>;

async function count(table: string, apply: (q: Query) => Query = (q) => q): Promise<number> {
  const { count: n, error } = await apply(service.from(table).select('*', { count: 'exact', head: true }));
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

async function all<T>(table: string, columns: string, apply: (q: Query) => Query = (q) => q, order = 'id'): Promise<T[]> {
  const { ok, rows, error } = await selectAllRows<T>(() => apply(service.from(table).select(columns)).order(order, { ascending: true }));
  if (!ok) throw new Error(`read ${table}: ${error?.message}`);
  return rows;
}

async function go(page: Page, path: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(2000 * (attempt + 1));
    }
  }
}

// ---------------------------------------------------------------------
// 1. Exercise library
// ---------------------------------------------------------------------
async function exerciseLibrary(staff: BrowserContext): Promise<void> {
  const truth = await count('exercise_catalog');
  const unfiltered = await staff.request.get(`${BASE}/api/exercises?limit=24&offset=0`);
  const body = (await unfiltered.json()) as { total: number | null };
  record('1. Exercise library total equals the catalog table', body.total === truth, `${body.total} (library total)`, `${truth} rows in exercise_catalog`);

  const categories = await all<{ category: string | null }>('exercise_catalog', 'category', (q) => q.not('category', 'is', null));
  const byCategory = new Map<string, number>();
  for (const row of categories) byCategory.set(row.category!, (byCategory.get(row.category!) ?? 0) + 1);
  const [largest, largestCount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]!;

  const filtered = (await (await staff.request.get(`${BASE}/api/exercises?category=${encodeURIComponent(largest)}&limit=24&offset=0`)).json()) as { total: number | null };
  record(`1. Filter "${largest}": the library's total equals the table`, filtered.total === largestCount, `${filtered.total}`, `${largestCount} rows with category = ${largest}`);

  const page = await staff.newPage();
  await go(page, '/exercises');
  await page.getByLabel('Category').selectOption(largest);
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
  await pause(1500);
  for (let i = 0; i < 80; i += 1) {
    const more = page.getByRole('button', { name: /load more/i });
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click();
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
    await pause(800);
  }
  const cards = await page.locator('main a[href^="/exercises/"]').count();
  await page.screenshot({ path: `${OUT}/1-exercises-${largest.replace(/\W+/g, '-')}.png`, fullPage: false });
  record(`1. Filter "${largest}": every card can be reached on screen`, cards === largestCount, `${cards} cards after Load more`, `${largestCount} rows`);
  await page.close();
}

// ---------------------------------------------------------------------
// 2. Relationship Library
// ---------------------------------------------------------------------
type RoleCounts = { primary: number; related: number; support: number };
async function relationshipLibrary(staff: BrowserContext): Promise<void> {
  const heads = await all<{ id: string; current_version: number }>('cross_system_relationships', 'id, current_version');
  const versions = await all<{ id: string; relationship_id: string; version_number: number; pattern_name: string }>(
    'cross_system_relationship_versions',
    'id, relationship_id, version_number, pattern_name'
  );
  const current = versions.filter((v) => heads.some((h) => h.id === v.relationship_id && h.current_version === v.version_number));
  const components = await all<{ version_id: string; role: string }>('cross_system_relationship_components', 'version_id, role');
  const roles = new Map<string, RoleCounts>();
  for (const v of current) roles.set(v.id, { primary: 0, related: 0, support: 0 });
  for (const c of components) {
    const held = roles.get(c.version_id);
    if (held && (c.role === 'primary' || c.role === 'related' || c.role === 'support')) held[c.role] += 1;
  }
  const byName = new Map(current.map((v) => [v.pattern_name, roles.get(v.id)!]));

  const page = await staff.newPage();
  await go(page, '/coach/relationships');
  const totalLine = page.getByText(/\d+ of \d+ patterns?/).first();
  await totalLine.waitFor({ timeout: 60_000 });
  const match = /(\d+) of (\d+) patterns?/.exec((await totalLine.textContent()) ?? '');
  record('2. Relationship Library lists every pattern', num(match?.[2]) === current.length && num(match?.[1]) === current.length, match?.[0], `${current.length} entries with a current version (${heads.length} heads)`);

  // Every entry's link counts, with every group opened.
  for (let i = 0; i < 200; i += 1) {
    const closed = page.locator('section button[aria-expanded="false"]').first();
    if (!(await closed.isVisible().catch(() => false))) break;
    await closed.click();
    await pause(120);
  }
  const rows = page.locator('li:has(h2)');
  const rowCount = await rows.count();
  const mismatches: string[] = [];
  let checked = 0;
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i);
    const name = ((await row.locator('h2').first().textContent()) ?? '').trim();
    const truth = byName.get(name);
    if (!truth) continue;
    checked += 1;
    const text = (await row.textContent()) ?? '';
    const shown: RoleCounts = {
      primary: num(/(\d+) primary/.exec(text)?.[1] ?? '0'),
      related: num(/(\d+) related/.exec(text)?.[1] ?? '0'),
      support: num(/(\d+) supporting\./.exec(text)?.[1] ?? '0'),
    };
    if (shown.primary !== truth.primary || shown.related !== truth.related || shown.support !== truth.support) {
      mismatches.push(`${name}: screen ${JSON.stringify(shown)} vs db ${JSON.stringify(truth)}`);
    }
  }
  record('2. Every entry shows its full primary, related and supporting counts', checked === current.length && mismatches.length === 0, `${checked} rows read, ${mismatches.length} mismatches ${mismatches.slice(0, 3).join(' | ')}`, `${current.length} entries, ${components.length} components in total`);

  // The broad musculoskeletal entry, opened in the editor.
  const musculo = current
    .filter((v) => /musculoskeletal/i.test(v.pattern_name))
    .map((v) => ({ name: v.pattern_name, counts: roles.get(v.id)! }))
    .sort((a, b) => b.counts.primary + b.counts.related + b.counts.support - (a.counts.primary + a.counts.related + a.counts.support))[0]!;
  const truthTotal = musculo.counts.primary + musculo.counts.related + musculo.counts.support;
  await page.locator('#relationship-search').fill('musculoskeletal');
  await pause(800);
  const entry = page.locator('li:has(h2)').filter({ has: page.getByRole('heading', { name: musculo.name, exact: true }) }).first();
  await entry.getByRole('button', { name: 'Edit' }).click();
  await page.getByText(/Primary inputs/).first().waitFor({ timeout: 30_000 });
  const editorText = (await page.locator('main').textContent()) ?? '';
  const editor = {
    primary: num(/Primary inputs \((\d+)\)/.exec(editorText)?.[1] ?? '0'),
    related: num(/Related inputs \((\d+)\)/.exec(editorText)?.[1] ?? '0'),
    support: num(/Supporting inputs \((\d+)\)/.exec(editorText)?.[1] ?? '0'),
  };
  const editorTotal = editor.primary + editor.related + editor.support;
  await page.screenshot({ path: `${OUT}/2-musculoskeletal-editor.png`, fullPage: false });
  record(`2. "${musculo.name}" opened in the editor shows its full area count`, editorTotal === truthTotal && editor.related === musculo.counts.related, `${editorTotal} (${JSON.stringify(editor)})`, `${truthTotal} (${JSON.stringify(musculo.counts)})`);
  await page.close();
}

// ---------------------------------------------------------------------
// 3. Coach question bank
// ---------------------------------------------------------------------
async function questionBank(staff: BrowserContext): Promise<void> {
  const truth = await count('driver_probe_questions', (q) => q.eq('active', true));
  const total = await count('driver_probe_questions');
  const page = await staff.newPage();
  await go(page, '/coach/questions');
  const line = page.locator('[data-question-count]');
  await line.waitFor({ timeout: 60_000 });
  const text = (await line.textContent()) ?? '';
  record('3. Coach question bank shows every active question', num(/(\d+) active questions/.exec(text)?.[1]) === truth, text.trim(), `${truth} active of ${total} rows in driver_probe_questions`);
  await page.close();
}

// ---------------------------------------------------------------------
// 4. Admin Users and Assignment history
// ---------------------------------------------------------------------
async function adminLists(staff: BrowserContext): Promise<void> {
  const profiles = await all<{ id: string; is_test: boolean | null }>('profiles', 'id, is_test');
  const testIds = new Set(profiles.filter((p) => p.is_test).map((p) => p.id));
  const assignments = await all<{ coach_id: string; client_id: string }>('coach_client_assignments', 'coach_id, client_id');
  const realPairings = assignments.filter((a) => !testIds.has(a.coach_id) && !testIds.has(a.client_id)).length;

  for (const includeTest of [false, true]) {
    const page = await staff.newPage();
    await go(page, includeTest ? '/admin?includeTest=1' : '/admin');
    const users = page.locator('[data-user-count]');
    await users.waitFor({ timeout: 60_000 });
    const userText = ((await users.textContent()) ?? '').trim();
    const pairText = ((await page.locator('[data-assignment-count]').textContent()) ?? '').trim();
    const shownUsers = num(/(\d+) accounts? shown/.exec(userText)?.[1]);
    const hiddenUsers = /No test accounts hidden/.test(userText) ? 0 : num(/(\d+) test accounts? hidden/.exec(userText)?.[1]);
    const shownPairs = num(/(\d+) pairings? shown/.exec(pairText)?.[1]);
    const hiddenPairs = /No test pairings hidden/.test(pairText) ? 0 : num(/(\d+) pairings? involving/.exec(pairText)?.[1]);
    const label = includeTest ? 'test accounts shown' : 'test accounts hidden';
    record(
      `4. Admin Users (${label}) equals profiles`,
      includeTest ? shownUsers === profiles.length && hiddenUsers === 0 : shownUsers === profiles.length - testIds.size && hiddenUsers === testIds.size,
      userText,
      `${profiles.length} profiles, ${testIds.size} test`
    );
    record(
      `4. Assignment history (${label}) equals coach_client_assignments`,
      includeTest ? shownPairs === assignments.length && hiddenPairs === 0 : shownPairs === realPairings && hiddenPairs === assignments.length - realPairings,
      pairText,
      `${assignments.length} pairings, ${assignments.length - realPairings} touching a test account`
    );
    const toggle = page.getByRole('link', { name: includeTest ? 'Hide test accounts' : 'Show test accounts' });
    record(`4. The test-account toggle is present (${label})`, await toggle.isVisible().catch(() => false), includeTest ? 'Hide test accounts link' : 'Show test accounts link', 'n/a');
    await page.close();
  }
}

// ---------------------------------------------------------------------
// 5. Her Signals list, History and Health Timeline
// ---------------------------------------------------------------------
async function signalsList(staff: BrowserContext): Promise<void> {
  const signals = await all<{ signal_slug: string; side: string | null }>('cross_system_signals', 'signal_slug, side', (q) => q.eq('member_id', MEMBER_ID));
  const distinct = new Set(signals.map((s) => `${s.signal_slug}|${s.side ?? 'none'}`)).size;
  const page = await staff.newPage();
  await go(page, `/coach/clients/${MEMBER_ID}/detail`);
  const section = page.locator('#detail-section-cross-system-signals');
  await section.waitFor({ timeout: 60_000 });
  const header = section.locator('button[aria-expanded]').first();
  const headerText = ((await header.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
  await pause(2500);
  const rows = await section.locator('section > ul > li').count();
  const signalsShown = num(/(\d+) signals?/.exec(headerText)?.[1]);
  const entriesShown = /(\d+) entries/.exec(headerText) ? num(/(\d+) entries/.exec(headerText)?.[1]) : signalsShown;
  await page.screenshot({ path: `${OUT}/5-signals.png`, fullPage: false });
  record('5. Her Signals list shows one row per signal, and every entry is counted', rows === distinct && signalsShown === distinct && entriesShown === signals.length, `${rows} rows; header "${headerText.slice(0, 80)}"`, `${distinct} distinct signals, ${signals.length} stored rows`);
  await page.close();
}

async function memberHistory(member: BrowserContext): Promise<void> {
  const checkins = await count('daily_checkins_current', (q) => q.eq('user_id', MEMBER_ID));
  const page = await member.newPage();
  await go(page, '/progress');
  const history = page.locator('section:has(> p:text-is("History")) .divide-y > div');
  await history.first().waitFor({ timeout: 45_000 }).catch(() => {});
  const shown = await history.count();
  record('5. Her check-in History shows her most recent 30 days (or all of them if fewer)', shown === Math.min(30, checkins), `${shown} rows`, `${checkins} rows in daily_checkins_current (the screen is designed to show the latest 30)`);

  const events = await count('health_timeline_events', (q) => q.eq('member_id', MEMBER_ID));
  await go(page, '/progress/timeline');
  await pause(2000);
  const body = (await page.locator('main').textContent()) ?? '';
  let folded = 0;
  for (const m of body.matchAll(/Checked in (\d+) times/g)) folded += num(m[1]);
  folded += [...body.matchAll(/Checked in on /g)].length;
  const milestones = await page.locator('main div.mef-card').count();
  record('5. Her Health Timeline accounts for her latest 200 events (or all of them if fewer)', folded + milestones === Math.min(200, events), `${folded} check-ins in chips + ${milestones} milestone cards`, `${events} rows in health_timeline_events (the screen is designed to show the latest 200)`);
  await page.close();
}

// ---------------------------------------------------------------------
// 6. Admin analytics member timeline
// ---------------------------------------------------------------------
async function analyticsTimeline(staff: BrowserContext): Promise<void> {
  for (const range of ['30d', '90d']) {
    const page = await staff.newPage();
    await go(page, `/admin/analytics/members/${MEMBER_ID}?range=${range}&test=on`);
    const totals = page.getByText(/days? with activity, [\d,]+ recorded actions? in total/).first();
    await totals.waitFor({ timeout: 60_000 });
    const text = (await totals.textContent()) ?? '';
    const shownDays = num(/([\d,]+) days? with activity/.exec(text)?.[1]);
    const shownEvents = num(/([\d,]+) recorded actions?/.exec(text)?.[1]);
    const main = (await page.locator('main').textContent()) ?? '';
    const [, start, end] = /(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(main) ?? [];
    const notice = /Only the most recent [\d,]+ actions in this range are shown/.test(main);

    const rows = await all<{ local_date: string; occurred_at: string; id: string }>(
      'product_analytics_events',
      'id, local_date, occurred_at',
      (q) => q.eq('member_id', MEMBER_ID).gte('local_date', start).lte('local_date', end)
    );
    rows.sort((a, b) => (a.local_date === b.local_date ? (a.occurred_at === b.occurred_at ? a.id.localeCompare(b.id) : b.occurred_at.localeCompare(a.occurred_at)) : b.local_date.localeCompare(a.local_date)));
    let kept = rows.slice(0, TIMELINE_ROW_CAP + 1);
    const truncated = kept.length > TIMELINE_ROW_CAP;
    if (truncated) {
      kept = kept.slice(0, TIMELINE_ROW_CAP);
      const partial = kept[kept.length - 1]!.local_date;
      kept = kept.filter((row) => row.local_date !== partial);
    }
    const expectedDays = new Set(kept.map((row) => row.local_date)).size;
    await page.screenshot({ path: `${OUT}/6-analytics-${range}.png`, fullPage: false });
    record(
      `6. Analytics member timeline (${range}, ${start} to ${end}) counts every action it should`,
      shownEvents === kept.length && shownDays === expectedDays && notice === truncated,
      `${shownEvents} actions on ${shownDays} days; truncation notice ${notice ? 'shown' : 'absent'}`,
      `${rows.length} events in range; expected ${kept.length} actions on ${expectedDays} days, notice ${truncated ? 'expected' : 'not expected'} (was capped at 1,000 before this build)`
    );
    await page.close();
  }
}

// ---------------------------------------------------------------------
// 7. Her screens: console errors and coach-only phrases
// ---------------------------------------------------------------------
async function memberWalk(member: BrowserContext): Promise<void> {
  const consoleErrors: string[] = [];
  const bodies: Array<{ url: string; body: string }> = [];
  const routes = ['/dashboard', '/today', '/checkin', '/checkin/evening', '/body-systems', '/progress', '/progress/timeline', '/profile'];
  for (const route of routes) {
    const page = await member.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${route}: ${message.text().slice(0, 160)}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${route}: ${String(error).slice(0, 160)}`));
    page.on('response', async (response) => {
      try {
        const type = response.headers()['content-type'] ?? '';
        if (!/text|json|javascript|x-component/.test(type) || !response.url().startsWith(BASE)) return;
        bodies.push({ url: response.url(), body: await response.text() });
      } catch {
        /* a body that cannot be read carried nothing */
      }
    });
    await go(page, route);
    await pause(1500);
    await page.close();
  }
  const leaks: string[] = [];
  for (const { url, body } of bodies) for (const word of COACH_ONLY_WORDS) if (body.includes(word)) leaks.push(`"${word}" in ${url.slice(0, 90)}`);
  record('7. Zero hits for the thirteen coach-only phrases in her response bodies', leaks.length === 0, leaks.slice(0, 5).join(' | ') || `${bodies.length} response bodies over ${routes.length} routes`, 'n/a');
  record('7. Zero console errors on her screens', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ') || `${routes.length} routes`, 'n/a');
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  let staff: Awaited<ReturnType<typeof mintSessionContext>> = null;
  let member: Awaited<ReturnType<typeof mintSessionContext>> = null;
  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('could not mint the staff session');
    for (const [name, check] of [
      ['exercise library', () => exerciseLibrary(staff!.context)],
      ['relationship library', () => relationshipLibrary(staff!.context)],
      ['question bank', () => questionBank(staff!.context)],
      ['admin lists', () => adminLists(staff!.context)],
      ['signals list', () => signalsList(staff!.context)],
      ['analytics timeline', () => analyticsTimeline(staff!.context)],
    ] as const) {
      try {
        await check();
      } catch (error) {
        record(`${name} completed without throwing`, false, String(error).slice(0, 300), 'n/a');
      }
    }
    member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE });
    if (!member) throw new Error('could not mint the member session');
    for (const [name, check] of [
      ['member history', () => memberHistory(member!.context)],
      ['member walk', () => memberWalk(member!.context)],
    ] as const) {
      try {
        await check();
      } catch (error) {
        record(`${name} completed without throwing`, false, String(error).slice(0, 300), 'n/a');
      }
    }
  } finally {
    if (member) await retireSession(member);
    if (staff) await retireSession(staff);
    await browser.close();
    writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
  }
}

await main();
