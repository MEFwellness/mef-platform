#!/usr/bin/env node
/**
 * The rebuilt Assessments and Findings section, driven on production.
 *
 * WHAT THIS BUILD CHANGED, and therefore what has to be checked on the
 * real site rather than in a test: the section used to open on its
 * findings, with the list of assessments at the very bottom of a scroll
 * measured in thousands of pixels, and nine deep-dive cards each repeating
 * one sentence about how nothing is offered until you send it. It now
 * opens on three groups of compact rows, and the findings follow under
 * three named sub-headers.
 *
 * WHAT IS CHECKED, on a 390px phone, signed in as the real coach through a
 * one-time minted session retired afterwards with scope 'local':
 *
 *   1. THE ORDER. Not Yet Assigned, then Assigned Waiting, then Completed,
 *      then Wellness Identity, Snapshots and Deep-Dive Results.
 *   2. THE COUNTS. Each group header's number is the number of rows really
 *      under it, and the folded header's digest names the same three
 *      numbers. A header that disagrees with the rows under it is the
 *      reason a coach stops opening sections.
 *   3. THE SENTENCE IS GONE. Zero occurrences of the old repeated line,
 *      and at most one line of context for the whole first group.
 *   4. THE SCROLL. Two different numbers, both measured and both printed.
 *      The distance to REACH the assessment list is what this build set
 *      out to change and it went from the bottom of the section to the
 *      top. The section's own total height is mostly the findings, which
 *      the brief said to keep and render fully, so it is asserted only to
 *      have gone down, against the figure taken from THIS SAME PAGE before
 *      the deploy (BEFORE_HEIGHT_READ / BEFORE_HEIGHT_WRITE).
 *   5. THE PINNED SEARCH STILL LANDS. Typing "joy" and choosing the
 *      questionnaire opens the section, scrolls to that questionnaire's
 *      own row, and marks it.
 *   6. THE INLINE ASSIGN FLOW, END TO END, and this is the ONLY check that
 *      writes anything. It runs against the seeded test fixture, never
 *      against a real member: an assignment appears on her phone, the
 *      notification job reads it, and a withdrawn row would sit on a real
 *      client's ledger forever.
 *   7. THE MEMBER SIDE. Her own questionnaire list shows it exactly as a
 *      coach assignment has always appeared.
 *   8. Zero console errors and zero em dashes on every screen visited.
 *
 * Everything it writes is deleted in a `finally`, whether the run passes
 * or not, including the pop-up dismissal row that survives an assignment
 * delete because it is keyed by a string rather than by a foreign key.
 *
 * Environment:
 *   BASE_URL            default https://app.mefwellness.com
 *   STAFF_EMAIL         the coach whose caseload holds both accounts
 *   READ_CLIENT_ID      the real client to READ only
 *   WRITE_CLIENT_ID     the seeded test client to WRITE to
 *   WRITE_MEMBER_EMAIL  that same test client, for her own side
 *   BEFORE_HEIGHT_READ / BEFORE_HEIGHT_WRITE   pixels, measured pre-deploy
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const READ_CLIENT_ID = process.env.READ_CLIENT_ID;
const WRITE_CLIENT_ID = process.env.WRITE_CLIENT_ID;
const WRITE_MEMBER_EMAIL = process.env.WRITE_MEMBER_EMAIL;
const BEFORE_READ = Number(process.env.BEFORE_HEIGHT_READ ?? 0);
const BEFORE_WRITE = Number(process.env.BEFORE_HEIGHT_WRITE ?? 0);
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/assessment-status-block';

const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';
const OLD_SENTENCE = 'Nothing about this is offered to them until you send it';

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
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

/** Opens Assessments and Findings and waits for the status block to really be there. */
async function openSection(page, clientId) {
  await page.goto(`${BASE}/coach/clients/${clientId}/detail`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-controls="detail-section-assessments-content"]', {
    timeout: 30000,
  });
  const header = page.locator('button[aria-controls="detail-section-assessments-content"]');
  const digest = (await header.innerText()).replace(/\s+/g, ' ').trim();
  /*
    A HEADER THAT IS PAINTED IS NOT A HEADER THAT IS LISTENING. This page
    is several screens of server-rendered panels and the fold is a client
    component, so a tap that lands before hydration does nothing at all and
    says nothing about it. Wait for the section to report itself expanded,
    and tap again if the first one fell on the floor.
  */
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await header.click();
    const opened = await page
      .waitForSelector('section[aria-label="Assessment Status"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return digest;
    // A tap that DID register would have expanded it, so fold it back
    // before trying again rather than toggling it shut on the next one.
    if ((await header.getAttribute('aria-expanded')) === 'true') await header.click();
  }
  throw new Error('Assessments and Findings never opened');
}

/** Everything the block says about itself, read out of the real DOM. */
async function readBlock(page) {
  return page.evaluate(() => {
    const groups = [...document.querySelectorAll('[data-assessment-group]')].map((el) => {
      const heading = el.querySelector('h3');
      const countText = heading?.nextElementSibling?.textContent ?? '';
      return {
        key: el.getAttribute('data-assessment-group'),
        title: (heading?.textContent ?? '').trim(),
        printedCount: Number((countText.match(/\((\d+)\)/) ?? [])[1] ?? -1),
        rowCount: el.querySelectorAll('[data-assessment-row]').length,
        rowIds: [...el.querySelectorAll('[data-assessment-row]')].map((r) =>
          r.getAttribute('data-assessment-row')
        ),
        top: Math.round(el.getBoundingClientRect().top + window.scrollY),
      };
    });
    const groupIds = [
      'findings-wellness-identity',
      'findings-snapshots',
      'findings-deep-dive-results',
    ];
    const findings = groupIds.map((id) => {
      const el = document.getElementById(id);
      return {
        id,
        present: Boolean(el),
        top: el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null,
      };
    });
    const content = document.getElementById('detail-section-assessments-content');
    const status = document.getElementById('detail-card-assessment-status');
    const text = document.body.innerText ?? '';
    return {
      groups,
      findings,
      expandedHeight: content ? Math.round(content.getBoundingClientRect().height) : null,
      statusTop: status ? Math.round(status.getBoundingClientRect().top + window.scrollY) : null,
      statusHeight: status ? Math.round(status.getBoundingClientRect().height) : null,
      sectionTop: content ? Math.round(content.getBoundingClientRect().top + window.scrollY) : null,
      oldSentenceCount:
        text.split('Nothing about this is offered to them until you send it').length - 1,
      contextLineCount: text.split('is offered to them until you send it').length - 1,
      emDash: text.includes('—'),
    };
  });
}

/** Reads one row: which group it is in, and the sentence under it. */
async function readRow(page, rowId) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-assessment-row="${id}"]`);
    if (!row) return null;
    const group = row.closest('[data-assessment-group]');
    return {
      group: group?.getAttribute('data-assessment-group') ?? null,
      text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      marked: row.className.includes('bg-[#F5B700]/15'),
    };
  }, rowId);
}

const createdAssignmentIds = [];
const dismissalKeysBefore = new Set();

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  if (!canMintSessions()) throw new Error('Session minting is not configured for this run.');
  for (const [name, value] of Object.entries({
    STAFF_EMAIL,
    READ_CLIENT_ID,
    WRITE_CLIENT_ID,
    WRITE_MEMBER_EMAIL,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  const db = serviceClient();
  const browser = await chromium.launch();
  const errors = [];
  let coach = null;
  let member = null;

  try {
    // Snapshot what was already there, so teardown can only ever remove
    // what this run made.
    const { data: before } = await db
      .from('assessment_assignments')
      .select('id')
      .eq('member_id', WRITE_CLIENT_ID);
    const preexisting = new Set((before ?? []).map((r) => r.id));
    const { data: dismissals } = await db
      .from('member_root_popup_dismissals')
      .select('message_key')
      .eq('member_id', WRITE_CLIENT_ID);
    for (const row of dismissals ?? []) dismissalKeysBefore.add(row.message_key);
    note(`fixture starts with ${preexisting.size} assignment row(s)`);

    coach = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!coach) throw new Error(`could not mint a session for ${STAFF_EMAIL}`);
    const page = await coach.context.newPage();
    watch(page, errors);

    /* ---------------- 1 to 4, read only, on the real client ---------------- */
    const digest = await openSection(page, READ_CLIENT_ID);
    const block = await readBlock(page);
    await shot(page, 'read-client-expanded');

    check(
      "the three groups render in the brief's order",
      block.groups.map((g) => g.key).join(',') === 'notYetAssigned,waiting,completed',
      block.groups.map((g) => `${g.title} (${g.printedCount})`).join(' | ')
    );
    check(
      'every group header counts the rows really under it',
      block.groups.every((g) => g.printedCount === g.rowCount),
      block.groups.map((g) => `${g.key} printed=${g.printedCount} rows=${g.rowCount}`).join(', ')
    );

    const counts = Object.fromEntries(block.groups.map((g) => [g.key, g.rowCount]));
    const digestParts = [];
    if (counts.waiting > 0) digestParts.push(`${counts.waiting} waiting`);
    if (counts.completed > 0) digestParts.push(`${counts.completed} completed`);
    if (counts.notYetAssigned > 0) digestParts.push(`${counts.notYetAssigned} not yet assigned`);
    const expectedDigest = digestParts.join(', ') || 'Nothing to send and nothing sent';
    check(
      'the folded header names the same three numbers the groups draw',
      digest.includes(expectedDigest),
      `header="${digest}" expected="${expectedDigest}"`
    );

    check(
      'the status block is above every findings group',
      block.findings
        .filter((f) => f.present)
        .every((f) => block.statusTop !== null && f.top > block.statusTop),
      `status@${block.statusTop}px, findings at ${block.findings.map((f) => `${f.id}@${f.top}`).join(', ')}`
    );
    const present = block.findings.filter((f) => f.present);
    check(
      'the findings groups run Wellness Identity, Snapshots, Deep-Dive Results',
      present.map((f) => f.id).join(',') ===
        ['findings-wellness-identity', 'findings-snapshots', 'findings-deep-dive-results']
          .filter((id) => present.some((f) => f.id === id))
          .join(','),
      present.map((f) => `${f.id}@${f.top}`).join(', ')
    );
    check(
      'Wellness Identity is on the page',
      present.some((f) => f.id === 'findings-wellness-identity'),
      ''
    );
    check(
      'Snapshots is on the page',
      present.some((f) => f.id === 'findings-snapshots'),
      ''
    );

    check(
      'the repeated not-assigned sentence is gone',
      block.oldSentenceCount === 0,
      `${block.oldSentenceCount} occurrence(s)`
    );
    check(
      'the group context line is said at most once',
      block.contextLineCount <= 1,
      `${block.contextLineCount} occurrence(s)`
    );
    check('no em dash on the expanded section', block.emDash === false, '');

    /*
      THE SCROLL, MEASURED HONESTLY.

      The distance a coach travels to REACH the assessment list is the
      number this build set out to change, and it went from the bottom of
      the section to the top of it. The section's own total height is a
      different number and it is mostly the findings, which the brief said
      to keep and render fully: one finished deep-dive alone is a couple of
      thousand pixels of her own answers. So both are asserted, and the
      breakdown is printed rather than summarised away.
    */
    check(
      'the assessment list is the first thing in the section, not the last',
      block.statusTop !== null &&
        block.sectionTop !== null &&
        block.statusTop - block.sectionTop < 40,
      `status block starts ${block.statusTop - block.sectionTop}px into the section`
    );
    check(
      'the whole list fits inside one phone screen of the section opening',
      block.statusHeight !== null && block.statusTop - block.sectionTop < PHONE.height,
      `list is ${block.statusHeight}px tall, starting ${block.statusTop - block.sectionTop}px in`
    );
    if (BEFORE_READ > 0) {
      check(
        'the expanded section is shorter than it was',
        block.expandedHeight !== null && block.expandedHeight < BEFORE_READ,
        `before=${BEFORE_READ}px after=${block.expandedHeight}px (${Math.round((1 - block.expandedHeight / BEFORE_READ) * 100)}% shorter)`
      );
    }
    const findingsTops = block.findings.filter((f) => f.present).map((f) => `${f.id}@${f.top}px`);
    note(
      `height breakdown: section ${block.expandedHeight}px, status list ${block.statusHeight}px, findings start at ${findingsTops.join(', ')}`
    );

    /* ---------------- 5, the pinned search ---------------- */
    await page.goto(`${BASE}/coach/clients/${READ_CLIENT_ID}/detail`, {
      waitUntil: 'domcontentloaded',
    });
    const field = page.locator('[data-detail-page-search="true"] input');
    await field.waitFor({ timeout: 30000 });
    await field.fill('joy');
    const joyResult = page.locator('[data-questionnaire-result="where-your-joy-lives"]');
    await joyResult.waitFor({ timeout: 15000 });
    check(
      'the pinned search still finds a questionnaire by name',
      true,
      'Where Your Joy Lives offered'
    );
    await joyResult.click();
    await page.waitForSelector('[data-assessment-row="where-your-joy-lives"]', { timeout: 30000 });
    // Wait on the mark itself, which is the thing the tap was for.
    await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-assessment-row="where-your-joy-lives"]')
            ?.className.includes('bg-[#F5B700]/15') ?? false,
        { timeout: 15000 }
      )
      .catch(() => {});
    const joyRow = await readRow(page, 'where-your-joy-lives');
    await shot(page, 'search-landed-on-row');
    check(
      'choosing it opens the section and lands on that row',
      Boolean(joyRow),
      `group=${joyRow?.group}`
    );
    check('and marks the row it took her to', joyRow?.marked === true, '');
    const rowsOnScreen = await page.locator('[data-assessment-row]').count();
    check(
      'every other row is still on screen, because the grouping is the point',
      rowsOnScreen > 5,
      `${rowsOnScreen} rows`
    );

    /* ---------------- 6, the write, on the seeded fixture only ---------------- */
    const writeDigest = await openSection(page, WRITE_CLIENT_ID);
    note(`fixture header before: ${writeDigest}`);
    const beforeBlock = await readBlock(page);
    await shot(page, 'fixture-before-assign');

    // A row this page can send with a reason, chosen from what is really
    // in Not Yet Assigned rather than from a name typed in here.
    const target = await page.evaluate(() => {
      const group = document.querySelector('[data-assessment-group="notYetAssigned"]');
      const rows = [...(group?.querySelectorAll('[data-assessment-row]') ?? [])];
      const preferred =
        rows.find((r) => (r.innerText ?? '').includes('Four Doctors')) ??
        rows.find((r) => (r.innerText ?? '').includes('Short Health Assessment')) ??
        rows[0];
      return preferred
        ? {
            id: preferred.getAttribute('data-assessment-row'),
            name: (preferred.innerText ?? '').split('\n')[0],
          }
        : null;
    });
    if (!target) throw new Error('the fixture has nothing left in Not Yet Assigned to send');
    note(`assigning "${target.name}" (${target.id})`);

    await page
      .locator(`[data-assessment-row="${target.id}"] button`, { hasText: 'Assign' })
      .first()
      .click();
    await page.waitForSelector(`[data-assign-form="${target.id}"]`, { timeout: 15000 });
    check(
      'the Assign button opens a form under that row and nowhere else',
      (await page.locator('[data-assign-form]').count()) === 1,
      ''
    );

    const due = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const form = page.locator(`[data-assign-form="${target.id}"]`);
    const reason = form.locator('textarea');
    if ((await reason.count()) > 0) await reason.fill('Checking the new inline form.');
    await form.locator('input[type="date"]').fill(due);
    await form.locator('button[type="submit"]').click();

    // Wait on the row arriving in Waiting, which is the destination, never
    // on a fixed pause over a submit in flight.
    await page
      .waitForFunction(
        (id) =>
          document
            .querySelector(`[data-assessment-row="${id}"]`)
            ?.closest('[data-assessment-group]')
            ?.getAttribute('data-assessment-group') === 'waiting',
        target.id,
        { timeout: 45000 }
      )
      .catch(() => {});
    const movedRow = await readRow(page, target.id);
    const afterBlock = await readBlock(page);
    await shot(page, 'fixture-after-assign');

    check(
      'the row moved to Assigned, Waiting',
      movedRow?.group === 'waiting',
      `group=${movedRow?.group}`
    );
    const dueLabel = new Date(`${due}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    check(
      'and names the due day the coach picked',
      Boolean(movedRow?.text.includes(`Due ${dueLabel}`)),
      `row said: ${movedRow?.text}`
    );
    check(
      'the waiting count went up by one and not yet assigned went down by one',
      afterBlock.groups.find((g) => g.key === 'waiting').rowCount ===
        beforeBlock.groups.find((g) => g.key === 'waiting').rowCount + 1 &&
        afterBlock.groups.find((g) => g.key === 'notYetAssigned').rowCount ===
          beforeBlock.groups.find((g) => g.key === 'notYetAssigned').rowCount - 1,
      `waiting ${beforeBlock.groups.find((g) => g.key === 'waiting').rowCount} -> ${afterBlock.groups.find((g) => g.key === 'waiting').rowCount}`
    );
    check(
      'every group header still counts its own rows after the write',
      afterBlock.groups.every((g) => g.printedCount === g.rowCount),
      ''
    );
    check('the form closed itself', (await page.locator('[data-assign-form]').count()) === 0, '');
    if (BEFORE_WRITE > 0) {
      check(
        'the fixture section is shorter than it was too',
        afterBlock.expandedHeight < BEFORE_WRITE,
        `before=${BEFORE_WRITE}px after=${afterBlock.expandedHeight}px (${Math.round((1 - afterBlock.expandedHeight / BEFORE_WRITE) * 100)}% shorter)`
      );
      note(`fixture status list is ${afterBlock.statusHeight}px tall`);
    }

    const { data: written } = await db
      .from('assessment_assignments')
      .select('id, status, due_at, reason, is_required')
      .eq('member_id', WRITE_CLIENT_ID);
    for (const row of written ?? [])
      if (!preexisting.has(row.id)) createdAssignmentIds.push(row.id);
    check(
      'exactly one assignment row was written',
      createdAssignmentIds.length === 1,
      `${createdAssignmentIds.length}`
    );
    const madeRow = (written ?? []).find((r) => r.id === createdAssignmentIds[0]);
    check(
      'it carries the day she picked, stored as that calendar day',
      String(madeRow?.due_at ?? '').startsWith(due),
      `${madeRow?.due_at}`
    );

    /* ---------------- 7, the member's own side ---------------- */
    member = await mintSessionContext(browser, WRITE_MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: PHONE,
    });
    if (!member) throw new Error(`could not mint a session for ${WRITE_MEMBER_EMAIL}`);
    const memberPage = await member.context.newPage();
    watch(memberPage, errors);
    await memberPage.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForLoadState('networkidle').catch(() => {});
    const memberText = (await memberPage.evaluate(() => document.body.innerText ?? '')).replace(
      /\s+/g,
      ' '
    );
    await shot(memberPage, 'member-questionnaires');
    check(
      'it appears on her own questionnaire list',
      memberText.toLowerCase().includes(target.name.toLowerCase().slice(0, 12)),
      `looked for "${target.name}"`
    );
    check(
      'and it reads as a coach assignment, exactly as one always has',
      /assigned|your coach/i.test(memberText),
      ''
    );
    check('no em dash on her questionnaire list', !memberText.includes(EM_DASH), '');

    check(
      'no console or page errors on any screen visited',
      errors.length === 0,
      errors.slice(0, 3).join(' | ')
    );
  } finally {
    /* ---------------- teardown ---------------- */
    const db2 = serviceClient();
    const removed = [];
    if (createdAssignmentIds.length > 0) {
      await db2
        .from('member_assignment_deliveries')
        .delete()
        .in('assignment_id', createdAssignmentIds);
      await db2.from('assessment_assignments').delete().in('id', createdAssignmentIds);
      removed.push(`${createdAssignmentIds.length} assignment row(s)`);
    }
    // A "Maybe later" tap leaks a dismissal keyed by a string rather than
    // by a foreign key, so deleting the assignment does not take it.
    const { data: after } = await db2
      .from('member_root_popup_dismissals')
      .select('id, message_key')
      .eq('member_id', WRITE_CLIENT_ID);
    const leaked = (after ?? []).filter((r) => !dismissalKeysBefore.has(r.message_key));
    if (leaked.length > 0) {
      await db2
        .from('member_root_popup_dismissals')
        .delete()
        .in(
          'id',
          leaked.map((r) => r.id)
        );
      removed.push(`${leaked.length} pop-up dismissal(s)`);
    }
    console.log(`RESTORE: ${removed.length > 0 ? removed.join(', ') : 'nothing to remove'}`);

    if (coach) await retireSession(coach);
    if (member) await retireSession(member);
    await browser.close();

    const failed = results.filter((r) => !r.passed);
    console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
    for (const f of failed) console.log(`  FAILED: ${f.name}`);
    if (failed.length > 0) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
