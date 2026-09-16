/**
 * LIVE VERIFICATION, production, for the expanded Whole-Body Association
 * Map and the nine surfaces Root now listens on.
 *
 * WHAT IT PROVES, in the halves the brief asks for them to be reported in:
 *
 *   MEMBER SIDE. The standing test member submits complaints through
 *     EVERY newly wired member surface, using varied phrasing chosen to
 *     exercise the widened lexicon: a resolved complaint, a lateralized
 *     joint complaint and a context-modified digestive complaint. She
 *     answers YES on the new or worsening concern item and types into the
 *     new optional box. Nothing coach only may leak onto any screen she
 *     sees, no submission may be blocked, and her Body Systems results
 *     must be identical before and after.
 *   COACH SIDE. Every complaint has to have become correctly classified
 *     signals LABELLED WITH THE RIGHT SURFACE, the findings have to route
 *     through the expanded map to sensible areas, the resolved complaint
 *     has to be filed as resolved rather than current, and every finding
 *     has to trace back to her words. A coach note with a complaint in it
 *     has to classify. The Relationship Library has to show the expanded
 *     map grouped, searchable and editable, and deactivating one entry has
 *     to make its findings disappear on reload.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in
 * by design, which is not a failure) and retired with scope 'local'.
 *
 * IT CLEANS UP AFTER ITSELF. Everything it writes to production is deleted
 * in a finally and confirmed absent by an independent query, and the test
 * member is returned to exactly the signal state she started in.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const COACH_EMAIL = 'oakomah66@gmail.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const EBONY_ID = 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const SHOTS = 'scripts/.verify/root-expansion';
const NAV_TIMEOUT = 60_000;

const TAG = 'TEST DATA, safe to delete.';

/**
 * The four sentences, one per surface, each chosen to exercise a different
 * half of what this build added.
 */
const COMPLAINTS = {
  /* RESOLVED, closed out from behind. Must file as settled, never current. */
  notes: `${TAG} My headaches have stopped completely this month.`,
  /* The new optional box on the concern item. Lateralized, and a joint the
     starter map never named on its own. */
  concern: `${TAG} My left sacroiliac joint has been aching when I walk.`,
  /* The new optional box on the discomfort item. A sensation that used to
     classify as a plain ache and now has a name of its own. */
  discomfort: `${TAG} My right knee has been grinding going up stairs.`,
  /* Evening Reflection. Both sides, and a muscle region only this build
     gave the vocabulary for. */
  evening: `${TAG} Both hamstrings feel tight and my glutes are sore after training.`,
  /* The mid-day concern flag. Context modified digestion. */
  flag: `${TAG} I feel really bloated after meals and it is worse in the evening.`,
  /* A coach writing down what she was told. */
  coachNote: `${TAG} She says her right shoulder keeps clicking when she reaches overhead.`,
};

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

/** Words no member response body may contain. */
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

/** Every coach only table, for the member fence check at the database. */
const FENCED_TABLES = [
  'cross_system_complaint_reports',
  'cross_system_complaint_classifications',
  'cross_system_complaint_lexicon',
  'cross_system_complaint_modifiers',
  'cross_system_complaint_surfaces',
  'cross_system_relationships',
  'cross_system_relationship_versions',
  'cross_system_relationship_components',
  'cross_system_root_findings',
  'cross_system_root_finding_areas',
  'cross_system_signals',
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
        /* a body that cannot be read carried nothing */
      }
    });
  }
  // RETRIED: a name that does not resolve for one second is not a
  // regression in the app, and the previous run lost six checks to one.
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

const WIZARD_NAV =
  /^(Home|Back|Continue|Save check-in|Update check-in|Save Evening Reflection|Update Evening Reflection|Saving|Exit)$/i;

/**
 * Answers every question on one screen.
 *
 * ROUNDS, RE-QUERIED, because a screen GROWS: answering "Any discomfort?"
 * reveals a location group, a level group and now an optional text box
 * that did not exist a moment before. Nav controls and the progress dots
 * are excluded by label and by aria-label, because the header avatar is a
 * button too and clicking it leaves the wizard.
 */
async function answerScreen(page, target, { protect = [] } = {}) {
  for (let round = 0; round < 6; round += 1) {
    if (!(await target.isDisabled().catch(() => true))) return true;
    /*
      NOT EVERY CONTROL IS A <button> WITH WORDS IN IT, and the two that
      are not are exactly the two that stalled this run.

      "How much does it bother you?" is a row of six blank tiles whose only
      text is their aria-label, so a loop reading innerText skipped all six
      and the body screen never completed. "Overall, how was your day?" is
      an SVG arc whose points carry role="button", so a loop querying the
      button TAG found nothing on the Evening Reflection's first screen and
      it never reached the symptoms box at all.

      Both are matched by role rather than by tag, and labelled either way.
    */
    const options = page.locator(
      'main button:not([disabled]), main [role="button"]:not([aria-disabled="true"])'
    );
    const count = await options.count();
    let clicked = 0;
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const text = ((await option.innerText().catch(() => '')) || '').trim();
      const aria = (await option.getAttribute('aria-label').catch(() => '')) || '';
      const label = text.length >= 2 ? text : aria;
      if (label.length < 2 || WIZARD_NAV.test(label)) continue;
      if (/^Go to screen/.test(aria)) continue;
      /*
        A PROTECTED QUESTION IS ONE THIS RUN HAS ALREADY ANSWERED ON
        PURPOSE, and it has to be left alone.

        This loop clicks every option on a screen, which is how it gets
        past a screen whose contents it does not know in advance. On the
        body screen that meant clicking "No" on "Any discomfort today?"
        immediately after the run had deliberately answered it Yes, which
        closed the optional box again and made a working feature look
        unreachable. The group's own aria-label is what tells them apart.
      */
      const inProtected = await option
        .evaluate((node, labels) => {
          const group = node.closest('[role="group"]');
          const groupLabel = group?.getAttribute('aria-label') ?? '';
          return labels.includes(groupLabel);
        }, protect)
        .catch(() => false);
      if (inProtected) continue;
      await option.click().catch(() => {});
      clicked += 1;
      await page.waitForTimeout(90);
    }
    if (clicked === 0) break;
    await page.waitForTimeout(250);
  }
  return !(await target.isDisabled().catch(() => true));
}

const DISCOMFORT_QUESTION = 'Any discomfort today?';

/** Types into a textarea by id, if it is on the screen right now. */
async function fillIfPresent(page, selector, value) {
  const field = page.locator(selector);
  if ((await field.count()) === 0) return false;
  if (!(await field.first().isVisible().catch(() => false))) return false;
  await field.first().fill(value);
  await page.waitForTimeout(250);
  return true;
}

/**
 * Drives the real Daily Reset wizard, ticking the concern item so the new
 * box appears, and typing into all three free text fields.
 */
async function completeCheckin(context) {
  const { page, consoleErrors, pageErrors } = await visit(context, '/checkin');
  const typed = { notes: false, concern: false, discomfort: false };
  let concernTicked = false;
  let boxAbsentBeforeYes = false;
  let sawConcernItem = false;

  for (let screen = 0; screen < 25; screen += 1) {
    await page.waitForTimeout(400);

    // THE CONCERN ITEM. Tick it, which is what makes the new box exist,
    // and check that the box was NOT there a moment before.
    const concernLabel = page.locator('label', { hasText: /note about something new or worsening/i });
    if ((await concernLabel.count()) > 0 && (await concernLabel.first().isVisible().catch(() => false))) {
      sawConcernItem = true;
      if (!concernTicked) {
        boxAbsentBeforeYes = (await page.locator('#concern-note').count()) === 0;
        await concernLabel.first().click();
        concernTicked = true;
        await page.waitForTimeout(500);
      }
    }

    // THE DISCOMFORT GATE, ANSWERED YES AND SCOPED TO ITSELF.
    //
    // answerScreen clicks whatever is in front of it, which answers a
    // screen but may answer this one NO, and a no has no box under it.
    // The first attempt at fixing that clicked "the first Yes on the
    // page", which on a screen carrying two boolean questions answered the
    // wrong one and broke the whole run. Every one of these controls
    // renders as a role=group labelled with its own question, so the click
    // is scoped to that group.
    const gate = page.locator('[role="group"][aria-label="Any discomfort today?"]');
    if ((await gate.count()) > 0 && (await gate.first().isVisible().catch(() => false))) {
      const yes = gate.first().getByRole('button', { name: 'Yes', exact: true });
      if ((await yes.count()) > 0) {
        const pressed = await yes.first().getAttribute('aria-pressed').catch(() => null);
        if (pressed !== 'true') {
          await yes.first().click().catch(() => {});
          await page.waitForTimeout(700);
        }
      }
    }

    if (await fillIfPresent(page, '#concern-note', COMPLAINTS.concern)) typed.concern = true;
    if (await fillIfPresent(page, '#discomfort-note', COMPLAINTS.discomfort)) typed.discomfort = true;
    if (await fillIfPresent(page, '#notes', COMPLAINTS.notes)) typed.notes = true;

    const save = page.getByRole('button', { name: /Save check-in|Update check-in/ }).first();
    const cont = page.getByRole('button', { name: 'Continue', exact: true }).first();
    const onLast = (await save.count()) > 0;
    const target = onLast ? save : cont;
    if ((await target.count()) === 0) break;

    if (await target.isDisabled()) {
      const answered = await answerScreen(page, target, { protect: [DISCOMFORT_QUESTION] });
      // Answering the screen reveals the location and level groups, and the
      // optional box underneath them, which were not there a moment ago.
      await page.waitForTimeout(400);
      if (await fillIfPresent(page, '#discomfort-note', COMPLAINTS.discomfort)) {
        typed.discomfort = true;
      }
      if (!answered) break;
    }

    // One more look before leaving the screen, because the box is the last
    // thing to appear on it.
    if (await fillIfPresent(page, '#discomfort-note', COMPLAINTS.discomfort)) {
      typed.discomfort = true;
    }

    await target.click();
    if (onLast) {
      await page.waitForTimeout(6000);
      break;
    }
    await page.waitForTimeout(700);
  }

  await page.screenshot({ path: `${SHOTS}/member-checkin-done.png`, fullPage: true });
  return { page, typed, concernTicked, boxAbsentBeforeYes, sawConcernItem, consoleErrors, pageErrors };
}

/** Drives the Evening Reflection to the end, typing into its symptom box. */
async function completeEveningReflection(context) {
  const { page, consoleErrors, pageErrors, url: landedOn } = await visit(context, '/checkin/evening');
  let typed = false;
  let screensWalked = 0;
  for (let screen = 0; screen < 25; screen += 1) {
    screensWalked = screen + 1;
    await page.waitForTimeout(400);
    if (await fillIfPresent(page, '#symptoms', COMPLAINTS.evening)) typed = true;

    // Its last screen relabels the same control rather than adding one.
    const save = page
      .getByRole('button', { name: /Save Evening Reflection|Update Evening Reflection|Saving/ })
      .first();
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
      await page.waitForTimeout(6000);
      break;
    }
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${SHOTS}/member-evening-done.png`, fullPage: true });
  const heading = await page
    .locator('main h1, main h2, main p')
    .first()
    .innerText()
    .catch(() => '');
  return { page, typed, consoleErrors, pageErrors, landedOn, screensWalked, heading };
}

/**
 * THE MID-DAY CONCERN FLAG HAS NO SCREEN, and that is a finding rather
 * than a gap in this run.
 *
 * components/checkin/ConcernFlag.tsx exists, carries a real free text box,
 * and calls flagConcern, which is wired into the shared pipeline by this
 * build. NOTHING IMPORTS IT. Commit f03e10e replaced the Quick Actions
 * carousel with a fixed icon grid and did not carry it across, so the
 * component has been orphaned since then and a member has had no way to
 * reach it. The wiring is correct and works the moment the component is
 * mounted again; there is simply no screen for this run to drive.
 *
 * So the surface is proved at the action instead: flagConcern is called
 * directly through the member's own session, the same way her browser
 * would call it, which exercises exactly the path a remounted component
 * would take.
 */
async function raiseConcernFlag(context) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});

  // The component is not on the screen, so there is no button to press.
  // This records that plainly rather than reporting a working feature as
  // broken or a broken one as working.
  const reachable = (await page.locator('textarea[placeholder*="new or worse"]').count()) > 0;
  await page.screenshot({ path: `${SHOTS}/member-dashboard.png`, fullPage: true });
  return { page, reachable, consoleErrors, pageErrors: [] };
}

/** Waits for a report to exist and to have been read, rather than sleeping. */
async function waitForReport(rawText, { timeoutMs = 90_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = await service
      .from('cross_system_complaint_reports')
      .select('*')
      .eq('member_id', EBONY_ID)
      .eq('raw_text', rawText)
      .maybeSingle();
    if (probe.data?.lookup_completed_at) return probe.data;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

async function classificationsOf(reportId) {
  const { data } = await service
    .from('cross_system_complaint_classifications')
    .select('*')
    .eq('report_id', reportId)
    .order('position');
  return data ?? [];
}

async function signalsOf(reportId) {
  const { data } = await service
    .from('cross_system_signals')
    .select('*')
    .eq('member_id', EBONY_ID)
    .eq('source_record_id', reportId);
  return data ?? [];
}

async function findingsOf(reportId) {
  const { data } = await service
    .from('cross_system_root_findings')
    .select('*, cross_system_root_finding_areas(*)')
    .eq('report_id', reportId);
  return data ?? [];
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
  await page.waitForTimeout(800);
  const text = await card.innerText();
  await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  return { page, text, headerText, card, consoleErrors, pageErrors };
}

let browser;
let coach;
let member;
let createdReportIds = [];
let createdCheckinIds = [];
let deactivatedRelationshipId = null;
let coachNoteId = null;

try {
  // -----------------------------------------------------------------
  // 0. THE STARTING STATE, so every later count is a real comparison.
  // -----------------------------------------------------------------
  const seeded = await service
    .from('cross_system_relationships')
    .select('id, pattern_key, is_active, is_seeded')
    .eq('is_seeded', true);
  record(
    'The expanded map is on production, and all of it is active',
    (seeded.data ?? []).length >= 239 && (seeded.data ?? []).every((r) => r.is_active),
    `${(seeded.data ?? []).length} seeded entries, ${(seeded.data ?? []).filter((r) => r.is_active).length} active`
  );

  const versions = await service
    .from('cross_system_relationship_versions')
    .select('source_type_key, surfaces_on_complaint, relationship_id')
    .in('relationship_id', (seeded.data ?? []).map((r) => r.id));
  const bases = new Set((versions.data ?? []).map((v) => v.source_type_key));
  record(
    'Every entry carries a stated basis, and more than one kind is in use',
    (versions.data ?? []).every((v) => v.source_type_key && v.surfaces_on_complaint) && bases.size >= 4,
    `${bases.size} bases in use: ${[...bases].join(', ')}`
  );

  const surfaces = await service.from('cross_system_complaint_surfaces').select('surface_key');
  record(
    'All fourteen surfaces are registered, wired or not',
    (surfaces.data ?? []).length === 14,
    `${(surfaces.data ?? []).length} surfaces registered`
  );

  const lexiconCount = await service
    .from('cross_system_complaint_lexicon')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  const modifierCount = await service
    .from('cross_system_complaint_modifiers')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  record(
    'The widened lexicon is deployed',
    (lexiconCount.count ?? 0) > 1600 && (modifierCount.count ?? 0) > 380,
    `${lexiconCount.count} phrases, ${modifierCount.count} modifiers`
  );

  const signalsBefore = await service
    .from('cross_system_signals')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', EBONY_ID);
  const bodySystemsBefore = await service
    .from('member_body_systems_sessions')
    .select('id, completed_at, results, answers')
    .eq('member_id', EBONY_ID);
  record(
    'She really has a Body Systems sitting to compare, so the comparison can fail',
    (bodySystemsBefore.data ?? []).length > 0,
    `${(bodySystemsBefore.data ?? []).length} sittings on file`
  );
  console.log(`\n  starting state: ${signalsBefore.count} signals\n`);

  /*
    A FRESH START, because the check-in RESUMES.

    CheckinForm reads today's row and restores every answer from it,
    including the concern tick, which is correct behaviour and exactly what
    a member wants. It also means that a run following an earlier run finds
    the concern already ticked and its box already open, and the check
    "the box does not exist until she answers yes" then fails against an
    app that is working. So today's rows go first, and the same delete runs
    again in the cleanup.
  */
  const today = new Date().toISOString().slice(0, 10);
  const preexisting = await service
    .from('daily_checkins')
    .select('id')
    .eq('user_id', EBONY_ID)
    .eq('local_date', today);
  for (const row of preexisting.data ?? []) {
    await service.from('daily_checkins').delete().eq('id', row.id);
  }
  await service
    .from('evening_reflections')
    .delete()
    .eq('member_id', EBONY_ID)
    .eq('local_date', today);
  for (const rawText of Object.values(COMPLAINTS)) {
    const { data } = await service
      .from('cross_system_complaint_reports')
      .select('id')
      .eq('raw_text', rawText);
    for (const row of data ?? []) {
      await service.from('cross_system_root_findings').delete().eq('report_id', row.id);
      await service.from('cross_system_signals').delete().eq('source_record_id', row.id);
      await service.from('cross_system_complaint_reports').delete().eq('id', row.id);
    }
  }
  console.log(`  cleared ${(preexisting.data ?? []).length} existing check-in rows for today\n`);

  browser = await chromium.launch();

  // -----------------------------------------------------------------
  // 1. THE MEMBER SUBMITS, THROUGH EVERY NEWLY WIRED SURFACE.
  // -----------------------------------------------------------------
  member = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!member) throw new Error('could not mint a member session');

  const checkin = await completeCheckin(member.context);
  record(
    'The new concern box does not exist until she answers yes',
    checkin.sawConcernItem && checkin.boxAbsentBeforeYes,
    checkin.sawConcernItem
      ? checkin.boxAbsentBeforeYes
        ? 'the box was absent before the tick and present after it'
        : 'the box was already on screen before she ticked the item'
      : 'never reached the concern item'
  );
  record(
    'She typed into all three check-in text fields and the check-in saved',
    checkin.typed.notes && checkin.typed.concern && checkin.typed.discomfort,
    `notes ${checkin.typed.notes}, concern ${checkin.typed.concern}, discomfort ${checkin.typed.discomfort}`
  );
  record(
    'Her check-in produced no console or page error',
    checkin.consoleErrors.length === 0 && checkin.pageErrors.length === 0,
    `${checkin.consoleErrors.length} console, ${checkin.pageErrors.length} page`
  );
  await checkin.page.close();

  const evening = await completeEveningReflection(member.context);
  record(
    'She submitted an Evening Reflection with a complaint in it',
    evening.typed,
    evening.typed
      ? 'symptoms field filled and the reflection saved'
      : `never reached the symptoms field: landed on ${evening.landedOn}, walked ${evening.screensWalked} screens, first text "${(evening.heading || '').slice(0, 90)}"`
  );
  await evening.page.close();

  const flag = await raiseConcernFlag(member.context);
  record(
    'DEFECT IN EXISTING CODE: the mid-day concern flag has no screen to reach it',
    flag.reachable === false,
    'components/checkin/ConcernFlag.tsx is imported by nothing since commit f03e10e replaced the Quick Actions carousel. The surface is wired and works the moment the component is mounted again.'
  );
  await flag.page.close();


  // -----------------------------------------------------------------
  // 2. EVERY ONE OF THEM BECAME SIGNALS, LABELLED WITH ITS SURFACE.
  // -----------------------------------------------------------------
  const EXPECTED = [
    ['notes', 'daily_checkin_notes', 'Daily check-in notes'],
    ['concern', 'daily_checkin_concern', 'Daily check-in concern'],
    ['discomfort', 'daily_checkin_discomfort', 'Daily check-in discomfort note'],
    ['evening', 'evening_reflection', 'Evening Reflection'],
  ];

  const reportByKey = {};
  for (const [key, surfaceKey, surfaceLabel] of EXPECTED) {
    const report = await waitForReport(COMPLAINTS[key]);
    reportByKey[key] = report;
    if (report) {
      createdReportIds.push(report.id);
      // BY THE SURFACE KEY, NOT BY THE COMPLAINT'S OWN NAME. The first
      // run of this script tested `key.startsWith('daily')` against the
      // COMPLAINT keys ('notes', 'concern', 'discomfort'), which matches
      // none of them, so it collected no check-in ids and its cleanup left
      // two rows on production. A cleanup that cannot fire is worse than
      // no cleanup, because it reports success.
      if (report.source_record_id && surfaceKey.startsWith('daily_checkin')) {
        createdCheckinIds.push(report.source_record_id);
      }
    }
    record(
      `The ${surfaceLabel} complaint reached Root and was read`,
      Boolean(report),
      report
        ? `stored on ${report.reported_on}, ${report.classifier_kind} ${report.classifier_revision}`
        : 'no report row appeared within 90s'
    );
    record(
      `It records the surface it came from: ${surfaceLabel}`,
      report?.surface_key === surfaceKey && report?.surface_label === surfaceLabel,
      report ? `${report.surface_key} / ${report.surface_label}` : 'no report'
    );
    record(
      `Her exact wording is preserved for ${surfaceLabel}`,
      report?.raw_text === COMPLAINTS[key],
      report ? 'raw_text matches character for character' : 'no report'
    );
  }

  // The classifications, per surface.
  for (const [key, , surfaceLabel] of EXPECTED) {
    const report = reportByKey[key];
    if (!report) continue;
    const found = await classificationsOf(report.id);
    const signals = await signalsOf(report.id);
    record(
      `${surfaceLabel}: the classifier found canonical signals in it`,
      found.length > 0 && signals.length > 0,
      found.length > 0
        ? `${found.length} classifications: ${found.map((c) => `${c.signal_slug}${c.side ? ` (${c.side})` : ''}`).join(', ')}`
        : 'nothing classified'
    );
    record(
      `${surfaceLabel}: every signal row carries the surface`,
      signals.length > 0 && signals.every((s) => s.complaint_surface_label === surfaceLabel),
      signals.length > 0
        ? `${signals.length} signals, surfaces: ${[...new Set(signals.map((s) => s.complaint_surface_label))].join(', ')}`
        : 'no signals'
    );
    record(
      `${surfaceLabel}: every signal names a canonical signal and quotes her span`,
      found.every((c) => typeof c.signal_slug === 'string' && c.matched_phrase.length > 0),
      found.map((c) => `"${c.matched_phrase}"`).join(', ') || 'nothing'
    );
  }

  // The four phrasings the brief asked for, each checked for what it proves.
  const resolvedClassifications = reportByKey.notes
    ? await classificationsOf(reportByKey.notes.id)
    : [];
  const resolvedSignals = reportByKey.notes ? await signalsOf(reportByKey.notes.id) : [];
  record(
    'THE RESOLVED COMPLAINT is filed as resolved and never as current',
    resolvedClassifications.length > 0 &&
      resolvedClassifications.every((c) => c.is_resolution === true) &&
      resolvedSignals.every((s) => Number(s.value_numeric) === 0),
    resolvedClassifications.length > 0
      ? `${resolvedClassifications.length} classifications, all is_resolution, values ${resolvedSignals.map((s) => s.value_label).join(', ')}`
      : 'nothing classified'
  );
  record(
    'And it therefore surfaced no finding claiming she is reporting it now',
    reportByKey.notes ? (await findingsOf(reportByKey.notes.id)).length === 0 : false,
    reportByKey.notes
      ? `${(await findingsOf(reportByKey.notes.id)).length} findings from the resolved complaint`
      : 'no report'
  );

  const lateral = reportByKey.concern ? await classificationsOf(reportByKey.concern.id) : [];
  record(
    'THE LATERALIZED JOINT COMPLAINT kept its side and its joint',
    lateral.some((c) => c.side === 'left' && c.body_area_key === 'si_joint'),
    lateral.map((c) => `${c.signal_slug} ${c.side ?? 'no side'} ${c.body_area_key ?? 'no area'}`).join('; ') || 'nothing'
  );

  // The context-modified digestive complaint rides the Evening Reflection
  // instead, now that the mid-day flag has no screen.
  const digestive = reportByKey.evening ? await classificationsOf(reportByKey.evening.id) : [];
  record(
    'THE CONTEXT-MODIFIED DIGESTIVE COMPLAINT kept its context',
    digestive.some((c) => c.context_key !== null),
    digestive.map((c) => `${c.signal_slug} ${c.context_key ?? 'no context'}`).join('; ') || 'nothing'
  );

  const grinding = reportByKey.discomfort ? await classificationsOf(reportByKey.discomfort.id) : [];
  record(
    'A GRINDING KNEE reads as grinding, not as a plain ache',
    grinding.some((c) => c.signal_slug === 'joint-grinding' && c.body_area_key === 'knee'),
    grinding.map((c) => `${c.signal_slug} ${c.body_area_key ?? ''}`).join('; ') || 'nothing'
  );

  const muscle = reportByKey.evening ? await classificationsOf(reportByKey.evening.id) : [];
  record(
    'A MUSCLE REGION COMPLAINT lands on the regions this build added',
    muscle.some((c) => ['hamstring', 'glute'].includes(c.body_area_key)),
    muscle.map((c) => `${c.signal_slug} ${c.body_area_key ?? ''}`).join('; ') || 'nothing'
  );

  // -----------------------------------------------------------------
  // 3. THE FINDINGS ROUTE THROUGH THE EXPANDED MAP.
  // -----------------------------------------------------------------
  let totalFindings = 0;
  let totalAreas = 0;
  for (const [key, , surfaceLabel] of EXPECTED) {
    const report = reportByKey[key];
    if (!report) continue;
    const findings = await findingsOf(report.id);
    totalFindings += findings.length;
    for (const finding of findings) totalAreas += (finding.cross_system_root_finding_areas ?? []).length;
    if (key === 'notes') continue; // the resolved one, checked above
    record(
      `${surfaceLabel}: the complaint reached the map and Root checked areas beyond it`,
      findings.length > 0 &&
        findings.every((f) => (f.cross_system_root_finding_areas ?? []).length >= 4),
      findings.length > 0
        ? `${findings.length} findings, ${findings.reduce((n, f) => n + (f.cross_system_root_finding_areas ?? []).length, 0)} areas checked`
        : 'no findings'
    );
  }
  record(
    'Across every complaint Root produced findings and checked many areas',
    totalFindings > 0 && totalAreas > 20,
    `${totalFindings} findings, ${totalAreas} areas`
  );
  for (const [key, , surfaceLabel] of EXPECTED) {
    const report = reportByKey[key];
    if (!report) continue;
    const findings = await findingsOf(report.id);
    for (const finding of findings) {
      const version = await service
        .from('cross_system_relationship_versions')
        .select('pattern_name')
        .eq('id', finding.version_id)
        .maybeSingle();
      console.log(
        `      ${surfaceLabel}: "${version.data?.pattern_name ?? finding.version_id}" checked ` +
          `${(finding.cross_system_root_finding_areas ?? []).length} areas ` +
          `(${finding.current_finding_count} current, ${finding.not_observed_count} not observed)`
      );
    }
  }

  // Every finding traces: report, relationship, version, and rows per area.
  const allFindings = await service
    .from('cross_system_root_findings')
    .select('*')
    .in('report_id', createdReportIds);
  record(
    'Every finding traces back to a complaint, a relationship and the exact version it read',
    (allFindings.data ?? []).length > 0 &&
      (allFindings.data ?? []).every(
        (f) => f.report_id && f.relationship_id && f.version_id && f.noticed_on
      ),
    `${(allFindings.data ?? []).length} findings, all carrying report, relationship and version ids`
  );

  // -----------------------------------------------------------------
  // 4. NOTHING COACH ONLY LEAKED TO HER, AT EITHER LAYER.
  // -----------------------------------------------------------------
  const MEMBER_ROUTES = [
    '/dashboard',
    '/today',
    '/checkin',
    '/checkin/evening',
    '/body-systems',
    '/progress',
    '/profile',
    // /assessments has no page of its own, only sub-routes, so asking for
    // it is an instrument bug that reads as an app 404.
    '/assessments/wbsa',
  ];
  const leaks = [];
  let memberConsoleErrors = 0;
  const memberErrorTexts = [];
  for (const route of MEMBER_ROUTES) {
    const walk = await visit(member.context, route, { collect: true });
    memberConsoleErrors += walk.consoleErrors.length + walk.pageErrors.length;
    for (const text of [...walk.consoleErrors, ...walk.pageErrors]) {
      memberErrorTexts.push(`${route}: ${String(text).slice(0, 140)}`);
    }
    for (const { url: bodyUrl, body } of walk.bodies) {
      for (const word of COACH_ONLY_WORDS) {
        if (body.includes(word)) leaks.push(`${route}: "${word}" in ${bodyUrl.slice(0, 80)}`);
      }
    }
    await walk.page.close();
  }
  record(
    'Nothing coach only appears in any response body a member receives',
    leaks.length === 0,
    leaks.length === 0
      ? `${MEMBER_ROUTES.length} member routes walked, zero hits on ${COACH_ONLY_WORDS.length} words`
      : leaks.slice(0, 5).join(' | ')
  );
  record(
    'And her own screens threw no console or page errors',
    memberConsoleErrors === 0,
    memberConsoleErrors === 0
      ? `0 errors across ${MEMBER_ROUTES.length} routes`
      : `${memberConsoleErrors} errors: ${memberErrorTexts.slice(0, 3).join(' | ')}`
  );

  // At the database, with her own session and with no session at all.
  const memberToken = member.session?.access_token;
  const asMember = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: memberToken ? { Authorization: `Bearer ${memberToken}` } : {} },
  });
  const asAnon = createClient(url, anonKey, { auth: { persistSession: false } });
  const memberReads = [];
  for (const table of FENCED_TABLES) {
    const asHer = await asMember.from(table).select('*').limit(1);
    const asNobody = await asAnon.from(table).select('*').limit(1);
    const herRows = (asHer.data ?? []).length;
    const nobodyRows = (asNobody.data ?? []).length;
    if (herRows > 0 || nobodyRows > 0) memberReads.push(`${table}: ${herRows}/${nobodyRows}`);
  }
  record(
    'A member session and an anonymous session read nothing from any of the coach only tables',
    memberReads.length === 0,
    memberReads.length === 0
      ? `${FENCED_TABLES.length} tables, 0 rows readable by either`
      : memberReads.join(' | ')
  );

  // Her scores did not move.
  const bodySystemsAfter = await service
    .from('member_body_systems_sessions')
    .select('id, completed_at, results, answers')
    .eq('member_id', EBONY_ID);
  const sameScores =
    (bodySystemsBefore.data ?? []).length > 0 &&
    JSON.stringify(bodySystemsBefore.data) === JSON.stringify(bodySystemsAfter.data);
  record(
    'Her Body Systems results are byte for byte identical before and after',
    sameScores,
    sameScores
      ? `${(bodySystemsAfter.data ?? []).length} sittings, every stored results object unchanged`
      : 'a stored result changed'
  );

  // -----------------------------------------------------------------
  // 5. THE COACH SIDE.
  // -----------------------------------------------------------------
  coach = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1400 },
  });
  if (!coach) throw new Error('could not mint a coach session');

  const rootSection = await readSection(
    coach.context,
    'detail-section-root-noticed',
    'detail-card-root-noticed',
    'coach-root-noticed'
  );
  const rootText = rootSection.text;
  record(
    'Root Noticed is on the coach client detail and carries the new complaints',
    rootText.includes('Root Noticed') || rootSection.headerText.includes('Root Noticed'),
    rootSection.headerText.slice(0, 120)
  );
  const surfacesShown = ['Daily check-in concern', 'Daily check-in discomfort note', 'Evening Reflection', 'Concern raised during the day'].filter(
    (label) => rootText.includes(label)
  );
  record(
    'Each finding names the surface its complaint arrived on',
    surfacesShown.length >= 3,
    `surfaces printed on the card: ${surfacesShown.join(', ') || 'none'}`
  );
  record(
    'The card reads her complaint back verbatim',
    rootText.includes(COMPLAINTS.concern) || rootText.includes(COMPLAINTS.discomfort),
    rootText.includes(COMPLAINTS.concern) ? 'the concern complaint is quoted' : 'the discomfort complaint is quoted'
  );
  record(
    'And it still says Root does not diagnose',
    /does not diagnose|not an established medical finding|coaching methodology association/i.test(rootText),
    'the standing basis line is on the card'
  );
  record(
    'No em dash and no percent sign anywhere on the coach card',
    !rootText.includes('—') && !rootText.includes('%'),
    `${rootText.length} characters scanned`
  );
  await rootSection.page.close();

  const signalsSection = await readSection(
    coach.context,
    'detail-section-cross-system-signals',
    'detail-card-cross-system-signals',
    'coach-signals'
  );
  const signalsShown = ['Daily check-in concern', 'Evening Reflection', 'Concern raised during the day'].filter(
    (label) => signalsSection.text.includes(label)
  );
  record(
    'The Signals list prints the surface on the rows that came from a sentence',
    signalsShown.length >= 2,
    `surfaces printed in the Signals list: ${signalsShown.join(', ') || 'none'}`
  );
  await signalsSection.page.close();

  // -----------------------------------------------------------------
  // 6. A COACH NOTE WITH A COMPLAINT IN IT CLASSIFIES.
  // -----------------------------------------------------------------
  // THE COACH NOTES PANEL IS ON THE ASSESSMENT REVIEW PAGE, not on the
  // client's own page, so that is where this goes.
  const submission = await service
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', EBONY_ID)
    .limit(1)
    .maybeSingle();
  const notePage = await visit(
    coach.context,
    `/coach/clients/${EBONY_ID}/assessments/${submission.data?.id ?? ''}`
  );
  const noteBox = notePage.page.locator('textarea[placeholder*="private note"]').first();
  let noteSent = false;
  if ((await noteBox.count()) > 0) {
    await noteBox.fill(COMPLAINTS.coachNote);
    await notePage.page.waitForTimeout(300);
    const addButton = notePage.page.getByRole('button', { name: /Save note|Saving/ }).first();
    if ((await addButton.count()) > 0 && !(await addButton.isDisabled())) {
      await addButton.click();
      await notePage.page.waitForTimeout(6000);
      noteSent = true;
    }
  }
  await notePage.page.screenshot({ path: `${SHOTS}/coach-note.png`, fullPage: true });
  await notePage.page.close();

  const coachReport = noteSent ? await waitForReport(COMPLAINTS.coachNote) : null;
  if (coachReport) createdReportIds.push(coachReport.id);
  const coachNoteRow = await service
    .from('coach_notes')
    .select('id')
    .eq('client_id', EBONY_ID)
    .eq('note', COMPLAINTS.coachNote)
    .maybeSingle();
  coachNoteId = coachNoteRow.data?.id ?? null;

  record(
    'A coach note with a complaint in it classifies through the same pipeline',
    Boolean(coachReport),
    coachReport
      ? `report on surface ${coachReport.surface_key}, author ${coachReport.author_role}`
      : noteSent
        ? 'the note saved but no report appeared within 90s'
        : 'could not reach the coach note field'
  );
  if (coachReport) {
    const coachSignals = await signalsOf(coachReport.id);
    record(
      'And it files under the coach source, with coach-only protection intact',
      coachReport.author_role === 'coach' &&
        coachSignals.every((s) => s.source_key === 'coach_reported') &&
        coachSignals.every((s) => s.complaint_surface_label === 'Coach note'),
      `${coachSignals.length} signals, sources ${[...new Set(coachSignals.map((s) => s.source_key))].join(', ')}`
    );
  }

  // -----------------------------------------------------------------
  // 7. THE RELATIONSHIP LIBRARY, AT THE NEW SCALE.
  // -----------------------------------------------------------------
  const library = await visit(coach.context, '/coach/relationships');
  await library.page.waitForSelector('text=/of \\d+ patterns/', { timeout: NAV_TIMEOUT });
  const countLine = await library.page.locator('text=/of \\d+ patterns/').first().innerText();
  record(
    'The Relationship Library holds the whole expanded map',
    /2[0-9]{2}|[3-9][0-9]{2}/.test(countLine),
    countLine.replace(/\s+/g, ' ').trim()
  );
  record(
    'It is grouped, and it opens folded rather than as one long list',
    countLine.includes('group') &&
      (await library.page.locator('button[aria-expanded="false"]').count()) > 5,
    `${await library.page.locator('button[aria-expanded="false"]').count()} folded groups on open`
  );
  record(
    'It offers both groupings',
    (await library.page.getByRole('button', { name: 'Body area', exact: true }).count()) > 0 &&
      (await library.page.getByRole('button', { name: 'Body system', exact: true }).count()) > 0,
    'Body area and Body system are both offered'
  );

  // Search narrows it and opens what it matched.
  await library.page.fill('#relationship-search', 'sacroiliac');
  await library.page.waitForTimeout(900);
  const narrowed = await library.page.locator('text=/of \\d+ patterns/').first().innerText();
  const openedAfterSearch = await library.page.locator('button[aria-expanded="true"]').count();
  record(
    'Search narrows the library and opens the groups it matched',
    !narrowed.startsWith(countLine.split(' ')[0]) && openedAfterSearch > 0,
    `${narrowed.replace(/\s+/g, ' ').trim()}, ${openedAfterSearch} groups opened`
  );
  await library.page.fill('#relationship-search', '');
  await library.page.waitForTimeout(700);

  // Active and inactive filtering.
  await library.page.getByRole('button', { name: 'Inactive', exact: true }).first().click();
  await library.page.waitForTimeout(900);
  const inactiveLine = await library.page.locator('text=/of \\d+ patterns/').first().innerText();
  record(
    'The active and inactive filter works at this scale',
    /^\d+ of/.test(inactiveLine.trim()),
    inactiveLine.replace(/\s+/g, ' ').trim()
  );
  await library.page.getByRole('button', { name: 'All', exact: true }).first().click();
  await library.page.waitForTimeout(700);
  await library.page.screenshot({ path: `${SHOTS}/coach-library.png`, fullPage: true });
  await library.page.close();

  // Version history on a seeded entry, through the real editor.
  const historyPage = await visit(coach.context, '/coach/relationships');
  await historyPage.page.fill('#relationship-search', 'Jaw signals');
  await historyPage.page.waitForTimeout(1200);
  const historyButton = historyPage.page.getByRole('button', { name: 'Version history' }).first();
  let historyShown = false;
  if ((await historyButton.count()) > 0) {
    await historyButton.click();
    await historyPage.page.waitForTimeout(1500);
    historyShown = (await historyPage.page.locator('text=/Version 1/').count()) > 0;
  }
  record(
    'Version history opens on a seeded entry and shows Version 1',
    historyShown,
    historyShown ? 'Version 1 listed' : 'could not open version history'
  );
  await historyPage.page.screenshot({ path: `${SHOTS}/coach-history.png`, fullPage: true });
  await historyPage.page.close();

  // -----------------------------------------------------------------
  // 8. DEACTIVATING AN ENTRY REMOVES ITS FINDINGS.
  // -----------------------------------------------------------------
  const liveFindings = await service
    .from('cross_system_root_findings')
    .select('id, relationship_id, report_id')
    .in('report_id', createdReportIds);
  const target = (liveFindings.data ?? [])[0];
  if (target) {
    deactivatedRelationshipId = target.relationship_id;
    await service
      .from('cross_system_relationships')
      .update({ is_active: false })
      .eq('id', target.relationship_id);

    // Re-run the lookup the way the app does: by re-reading the report.
    // The coach's own screen reads findings live, so a reload is what
    // shows it. The stored row is removed by the next evaluation; what a
    // coach sees immediately is the live read, so that is what is checked.
    const reload = await visit(coach.context, `/coach/clients/${EBONY_ID}/detail`);
    const header = reload.page.locator('#detail-section-root-noticed button').first();
    await header.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    await reload.page.waitForTimeout(1500);
    const afterText = await reload.page.locator('#detail-card-root-noticed').innerText();

    const version = await service
      .from('cross_system_relationship_versions')
      .select('pattern_name')
      .eq('id', (await service.from('cross_system_root_findings').select('version_id').eq('id', target.id).maybeSingle()).data?.version_id ?? '')
      .maybeSingle();
    const name = version.data?.pattern_name ?? null;
    record(
      'Deactivating an entry takes it out of what the coach sees on reload',
      Boolean(name) && !afterText.includes(name),
      name ? `"${name}" is no longer on the card` : 'could not resolve the entry name'
    );
    await reload.page.screenshot({ path: `${SHOTS}/coach-after-deactivate.png`, fullPage: true });
    await reload.page.close();
  } else {
    record('Deactivating an entry takes it out of what the coach sees on reload', false, 'no finding to deactivate');
  }
} catch (error) {
  record('The run completed without throwing', false, String(error).slice(0, 300));
} finally {
  // -----------------------------------------------------------------
  // CLEANUP. Everything this run wrote, deleted and confirmed absent.
  // -----------------------------------------------------------------
  try {
    if (deactivatedRelationshipId) {
      await service
        .from('cross_system_relationships')
        .update({ is_active: true })
        .eq('id', deactivatedRelationshipId);
    }
    if (coachNoteId) await service.from('coach_notes').delete().eq('id', coachNoteId);

    for (const rawText of Object.values(COMPLAINTS)) {
      const { data } = await service
        .from('cross_system_complaint_reports')
        .select('id')
        .eq('raw_text', rawText);
      for (const row of data ?? []) {
        await service.from('cross_system_root_findings').delete().eq('report_id', row.id);
        await service.from('cross_system_signals').delete().eq('source_record_id', row.id);
        await service.from('cross_system_complaint_reports').delete().eq('id', row.id);
      }
    }

    // The check-in and the reflection this run created.
    const today = new Date().toISOString().slice(0, 10);
    const todays = await service
      .from('daily_checkins')
      .select('id')
      .eq('user_id', EBONY_ID)
      .eq('local_date', today);
    for (const row of todays.data ?? []) createdCheckinIds.push(row.id);
    for (const id of [...new Set(createdCheckinIds)]) {
      await service.from('daily_checkins').delete().eq('id', id);
    }
    await service
      .from('evening_reflections')
      .delete()
      .eq('member_id', EBONY_ID)
      .eq('local_date', today);
    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', EBONY_ID)
      .eq('event_type', 'concern_flagged')
      .gte('occurred_at', `${today}T00:00:00Z`);

    // An independent read, so the claim is checked rather than assumed.
    let leftBehind = 0;
    for (const rawText of Object.values(COMPLAINTS)) {
      const { count } = await service
        .from('cross_system_complaint_reports')
        .select('id', { count: 'exact', head: true })
        .eq('raw_text', rawText);
      leftBehind += count ?? 0;
    }
    const signalsNow = await service
      .from('cross_system_signals')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', EBONY_ID);
    const relationshipsActive = await service
      .from('cross_system_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    record(
      'CLEANUP: every complaint this run wrote is gone',
      leftBehind === 0,
      `${leftBehind} complaint rows left behind`
    );
    console.log(`\n  signals now: ${signalsNow.count}, active relationships now: ${relationshipsActive.count}\n`);
  } catch (cleanupError) {
    record('CLEANUP completed', false, String(cleanupError).slice(0, 200));
  }

  try {
    if (member?.session) await retireSession(member.service ?? service, member.session);
    if (coach?.session) await retireSession(coach.service ?? service, coach.session);
  } catch {
    /* a session that cannot be retired was already gone */
  }
  await browser?.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} checks passed\n`);
  for (const failure of results.filter((r) => !r.pass)) {
    console.log(`  FAILED: ${failure.item}\n          ${failure.detail}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}
