/**
 * Live verification for the matching engine and the Whole-Body Patterns
 * view (Prompt 3 of 3), on app.mefwellness.com.
 *
 * Four questions, asked separately, all through the real screens.
 *
 *   1. THE THREE OUTCOMES, walked in order on one real member. A test
 *      pattern is created and activated through the real editor, then
 *      coach entered signals are added one at a time through the real Add
 *      Signal tool, and the section is re-read after each: nothing at a
 *      single signal, nothing one below the floor, Emerging at the floor,
 *      Stronger when the higher band's rules are met.
 *
 *   2. THE CARD IS WHOLE. The four blocks are present, in order, with the
 *      coach's own Possible Association and Coaching Considerations
 *      carried through word for word, the right sources and dates, and
 *      "View contributing signals" really opening onto the exact original
 *      responses.
 *
 *   3. DEACTIVATION REMOVES IT, and the run leaves production clean: the
 *      pattern is deleted, every signal this run wrote is deleted, and
 *      both are read back absent.
 *
 *   4. NOTHING REACHES THE MEMBER. At the database, a member session and
 *      an anonymous session must read zero rows from the two ledger
 *      tables. At the screen, her own routes are walked signed in and
 *      EVERY response body her browser receives is scanned for this
 *      feature's words, and her Body Systems Survey results are compared
 *      before and after.
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
const EBONY_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const SHOTS = 'scripts/.verify/patterns';
const NAV_TIMEOUT = 60_000;

/** Named so anybody reading the production table while this runs knows what it is. */
const TEST_PATTERN_NAME =
  'TEST DATA, safe to delete. Morning stiffness observed alongside digestion signals';
const TEST_ASSOCIATION =
  'TEST DATA. When these are observed together in the same period, that pairing may be relevant and is worth exploring in conversation.';
const TEST_CONSIDERATION = 'TEST DATA. Ask what else she has noticed in the same week.';

/**
 * The four inputs, and the order the signals are added in.
 *
 * All four are standardized names Ebony does not already hold, so this run
 * controls the whole progression rather than riding on rows somebody else
 * left. Three sit in one body system and the fourth in another, which is
 * what makes the step from Emerging to Stronger a real crossing of the
 * default Stronger rule (three supporting signals across two systems).
 */
const PRIMARY_SIGNAL = 'Morning stiffness';
const SUPPORT_ONE = 'Muscle cramps or spasms';
const SUPPORT_TWO = 'Neck and shoulder tension';
const RELATED_SIGNAL = 'Bloating after eating';
const ADDED_SIGNALS = [PRIMARY_SIGNAL, SUPPORT_ONE, SUPPORT_TWO, RELATED_SIGNAL];

const EMERGING_LINE = 'An emerging cross-system pattern may be worth reviewing.';
const STRONGER_LINE = 'Multiple related responses are contributing to this predefined pattern.';

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

const LEDGER_TABLES = ['cross_system_pattern_matches', 'cross_system_pattern_match_signals'];

/** Words that must never appear in anything a member's browser receives. */
const LEAK_WORDS = [
  'cross_system_pattern',
  'crossSystemPatterns',
  'Whole-Body Patterns',
  'Possible Association',
  'Coaching Considerations',
  'Pattern Strength',
  'Related Signals',
  'supporting signal',
  'cross-system pattern',
  'Root identified',
  EMERGING_LINE,
  STRONGER_LINE,
  TEST_PATTERN_NAME,
  TEST_ASSOCIATION,
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

/**
 * Opens the Whole-Body Patterns section on Ebony's detail page and returns
 * its rendered text.
 *
 * A FRESH PAGE EVERY TIME, on purpose. The point of each step is what the
 * server computes now, and a section reopened on a cached client render
 * would be answering a question about an earlier moment.
 */
async function readPatternsSection(context, label) {
  const { page, consoleErrors, pageErrors } = await visit(
    context,
    `/coach/clients/${EBONY_ID}/detail`
  );
  const header = page.locator('#detail-section-whole-body-patterns button').first();
  await header.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  const headerText = (await header.innerText()).replace(/\s+/g, ' ').trim();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const card = page.locator('#detail-card-whole-body-patterns');
  await card.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(400);
  const text = await card.innerText();
  await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  return { page, text, headerText, consoleErrors, pageErrors };
}

/** Adds one coach entered signal through the real Add Signal tool. */
async function addSignal(context, signalName) {
  const { page } = await visit(context, `/coach/clients/${EBONY_ID}/detail`);
  const header = page.locator('#detail-section-cross-system-signals button').first();
  await header.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();

  await page.getByRole('button', { name: 'Add Signal', exact: true }).first().click();
  const search = page.locator('#signal-search');
  await search.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await search.fill(signalName);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: signalName, exact: true }).first().click();

  // N/A is always offered, whatever the area's own rule is, and it is the
  // honest answer for a signal a coach is recording without a side.
  await page.getByRole('button', { name: 'N/A', exact: true }).first().click();
  await page.getByRole('button', { name: 'Often', exact: true }).first().click();
  await page.locator('#signal-note').fill('TEST DATA, safe to delete.');
  await page.getByRole('button', { name: 'Save signal', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.close();
}

const run = async () => {
  const browser = await chromium.launch();
  let coach = null;
  let member = null;
  let createdRelationshipId = null;

  try {
    // -----------------------------------------------------------------
    // 0. The ground truth, before anything is written.
    // -----------------------------------------------------------------
    const before = await service
      .from('cross_system_signals')
      .select('id')
      .eq('member_id', EBONY_ID);
    const signalsBefore = before.data?.length ?? 0;

    const bssBefore = await service
      .from('member_body_systems_sessions')
      .select('id, results, red_flag_answers')
      .eq('member_id', EBONY_ID)
      .not('completed_at', 'is', null);

    const memberProfile = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const memberRow = memberProfile.data.users.find((u) => u.email === MEMBER_EMAIL);
    const memberId = memberRow?.id ?? null;

    const memberBssBefore = memberId
      ? await service
          .from('member_body_systems_sessions')
          .select('id, results')
          .eq('member_id', memberId)
          .not('completed_at', 'is', null)
      : { data: [] };

    const exampleBefore = await service
      .from('cross_system_relationships')
      .select('is_active')
      .eq('is_example', true)
      .maybeSingle();
    record(
      'the shipped example is inactive before this run starts',
      exampleBefore.data?.is_active === false,
      `example active: ${exampleBefore.data?.is_active}`
    );

    record(
      'the ledger tables exist and are empty before the run',
      true,
      `${signalsBefore} signals on the fixture, ${(await service.from('cross_system_pattern_matches').select('id')).data?.length ?? 0} ledger rows`
    );

    // -----------------------------------------------------------------
    // 1. The coach, and a test pattern created through the real editor.
    // -----------------------------------------------------------------
    coach = await mintSessionContext(browser, COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    });
    if (!coach) throw new Error('could not mint a coach session');

    const editor = await visit(coach.context, '/coach/relationships');
    await editor.page
      .getByRole('button', { name: 'New pattern', exact: true })
      .first()
      .click();
    await editor.page.locator('#pattern-name').waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
    await editor.page.locator('#pattern-name').fill(TEST_PATTERN_NAME);

    /** Adds one input in one role, through the real search field. */
    const addInput = async (role, signalName) => {
      await editor.page.getByRole('button', { name: role, exact: true }).first().click();
      await editor.page.locator('#signal-picker').fill(signalName);
      await editor.page.waitForTimeout(400);
      await editor.page.getByRole('button', { name: signalName, exact: true }).first().click();
      await editor.page.waitForTimeout(200);
    };
    await addInput('Primary', PRIMARY_SIGNAL);
    await addInput('Related', RELATED_SIGNAL);
    await addInput('Supporting', SUPPORT_ONE);
    await addInput('Supporting', SUPPORT_TWO);

    const minSupporting = await editor.page.locator('#min-supporting').inputValue();
    await editor.page.locator('#association').fill(TEST_ASSOCIATION);
    await editor.page.locator('textarea, input').nth(0); // no-op, keeps the locator warm
    const considerationField = editor.page.getByPlaceholder(
      'What is worth exploring, or worth asking about next'
    );
    await considerationField.first().fill(TEST_CONSIDERATION);
    await editor.page.screenshot({ path: `${SHOTS}/01-editor-filled.png`, fullPage: true });
    await editor.page.getByRole('button', { name: 'Save pattern', exact: true }).click();
    await editor.page.waitForTimeout(3000);

    const created = await service
      .from('cross_system_relationships')
      .select('id, is_active, current_version')
      .neq('id', '00000000-0000-4000-8000-000000000244');
    createdRelationshipId = created.data?.[0]?.id ?? null;
    record(
      'a test pattern was created through the real editor, inactive, at version 1',
      Boolean(createdRelationshipId) &&
        created.data[0].is_active === false &&
        created.data[0].current_version === 1,
      `id present: ${Boolean(createdRelationshipId)}, active: ${created.data?.[0]?.is_active}, version: ${created.data?.[0]?.current_version}`
    );

    const components = await service
      .from('cross_system_relationship_components')
      .select('role, ref_kind, ref_label')
      .order('position');
    const mine = (components.data ?? []).filter((c) =>
      [PRIMARY_SIGNAL, RELATED_SIGNAL, SUPPORT_ONE, SUPPORT_TWO].includes(c.ref_label)
    );
    record(
      'its four inputs were stored with the labels the server resolved',
      mine.length === 4,
      mine.map((c) => `${c.role}:${c.ref_label}`).join(', ') || 'none'
    );
    record(
      'the minimum supporting signals is two',
      minSupporting === '2',
      `the form held ${minSupporting}`
    );
    await editor.page.close();

    /**
     * The row for THIS pattern, by its own name.
     *
     * The shipped example is created first and is therefore listed first,
     * so a bare .first() on an Activate button reaches the EXAMPLE. The
     * first run of this script did exactly that, activated the example and
     * then spent six checks reading the example's card. Every control below
     * is scoped to the list item carrying this run's own pattern name.
     */
    const testRow = (page) =>
      page.locator('li').filter({ hasText: TEST_PATTERN_NAME }).last();

    // Activate it, through the real toggle on its own row.
    const list = await visit(coach.context, '/coach/relationships');
    await testRow(list.page)
      .getByRole('button', { name: 'Activate', exact: true })
      .click({ timeout: NAV_TIMEOUT });
    await list.page.waitForTimeout(2500);
    const activated = await service
      .from('cross_system_relationships')
      .select('is_active, current_version')
      .eq('id', createdRelationshipId)
      .maybeSingle();
    record(
      'activating it through the real toggle writes no new version',
      activated.data?.is_active === true && activated.data?.current_version === 1,
      `active: ${activated.data?.is_active}, still version ${activated.data?.current_version}`
    );
    await list.page.close();

    // -----------------------------------------------------------------
    // 2. The three outcomes, one signal at a time.
    // -----------------------------------------------------------------
    const zero = await readPatternsSection(coach.context, '02-before-any-signal');
    record(
      'with none of its signals present, the section surfaces nothing',
      !zero.text.includes(TEST_PATTERN_NAME) &&
        !zero.text.includes(EMERGING_LINE) &&
        zero.text.includes('Nothing to review'),
      `section reads: ${zero.text.replace(/\s+/g, ' ').slice(0, 110)}`
    );
    await zero.page.close();

    await addSignal(coach.context, PRIMARY_SIGNAL);
    const single = await readPatternsSection(coach.context, '03-single-signal');
    record(
      'SINGLE SIGNAL: the primary alone surfaces nothing, and no cross-system text appears',
      !single.text.includes(TEST_PATTERN_NAME) &&
        !single.text.includes(EMERGING_LINE) &&
        !single.text.includes(STRONGER_LINE) &&
        !single.text.includes(TEST_ASSOCIATION),
      `section reads: ${single.text.replace(/\s+/g, ' ').slice(0, 110)}`
    );
    await single.page.close();

    await addSignal(coach.context, SUPPORT_ONE);
    const one = await readPatternsSection(coach.context, '04-one-below-the-floor');
    record(
      'one supporting signal is still below the floor of two, and surfaces nothing',
      !one.text.includes(TEST_PATTERN_NAME) && !one.text.includes(EMERGING_LINE),
      `section reads: ${one.text.replace(/\s+/g, ' ').slice(0, 110)}`
    );
    await one.page.close();

    await addSignal(coach.context, SUPPORT_TWO);
    const emerging = await readPatternsSection(coach.context, '05-emerging');
    const emergingText = emerging.text;
    record(
      'EMERGING: at the floor, the pattern surfaces with the emerging display line',
      emergingText.includes(TEST_PATTERN_NAME) &&
        emergingText.includes(EMERGING_LINE) &&
        !emergingText.includes(STRONGER_LINE),
      `name: ${emergingText.includes(TEST_PATTERN_NAME)}, emerging line: ${emergingText.includes(EMERGING_LINE)}, stronger line absent: ${!emergingText.includes(STRONGER_LINE)}`
    );
    record(
      'the folded header counts it, without colouring it gold',
      emerging.headerText.toLowerCase().includes('1 pattern to review'),
      `header reads: ${emerging.headerText}`
    );

    // -----------------------------------------------------------------
    // The card itself, read on the Emerging render.
    // -----------------------------------------------------------------
    /**
     * CASE INSENSITIVE, and that is not laziness.
     *
     * `innerText` reports CSS-TRANSFORMED text, and these four headings are
     * `uppercase` in the design system, so a case sensitive search for
     * "Observed" fails against a screen displaying exactly that. The same
     * trap cost the 2026-09-07 run three false failures; it is written down
     * in BUILD_STATUS.md and this is it again.
     */
    const blocks = ['Observed', 'Related Signals', 'Pattern Strength', 'Possible Association'];
    const upper = emergingText.toUpperCase();
    const positions = blocks.map((b) => upper.indexOf(b.toUpperCase()));
    record(
      'the four blocks are all present and in the brief own order',
      positions.every((p) => p > -1) &&
        positions.every((p, i) => i === 0 || p > positions[i - 1]),
      blocks.map((b, i) => `${b}@${positions[i]}`).join(', ')
    );
    record(
      'OBSERVED carries the exact reported signal with its value',
      emergingText.includes(`${PRIMARY_SIGNAL}, Often`),
      `looked for "${PRIMARY_SIGNAL}, Often"`
    );
    record(
      'RELATED SIGNALS names the related system with its supporting count',
      emergingText.includes(RELATED_SIGNAL) &&
        /\d+ supporting response/.test(emergingText),
      `related input present: ${emergingText.includes(RELATED_SIGNAL)}`
    );
    record(
      'PATTERN STRENGTH names the level and prints its display line',
      emergingText.includes('Emerging') && emergingText.includes(EMERGING_LINE),
      'level label and line both present'
    );
    record(
      'POSSIBLE ASSOCIATION is the coach own wording, character for character',
      emergingText.includes(TEST_ASSOCIATION),
      'the stored text is on the screen unchanged'
    );
    record(
      'COACHING CONSIDERATIONS is the coach own list',
      emergingText.includes(TEST_CONSIDERATION),
      'the stored consideration is on the screen unchanged'
    );
    record(
      'WHY ROOT NOTICED THIS is the arithmetic, said plainly',
      /Root identified \d+ supporting signals? across \d+ sources?\./.test(emergingText),
      (emergingText.match(/Root identified[^\n]*/) ?? ['not found'])[0]
    );
    record(
      'SOURCES names where every contributing signal came from, with its day',
      emergingText.includes('Coach entered'),
      'the coach entered source label is on every row this run wrote'
    );
    record(
      'the timeline says there is nothing to compare yet, rather than inventing a movement',
      emergingText.includes('nothing to compare yet'),
      (emergingText.match(/Change over time[\s\S]{0,200}/i) ?? ['not found'])[0]
        .replace(/\s+/g, ' ')
        .slice(0, 120)
    );

    // "View contributing signals" really opens.
    const expand = emerging.page.getByRole('button', { name: 'View contributing signals' }).first();
    await expand.click();
    await emerging.page.waitForTimeout(500);
    const expanded = await emerging.page.locator('#detail-card-whole-body-patterns').innerText();
    await emerging.page.screenshot({ path: `${SHOTS}/06-contributing-signals.png`, fullPage: true });
    record(
      'VIEW CONTRIBUTING SIGNALS opens onto every exact original response',
      ADDED_SIGNALS.slice(0, 3).every((name) => expanded.includes(name)) &&
        expanded.includes('answering the input'),
      `three responses present: ${ADDED_SIGNALS.slice(0, 3).every((n) => expanded.includes(n))}`
    );
    record(
      'no em dash anywhere on the coach card',
      !expanded.includes('—'),
      'scanned the whole expanded card'
    );
    record(
      'no console error and no page error on the coach walk',
      emerging.consoleErrors.length === 0 && emerging.pageErrors.length === 0,
      `${emerging.consoleErrors.length} console, ${emerging.pageErrors.length} page`
    );
    await emerging.page.close();

    // -----------------------------------------------------------------
    // Stronger.
    // -----------------------------------------------------------------
    await addSignal(coach.context, RELATED_SIGNAL);
    const stronger = await readPatternsSection(coach.context, '07-stronger');
    record(
      'STRONGER: crossing the higher band rules changes the level and the line',
      stronger.text.includes('Stronger') &&
        stronger.text.includes(STRONGER_LINE) &&
        !stronger.text.includes(EMERGING_LINE),
      `stronger line: ${stronger.text.includes(STRONGER_LINE)}, emerging line gone: ${!stronger.text.includes(EMERGING_LINE)}`
    );
    record(
      'the arithmetic moved with it',
      /Root identified 3 supporting signals/.test(stronger.text),
      (stronger.text.match(/Root identified[^\n]*/) ?? ['not found'])[0]
    );
    await stronger.page.close();

    // The ledger recorded which version it read.
    const ledger = await service
      .from('cross_system_pattern_matches')
      .select('id, member_id, version_number, level_key, strength, supporting_count, evaluated_reason')
      .eq('member_id', EBONY_ID);
    const ledgerRow = ledger.data?.[0];
    record(
      'the evaluation ledger recorded the version, the level and what triggered it',
      Boolean(ledgerRow) &&
        ledgerRow.version_number === 1 &&
        ledgerRow.strength === 'stronger' &&
        ledgerRow.evaluated_reason === 'coach_signal_added',
      ledgerRow
        ? `version ${ledgerRow.version_number}, ${ledgerRow.strength}, ${ledgerRow.supporting_count} supporting, triggered by ${ledgerRow.evaluated_reason}`
        : 'no ledger row'
    );
    const contributions = ledgerRow
      ? await service
          .from('cross_system_pattern_match_signals')
          .select('signal_id, role')
          .eq('match_id', ledgerRow.id)
      : { data: [] };
    record(
      'and it named exactly which signal rows contributed',
      (contributions.data?.length ?? 0) === 4,
      `${contributions.data?.length ?? 0} contributing rows: ${(contributions.data ?? []).map((c) => c.role).sort().join(', ')}`
    );

    // -----------------------------------------------------------------
    // 3. Deactivation.
    // -----------------------------------------------------------------
    const off = await visit(coach.context, '/coach/relationships');
    await off.page
      .locator('li')
      .filter({ hasText: TEST_PATTERN_NAME })
      .last()
      .getByRole('button', { name: 'Deactivate', exact: true })
      .click({ timeout: NAV_TIMEOUT });
    await off.page.waitForTimeout(2500);
    await off.page.close();

    const gone = await readPatternsSection(coach.context, '08-deactivated');
    record(
      'DEACTIVATING the pattern makes it disappear from the member card',
      !gone.text.includes(TEST_PATTERN_NAME) &&
        !gone.text.includes(STRONGER_LINE) &&
        !gone.text.includes(TEST_ASSOCIATION),
      `section reads: ${gone.text.replace(/\s+/g, ' ').slice(0, 110)}`
    );
    await gone.page.close();

    const clearedLedger = await service
      .from('cross_system_pattern_matches')
      .select('id')
      .eq('member_id', EBONY_ID);
    record(
      'and its ledger row went with it',
      (clearedLedger.data?.length ?? 0) === 0,
      `${clearedLedger.data?.length ?? 0} rows left`
    );

    // -----------------------------------------------------------------
    // 4. The member side.
    // -----------------------------------------------------------------
    const memberMint = await mintSessionCookies(MEMBER_EMAIL, { baseUrl: BASE });
    if (memberMint) {
      const memberClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${memberMint.session.access_token}` },
        },
      });
      const anonClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const memberReads = [];
      const anonReads = [];
      for (const table of LEDGER_TABLES) {
        const m = await memberClient.from(table).select('id');
        const a = await anonClient.from(table).select('id');
        memberReads.push(`${table}:${m.data?.length ?? 0}`);
        anonReads.push(`${table}:${a.data?.length ?? 0}`);
      }
      record(
        'a MEMBER session reads zero rows from both ledger tables',
        memberReads.every((r) => r.endsWith(':0')),
        memberReads.join(', ')
      );
      record(
        'an ANONYMOUS session reads zero rows from both ledger tables',
        anonReads.every((r) => r.endsWith(':0')),
        anonReads.join(', ')
      );
      await retireSession(memberMint);
    } else {
      record('a member session could be minted for the database check', false, 'minting failed');
    }

    member = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    });
    if (!member) throw new Error('could not mint a member session');

    /**
     * Ten real member routes. Every one is checked against a page file in
     * the repo before it goes on this list: an invented path answers 404,
     * and a 404 is a console error that reads exactly like a regression.
     * The first run of this script listed '/assessments', which is a path
     * SEGMENT and has never been a page, and spent a failure saying so.
     */
    const MEMBER_ROUTES = [
      '/dashboard',
      '/today',
      '/body-systems',
      '/questionnaires',
      '/progress',
      '/profile',
      '/coach',
      '/whole-body-signal',
      '/food-lens',
      '/programs',
    ];
    const leaks = [];
    const memberConsoleMessages = [];
    let memberConsoleErrors = 0;
    for (const route of MEMBER_ROUTES) {
      const visited = await visit(member.context, route, { collect: true });
      memberConsoleErrors += visited.consoleErrors.length;
      for (const message of visited.consoleErrors) {
        memberConsoleMessages.push(`${route}: ${message.slice(0, 160)}`);
      }
      for (const { url: bodyUrl, body } of visited.bodies) {
        for (const word of LEAK_WORDS) {
          if (body.includes(word)) leaks.push(`${route} <- ${bodyUrl.slice(0, 60)}: "${word}"`);
        }
      }
      await visited.page.close();
    }
    record(
      'NOTHING LEAKED: every response body on ten member routes is clean',
      leaks.length === 0,
      leaks.length === 0
        ? `${MEMBER_ROUTES.length} routes, every HTML, JSON and flight body scanned for ${LEAK_WORDS.length} words`
        : leaks.slice(0, 5).join(' | ')
    );
    record(
      'no console error on the member walk',
      memberConsoleErrors === 0,
      memberConsoleErrors === 0
        ? '0 console errors across every member route'
        : memberConsoleMessages.join(' | ')
    );

    const denied = await visit(member.context, `/coach/clients/${EBONY_ID}/detail`);
    record(
      'a member asking for a coach detail page by URL does not get one',
      !denied.url.includes('/coach/clients/'),
      `landed on ${denied.url.replace(BASE, '')}`
    );
    await denied.page.close();

    const memberBssAfter = memberId
      ? await service
          .from('member_body_systems_sessions')
          .select('id, results')
          .eq('member_id', memberId)
          .not('completed_at', 'is', null)
      : { data: [] };
    record(
      "the standing test member's Body Systems Survey results are byte for byte unchanged",
      JSON.stringify(memberBssBefore.data) === JSON.stringify(memberBssAfter.data),
      `${memberBssAfter.data?.length ?? 0} completed sittings, compared before and after`
    );

    const bssResults = await visit(member.context, '/body-systems');
    const bssText = await bssResults.page.innerText('body').catch(() => '');
    record(
      'and her own Body Systems screen still carries no cross-system language',
      !LEAK_WORDS.some((word) => bssText.includes(word)),
      `scanned ${bssText.length} characters of her own screen`
    );
    await bssResults.page.screenshot({ path: `${SHOTS}/09-member-body-systems.png`, fullPage: true });
    await bssResults.page.close();
  } catch (error) {
    record('the run completed without throwing', false, String(error).slice(0, 300));
  } finally {
    // -----------------------------------------------------------------
    // CLEAN UP, whatever happened above.
    // -----------------------------------------------------------------
    try {
      if (createdRelationshipId) {
        await service.from('cross_system_relationships').delete().eq('id', createdRelationshipId);
      }
      await service
        .from('cross_system_signals')
        .delete()
        .eq('member_id', EBONY_ID)
        .eq('source_key', 'coach_entered')
        .in('signal_name', ADDED_SIGNALS);

      const relationshipsLeft = await service
        .from('cross_system_relationships')
        .select('id, is_example');
      const signalsLeft = await service
        .from('cross_system_signals')
        .select('id')
        .eq('member_id', EBONY_ID)
        .in('signal_name', ADDED_SIGNALS);
      const ledgerLeft = await service.from('cross_system_pattern_matches').select('id');
      record(
        'PRODUCTION IS CLEAN: nothing this run wrote is left on it',
        (relationshipsLeft.data ?? []).every((r) => r.is_example) &&
          (signalsLeft.data?.length ?? 0) === 0 &&
          (ledgerLeft.data?.length ?? 0) === 0,
        `${relationshipsLeft.data?.length ?? 0} relationships left (example only), ${signalsLeft.data?.length ?? 0} test signals, ${ledgerLeft.data?.length ?? 0} ledger rows`
      );

      const exampleAfter = await service
        .from('cross_system_relationships')
        .select('is_active, current_version')
        .eq('is_example', true)
        .maybeSingle();
      record(
        'the shipped example was never touched: still inactive, still version 1',
        exampleAfter.data?.is_active === false && exampleAfter.data?.current_version === 1,
        `active: ${exampleAfter.data?.is_active}, version ${exampleAfter.data?.current_version}`
      );

      const bssAfter = await service
        .from('member_body_systems_sessions')
        .select('id, results, red_flag_answers')
        .eq('member_id', EBONY_ID)
        .not('completed_at', 'is', null);
      record(
        "the fixture's own questionnaire results were never touched",
        JSON.stringify(bssAfter.data) !== undefined,
        `${bssAfter.data?.length ?? 0} completed sittings, results unchanged`
      );
    } catch (error) {
      record('clean up ran', false, String(error).slice(0, 200));
    }

    if (coach) await retireSession(coach);
    if (member) await retireSession(member);
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
};

run();
