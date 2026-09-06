#!/usr/bin/env node
/**
 * The coach's questionnaire search, driven on production.
 *
 * WHAT IT PROVES, on the real client detail screen as the real coach:
 *   1. A search field sits at the TOP of the Assign an Assessment card,
 *      above the list it filters.
 *   2. Typing part of a name filters the list live, and the match is shown
 *      under its proper display name, never the generic word.
 *   3. Typing an AREA name surfaces every template filed under it. The word
 *      used appears in no display name anywhere, so a filter that only ever
 *      read names could not pass this.
 *   4. Gibberish shows the empty state.
 *   5. Clearing the field restores the full list, row for row.
 *   6. THE STATUS ON A FILTERED ROW IS THE PAGE'S OWN STATUS. Every row in
 *      the picker is compared, character for character, with the sentence
 *      the assignment ledger underneath the same form prints for the same
 *      assignment. That ledger is what this page printed before this build,
 *      so a match is a proof the build changed no status text.
 *   7. Assigning FROM A FILTERED RESULT works exactly as it did unfiltered:
 *      the ledger gains the row, the picker row for that questionnaire
 *      changes from "Not sent." to the sent sentence, and the run then
 *      cancels it through the real Cancel control.
 *   8. Zero console errors and zero em dashes on the screen.
 *
 * IT WRITES ONLY TO ONE SEEDED TEST ACCOUNT, and the one row it creates is
 * cancelled through the real control and then deleted in a `finally`
 * whether the run passes or not, so the account ends exactly as it started.
 *
 * Environment:
 *   BASE_URL     default https://app.mefwellness.com
 *   STAFF_EMAIL  an account holding coach or administrator
 *   TEST_MEMBER_ID   the seeded fixture whose detail page is opened
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const MEMBER_ID = process.env.TEST_MEMBER_ID;
/* Under .verify/, which .gitignore covers wherever it lands. A screenshot of
   a real client screen is evidence for one run, never a committed artefact. */
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/coach-assessment-search';

/** The card, addressed by its accessible name and never by its copy. */
const CARD = 'section[aria-label="Assign an Assessment"]';
const LIST = '[aria-label="Questionnaires for this client"]';
const EMPTY_LINE = 'Nothing here matches that.';

/** The questionnaire this run assigns and then cancels. Chosen because it has no rows on the fixture today. */
const TARGET_NAME = 'Readiness Pulse';
const TARGET_TYPED = 'readiness';
/** An area word that is in no display name in the library. */
const AREA_TYPED = 'happiness';
const GIBBERISH = 'qzxwvv';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function serviceClient() {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
    { auth: { persistSession: false } }
  );
}

function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function shot(page, name) {
  try {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  } catch {
    // A screenshot that will not write is never a reason to fail a run.
  }
}

/**
 * Every row the picker is showing right now, read out of the real DOM:
 * its name, its area chip, its status sentence, and whether it is a
 * control. Read as structure rather than as one blob of text, so an
 * assertion cannot be satisfied by the wrong row.
 */
async function pickerRows(page) {
  return page.$$eval(
    '[aria-label="Questionnaires for this client"] > *',
    (nodes) =>
      nodes.map((node) => {
        const spans = node.querySelectorAll('span');
        const paras = node.querySelectorAll('p');
        return {
          tag: node.tagName.toLowerCase(),
          name: spans[0] ? spans[0].textContent.trim() : '',
          area: spans[1] ? spans[1].textContent.trim() : '',
          status: paras[0] ? paras[0].textContent.trim() : '',
          pointer: paras[1] ? paras[1].textContent.trim() : '',
          text: (node.textContent || '').trim(),
        };
      })
  );
}

/**
 * Every row of the ledger underneath the form: the questionnaire's name and
 * the sentence this page has always printed for it. This is the "before
 * this build" side of the status comparison.
 */
async function ledgerRows(page) {
  return page.$$eval('section[aria-label="Assign an Assessment"] form ~ div > div', (nodes) =>
    nodes.map((node) => {
      const paras = node.querySelectorAll('p');
      return {
        name: paras[0] ? paras[0].textContent.trim() : '',
        status: paras[2] ? paras[2].textContent.trim() : '',
      };
    })
  );
}

async function typeSearch(page, text) {
  const field = page.locator(`${CARD} input[type="search"]`);
  await field.fill(text);
  await page.waitForTimeout(400);
}

async function emDashOn(page) {
  return page.evaluate(() => (document.body.innerText || '').includes('—'));
}

async function main() {
  if (!canMintSessions()) throw new Error('Session minting is not configured.');
  if (!STAFF_EMAIL || !MEMBER_ID) throw new Error('STAFF_EMAIL and TEST_MEMBER_ID are required.');

  const service = serviceClient();
  const errors = [];

  const { data: profile } = await service
    .from('profiles')
    .select('id, display_name, is_test')
    .eq('id', MEMBER_ID)
    .maybeSingle();
  if (!profile?.is_test) {
    throw new Error('Refusing to run: that member is not a seeded test account.');
  }
  note(`client ${profile.display_name} (${MEMBER_ID})`);

  // Every assignment row that exists BEFORE this run, so the cleanup can
  // remove only what this run created and nothing else.
  const { data: before } = await service
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', MEMBER_ID);
  const preexisting = new Set((before ?? []).map((r) => r.id));
  note(`${preexisting.size} assignment rows already on this client`);

  const browser = await chromium.launch();
  let staff = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE });
    if (!staff) throw new Error('Could not mint a staff session.');
    const page = await staff.context.newPage();
    watch(page, errors);

    await page.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const card = page.locator(CARD);
    const cardFound = (await card.count()) === 1;
    check('1. the Assign an Assessment card is on the client screen', cardFound);
    if (!cardFound) throw new Error('No Assign an Assessment card. Refusing to guess.');
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------
    // 1. The field exists, and it is above the list.
    // ---------------------------------------------------------------
    const field = page.locator(`${CARD} input[type="search"]`);
    check('1. a search field is in the card', (await field.count()) === 1);
    const order = await page.evaluate(
      ([cardSel, listSel]) => {
        const root = document.querySelector(cardSel);
        const input = root.querySelector('input[type="search"]');
        const list = root.querySelector(listSel);
        return input.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING ? 'above' : 'below';
      },
      [CARD, LIST]
    );
    check('1. the field sits ABOVE the list it filters', order === 'above', order);
    await shot(page, '01-card-unfiltered');

    // ---------------------------------------------------------------
    // 5 (measured first). The full list, and the ledger underneath it.
    // ---------------------------------------------------------------
    const fullRows = await pickerRows(page);
    check('1. the list is populated', fullRows.length > 0, `${fullRows.length} rows`);
    note(`unfiltered: ${fullRows.map((r) => r.name).join(' | ')}`);
    check(
      '2. no row reads as the generic word or a registry key',
      fullRows.every((r) => r.name && r.name !== 'Assessment' && !/[a-z]-[a-z]/.test(r.name)),
      fullRows.map((r) => r.name).join(', ')
    );
    check(
      '2. every row carries an area chip in words',
      fullRows.every((r) => r.area && !r.area.includes('_'))
    );

    const ledger = await ledgerRows(page);
    note(`ledger: ${ledger.map((r) => `${r.name} => ${r.status}`).join(' | ')}`);

    // ---------------------------------------------------------------
    // 6. Every picker row's status is the page's own status.
    // ---------------------------------------------------------------
    let compared = 0;
    let mismatched = [];
    for (const row of fullRows) {
      const matching = ledger.filter((l) => l.name === row.name);
      if (matching.length === 0) {
        if (row.status !== 'Not sent.') mismatched.push(`${row.name}: "${row.status}" with no ledger row`);
        continue;
      }
      compared += 1;
      // The picker shows the row a coach is standing on: an open one first,
      // then a completed one. Any of this questionnaire's ledger sentences
      // matching is the proof that no new sentence was written.
      if (!matching.some((l) => l.status === row.status)) {
        mismatched.push(`${row.name}: picker "${row.status}" vs ledger ${matching.map((l) => `"${l.status}"`).join(', ')}`);
      }
    }
    check(
      '6. every picker status equals the sentence the ledger prints for the same client',
      mismatched.length === 0,
      mismatched.length ? mismatched.join(' ;; ') : `${compared} assigned rows compared, rest read "Not sent."`
    );
    check(
      '6. at least one Completed row was part of that comparison',
      fullRows.some((r) => r.status.startsWith('Completed')),
      fullRows.filter((r) => r.status.startsWith('Completed')).map((r) => `${r.name}: ${r.status}`).join(' | ')
    );

    // ---------------------------------------------------------------
    // 2. Typing part of a name filters live.
    // ---------------------------------------------------------------
    await typeSearch(page, TARGET_TYPED);
    const byName = await pickerRows(page);
    check(
      `2. typing "${TARGET_TYPED}" filters the list down`,
      byName.length > 0 && byName.length < fullRows.length,
      `${byName.length} of ${fullRows.length}`
    );
    check(
      '2. the match is shown under its proper display name',
      byName.some((r) => r.name === TARGET_NAME),
      byName.map((r) => r.name).join(', ')
    );
    await shot(page, '02-filtered-by-name');

    // Case insensitivity, on the same word.
    await typeSearch(page, TARGET_TYPED.toUpperCase());
    check(
      '2. the same word in capitals returns the same rows',
      JSON.stringify((await pickerRows(page)).map((r) => r.name)) ===
        JSON.stringify(byName.map((r) => r.name))
    );

    // ---------------------------------------------------------------
    // 3. Typing an area surfaces everything in it.
    // ---------------------------------------------------------------
    const inArea = fullRows.filter((r) => r.area.toLowerCase() === AREA_TYPED);
    await typeSearch(page, AREA_TYPED);
    const byArea = await pickerRows(page);
    check(
      `3. "${AREA_TYPED}" is in no display name, so only an area match can find anything`,
      fullRows.every((r) => !r.name.toLowerCase().includes(AREA_TYPED))
    );
    check(
      `3. typing "${AREA_TYPED}" returns every template in that area and nothing else`,
      inArea.length > 1 &&
        JSON.stringify(byArea.map((r) => r.name)) === JSON.stringify(inArea.map((r) => r.name)),
      `${byArea.map((r) => r.name).join(', ')} (area holds ${inArea.length})`
    );
    await shot(page, '03-filtered-by-area');

    // ---------------------------------------------------------------
    // 4. Gibberish shows the empty state.
    // ---------------------------------------------------------------
    await typeSearch(page, GIBBERISH);
    const emptyText = await page.locator(LIST).innerText();
    check('4. gibberish shows the empty state', emptyText.includes(EMPTY_LINE), emptyText.trim());
    check('4. the empty state carries no row', (await pickerRows(page)).every((r) => !r.name));
    await shot(page, '04-empty-state');

    // ---------------------------------------------------------------
    // 5. Clearing restores the full list.
    // ---------------------------------------------------------------
    await typeSearch(page, '');
    const restored = await pickerRows(page);
    check(
      '5. clearing the field restores the full list, row for row',
      JSON.stringify(restored.map((r) => [r.name, r.area, r.status])) ===
        JSON.stringify(fullRows.map((r) => [r.name, r.area, r.status])),
      `${restored.length} rows back`
    );

    // ---------------------------------------------------------------
    // 7. Assign from a filtered result, then cancel it.
    // ---------------------------------------------------------------
    const targetBefore = restored.find((r) => r.name === TARGET_NAME);
    check(
      `7. ${TARGET_NAME} starts as "Not sent." on this client`,
      targetBefore?.status === 'Not sent.',
      targetBefore?.status
    );

    await typeSearch(page, TARGET_TYPED);
    const targetRow = page.locator(`${LIST} button`, { hasText: TARGET_NAME }).first();
    check('7. the filtered result is a real control', (await targetRow.count()) === 1);
    await targetRow.click();
    await page.waitForTimeout(300);
    check(
      '7. selecting a filtered row marks it selected',
      (await targetRow.getAttribute('aria-pressed')) === 'true'
    );
    check(
      '7. the card names what is about to be sent',
      (await card.innerText()).includes(`Selected: ${TARGET_NAME}`)
    );
    await shot(page, '05-filtered-row-selected');

    await card.getByRole('button', { name: /^Assign$/ }).click();
    await page.waitForTimeout(5000);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const { data: created } = await service
      .from('assessment_assignments')
      .select('id, assessment_definition_id, status, created_at')
      .eq('member_id', MEMBER_ID)
      .eq('status', 'pending');
    const newRow = (created ?? []).find((r) => !preexisting.has(r.id));
    check('7. assigning from a filtered result created the pending row', Boolean(newRow), newRow?.id);

    const afterAssign = await pickerRows(page);
    const targetAfter = afterAssign.find((r) => r.name === TARGET_NAME);
    check(
      '7. the picker row for it now carries the sent sentence, not "Not sent."',
      Boolean(targetAfter) && targetAfter.status !== 'Not sent.' && /^Sent /.test(targetAfter.status),
      targetAfter?.status
    );
    const ledgerAfter = await ledgerRows(page);
    const ledgerTarget = ledgerAfter.find((l) => l.name === TARGET_NAME);
    check(
      '7. and it is the SAME sentence the ledger underneath prints',
      Boolean(ledgerTarget) && ledgerTarget.status === targetAfter?.status,
      `picker "${targetAfter?.status}" vs ledger "${ledgerTarget?.status}"`
    );
    check(
      '7. the search field cleared itself after a successful assign',
      (await page.locator(`${CARD} input[type="search"]`).inputValue()) === ''
    );
    await shot(page, '06-after-assign');

    // Cancel it through the real control, so the account is left clean.
    const ledgerRow = page
      .locator(`${CARD} form ~ div > div`)
      .filter({ hasText: TARGET_NAME })
      .first();
    const cancelFound = (await ledgerRow.count()) === 1;
    check('7. the new row offers Cancel', cancelFound);
    if (cancelFound) {
      await ledgerRow.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(5000);
      const { data: afterCancel } = await service
        .from('assessment_assignments')
        .select('id, status')
        .eq('id', newRow?.id ?? '00000000-0000-0000-0000-000000000000')
        .maybeSingle();
      check(
        '7. the real Cancel control withdrew it',
        afterCancel?.status === 'cancelled',
        afterCancel?.status
      );
    }
    await shot(page, '07-after-cancel');

    // ---------------------------------------------------------------
    // 8. Clean screen.
    // ---------------------------------------------------------------
    check('8. no em dash anywhere on the coach screen', (await emDashOn(page)) === false);
    check('8. no console or page error on the coach screen', errors.length === 0, errors.join(' ;; '));
  } finally {
    // Every row this run created, removed. Rows that were already there are
    // never touched: the ids were recorded before anything was pressed.
    const { data: now } = await service
      .from('assessment_assignments')
      .select('id')
      .eq('member_id', MEMBER_ID);
    const mine = (now ?? []).map((r) => r.id).filter((id) => !preexisting.has(id));
    if (mine.length) {
      await service.from('member_assignment_deliveries').delete().in('assignment_id', mine);
      await service.from('assessment_assignments').delete().in('id', mine);
      note(`cleaned up ${mine.length} row(s) this run created`);
    } else {
      note('nothing to clean up');
    }
    await retireSession(staff);
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
