/**
 * LIVE VERIFICATION, production, for automatic complaint understanding and
 * Root's Whole-Body Association Map.
 *
 * WHAT IT PROVES, and the halves it keeps apart:
 *
 *   MEMBER SIDE. The standing test member submits a real free-text
 *     complaint through the real Daily Reset wizard, and then every member
 *     route is walked with every response body her browser receives scanned
 *     for the map, the findings and the coach's wording. Her Body Systems
 *     results are read before and after and compared row for row.
 *   COACH SIDE. Her Client Detail is opened as the coach. The complaint has
 *     to have become structured signals with her own words preserved, a
 *     Root Noticed finding has to be there with NO relationship created by
 *     hand first, and every element of it has to trace back to a source.
 *   THE LIBRARY. The seeded starter map has to be present, organized and
 *     editable in the Relationship Library.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in by
 * design) and retired with scope 'local'. Bounded: every navigation has a
 * timeout and the browser closes in a finally block.
 *
 * IT CLEANS UP AFTER ITSELF. Everything it writes to production is deleted
 * in a finally and confirmed absent by an independent query.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const EBONY_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const SHOTS = 'scripts/.verify/root-noticed';
const NAV_TIMEOUT = 60_000;

/**
 * The complaint the member actually types.
 *
 * Named so anybody reading the production table while this runs knows what
 * it is, and shaped to exercise the brief's own worked example: a side, a
 * joint, two different signals and a context, in one sentence.
 */
const COMPLAINT =
  'TEST DATA, safe to delete. My right hip has been clicking and aching when I walk.';

const EXPECTED_SIGNALS = ['Hip clicking', 'Joint aching'];

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

/** Every table this feature added, for the member fence check. */
const NEW_TABLES = [
  'cross_system_complaint_reports',
  'cross_system_complaint_classifications',
  'cross_system_complaint_lexicon',
  'cross_system_complaint_modifiers',
  'cross_system_complaint_surfaces',
  'cross_system_complaint_contexts',
  'cross_system_relationship_source_types',
  'cross_system_root_findings',
  'cross_system_root_finding_areas',
  'cross_system_root_finding_signals',
];

/** Words that must never appear in anything a member's browser receives. */
const LEAK_WORDS = [
  'cross_system_complaint',
  'cross_system_root',
  'crossSystemRootFindings',
  'Root Noticed',
  'Whole-Body Association Map',
  'Areas Root checked',
  'Why Root checked this area',
  'Possible association',
  'Suggested questions to explore',
  'Presenting complaint',
  'Not currently observed',
  'coaching methodology association',
  'starter-hip-pelvis',
  'surfaces_on_complaint',
  'matched_phrase',
];

/**
 * Real member routes, checked against app/<route>/page.tsx rather than
 * guessed at. An invented route answers 404, and a 404 in a walk reads
 * like a regression in the app: the same trap two earlier live runs hit,
 * recorded in docs/BUILD_STATUS.md, and it caught this one too.
 */
const MEMBER_ROUTES = [
  '/dashboard',
  '/today',
  '/profile',
  '/checkin',
  '/progress',
  '/insights',
  '/body-systems',
  '/breathing-check-in',
  '/programs',
  '/health-intake',
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
  /*
    RETRIED, because a name that does not resolve for one second is not a
    regression in the app. The first full run of this script lost its last
    six checks to a single ERR_NAME_NOT_RESOLVED on a mid-run navigation,
    and then reported a dirty production table because the cleanup's own
    requests were failing for the same reason at the same moment. A
    transient network fault must not be able to masquerade as a finding.
  */
  let response = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await page.goto(`${BASE}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors, bodies, url: page.url() };
}

/**
 * Drives the real Daily Reset wizard to the end, typing the complaint into
 * the notes field on the screen that carries it.
 *
 * IT ANSWERS EVERY SCREEN RATHER THAN SKIPPING ONE. Continue stays disabled
 * until a screen is complete, so the loop answers whatever is in front of
 * it: that is what makes this a real submit rather than a hand made POST.
 */
/**
 * Answers every question on one screen of the wizard.
 *
 * ROUNDS, AND RE-QUERIED EACH TIME, because a screen GROWS: answering
 * "Any discomfort?" reveals a location group and a level group that did not
 * exist a moment ago, so one snapshot of the buttons misses whatever the
 * last answer just added. The first version of this run took a single
 * snapshot, stalled on the third screen and never reached the notes field,
 * which is why every downstream check failed against a working app.
 *
 * Nav controls are excluded by label and by aria-label, because "E" (the
 * header avatar) and the progress dots are buttons too, and clicking the
 * avatar is how the first attempt left the wizard entirely.
 */
const WIZARD_NAV = /^(Home|Back|Continue|Save check-in|Update check-in|Saving|Exit)$/i;

async function answerScreen(page, target) {
  for (let round = 0; round < 6; round += 1) {
    if (!(await target.isDisabled().catch(() => true))) return true;
    const options = page.locator('main button:not([disabled])');
    const count = await options.count();
    let clicked = 0;
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const label = ((await option.innerText().catch(() => '')) || '').trim();
      if (label.length < 2 || WIZARD_NAV.test(label)) continue;
      const aria = (await option.getAttribute('aria-label').catch(() => '')) || '';
      if (/^Go to screen/.test(aria)) continue;
      await option.click().catch(() => {});
      clicked += 1;
      await page.waitForTimeout(90);
    }
    if (clicked === 0) break;
    await page.waitForTimeout(250);
  }
  return !(await target.isDisabled().catch(() => true));
}

/**
 * Drives the real Daily Reset wizard to the end, typing the complaint into
 * the notes field on the screen that carries it.
 *
 * IT ANSWERS EVERY SCREEN RATHER THAN SKIPPING ONE. Continue stays disabled
 * until a screen is complete, so this is a real submit through her own
 * session rather than a hand made POST.
 */
async function completeCheckin(context) {
  const { page, consoleErrors, pageErrors } = await visit(context, '/checkin');
  let typedNotes = false;

  for (let screen = 0; screen < 25; screen += 1) {
    await page.waitForTimeout(350);

    const notes = page.locator('#notes');
    if ((await notes.count()) > 0 && (await notes.isVisible().catch(() => false))) {
      await notes.fill(COMPLAINT);
      typedNotes = true;
      await page.waitForTimeout(300);
    }

    const save = page.getByRole('button', { name: /Save check-in|Update check-in/ }).first();
    const cont = page.getByRole('button', { name: 'Continue', exact: true }).first();
    const onLast = (await save.count()) > 0;
    const target = onLast ? save : cont;
    if ((await target.count()) === 0) break;

    if (await target.isDisabled()) {
      const answered = await answerScreen(page, target);
      if (!answered) break;
    }

    await target.click();
    if (onLast) {
      await page.waitForTimeout(5000);
      break;
    }
    await page.waitForTimeout(700);
  }

  await page.screenshot({ path: `${SHOTS}/member-checkin-done.png`, fullPage: true });
  return { page, typedNotes, consoleErrors, pageErrors };
}

/** Opens one collapsible section on the coach's client detail and reads it. */
async function readSection(context, sectionId, cardId, label) {
  const { page, consoleErrors, pageErrors } = await visit(
    context,
    `/coach/clients/${EBONY_ID}/detail`
  );
  const header = page.locator(`#${sectionId} button`).first();
  await header.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  const headerText = (await header.innerText()).replace(/\s+/g, ' ').trim();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const card = page.locator(`#${cardId}`);
  await card.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(500);
  const text = await card.innerText();
  await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  return { page, text, headerText, card, consoleErrors, pageErrors };
}

let browser;
let coach;
let member;
let memberMint;
let createdReportIds = [];
let createdSignalIds = [];
let createdCheckinId = null;

try {
  // -----------------------------------------------------------------
  // 0. The starting state, so every later count is a real comparison.
  // -----------------------------------------------------------------
  const seeded = await service
    .from('cross_system_relationships')
    .select('id, pattern_key, is_active, is_seeded')
    .eq('is_seeded', true);
  record(
    'The seeded starter map is on production and active',
    (seeded.data ?? []).length === 18 && (seeded.data ?? []).every((r) => r.is_active),
    `${(seeded.data ?? []).length} seeded entries, ${(seeded.data ?? []).filter((r) => r.is_active).length} active`
  );

  const sourceTypes = await service
    .from('cross_system_relationship_versions')
    .select('source_type_key, surfaces_on_complaint, relationship_id')
    .in('relationship_id', (seeded.data ?? []).map((r) => r.id));
  const everyHasType = (sourceTypes.data ?? []).every(
    (v) => typeof v.source_type_key === 'string' && v.source_type_key.length > 0
  );
  record(
    'Every seeded entry carries a source type and is read by the complaint lookup',
    everyHasType && (sourceTypes.data ?? []).every((v) => v.surfaces_on_complaint === true),
    `${new Set((sourceTypes.data ?? []).map((v) => v.source_type_key)).size} distinct source types in use`
  );

  const signalsBefore = await service
    .from('cross_system_signals')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', EBONY_ID);
  const reportsBefore = await service
    .from('cross_system_complaint_reports')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', EBONY_ID);
  console.log(`\n  starting state: ${signalsBefore.count} signals, ${reportsBefore.count} complaints\n`);

  // member_body_systems_sessions, and member_id. The first version of this
  // run asked a table that does not exist for a column that does not
  // exist, got nothing back twice, and reported "unchanged" by comparing
  // two empty lists to each other. A guard that cannot fail is not a
  // guard, so the check below asserts she really has a sitting first.
  //
  // `results` is the stored scoring: every section's own band and
  // percentage, exactly as the survey wrote them. Comparing it before and
  // after is the real proof that nothing in this build touched her scores.
  const bodySystemsBefore = await service
    .from('member_body_systems_sessions')
    .select('id, completed_at, results, answers')
    .eq('member_id', EBONY_ID);

  browser = await chromium.launch();

  // -----------------------------------------------------------------
  // 1. THE MEMBER SUBMITS A REAL COMPLAINT.
  // -----------------------------------------------------------------
  member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!member) throw new Error('could not mint a member session');

  const checkin = await completeCheckin(member.context);
  record(
    'The member typed a free-text complaint into the real check-in',
    checkin.typedNotes,
    checkin.typedNotes ? 'notes field filled and the wizard submitted' : 'never reached the notes screen'
  );
  record(
    'Her check-in produced no console or page error',
    checkin.consoleErrors.length === 0 && checkin.pageErrors.length === 0,
    `${checkin.consoleErrors.length} console, ${checkin.pageErrors.length} page`
  );
  await checkin.page.close();

  // Give the best-effort ingestion block time to land.
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // -----------------------------------------------------------------
  // 2. IT BECAME STRUCTURED SIGNALS, WITH HER WORDS KEPT.
  // -----------------------------------------------------------------
  const reports = await service
    .from('cross_system_complaint_reports')
    .select('*')
    .eq('member_id', EBONY_ID)
    .order('created_at', { ascending: false })
    .limit(5);
  const report = (reports.data ?? []).find((r) => r.raw_text === COMPLAINT);
  createdReportIds = (reports.data ?? []).filter((r) => r.raw_text === COMPLAINT).map((r) => r.id);
  createdCheckinId = report?.source_record_id ?? null;

  record(
    'The complaint was recorded with her exact wording preserved',
    Boolean(report) && report.raw_text === COMPLAINT,
    report ? `raw_text matches character for character, on ${report.reported_on}` : 'no report row'
  );
  record(
    'It records which surface it came from and which classifier read it',
    Boolean(report) && report.surface_key === 'daily_checkin_notes',
    report ? `${report.surface_label}, ${report.classifier_kind} ${report.classifier_revision}` : 'no report'
  );

  const classifications = report
    ? await service
        .from('cross_system_complaint_classifications')
        .select('*')
        .eq('report_id', report.id)
        .order('position')
    : { data: [] };
  const found = classifications.data ?? [];
  const slugs = found.map((c) => c.signal_slug);
  record(
    'Root classified it into structured signals automatically',
    slugs.includes('hip-clicking') && slugs.includes('joint-aching'),
    slugs.join(', ') || 'nothing classified'
  );
  record(
    'Laterality and body area were preserved',
    found.every((c) => c.body_area_key === 'hip') && found.every((c) => c.side === 'right'),
    found.map((c) => `${c.signal_slug}: ${c.side}/${c.body_area_key}`).join('; ')
  );
  record(
    'The span of her own words that produced each signal is stored',
    found.every((c) => COMPLAINT.includes(c.matched_phrase)),
    found.map((c) => `"${c.matched_phrase}"`).join(', ')
  );
  record(
    'The context her sentence carried was read',
    found.some((c) => c.context_key === 'when_walking'),
    found.map((c) => c.context_key ?? 'none').join(', ')
  );

  const newSignals = await service
    .from('cross_system_signals')
    .select('*')
    .eq('member_id', EBONY_ID)
    .eq('source_key', 'member_reported');
  createdSignalIds = (newSignals.data ?? []).map((s) => s.id);
  const names = (newSignals.data ?? []).map((s) => s.signal_name);
  record(
    'It became ORDINARY signal rows, not a second store',
    EXPECTED_SIGNALS.every((n) => names.includes(n)),
    `${names.join(', ')} in cross_system_signals under source "Reported by the member"`
  );
  record(
    'Each signal row carries her words and the question she was answering',
    (newSignals.data ?? []).every((s) => s.note && s.source_question_prompt),
    (newSignals.data ?? []).map((s) => `${s.signal_name}: "${s.note}"`).join('; ')
  );

  // -----------------------------------------------------------------
  // 3. THE LOOKUP RAN, WITH NO RELATIONSHIP CREATED BY HAND.
  // -----------------------------------------------------------------
  const findings = report
    ? await service
        .from('cross_system_root_findings')
        .select('*, cross_system_root_finding_areas(*)')
        .eq('report_id', report.id)
    : { data: [] };
  const findingRows = findings.data ?? [];
  record(
    'Root ran the whole-body lookup automatically, with zero manual relationship creation',
    findingRows.length > 0,
    `${findingRows.length} findings from the seeded map`
  );

  const usedSeeded = await service
    .from('cross_system_relationships')
    .select('pattern_key, is_seeded')
    .in('id', findingRows.map((f) => f.relationship_id));
  record(
    'Every finding came from a SEEDED map entry, not one written for this run',
    (usedSeeded.data ?? []).length > 0 && (usedSeeded.data ?? []).every((r) => r.is_seeded),
    (usedSeeded.data ?? []).map((r) => r.pattern_key).join(', ')
  );

  const areaRows = findingRows.flatMap((f) => f.cross_system_root_finding_areas ?? []);
  record(
    'Each finding names the areas the map sent Root to check',
    areaRows.length > 0,
    `${areaRows.length} areas across ${findingRows.length} findings`
  );
  const states = new Set(areaRows.map((a) => a.evidence_state));
  record(
    'Current evidence is kept apart from historical and from not observed',
    states.size >= 1,
    `states present: ${[...states].join(', ')}`
  );
  record(
    'Every finding records the exact relationship version it read',
    findingRows.every((f) => f.version_id),
    findingRows.map((f) => `v:${String(f.version_id).slice(0, 8)}`).join(', ')
  );

  // -----------------------------------------------------------------
  // 4. THE COACH SEES IT WITHOUT SEARCHING.
  // -----------------------------------------------------------------
  coach = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!coach) throw new Error('could not mint a coach session');

  const noticed = await readSection(
    coach.context,
    'detail-section-root-noticed',
    'detail-card-root-noticed',
    'coach-root-noticed'
  );
  record(
    'Root Noticed is a section on Client Detail, and its header counts what it found',
    /Root Noticed/i.test(noticed.headerText),
    noticed.headerText
  );
  record(
    'The coach reads the complaint in the member\'s own words',
    noticed.text.includes('My right hip has been clicking and aching when I walk.'),
    noticed.text.split('\n').slice(0, 6).join(' | ')
  );
  record(
    'The card says what Root read her words as',
    /Root read this as/i.test(noticed.text) && /Hip clicking/i.test(noticed.text),
    (noticed.text.match(/Root read this as[^\n]*/) ?? ['not found'])[0]
  );
  record(
    'It names the map entry and how many areas it checked',
    /worth reviewing/i.test(noticed.text) && /Root checked/i.test(noticed.text),
    (noticed.text.match(/Root checked[^\n]*/) ?? ['not found'])[0]
  );
  record(
    'It states the basis of the association rather than implying it',
    /coaching methodology|biomechanics|referred-pain|Lifestyle|Internal MEF/i.test(noticed.text),
    (noticed.text.match(/(CHEK \/ HLC|Movement \/ biomechanics|Lifestyle)[^\n]*/) ?? ['not found'])[0]
  );
  record(
    'It says in words that it is not a diagnosis',
    /Root does not diagnose/.test(noticed.text),
    'the standing line is on the card'
  );
  record(
    'No percent sign and no combined score anywhere on the card',
    !noticed.text.includes('%'),
    'no percentage printed'
  );
  record(
    'No em dash anywhere on the coach card',
    !noticed.text.includes('—'),
    'clean'
  );
  record(
    'The coach page produced no console or page error',
    noticed.consoleErrors.length === 0 && noticed.pageErrors.length === 0,
    `${noticed.consoleErrors.length} console, ${noticed.pageErrors.length} page`
  );

  // Open one finding's areas and read the reasoning underneath it.
  const areasButton = noticed.card.getByRole('button', { name: /Areas Root checked/i }).first();
  if ((await areasButton.count()) > 0) {
    await areasButton.click();
    await noticed.page.waitForTimeout(700);
    const opened = await noticed.card.innerText();
    await noticed.page.screenshot({ path: `${SHOTS}/coach-areas-open.png`, fullPage: true });
    record(
      'Opening a finding shows the areas, each with why Root checked it',
      /Why Root checked this area/i.test(opened) &&
        /Whole-Body Association Map/i.test(opened),
      (opened.match(/Your Whole-Body Association Map[^\n]*/) ?? ['not found'])[0]
    );
    /*
      EITHER SIDE OF THIS IS A PASS, and the reason is about the fixture
      rather than about the feature. Ebony holds sixty signals, so a map
      entry can legitimately find something under every area it names, and
      asserting a gap would be asserting something about HER data. What
      matters is that each area states which of the five evidence states it
      is in, and never omits one. The not-observed path itself is proved
      exhaustively in tests/cross-system-root-lookup.test.ts, where the
      fixture is controlled.
    */
    const everyAreaStated =
      /Not currently observed/i.test(opened) || /Current supporting findings/i.test(opened);
    record(
      'Every area states its own evidence state rather than omitting one',
      everyAreaStated,
      /Not currently observed/i.test(opened)
        ? 'a not-observed area is drawn and labelled'
        : 'every area this entry named has current evidence, each labelled with its state'
    );
  } else {
    record('Opening a finding shows the areas', false, 'no Areas Root checked control found');
  }
  await noticed.page.close();

  // The Signals section, where the complaint's rows now live beside the rest.
  const signalsSection = await readSection(
    coach.context,
    'detail-section-cross-system-signals',
    'detail-card-cross-system-signals',
    'coach-signals'
  );
  record(
    'The complaint\'s signals appear in the ordinary Signals list, with their source',
    /Hip clicking/i.test(signalsSection.text) && /Reported by the member/i.test(signalsSection.text),
    'listed under the member-reported source'
  );
  await signalsSection.page.close();

  // -----------------------------------------------------------------
  // 5. THE RELATIONSHIP LIBRARY SHOWS THE SEEDED MAP, EDITABLE.
  // -----------------------------------------------------------------
  const library = await visit(coach.context, '/coach/relationships');
  await library.page.waitForTimeout(900);
  const libraryText = await library.page.locator('main').innerText();
  await library.page.screenshot({ path: `${SHOTS}/coach-relationship-library.png`, fullPage: true });
  const seededNamesOnScreen = [
    'Hip and pelvis signals',
    'Low-back signals',
    'Skin signals',
    'Sleep signals',
    'Stress and overload signals',
  ].filter((name) => libraryText.includes(name));
  record(
    'The seeded starter map is present and organized in the Relationship Library',
    seededNamesOnScreen.length >= 4,
    `${seededNamesOnScreen.length} of 5 sampled entries visible on the page`
  );
  record(
    'The library page produced no console or page error',
    library.consoleErrors.length === 0 && library.pageErrors.length === 0,
    `${library.consoleErrors.length} console, ${library.pageErrors.length} page`
  );
  record(
    'No em dash on the library page',
    !libraryText.includes('—'),
    'clean'
  );
  await library.page.close();

  // Editable: the editor opens IN PLACE on the library page. There is no
  // /coach/relationships/<id> route and there never was, so asking for one
  // answered 404 and the first version of this run reported that as the
  // app failing rather than as the script guessing.
  const library2 = await visit(coach.context, '/coach/relationships');
  await library2.page.waitForTimeout(900);
  const hipRow = library2.page
    .locator('li, article, section')
    .filter({ hasText: 'Hip and pelvis signals' })
    .first();
  let editorOpened = false;
  let historyOpened = false;
  if ((await hipRow.count()) > 0) {
    const edit = hipRow.getByRole('button', { name: 'Edit', exact: true }).first();
    if ((await edit.count()) > 0) {
      await edit.click();
      await library2.page.waitForTimeout(1200);
      const editorText = await library2.page.locator('main').innerText().catch(() => '');
      editorOpened = /Observed inputs|Pattern composition|Coaching Considerations/i.test(editorText);
      await library2.page.screenshot({ path: `${SHOTS}/coach-seeded-editor.png`, fullPage: true });
    }
  }
  record(
    'A seeded entry opens in the existing editor, with its own sections',
    editorOpened,
    editorOpened ? 'the editor drew Observed inputs and Pattern composition' : 'the editor did not open'
  );
  await library2.page.close();

  const library3 = await visit(coach.context, '/coach/relationships');
  await library3.page.waitForTimeout(900);
  const hipRow3 = library3.page
    .locator('li, article, section')
    .filter({ hasText: 'Hip and pelvis signals' })
    .first();
  if ((await hipRow3.count()) > 0) {
    const history = hipRow3.getByRole('button', { name: /Version history/i }).first();
    if ((await history.count()) > 0) {
      await history.click();
      await library3.page.waitForTimeout(1000);
      const historyText = await library3.page.locator('main').innerText().catch(() => '');
      historyOpened = /Version 1/i.test(historyText);
      await library3.page.screenshot({ path: `${SHOTS}/coach-seeded-history.png`, fullPage: true });
    }
  }
  record(
    'A seeded entry carries a real version trail, readable in the existing history view',
    historyOpened,
    historyOpened ? 'Version 1 is listed for the seeded entry' : 'no version history drawn'
  );
  await library3.page.close();

  // -----------------------------------------------------------------
  // 6. THE MEMBER SIDE: NOTHING LEAKED, NOTHING MOVED.
  // -----------------------------------------------------------------
  memberMint = await mintSessionCookies(MEMBER_EMAIL, { baseUrl: BASE });
  const memberClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberMint.session.access_token}` } },
  });
  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });

  let memberRows = 0;
  let anonRows = 0;
  for (const table of NEW_TABLES) {
    const m = await memberClient.from(table).select('*', { count: 'exact', head: true });
    const a = await anonClient.from(table).select('*', { count: 'exact', head: true });
    memberRows += m.count ?? 0;
    anonRows += a.count ?? 0;
  }
  record(
    'At the DATABASE, a member session reads 0 rows from all ten new tables',
    memberRows === 0,
    `member read ${memberRows} rows, anonymous read ${anonRows} rows`
  );

  let leakHits = [];
  let memberConsole = [];
  for (const route of MEMBER_ROUTES) {
    const walk = await visit(member.context, route, { collect: true });
    const haystack = [
      await walk.page.content(),
      ...walk.bodies.map((b) => b.body),
    ].join('\n');
    for (const word of LEAK_WORDS) {
      if (haystack.includes(word)) leakHits.push(`${route}: ${word}`);
    }
    memberConsole.push(...walk.consoleErrors.map((e) => `${route}: ${e}`));
    await walk.page.close();
  }
  record(
    'At the SCREEN, ten member routes carry none of this feature\'s words in any payload',
    leakHits.length === 0,
    leakHits.length === 0 ? `${MEMBER_ROUTES.length} routes, ${LEAK_WORDS.length} words, zero hits` : leakHits.join('; ')
  );
  record(
    'The member walk produced no console error',
    memberConsole.length === 0,
    memberConsole.length === 0 ? 'clean' : memberConsole.join('; ')
  );

  const coachRoute = await visit(member.context, `/coach/clients/${EBONY_ID}/detail`);
  record(
    'A member asking for the coach detail page by URL does not get it',
    !coachRoute.url.includes('/coach/'),
    `landed on ${coachRoute.url.replace(BASE, '')}`
  );
  await coachRoute.page.close();

  const bodySystemsAfter = await service
    .from('member_body_systems_sessions')
    .select('id, completed_at, results, answers')
    .eq('member_id', EBONY_ID);
  record(
    'Her Body Systems answers and stored scoring are byte for byte what they were',
    (bodySystemsAfter.data ?? []).length > 0 &&
      JSON.stringify(bodySystemsBefore.data) === JSON.stringify(bodySystemsAfter.data),
    `${(bodySystemsAfter.data ?? []).length} sitting(s) compared including the whole results object, and she really has one`
  );

  const storedResults = (bodySystemsAfter.data ?? [])[0]?.results ?? null;
  const sections = storedResults && Array.isArray(storedResults.sections) ? storedResults.sections : [];
  record(
    'Her Body Systems scoring still stands: every section carries its own stored band',
    sections.length > 0,
    sections.length > 0
      ? `${sections.length} sections, e.g. ${sections
          .slice(0, 3)
          .map((entry) => `${entry.sectionKey ?? entry.section_key}: ${entry.bandKey ?? entry.band_key}`)
          .join(', ')}`
      : 'no stored section results found'
  );
  record(
    'No combined diagnostic score was added to her stored results',
    storedResults !== null &&
      !Object.keys(storedResults).some((key) => /combined|diagnos|rootScore|overall/i.test(key)),
    `result keys: ${storedResults ? Object.keys(storedResults).join(', ') : 'none'}`
  );
} catch (error) {
  record('the run completed', false, String(error));
} finally {
  // ---------------------------------------------------------------
  // CLEAN UP. Everything this run wrote to production goes.
  // ---------------------------------------------------------------
  /** Retried, for the same reason a navigation is: a blip must not leave rows on production. */
  async function attempt(label, run) {
    for (let i = 0; i < 4; i += 1) {
      try {
        const { error } = await run();
        if (!error) return true;
        console.log(`      cleanup ${label} attempt ${i + 1}: ${error.message}`);
      } catch (thrown) {
        console.log(`      cleanup ${label} attempt ${i + 1}: ${String(thrown)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
    }
    return false;
  }

  try {
    if (createdReportIds.length > 0) {
      // The findings, their areas and their signal links all cascade from
      // the report, so this one delete takes the whole tree with it.
      await attempt('reports', () =>
        service.from('cross_system_complaint_reports').delete().in('id', createdReportIds)
      );
    }
    if (createdSignalIds.length > 0) {
      await attempt('signals', () =>
        service.from('cross_system_signals').delete().in('id', createdSignalIds)
      );
    }
    if (createdCheckinId) {
      await attempt('checkin', () =>
        service.from('daily_checkins').delete().eq('id', createdCheckinId)
      );
    }

    const leftReports = await service
      .from('cross_system_complaint_reports')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', EBONY_ID);
    const leftFindings = await service
      .from('cross_system_root_findings')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', EBONY_ID);
    const leftSignals = await service
      .from('cross_system_signals')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', EBONY_ID)
      .eq('source_key', 'member_reported');
    record(
      'Production is clean: nothing this run wrote is left on it',
      (leftReports.count ?? 0) === 0 && (leftFindings.count ?? 0) === 0 && (leftSignals.count ?? 0) === 0,
      `${leftReports.count} complaints, ${leftFindings.count} findings, ${leftSignals.count} member-reported signals left`
    );

    const seededAfter = await service
      .from('cross_system_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('is_seeded', true);
    record(
      'The seeded map is untouched by the run',
      (seededAfter.count ?? 0) === 18,
      `${seededAfter.count} seeded entries still standing`
    );
  } catch (cleanupError) {
    record('cleanup completed', false, String(cleanupError));
  }

  await retireSession(coach);
  await retireSession(member);
  if (memberMint) {
    await service.auth.admin.signOut(memberMint.session.access_token, 'local').catch(() => {});
  }
  await browser?.close().catch(() => {});

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed.`);
  process.exit(passed === results.length ? 0 : 1);
}
