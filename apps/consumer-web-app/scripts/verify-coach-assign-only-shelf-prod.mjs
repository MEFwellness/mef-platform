/**
 * THE FOUR COACH-ASSIGN-ONLY QUESTIONNAIRES, ON THE REAL SHELF, ON
 * PRODUCTION.
 *
 * WHAT IT DRIVES, in the order a member and her coach meet it:
 *
 *   a member who has been sent NONE of them opens /questionnaires and
 *     finds all four standing there, locked, with the gold corner marker,
 *     both renamed titles reading the new name, and no way in;
 *   she taps each one and reads the sheet, which must name her coach and
 *     never a plan, and must offer no way to buy past it;
 *   her coach opens his real client Detail page and presses the real
 *     Assign control on the Breathing Pattern Check-In;
 *   she reloads the same shelf: that one is unlocked and really opens,
 *     and the other three are exactly as they were.
 *
 * IT WRITES ONE ROW AND TAKES IT BACK. The only thing this run creates is
 * the assignment the coach sends, plus anything the member's own visit
 * writes downstream of it, and all of it is removed at the end and the
 * removal confirmed by an independent read of the ledger and of all four
 * sitting tables.
 *
 * IT NEVER STARTS A SITTING. Confirming the check-in opens means reaching
 * its first screen, not answering it, because a finished sitting on
 * production is a member's record and not a test artefact.
 *
 * TWO ACCOUNTS, FOR TWO DIFFERENT CLAIMS.
 *   SHELF_CLEAN_EMAIL   a test member who has been sent none of the four,
 *                       which is the only account "all four are locked"
 *                       can honestly be asked of.
 *   SHELF_MEMBER        the coach's own test client, who is on his
 *                       caseload, so his real Assign control can be
 *                       driven. She has finished some of the four
 *                       already, and the run reads her shelf as it
 *                       actually is rather than as it would be for a new
 *                       member.
 *
 * WHERE IT RUNS:
 *   SHELF_BASE_URL          default https://app.mefwellness.com
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   SHELF_CLEAN_EMAIL       the untouched test member
 *   SHELF_MEMBER / SHELF_MEMBER_EMAIL   the coach's test client
 *   SHELF_COACH_EMAIL       the coach whose caseload she is on
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line, and every session it
 * mints is retired locally the moment it is done.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.SHELF_BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const SUPA = process.env.PROD_SUPABASE_URL ?? 'https://piafgqstbibvllsnuike.supabase.co';
process.env.PROD_SUPABASE_URL = SUPA;

const CLEAN_EMAIL = process.env.SHELF_CLEAN_EMAIL;
const MEMBER = process.env.SHELF_MEMBER;
const MEMBER_EMAIL = process.env.SHELF_MEMBER_EMAIL;
const COACH_EMAIL = process.env.SHELF_COACH_EMAIL;

const EM = '—';

/** The one sentence the lock sheet must say, quoted here so a reworded constant fails a real screen. */
const LOCK_SENTENCE =
  "This one opens once your coach assigns it to you. I'll let you know the moment it's ready.";

/** The four, with everything this run addresses each of them by. */
const FOUR = [
  {
    key: 'health-lifestyle-intake',
    title: 'Health & Lifestyle Intake',
    route: '/health-intake',
    definitionId: '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74',
    table: 'member_health_intake_sessions',
  },
  {
    key: 'body-systems-survey',
    title: 'Rooted Reset Body Systems Survey',
    route: '/body-systems',
    definitionId: 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4',
    table: 'member_body_systems_sessions',
  },
  {
    key: 'whole-body-signal',
    title: 'Rooted Reset Whole-Body Signal Assessment',
    route: '/whole-body-signal',
    definitionId: '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36',
    table: 'member_whole_body_signal_sessions',
  },
  {
    key: 'breathing-pattern-check-in',
    title: 'Breathing Pattern Check-In',
    route: '/breathing-check-in',
    definitionId: '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405',
    table: 'member_breathing_check_in_sessions',
  },
];

/** The one the coach sends in step 2. */
const SENT = FOUR[3];
const SENT_ROW_ID = 'breathing-pattern-check-in';

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
}
if (!CLEAN_EMAIL || !MEMBER || !MEMBER_EMAIL || !COACH_EMAIL) {
  console.error('Set SHELF_CLEAN_EMAIL, SHELF_MEMBER, SHELF_MEMBER_EMAIL and SHELF_COACH_EMAIL.');
  process.exitCode = 1;
  throw new Error('missing identities');
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok: Boolean(ok), note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${String(e)}`));
}

// ---------------------------------------------------------------------
// Reads, and waits that are on the app rather than on a clock.
// ---------------------------------------------------------------------

/**
 * Reads the screen, and survives a navigation happening underneath it.
 *
 * A SERVER SIDE REDIRECT DESTROYS THE EXECUTION CONTEXT mid-evaluate, and
 * three of the four routes redirect a member with no assignment. Treating
 * that as an empty read rather than as a throw is what lets the caller
 * settle on the page she actually landed on.
 */
async function screenKey(page) {
  return page
    .evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim())
    .catch(() => '');
}

async function settled(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return last ?? '';
}

async function assignmentsFor(memberId, definitionId) {
  const { data } = await admin
    .from('assessment_assignments')
    .select('id, status, created_at, due_at, assigned_by, updated_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/**
 * Her sitting ids in one table, and it THROWS on a failed read rather than
 * answering with an empty list. A read that quietly returned [] would make
 * the closing "her rows are exactly what they were" comparison report a
 * change that never happened, or worse, miss one that did.
 */
async function sittingsFor(memberId, table) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });
    if (!error) return (data ?? []).map((row) => row.id).sort();
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(`could not read ${table} for ${memberId}`);
}

async function allSittings(memberId) {
  const out = {};
  for (const one of FOUR) out[one.key] = await sittingsFor(memberId, one.table);
  return out;
}

async function ledgerReaches(memberId, definitionId, predicate, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const rows = await assignmentsFor(memberId, definitionId);
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`the ledger never reached: ${label}`);
}

/**
 * One card on the shelf, read out of the DOM by its own heading.
 *
 * ADDRESSED BY ITS HEADING, AND SCOPED TO ITS OWN CARD. The first version
 * of this walked a fixed number of parents up from the heading, which
 * overshot into the grid for an unlocked card and then found the NEXT
 * card's lock button, so three cards that were genuinely open were read as
 * locked. The card is the grid's own direct child, which is what the
 * section renders one per questionnaire, so that is what is climbed to.
 */
async function cardState(page, title) {
  return page.evaluate((wanted) => {
    const headings = Array.from(document.querySelectorAll('h3'));
    const heading = headings.find((h) => h.textContent.trim() === wanted);
    if (!heading) return { found: false };

    const section = heading.closest('section');
    const grid = section ? section.querySelector('div.grid') : null;
    let scope = heading;
    if (grid) {
      while (scope.parentElement && scope.parentElement !== grid) scope = scope.parentElement;
      if (scope.parentElement !== grid) scope = section ?? heading.parentElement;
    } else {
      scope = section ?? heading.parentElement;
    }

    const lockButton = scope.querySelector('button[aria-label*="locked"]');
    const lockMarker = scope.querySelector('[aria-label="Locked"]');
    const sectionLabel = section ? (section.querySelector('p')?.textContent ?? '').trim() : '';
    const links = Array.from(scope.querySelectorAll('a')).map((a) => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href'),
    }));
    return {
      found: true,
      locked: Boolean(lockButton),
      hasMarker: Boolean(lockMarker),
      sectionLabel,
      links,
      text: scope.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  }, title);
}

/** Taps a locked card and reads the sheet that comes up. */
async function openLockSheet(page, title) {
  const button = page.locator(`button[aria-label="${title}, locked. Tap to hear from Root about it."]`);
  await button.first().waitFor({ state: 'visible', timeout: 25000 });
  await button.first().click({ timeout: 15000 });
  const sheet = page.getByRole('dialog').first();
  await sheet.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const text =
    (await sheet.count()) > 0
      ? (await sheet.innerText()).replace(/\s+/g, ' ').trim()
      : await screenKey(page);
  const membershipLinks = await page.locator('a[href="/membership"]:visible').count();
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  return { text, membershipLinks };
}

async function openAssessments(page) {
  const fold = page.getByRole('button', { name: /assessments and findings/i }).first();
  await fold.waitFor({ state: 'visible', timeout: 40000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await page.locator(`[data-assessment-row="${SENT_ROW_ID}"]`).count()) > 0) return;
    await fold.click({ timeout: 10000 }).catch(() => {});
    const open = await page
      .waitForSelector(`[data-assessment-row="${SENT_ROW_ID}"]`, { timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (open) return;
  }
  throw new Error('the Assessments and Findings section never opened');
}

// ---------------------------------------------------------------------
// Guards. This run writes to one account, so it checks which one.
// ---------------------------------------------------------------------

const { data: guard } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (guard?.is_test !== true) throw new Error(`REFUSING TO RUN: ${MEMBER} is not a test account`);

// The untouched member is only ever READ, so she needs no write guard.
// Nothing in step 1 leaves a row behind: the shelf is rendered, four
// sheets are opened and closed in her browser, and four routes refuse her.

console.log(`coach's client is the test account "${guard.display_name}" on ${BASE}`);

const beforeAssignments = await assignmentsFor(MEMBER, SENT.definitionId);
const beforeSittings = await allSittings(MEMBER);
if (beforeAssignments.some((row) => row.status === 'pending')) {
  throw new Error('REFUSING TO RUN: she is already sitting on an open copy of the one under test');
}

const browser = await chromium.launch();
let cleanSession = null;
let memberSession = null;
let coachSession = null;
let createdAssignmentId = null;

try {
  // -------------------------------------------------------------------
  // 1. A MEMBER SENT NONE OF THEM SEES ALL FOUR, LOCKED.
  // -------------------------------------------------------------------
  const cleanCtx = await mintSessionContext(browser, CLEAN_EMAIL, { baseUrl: BASE });
  if (!cleanCtx) throw new Error('could not mint the untouched member session');
  cleanSession = cleanCtx.session;
  const clean = await cleanCtx.context.newPage();
  watch(clean, 'clean member');

  await clean.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
  const shelf = await settled(clean);
  check('1: the Wellness Questionnaires shelf renders', /wellness questionnaires/i.test(shelf));

  for (const one of FOUR) {
    const state = await cardState(clean, one.title);
    check(`1: "${one.title}" is on the shelf`, state.found === true);
    if (!state.found) continue;
    check(`1: "${one.title}" is LOCKED`, state.locked === true, state.sectionLabel);
    check(`1: "${one.title}" carries the gold corner marker`, state.hasMarker === true);
    check(`1: "${one.title}" is filed under Premium`, /premium/i.test(state.sectionLabel), state.sectionLabel);
    check(
      `1: "${one.title}" offers no way in`,
      state.links.every((link) => link.href !== one.route),
      state.links.map((l) => l.href).join(' ')
    );
    check(`1: no em dash on "${one.title}"`, !state.text.includes(EM));
  }

  check(
    '1: the old name is nowhere on the shelf',
    !/MEF Body Systems Survey|MEF Whole-Body Signal Assessment/i.test(shelf)
  );

  // -------------------------------------------------------------------
  // 1b. TAPPING EACH ONE SAYS THE SAME, TRUE THING.
  // -------------------------------------------------------------------
  for (const one of FOUR) {
    const sheet = await openLockSheet(clean, one.title);
    check(`1b: "${one.title}" opens the lock sheet`, sheet.text.length > 0);
    check(
      `1b: and it says the coach sentence, word for word`,
      sheet.text.includes(LOCK_SENTENCE),
      sheet.text.slice(0, 140)
    );
    check(
      `1b: it names no plan`,
      !/Monthly|24 week|upgrade|membership plan/i.test(sheet.text),
      sheet.text.slice(0, 140)
    );
    check(`1b: and offers no way to buy past it`, sheet.membershipLinks === 0);
    check(`1b: no em dash in the sheet for "${one.title}"`, !sheet.text.includes(EM));
  }

  // -------------------------------------------------------------------
  // 1c. AND NONE OF THE FOUR OPENS BY URL EITHER.
  // -------------------------------------------------------------------
  for (const one of FOUR) {
    await clean.goto(`${BASE}${one.route}`, { waitUntil: 'domcontentloaded' });
    // THE URL IS THE ASSERTION, not the words on the page. Each of these
    // routes re-asks its own access rule on the server and sends a member
    // with no assignment to Home before any content renders, so where she
    // ended up is the only thing that proves the server refused her. The
    // text is read too, and only as the second half of the same claim.
    await clean
      .waitForURL((url) => !url.pathname.startsWith(one.route), { timeout: 30000 })
      .catch(() => {});
    const landed = new URL(clean.url()).pathname;
    const screen = await settled(clean);
    check(
      `1c: ${one.route} refuses a member with no assignment`,
      landed !== one.route && !/begin|start my|continue my|pick up where/i.test(screen),
      `landed on ${landed}`
    );
  }

  // -------------------------------------------------------------------
  // 2. THE COACH SENDS ONE, WITH HIS OWN CONTROL.
  // -------------------------------------------------------------------
  const coachCtx = await mintSessionContext(browser, COACH_EMAIL, { baseUrl: BASE });
  if (!coachCtx) throw new Error('could not mint a coach session');
  coachSession = coachCtx.session;
  const coach = await coachCtx.context.newPage();
  watch(coach, 'coach');

  await coach.goto(`${BASE}/coach/clients/${MEMBER}/detail`, { waitUntil: 'domcontentloaded' });
  await settled(coach);
  await openAssessments(coach);

  const toggle = coach.locator(`[data-assign-toggle="${SENT_ROW_ID}"]`);
  check('2: the coach has a send control for the Breathing Pattern Check-In', (await toggle.count()) > 0);
  await toggle.first().click({ timeout: 15000 });
  const form = coach.locator(`[data-assign-form="${SENT_ROW_ID}"]`);
  await form.first().waitFor({ state: 'visible', timeout: 25000 });
  await form.first().getByRole('button', { name: /^assign$/i }).click({ timeout: 15000 });

  const afterAssign = await ledgerReaches(
    MEMBER,
    SENT.definitionId,
    (rows) => rows.some((row) => row.status === 'pending'),
    'a pending assignment'
  );
  createdAssignmentId = afterAssign.find((row) => row.status === 'pending').id;
  check('2: an assignment row was really written', Boolean(createdAssignmentId));

  // -------------------------------------------------------------------
  // 3. HER SHELF, AFTERWARDS.
  // -------------------------------------------------------------------
  const memberCtx = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE });
  if (!memberCtx) throw new Error('could not mint the member session');
  memberSession = memberCtx.session;
  const member = await memberCtx.context.newPage();
  watch(member, 'member');

  await member.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
  await settled(member);

  const sentCard = await cardState(member, SENT.title);
  check('3: THE ONE HE SENT IS UNLOCKED', sentCard.found && sentCard.locked === false, sentCard.sectionLabel);
  check('3: and it is filed under Assigned', /assigned/i.test(sentCard.sectionLabel), sentCard.sectionLabel);
  check(
    '3: with a real way in',
    sentCard.links.some((link) => link.href === SENT.route),
    sentCard.links.map((l) => l.href).join(' ')
  );

  await member.goto(`${BASE}${SENT.route}`, { waitUntil: 'domcontentloaded' });
  const taker = await settled(member);
  check('3: AND IT REALLY OPENS', /begin check-in|pick up where/i.test(taker), taker.slice(0, 90));

  // The other three are read as they actually are for this member, which
  // is not "locked" for one she has already finished: a questionnaire she
  // has completed keeps its card so she can reach her own results.
  await member.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
  await settled(member);
  for (const one of FOUR.filter((f) => f.key !== SENT.key)) {
    const finished = beforeSittings[one.key].length > 0;
    const state = await cardState(member, one.title);
    check(`3: "${one.title}" is still on her shelf`, state.found === true);
    if (!state.found) continue;
    if (finished) {
      check(
        `3: "${one.title}" reads as completed, because she finished it`,
        state.locked === false && /completed/i.test(state.sectionLabel),
        state.sectionLabel
      );
    } else {
      check(
        `3: "${one.title}" IS STILL LOCKED, because he sent her only one`,
        state.locked === true,
        state.sectionLabel
      );
    }
  }

  await clean.close();
  await coach.close();
  await member.close();
  await cleanCtx.context.close();
  await coachCtx.context.close();
  await memberCtx.context.close();
} catch (error) {
  check('the run completed without throwing', false, String(error));
} finally {
  // -------------------------------------------------------------------
  // RESTORE. Only what this run made, confirmed by an independent read.
  // -------------------------------------------------------------------
  if (cleanSession) await retireSession(cleanSession).catch(() => {});
  if (memberSession) await retireSession(memberSession).catch(() => {});
  if (coachSession) await retireSession(coachSession).catch(() => {});
  await browser.close();

  if (createdAssignmentId) {
    // Anything her visit wrote downstream of the row this run created.
    const keep = new Set(beforeSittings[SENT.key]);
    const now = await sittingsFor(MEMBER, SENT.table);
    for (const id of now) {
      if (!keep.has(id)) await admin.from(SENT.table).delete().eq('id', id);
    }
    await admin
      .from('assessment_attempts')
      .delete()
      .eq('member_id', MEMBER)
      .eq('assessment_definition_id', SENT.definitionId)
      .eq('assignment_id', createdAssignmentId);
    await admin.from('assessment_assignments').delete().eq('id', createdAssignmentId);
    await admin
      .from('member_root_popup_dismissals')
      .delete()
      .eq('member_id', MEMBER)
      .eq('message_key', `breathing_check_in:${createdAssignmentId}`);
  }

  const restoredAssignments = await assignmentsFor(MEMBER, SENT.definitionId);
  const restoredSittings = await allSittings(MEMBER);
  check(
    'RESTORE: her assignment ledger for this one is exactly what it was',
    JSON.stringify(restoredAssignments) === JSON.stringify(beforeAssignments),
    `${restoredAssignments.length} row(s), was ${beforeAssignments.length}`
  );
  const sittingsDiff = FOUR.filter(
    (one) => JSON.stringify(restoredSittings[one.key]) !== JSON.stringify(beforeSittings[one.key])
  ).map(
    (one) =>
      `${one.key}: ${beforeSittings[one.key].length} -> ${restoredSittings[one.key].length}`
  );
  check(
    'RESTORE: all four sitting tables are exactly what they were',
    sittingsDiff.length === 0,
    sittingsDiff.join(' | ')
  );

  for (const line of consoleErrors) console.log(`CONSOLE  ${line}`);
  check(
    'no console or page errors on any screen',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ')
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length}`);
  process.exitCode = passed === results.length ? 0 : 1;
}
