/**
 * Live verification for the Relationship Library (Prompt 2 of 3).
 *
 * Three questions, asked separately.
 *
 *   1. THE EDITOR REALLY WORKS, through the real form on the real site.
 *      A pattern is created, edited into a second version, its history is
 *      read, it is activated, deactivated, and then removed, so nothing
 *      this run wrote is left on production.
 *
 *   2. THE PICKERS ARE PROMPT 1'S OWN VOCABULARY. The body system and
 *      body area selects on the page are compared against the rows in
 *      cross_system_signal_categories and cross_system_body_areas, read
 *      straight from the database, and the signal search is driven with a
 *      real standardized name.
 *
 *   3. NOTHING REACHES A MEMBER. At the database, a member session and an
 *      anonymous session must read zero rows from all five tables. At the
 *      screen, the member's own routes are walked signed in and EVERY
 *      response body the browser receives is scanned for this feature's
 *      words, and /coach/relationships is asked for directly.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in
 * by design) and retired with scope 'local'. Bounded: every navigation has
 * a timeout and the browser closes in a finally block.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/relationships';
const NAV_TIMEOUT = 45_000;

/** Named so a human reading the production table knows instantly what it is. */
const TEST_PATTERN_NAME =
  'TEST DATA, safe to delete. Hip area signals observed alongside kidney and bladder signals';

mkdirSync(SHOTS, { recursive: true });

const url = process.env.PROD_SUPABASE_URL;
const service = createClient(
  url,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const anonKey = readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim();

const results = [];
function record(item, pass, detail) {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`);
}

const TABLES = [
  'cross_system_relationships',
  'cross_system_relationship_versions',
  'cross_system_relationship_components',
  'cross_system_relationship_strength_levels',
  'cross_system_relationship_considerations',
];

/** The words that must never appear in anything a member's browser receives. */
const LEAK_WORDS = [
  'cross_system_relationship',
  'crossSystemRelationships',
  'Relationship Library',
  'Possible Association',
  'Coaching Considerations',
  'coach-relationships',
  'pattern_key',
  'min_supporting_signals',
  TEST_PATTERN_NAME,
];

async function visit(context, path, { collect = false } = {}) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const bodies = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  if (collect) {
    page.on('response', async (response) => {
      try {
        const type = response.headers()['content-type'] ?? '';
        if (!/text|json|javascript/.test(type)) return;
        bodies.push({ url: response.url(), body: await response.text() });
      } catch {
        /* a body that cannot be read is a body that carried nothing */
      }
    });
  }
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors, bodies, url: page.url() };
}

/** Text of every option in a select, by its id. */
async function optionsOf(page, id) {
  return page.$$eval(`#${id} option`, (nodes) =>
    nodes.map((node) => node.textContent.trim()).filter((text) => text !== 'Choose one' && text !== 'Every body system')
  );
}

const run = async () => {
  const browser = await chromium.launch();
  let coach = null;
  let member = null;
  let createdId = null;

  try {
    // -----------------------------------------------------------------
    // 0. What the database holds before anything is touched.
    // -----------------------------------------------------------------
    const seeded = await service
      .from('cross_system_relationships')
      .select('id, pattern_key, is_active, is_example, current_version');
    if (seeded.error) throw new Error(`relationship read failed: ${seeded.error.message}`);
    const examples = seeded.data.filter((row) => row.is_example);
    record(
      'the library ships empty except for one inactive example',
      seeded.data.length === 1 && examples.length === 1 && examples[0].is_active === false,
      `${seeded.data.length} relationship(s) on production, ${examples.length} flagged as an example, active: ${examples.map((row) => row.is_active).join(', ')}`
    );

    const exampleVersion = await service
      .from('cross_system_relationship_versions')
      .select('id, version_number, pattern_name')
      .eq('relationship_id', examples[0]?.id ?? '00000000-0000-0000-0000-000000000000');
    record(
      'the example names itself an Example',
      (exampleVersion.data ?? []).every((row) => row.pattern_name.startsWith('Example')),
      (exampleVersion.data ?? []).map((row) => `v${row.version_number}: ${row.pattern_name}`).join(' | ')
    );

    // The Prompt 1 vocabulary, read straight from the database, which is
    // what the pickers on the screen are compared against.
    const [categories, areas, names] = await Promise.all([
      service.from('cross_system_signal_categories').select('category_key, display_name').eq('is_active', true),
      service.from('cross_system_body_areas').select('area_key, display_name').eq('is_active', true),
      service.from('cross_system_signal_names').select('signal_slug, display_name').eq('is_active', true),
    ]);
    console.log(
      `\nPrompt 1 vocabulary on production: ${categories.data.length} categories, ${areas.data.length} body areas, ${names.data.length} standardized signal names.\n`
    );

    // -----------------------------------------------------------------
    // 1 and 2. The coach walk.
    // -----------------------------------------------------------------
    coach = await mintSessionContext(browser, COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    });
    if (!coach) throw new Error(`could not mint a session for ${COACH_EMAIL}`);

    const library = await visit(coach.context, '/coach/relationships');
    const libraryText = await library.page.innerText('body');
    record(
      'the Relationship Library screen loads for the coach',
      library.status === 200 && libraryText.includes('Relationship Library'),
      `status ${library.status}, url ${library.url}`
    );
    record(
      'the example row is labelled Example and reads Inactive',
      libraryText.includes('Example') && libraryText.includes('Inactive'),
      libraryText.split('\n').filter((line) => line.includes('Example') || line === 'Inactive').slice(0, 4).join(' / ')
    );
    await library.page.screenshot({ path: `${SHOTS}/01-library.png`, fullPage: true });

    // The category filter on the list is the Signal Library's own list.
    const filterOptions = await optionsOf(library.page, 'category-filter');
    const expectedCategories = categories.data.map((row) => row.display_name).sort();
    record(
      'the body system filter is driven by the Prompt 1 categories',
      filterOptions.length === expectedCategories.length &&
        [...filterOptions].sort().join('|') === expectedCategories.join('|'),
      `${filterOptions.length} options on the page, ${expectedCategories.length} active rows in the database`
    );

    // ---- CREATE -----------------------------------------------------
    await library.page.click('text=New pattern');
    await library.page.waitForSelector('#pattern-name', { timeout: NAV_TIMEOUT });

    const pickerCategories = await optionsOf(library.page, 'category-picker');
    const pickerAreas = await optionsOf(library.page, 'area-picker');
    record(
      'the editor pickers show the real signal vocabulary from Prompt 1',
      [...pickerCategories].sort().join('|') === expectedCategories.join('|') &&
        [...pickerAreas].sort().join('|') === areas.data.map((row) => row.display_name).sort().join('|'),
      `body systems: ${pickerCategories.length} on screen vs ${categories.data.length} in the database. body areas: ${pickerAreas.length} on screen vs ${areas.data.length} in the database`
    );

    await library.page.fill('#pattern-name', TEST_PATTERN_NAME);

    // Primary: the Hip body area.
    await library.page.selectOption('#area-picker', 'hip');
    await library.page.click('#area-picker >> xpath=following-sibling::button');
    await library.page.waitForTimeout(200);

    // Related: the Kidney/Bladder body system.
    await library.page.click('button[aria-pressed="false"]:has-text("Related")');
    await library.page.selectOption('#category-picker', 'kidney_bladder');
    await library.page.click('#category-picker >> xpath=following-sibling::button');
    await library.page.waitForTimeout(200);

    // Supporting: two real standardized signal names, typed into the search.
    await library.page.click('button[aria-pressed="false"]:has-text("Supporting")');
    for (const typed of ['Hip clicking', 'Frequent urination']) {
      await library.page.fill('#signal-picker', typed);
      await library.page.waitForTimeout(400);
      await library.page.click(`ul li button:text-is("${typed}")`);
      await library.page.waitForTimeout(200);
    }

    await library.page.fill('#min-supporting', '2');
    await library.page.fill(
      '#association',
      'When hip area signals and kidney and bladder signals are observed together in the same period, that pairing may be relevant and is worth exploring in conversation.'
    );
    await library.page.fill('#consideration-0', 'Ask what else she has noticed in the same period.');
    await library.page.fill('#evidence', 'Test data written by the Prompt 2 live verification run.');
    await library.page.screenshot({ path: `${SHOTS}/02-editor-filled.png`, fullPage: true });

    await library.page.click('button:has-text("Save pattern")');
    // The editor closing is the signal that the save round trip finished.
    // Waiting on the words "New pattern" would match the editor's own
    // heading and resolve while the save was still in flight.
    await library.page.waitForSelector('#pattern-name', {
      state: 'detached',
      timeout: NAV_TIMEOUT,
    });
    await library.page.waitForTimeout(1500);

    const created = await service
      .from('cross_system_relationships')
      .select('id, pattern_key, is_active, current_version')
      .eq('is_example', false);
    if (created.error) console.error('created read failed', created.error);
    createdId = created.data?.[0]?.id ?? null;
    record(
      'a pattern created through the real form is stored, inactive, at version 1',
      created.data?.length === 1 && created.data[0].is_active === false && created.data[0].current_version === 1,
      created.data?.length
        ? `pattern_key ${created.data[0].pattern_key}, active ${created.data[0].is_active}, version ${created.data[0].current_version}`
        : 'nothing was written'
    );

    const v1 = await service
      .from('cross_system_relationship_versions')
      .select('id')
      .eq('relationship_id', createdId ?? '00000000-0000-0000-0000-000000000000')
      .eq('version_number', 1)
      .maybeSingle();
    const v1Components = await service
      .from('cross_system_relationship_components')
      .select('role, ref_kind, ref_key, ref_label')
      .eq('version_id', v1.data?.id ?? '00000000-0000-0000-0000-000000000000')
      .order('position');
    const mine = v1Components.data ?? [];
    record(
      'its inputs carry the labels the library reads today, resolved on the server',
      mine.some((row) => row.role === 'primary' && row.ref_kind === 'body_area' && row.ref_label === 'Hip') &&
        mine.some((row) => row.role === 'related' && row.ref_kind === 'category' && row.ref_label === 'Kidney/Bladder') &&
        mine.filter((row) => row.role === 'support' && row.ref_kind === 'signal').length >= 2,
      mine.map((row) => `${row.role}:${row.ref_kind}:${row.ref_label}`).join(', ')
    );

    // ---- EDIT, which must make a SECOND VERSION ---------------------
    await library.page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await library.page.waitForTimeout(800);
    await library.page.click(`li:has-text("TEST DATA") button:has-text("Edit")`);
    await library.page.waitForSelector('#change-summary', { timeout: NAV_TIMEOUT });
    await library.page.waitForTimeout(300);
    await library.page.fill('#min-supporting', '3');
    await library.page.fill('#change-summary', 'Raised the floor from two supporting signals to three.');
    await library.page.click('button:has-text("Save as a new version")');
    await library.page.waitForSelector('#pattern-name', {
      state: 'detached',
      timeout: NAV_TIMEOUT,
    });
    await library.page.waitForTimeout(1500);

    const versions = await service
      .from('cross_system_relationship_versions')
      .select('version_number, min_supporting_signals, change_summary')
      .eq('relationship_id', createdId)
      .order('version_number');
    const head = await service
      .from('cross_system_relationships')
      .select('current_version')
      .eq('id', createdId)
      .maybeSingle();
    record(
      'an edit writes a second version and leaves the first one exactly as it was',
      versions.data?.length === 2 &&
        versions.data[0].min_supporting_signals === 2 &&
        versions.data[1].min_supporting_signals === 3 &&
        head.data?.current_version === 2,
      (versions.data ?? [])
        .map((row) => `v${row.version_number} floor ${row.min_supporting_signals}`)
        .join(', ') + `, head points at v${head.data?.current_version}`
    );

    // ---- VERSION HISTORY --------------------------------------------
    await library.page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await library.page.waitForTimeout(800);
    await library.page.click(`li:has-text("TEST DATA") button:has-text("Version history")`);
    // The panel is fetched by a server action, so the thing to wait for is
    // a control only the OPEN panel carries. Waiting on the words "Version
    // history" would match the button that was just pressed and read the
    // list back instead.
    await library.page.waitForSelector('button:has-text("Back to the library")', {
      timeout: NAV_TIMEOUT,
    });
    await library.page.waitForTimeout(600);
    const historyText = await library.page.innerText('body');
    record(
      'the version history shows both versions, what changed, and her own reason',
      historyText.includes('Version 2') &&
        historyText.includes('Version 1') &&
        historyText.includes('2 to 3') &&
        historyText.includes('Note: Raised the floor from two supporting signals to three.') &&
        historyText.includes('the first version of this pattern'),
      historyText
        .split('\n')
        .filter((line) => /Version \d|2 to 3|Raised the floor|first version/.test(line))
        .slice(0, 6)
        .join(' / ')
    );
    await library.page.screenshot({ path: `${SHOTS}/03-version-history.png`, fullPage: true });
    await library.page.click('button:has-text("Back to the library")');
    await library.page.waitForTimeout(600);

    // ---- ACTIVATE, then DEACTIVATE ----------------------------------
    await library.page.click(`li:has-text("TEST DATA") button:has-text("Activate")`);
    await library.page.waitForTimeout(2000);
    const activated = await service
      .from('cross_system_relationships')
      .select('is_active, current_version')
      .eq('id', createdId)
      .maybeSingle();
    await library.page.click(`li:has-text("TEST DATA") button:has-text("Deactivate")`);
    await library.page.waitForTimeout(2000);
    const deactivated = await service
      .from('cross_system_relationships')
      .select('is_active, current_version')
      .eq('id', createdId)
      .maybeSingle();
    record(
      'the active toggle turns a pattern on and off without writing a version',
      activated.data?.is_active === true &&
        deactivated.data?.is_active === false &&
        deactivated.data?.current_version === 2,
      `activated: ${activated.data?.is_active}, deactivated: ${deactivated.data?.is_active}, still at version ${deactivated.data?.current_version}`
    );
    await library.page.screenshot({ path: `${SHOTS}/04-list-after-toggle.png`, fullPage: true });

    // ---- DELETE, so nothing this run wrote is left on production ----
    await library.page.click(`li:has-text("TEST DATA") button:has-text("Delete")`);
    await library.page.waitForTimeout(400);
    await library.page.click('button:has-text("Delete it and every version")');
    await library.page.waitForTimeout(2500);
    const after = await service.from('cross_system_relationships').select('id, is_example');
    const leftoverVersions = await service
      .from('cross_system_relationship_versions')
      .select('id')
      .eq('relationship_id', createdId ?? '00000000-0000-0000-0000-000000000000');
    record(
      'the test pattern and every version under it are gone from production',
      after.data?.length === 1 && after.data[0].is_example === true && leftoverVersions.data?.length === 0,
      `${after.data?.length} relationship(s) left, all examples: ${after.data?.every((row) => row.is_example)}, ${leftoverVersions.data?.length} orphan version(s)`
    );
    if (after.data?.length === 1) createdId = null;

    record(
      'no console error and no page error anywhere in the coach walk',
      library.consoleErrors.length === 0 && library.pageErrors.length === 0,
      `${library.consoleErrors.length} console error(s), ${library.pageErrors.length} page error(s)` +
        (library.consoleErrors.length ? `: ${library.consoleErrors.slice(0, 3).join(' | ')}` : '')
    );

    const pageHtml = await library.page.content();
    record(
      'no em dash anywhere on the screen',
      !pageHtml.includes('—'),
      pageHtml.includes('—') ? 'an em dash is on the page' : 'none found'
    );

    // -----------------------------------------------------------------
    // 3. Nothing reaches a member.
    // -----------------------------------------------------------------
    const memberCookies = await mintSessionCookies(MEMBER_EMAIL, { baseUrl: BASE });
    if (!memberCookies) throw new Error(`could not mint a session for ${MEMBER_EMAIL}`);

    // At the DATABASE, with her real token.
    const asMember = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${memberCookies.session.access_token}` } },
    });
    const asAnon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const memberReads = [];
    for (const table of TABLES) {
      const mine = await asMember.from(table).select('*');
      const theirs = await asAnon.from(table).select('*');
      memberReads.push(
        `${table}: member ${mine.data?.length ?? 0}, anon ${theirs.data?.length ?? 0}`
      );
    }
    record(
      'a member session and an anonymous session read zero rows from all five tables',
      memberReads.every((line) => line.endsWith('member 0, anon 0')),
      memberReads.join(' | ')
    );

    member = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await member.addCookies(memberCookies.cookies);

    // At the SCREEN, and the route asked for directly.
    const gated = await visit(member, '/coach/relationships');
    record(
      'a member asking for the editor by URL is turned away',
      !gated.url.includes('/coach/relationships'),
      `landed on ${gated.url} with status ${gated.status}`
    );

    const MEMBER_ROUTES = [
      '/',
      '/dashboard',
      '/today',
      '/checkin',
      '/questionnaires',
      '/progress',
      '/profile',
      '/insights',
      '/body-systems',
      '/whole-body-signal',
    ];
    const leaks = [];
    let memberConsoleErrors = 0;
    for (const route of MEMBER_ROUTES) {
      const walk = await visit(member, route, { collect: true });
      memberConsoleErrors += walk.consoleErrors.length;
      for (const { url: responseUrl, body } of walk.bodies) {
        for (const word of LEAK_WORDS) {
          if (body.includes(word)) leaks.push(`${route} <- ${responseUrl}: ${word}`);
        }
      }
      await walk.page.close();
    }
    record(
      'nothing from this feature appears in any response body a member receives',
      leaks.length === 0,
      leaks.length === 0
        ? `${MEMBER_ROUTES.length} member routes walked, every HTML, JSON and flight payload scanned for ${LEAK_WORDS.length} words, zero hits`
        : leaks.slice(0, 5).join(' | ')
    );
    console.log(`      (${memberConsoleErrors} console error(s) across the member walk)`);

    await retireSession({ service: memberCookies.service, session: memberCookies.session });
  } finally {
    // A run that fell over mid way must not leave a test row behind.
    if (createdId) {
      await service.from('cross_system_relationships').delete().eq('id', createdId);
      console.log('\nCleaned up the test pattern after an interrupted run.');
    }
    await retireSession(coach);
    await member?.close().catch(() => {});
    await browser.close();
  }

  const failed = results.filter((row) => !row.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
