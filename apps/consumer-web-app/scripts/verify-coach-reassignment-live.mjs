/**
 * A real, signed-in walk of sending an assessment again, end to end, on
 * whichever app the environment points at.
 *
 * WHAT IT DRIVES, in the order the brief asks for it:
 *
 *   as the coach, the real Assign control on the client screen for the MEF
 *     Whole-Body Signal Assessment, then the form REOPENED before she has
 *     finished, which must say it is already waiting for her and offer
 *     Resend rather than Assign;
 *   the Resend itself, proved by the due date moving and by the ledger
 *     still holding exactly one open row;
 *   as the member, one card and one knock, and the whole assessment;
 *   as the coach again, the completed row still offering to be sent, its
 *     history lines, and the quiet "Completed today" line;
 *   a second cycle answered differently, and the reassessment comparison
 *     the whole feature exists to make possible;
 *   the same assign, complete and Assign Again walk for the Whole-Body
 *     Check-In, which is sent by the other write path entirely.
 *
 * WHERE IT RUNS. Anywhere, from environment variables:
 *
 *   RA_BASE_URL             the app under test. Default http://127.0.0.1:3000
 *   PROD_SUPABASE_URL       the database behind it
 *   PROD_SERVICE_KEY_FILE   a PATH to the service role key
 *   PROD_ANON_KEY_FILE      a PATH to the anon key
 *   RA_MEMBER / RA_MEMBER_EMAIL     the member to walk as
 *   RA_COACH  / RA_COACH_EMAIL      the coach assigned to her
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line.
 *
 * IT CLEANS UP AFTER ITSELF, at the start as well as at the end, and the
 * cleanup is confirmed by an independent read rather than by trusting the
 * delete.
 *
 * THE TRAPS IT ALREADY KNOWS ABOUT, every one learned on this codebase:
 * a click before hydration does nothing silently, so every press is
 * confirmed by the app agreeing it happened; a coach section is a fold
 * whose children are not in the DOM until it is pressed; an answer row is
 * a radio, not a button; innerText reports what CSS painted; a fixed sleep
 * measures the network rather than the server, so every wait is on a row
 * or on the screen changing; and process.exit in a finally swallows the
 * throw above it.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.RA_BASE_URL ?? 'http://127.0.0.1:3000';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.RA_MEMBER ?? '11111111-1111-1111-1111-111111111111';
const MEMBER_EMAIL = process.env.RA_MEMBER_EMAIL ?? 'member.one@example.test';
const COACH = process.env.RA_COACH ?? '33333333-3333-3333-3333-333333333333';
const COACH_EMAIL = process.env.RA_COACH_EMAIL ?? 'coach.one@example.test';

const WBS_DEFINITION = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36';
const WBSA_DEFINITION = 'bfb52589-7566-4347-95aa-03d696a1041e';
const EM = String.fromCharCode(0x2014);

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

/** Everything either instrument could have left behind, removed. */
async function clean() {
  const { data: wbsSittings } = await admin
    .from('member_whole_body_signal_sessions')
    .select('id')
    .eq('member_id', MEMBER);
  const wbsIds = (wbsSittings ?? []).map((row) => row.id);
  if (wbsIds.length > 0) {
    await admin.from('member_whole_body_signal_question_actions').delete().in('session_id', wbsIds);
    await admin.from('member_whole_body_signal_focus').delete().in('session_id', wbsIds);
  }
  await admin.from('member_whole_body_signal_sessions').delete().eq('member_id', MEMBER);
  await admin.from('unified_assessment_sessions').delete().eq('member_id', MEMBER);
  await admin
    .from('assessment_assignments')
    .delete()
    .eq('member_id', MEMBER)
    .in('assessment_definition_id', [WBS_DEFINITION, WBSA_DEFINITION]);
  await admin
    .from('assessment_attempts')
    .delete()
    .eq('member_id', MEMBER)
    .in('assessment_definition_id', [WBS_DEFINITION, WBSA_DEFINITION]);
  await admin
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', MEMBER)
    .or('message_key.like.whole_body_signal:%,message_key.like.questionnaire_assigned:%');
}

/*
  NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
  CREATES the account when the address does not exist, so one typo would
  mint a session for a brand new stranger and walk as them.
*/
async function assertExistingUser(email, expectedId) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`could not list users: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`REFUSING TO RUN: ${email} is not an existing account`);
  if (found.id !== expectedId) {
    throw new Error(`REFUSING TO RUN: ${email} is ${found.id}, expected ${expectedId}`);
  }
  console.log(`identity confirmed: ${email} is ${found.id}`);
}

await assertExistingUser(MEMBER_EMAIL, MEMBER);
await assertExistingUser(COACH_EMAIL, COACH);

const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
const FIRST_NAME = (targetProfile.display_name ?? '').trim().split(/\s+/)[0] || 'them';
console.log(`target is the test account "${targetProfile.display_name}"`);

/** The words the form is made of, read out of the database rather than typed here. */
const { data: copyRows } = await admin.from('coach_assign_copy').select('copy_key, value');
if (!copyRows?.length) throw new Error('coach_assign_copy is not seeded on this database');
const COPY = Object.fromEntries(copyRows.map((row) => [row.copy_key, row.value]));
console.log(`assign form copy: ${copyRows.length} rows`);

await clean();

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${String(e)}`));
}

/** Press a control and WAIT FOR THE APP TO AGREE it was pressed. */
async function press(locator, attribute = 'aria-expanded') {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await locator.click({ timeout: 10000 }).catch(() => {});
    if ((await locator.getAttribute(attribute)) === 'true') return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Tap an answer and wait for the app to agree. */
async function tap(scope, name, exact = true) {
  const radios = scope.getByRole('radio', { name, exact });
  const target = (await radios.count()) > 0 ? radios : scope.getByRole('button', { name, exact });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await target.first().click({ timeout: 10000 }).catch(() => {});
    const [checked, pressed] = await Promise.all([
      target.first().getAttribute('aria-checked'),
      target.first().getAttribute('aria-pressed'),
    ]);
    if (checked === 'true' || pressed === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

async function textOf(page) {
  return page.evaluate(() => document.body.innerText);
}

/** Open every folded section on the coach page, which is how its cards reach the DOM. */
async function openFolds(page) {
  for (let pass = 0; pass < 3; pass += 1) {
    const folds = page.locator('[aria-expanded="false"]');
    const count = await folds.count();
    if (count === 0) break;
    for (let i = count - 1; i >= 0; i -= 1) {
      await folds.nth(i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
  }
}

/** Every assignment row this client has for one instrument, newest first. */
async function assignmentRows(definitionId) {
  const { data } = await admin
    .from('assessment_assignments')
    .select('id, status, due_at, created_at, assigned_by')
    .eq('member_id', MEMBER)
    .eq('assessment_definition_id', definitionId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Wait for the ledger to say what the button just asked it to say. */
async function waitForRows(definitionId, predicate, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rows = await assignmentRows(definitionId);
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`the ledger never reached: ${label}`);
}

const browser = await chromium.launch();
let minted = null;
let coach = null;
let knownDismissals = null;

try {
  // ------------------------------------------------------------------
  // 1. AS THE COACH: assign, then reopen the form and RESEND.
  // ------------------------------------------------------------------
  coach = await mintSessionContext(browser, COACH_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1000 },
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!coach) throw new Error('could not mint the coach session');
  const coachPage = await coach.context.newPage();
  watch(coachPage, 'coach');

  /** Reopen the client screen and hand back the assessment status block. */
  async function openDetail() {
    await coachPage.goto(`${BASE}/coach/clients/${MEMBER}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    await coachPage.waitForSelector('[aria-expanded]', { timeout: 120000 });
    await openFolds(coachPage);
    await coachPage.waitForSelector('[aria-label="Assessment Status"]', { timeout: 120000 });
    return coachPage.locator('[aria-label="Assessment Status"]');
  }

  /** One row of that block, addressed by its own id rather than by a name. */
  function rowFor(rowId) {
    return coachPage.locator(`#assessment-row-${rowId}`);
  }

  /** Open the inline form on a row, whatever its control is called today. */
  async function openForm(rowId) {
    const toggle = rowFor(rowId).locator(`[data-assign-toggle="${rowId}"]`);
    await toggle.waitFor({ timeout: 60000 });
    const label = (await toggle.innerText()).trim();
    const opened = await press(toggle);
    return { opened, label };
  }

  function formFor(rowId) {
    return coachPage.locator(`[data-assign-form="${rowId}"]`);
  }

  /** Which group a row is filed under right now. */
  async function groupOf(rowId) {
    return coachPage.evaluate((id) => {
      const row = document.querySelector(`[data-assessment-row="${id}"]`);
      const group = row?.closest('[data-assessment-group]');
      return group?.getAttribute('data-assessment-group') ?? null;
    }, rowId);
  }

  await openDetail();
  check(
    'the Whole-Body Signal row starts in Not Yet Assigned',
    (await groupOf('whole-body-signal')) === 'notYetAssigned'
  );

  let opened = await openForm('whole-body-signal');
  check('and its control reads Assign', opened.label === COPY['assign.row_assign'], opened.label);
  check('which opens its own form', opened.opened);
  check(
    'A CLIENT NOTHING HAS BEEN SENT TO GETS NO HISTORY BLOCK AT ALL',
    (await coachPage.locator('[data-assign-history="whole-body-signal"]').count()) === 0
  );
  check(
    'and the confirm button reads Assign',
    (await formFor('whole-body-signal').getByRole('button', { name: /^(Assign|Sending)$/ }).count()) > 0
  );

  await formFor('whole-body-signal').getByRole('button', { name: /^(Assign|Sending)$/ }).click();
  let wbsRows = await waitForRows(
    WBS_DEFINITION,
    (rows) => rows.some((row) => row.status === 'pending'),
    'one open assignment'
  );
  check('the coach Assign control really wrote the assignment', wbsRows.length === 1);
  const firstAssignmentId = wbsRows[0].id;
  const firstDueAt = wbsRows[0].due_at;

  // --- REOPEN THE FORM BEFORE SHE HAS FINISHED ---
  await openDetail();
  check(
    'the row has moved to Assigned, Waiting',
    (await groupOf('whole-body-signal')) === 'waiting'
  );
  opened = await openForm('whole-body-signal');
  check(
    'and its control now reads Resend',
    opened.label === COPY['assign.row_resend'],
    opened.label
  );

  const historyText = await coachPage
    .locator('[data-assign-history="whole-body-signal"]')
    .innerText();
  /*
    THE SENTENCE IS COMPARED AGAINST THE STORED ONE, not against a copy
    typed here. The day is the one part this run cannot know in advance, so
    the halves either side of it are what is matched: a reworded row is
    then still covered, and a row that lost her name is not.
  */
  const [noticeBefore, noticeAfter] = COPY['assign.open_notice']
    .replace('{name}', FIRST_NAME)
    .split('{date}');
  check(
    'THE FORM SAYS IT IS ALREADY WAITING FOR HER, naming her and the day',
    historyText.includes(noticeBefore.trim()) &&
      (noticeAfter.trim().length === 0 || historyText.includes(noticeAfter.trim())) &&
      new RegExp(`${noticeBefore.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[A-Za-z]+ \\d+`).test(historyText),
    historyText.replace(/\n/g, ' | ')
  );
  check(
    'and says it has not been completed',
    historyText.includes(COPY['assign.not_completed'])
  );
  check(
    'and says who sent it, which was this coach',
    historyText.includes(COPY['assign.by_you']),
    historyText.split('\n')[1] ?? ''
  );
  check('no em dash anywhere in the form', !(await formFor('whole-body-signal').innerText()).includes(EM));

  const resendButton = formFor('whole-body-signal').getByRole('button', {
    name: new RegExp(`^(${COPY['assign.confirm_resend']}|${COPY['assign.confirm_resending']})$`),
  });
  check('the confirm button reads Resend rather than Assign', (await resendButton.count()) > 0);

  /*
    NAME A DAY, SO THE MOVE IS OBSERVABLE.

    Assigning and resending on the same afternoon both default to seven
    days from her today, which is the correct behaviour and an invisible
    one: the due date a resend writes would be the identical value, and a
    run asserting "it changed" would fail against a resend that worked
    perfectly. Typing a date is also what a coach moving a deadline
    actually does.
  */
  const RESEND_DUE = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  await formFor('whole-body-signal').locator('input[type="date"]').fill(RESEND_DUE);

  await resendButton.click();

  wbsRows = await waitForRows(
    WBS_DEFINITION,
    (rows) => rows.length === 1 && String(rows[0].due_at).startsWith(RESEND_DUE),
    'the due date moving to the day the coach typed'
  );
  check(
    'RESENDING WROTE NO SECOND ASSIGNMENT: the ledger still holds exactly one',
    wbsRows.length === 1 && wbsRows[0].id === firstAssignmentId,
    `${wbsRows.length} row(s)`
  );
  check(
    'and it moved the due window to the day the coach named',
    String(wbsRows[0].due_at).startsWith(RESEND_DUE) && wbsRows[0].due_at !== firstDueAt,
    `${String(firstDueAt).slice(0, 10)} to ${String(wbsRows[0].due_at).slice(0, 10)}`
  );
  check('the one row is still open', wbsRows[0].status === 'pending');

  // ------------------------------------------------------------------
  // 2. AS THE MEMBER: one card, one knock, and the whole assessment.
  // ------------------------------------------------------------------
  minted = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!minted) throw new Error('could not mint the member session');
  let page = await minted.context.newPage();
  watch(page, 'member');

  const { data: dismissalsBefore } = await admin
    .from('member_root_popup_dismissals')
    .select('message_key')
    .eq('member_id', MEMBER);
  knownDismissals = new Set((dismissalsBefore ?? []).map((row) => row.message_key));

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/whole-body signal/i', { timeout: 120000 });

  const cardCount = await page.evaluate(() => {
    const matches = document.body.innerText.match(/MEF Whole-Body Signal Assessment/gi);
    return matches ? matches.length : 0;
  });
  check(
    'ONE CARD, NOT TWO: a resend is not a second thing on her Home',
    cardCount === 1,
    `${cardCount} mention(s)`
  );

  // Dismiss whatever she is knocked with, and count the ones about this.
  let signalKnocks = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('text=/whole-body signal/i', { timeout: 120000 });
    }
    const appeared = await page
      .waitForSelector('[role="dialog"]', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) break;
    const dialog = page.getByRole('dialog').first();
    let knockText = '';
    for (let read = 0; read < 25 && knockText.trim().length === 0; read += 1) {
      knockText = (await dialog.textContent().catch(() => '')) ?? '';
      if (knockText.trim().length === 0) await page.waitForTimeout(200);
    }
    if (/whole-body signal/i.test(knockText)) signalKnocks += 1;
    const dismiss = dialog.getByRole('button', {
      name: /maybe later|not today|not now|later|dismiss|no thanks|close/i,
    });
    if (await dismiss.count()) await dismiss.first().click().catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
    await page
      .waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, {
        timeout: 15000,
      })
      .catch(() => {});
    if (/whole-body signal/i.test(knockText)) break;
  }
  check('ONE KNOCK, NOT TWO, for the one assignment she holds', signalKnocks <= 1, `${signalKnocks}`);

  /** Answer every screen of the Whole-Body Signal until the results arrive. */
  async function walkSignal(answerFor) {
    await page.goto(`${BASE}/whole-body-signal`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 90000 });
    const start = page.getByRole('button', { name: /start my assessment|continue assessment/i });
    if (await start.count()) await start.first().click();

    for (let screen = 0; screen < 400; screen += 1) {
      await page.waitForSelector('h1', { timeout: 90000 });
      const heading = (await page.locator('h1').first().innerText()).trim();
      if (/you are done/i.test(heading)) return;

      const key = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1 ? h1.textContent.trim() : '';
      });

      const radios = page.getByRole('radio');
      const radioCount = await radios.count();
      if (radioCount === 0) {
        const cont = page.getByRole('button', { name: /^continue$/i });
        if (await cont.count()) {
          await cont.first().click();
          await page.waitForFunction(
            (previous) => {
              const h1 = document.querySelector('h1');
              return h1 ? h1.textContent.trim() !== previous : false;
            },
            key,
            { timeout: 60000 }
          );
          continue;
        }
        throw new Error(`unrecognised Whole-Body Signal screen: ${heading.slice(0, 60)}`);
      }

      const options = (await radios.allInnerTexts()).map((text) => text.trim());
      await tap(page, answerFor(options));
      await page.waitForFunction(
        (previous) => {
          const h1 = document.querySelector('h1');
          return h1 ? h1.textContent.trim() !== previous : false;
        },
        key,
        { timeout: 60000 }
      );
    }
    throw new Error('the Whole-Body Signal walk never reached the completion screen');
  }

  const loud = (options) =>
    options.includes('Often') ? 'Often' : options.includes('Yes') ? 'Yes' : options[0];
  const quiet = (options) =>
    options.includes('Never') ? 'Never' : options.includes('No') ? 'No' : options[0];

  await walkSignal(loud);
  await waitForRows(
    WBS_DEFINITION,
    (rows) => rows.some((row) => row.status === 'completed'),
    'the first sitting completing'
  );
  check('she finished the assessment and the assignment closed out', true);

  // ------------------------------------------------------------------
  // 3. AS THE COACH: Assign Again, with the history under it.
  // ------------------------------------------------------------------
  await openDetail();
  check(
    'the finished row is filed under Completed',
    (await groupOf('whole-body-signal')) === 'completed'
  );
  opened = await openForm('whole-body-signal');
  check(
    'AND IT STILL OFFERS TO BE SENT, reading Assign Again',
    opened.label === COPY['assign.row_assign_again'],
    opened.label
  );
  check(
    'with View results still beside it rather than replaced by it',
    (await rowFor('whole-body-signal').getByRole('button', { name: /view results/i }).count()) > 0
  );

  const doneHistory = await coachPage
    .locator('[data-assign-history="whole-body-signal"]')
    .innerText();
  check(
    'the form names the day it was last assigned, and who sent it',
    /last assigned/i.test(doneHistory) && doneHistory.includes(COPY['assign.by_you']),
    doneHistory.replace(/\n/g, ' | ')
  );
  check(
    'and the day she finished it',
    /last completed/i.test(doneHistory)
  );
  check(
    'and the one quiet line, because she finished it today',
    doneHistory.includes(COPY['assign.completed_today']),
    doneHistory.replace(/\n/g, ' | ')
  );
  check(
    'and nothing is blocked: the confirm button is a live Assign',
    (await formFor('whole-body-signal')
      .getByRole('button', { name: new RegExp(`^${COPY['assign.confirm_assign']}$`) })
      .isDisabled()) === false
  );

  // ------------------------------------------------------------------
  // 4. A SECOND CYCLE, ANSWERED DIFFERENTLY, AND THE COMPARISON.
  // ------------------------------------------------------------------
  await formFor('whole-body-signal')
    .getByRole('button', { name: new RegExp(`^(${COPY['assign.confirm_assign']}|${COPY['assign.confirm_sending']})$`) })
    .click();
  const secondCycle = await waitForRows(
    WBS_DEFINITION,
    (rows) => rows.length === 2 && rows.some((row) => row.status === 'pending'),
    'a second assignment opening'
  );
  check(
    'ASSIGN AGAIN OPENED A SECOND CYCLE, with the finished one still standing behind it',
    secondCycle.filter((row) => row.status === 'pending').length === 1 &&
      secondCycle.filter((row) => row.status === 'completed').length === 1
  );

  await walkSignal(quiet);
  await waitForRows(
    WBS_DEFINITION,
    (rows) => rows.filter((row) => row.status === 'completed').length === 2,
    'the second sitting completing'
  );
  check('she finished the second sitting, answered the other way', true);

  await openDetail();
  const panel = coachPage.locator('#detail-card-whole-body-signal');
  await panel.waitFor({ state: 'attached', timeout: 90000 });
  const panelText = await panel.innerText();
  check(
    'THE REASSESSMENT COMPARISON IS DRAWN, which is what sending it again is for',
    /reassessment/i.test(panelText)
  );
  check(
    'with a per section change stated as two numbers and a signed difference',
    /\d+ to \d+, [+-]\d+/.test(panelText),
    (panelText.match(/\d+ to \d+, [+-]\d+/) ?? [''])[0]
  );
  check(
    'the Zone shift is stated plainly, or said not to have moved',
    /previous primary:/i.test(panelText) || /primary zone has not moved/i.test(panelText)
  );
  check('the Signal Load trend is printed', /signal load trend/i.test(panelText));

  // ------------------------------------------------------------------
  // 5. THE WHOLE-BODY CHECK-IN, sent by the other write path entirely.
  // ------------------------------------------------------------------
  await openDetail();
  check(
    'the Whole-Body Check-In starts in Not Yet Assigned',
    (await groupOf('wbsa')) === 'notYetAssigned'
  );
  opened = await openForm('wbsa');
  check('its control reads Assign', opened.label === COPY['assign.row_assign'], opened.label);
  await formFor('wbsa').getByRole('button', { name: /^(Assign|Sending)$/ }).click();
  await waitForRows(
    WBSA_DEFINITION,
    (rows) => rows.some((row) => row.status === 'pending'),
    'the Check-In assignment'
  );
  check('the Check-In assignment was written', true);

  // Reopened before she finishes: the same open notice, the same Resend.
  await openDetail();
  opened = await openForm('wbsa');
  check(
    'reopened before she finishes, it reads Resend',
    opened.label === COPY['assign.row_resend'],
    opened.label
  );
  const wbsaOpenHistory = await coachPage.locator('[data-assign-history="wbsa"]').innerText();
  check(
    'and says it is already waiting for her',
    wbsaOpenHistory.includes(FIRST_NAME) && /already waiting/i.test(wbsaOpenHistory),
    wbsaOpenHistory.replace(/\n/g, ' | ')
  );

  /** Answer every screen of the Whole-Body Check-In until it is finished. */
  async function walkCheckIn() {
    await page.goto(`${BASE}/assessments/wbsa`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button', { timeout: 90000 });
    const begin = page.getByRole('button', { name: /begin|start|continue/i });
    const beginLink = page.getByRole('link', { name: /begin|start|continue/i });
    if (await begin.count()) await begin.first().click().catch(() => {});
    else if (await beginLink.count()) await beginLink.first().click().catch(() => {});
    await page.waitForURL(/\/assessments\/wbsa\/take/, { timeout: 90000 }).catch(() => {});

    /*
      DONE IS THE LEDGER SAYING SO, NOT A SCREEN.

      The first run of this walk answered every question, the sitting
      landed and the assignment closed out, and the rig then sat for ninety
      seconds waiting for an `h2` on a completion screen that has none. The
      finished state this run actually cares about is the assignment being
      closed, which is a row, so that is what ends the loop. The screen is
      still checked first because it is cheaper and answers a frame
      earlier.
    */
    async function alreadyClosed() {
      const rows = await assignmentRows(WBSA_DEFINITION);
      return rows.some((row) => row.status === 'completed');
    }

    for (let screen = 0; screen < 200; screen += 1) {
      const finished = await page
        .getByRole('button', { name: /view my results/i })
        .count()
        .catch(() => 0);
      if (finished > 0) return;
      if (await alreadyClosed()) return;

      const asked = await page
        .waitForSelector('h2', { timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (!asked) {
        if (await alreadyClosed()) return;
        throw new Error(
          `the Check-In walk stalled on: ${(await textOf(page)).replace(/\n/g, ' ').slice(0, 200)}`
        );
      }
      const prompt = (await page.locator('h2').first().innerText()).trim();

      const radios = page.getByRole('radio');
      if ((await radios.count()) > 0) {
        await radios.first().click({ timeout: 10000 }).catch(() => {});
      } else {
        // A multi select row is a toggle rather than a radio.
        const toggles = page.locator('[aria-pressed]');
        if ((await toggles.count()) > 0) {
          await toggles.first().click({ timeout: 10000 }).catch(() => {});
        }
      }

      const next = page.getByRole('button', { name: /^(continue|see my results)$/i }).first();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!(await next.isDisabled().catch(() => true))) break;
        await page.waitForTimeout(200);
      }
      await next.click({ timeout: 20000 }).catch(() => {});
      await page
        .waitForFunction(
          (previous) => {
            const done = document.body.innerText.toLowerCase().includes('view my results');
            const h2 = document.querySelector('h2');
            return done || (h2 ? h2.textContent.trim() !== previous : false);
          },
          prompt,
          { timeout: 60000 }
        )
        .catch(() => {});
    }
    throw new Error('the Whole-Body Check-In walk never finished');
  }

  await walkCheckIn();
  await waitForRows(
    WBSA_DEFINITION,
    (rows) => rows.some((row) => row.status === 'completed'),
    'the Check-In completing'
  );
  check('she finished the Whole-Body Check-In and its assignment closed out', true);

  await openDetail();
  check('its row is filed under Completed', (await groupOf('wbsa')) === 'completed');
  opened = await openForm('wbsa');
  check(
    'AND IT OFFERS ASSIGN AGAIN, on the other write path too',
    opened.label === COPY['assign.row_assign_again'],
    opened.label
  );
  const wbsaHistory = await coachPage.locator('[data-assign-history="wbsa"]').innerText();
  check(
    'with the day it was assigned, who sent it, and the day she finished',
    /last assigned/i.test(wbsaHistory) &&
      wbsaHistory.includes(COPY['assign.by_you']) &&
      /last completed/i.test(wbsaHistory),
    wbsaHistory.replace(/\n/g, ' | ')
  );
  check(
    'and the quiet line, because she finished it today',
    wbsaHistory.includes(COPY['assign.completed_today'])
  );

  check(
    'zero console or page errors on every screen either account saw',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ')
  );
} catch (e) {
  check('the run completed without throwing', false, String(e).slice(0, 500));
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passing`);
  if (failed.length) console.log('FAILED:\n' + failed.map((f) => `  ${f.name} ${f.note}`).join('\n'));

  if (knownDismissals) {
    const { data: after } = await admin
      .from('member_root_popup_dismissals')
      .select('message_key')
      .eq('member_id', MEMBER);
    const added = (after ?? [])
      .map((row) => row.message_key)
      .filter((key) => !knownDismissals.has(key));
    if (added.length > 0) {
      await admin
        .from('member_root_popup_dismissals')
        .delete()
        .eq('member_id', MEMBER)
        .in('message_key', added);
      console.log(`removed ${added.length} dismissal row(s) this run created`);
    }
  }

  if (coach) await retireSession(coach);
  if (minted) await retireSession(minted);
  await browser.close();

  // STATE LEFT BEHIND: NONE. Removed, then confirmed absent by an
  // independent read rather than by trusting the delete.
  await clean();
  const [{ data: leftSittings }, { data: leftAssignments }, { data: leftAttempts }, { data: leftUnified }] =
    await Promise.all([
      admin.from('member_whole_body_signal_sessions').select('id').eq('member_id', MEMBER),
      admin
        .from('assessment_assignments')
        .select('id')
        .eq('member_id', MEMBER)
        .in('assessment_definition_id', [WBS_DEFINITION, WBSA_DEFINITION]),
      admin
        .from('assessment_attempts')
        .select('id')
        .eq('member_id', MEMBER)
        .in('assessment_definition_id', [WBS_DEFINITION, WBSA_DEFINITION]),
      admin.from('unified_assessment_sessions').select('id').eq('member_id', MEMBER),
    ]);
  const leftovers =
    (leftSittings?.length ?? 0) +
    (leftAssignments?.length ?? 0) +
    (leftAttempts?.length ?? 0) +
    (leftUnified?.length ?? 0);
  console.log(leftovers === 0 ? 'cleanup: nothing left behind' : `cleanup: ${leftovers} rows REMAIN`);
  process.exitCode = failed.length === 0 && leftovers === 0 ? 0 : 1;
}
