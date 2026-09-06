#!/usr/bin/env node
/**
 * The folded client detail page, driven on production.
 *
 * WHAT IS CHECKED, on a 390px phone, signed in as the real coach:
 *   1. The page arrives folded. Six section headers, each with a digest
 *      line and a status dot, under the client identity block, and none of
 *      the panels' contents in the document.
 *   2. Every section opens on a tap and folds again on a second tap, and
 *      what it opens onto is the panel that was always there.
 *   3. The pinned search sits above every section and stays on screen while
 *      the page scrolls. Typing a section word finds and opens that section.
 *      Typing "joy" offers Where Your Joy Lives under Questionnaires, and
 *      choosing it lands on Assign an Assessment with the field pre-filled
 *      and the list already filtered to that row.
 *   4. The check-in chart draws her real logged days with real holes on the
 *      days she did not check in, and the day by day list is still reachable.
 *   5. The assign flow still works end to end from a filtered row.
 *   6. The member's own Home is unchanged.
 *   7. Zero console errors and zero em dashes on every screen visited.
 *
 * ONE DELIBERATE SUBSTITUTION, AND IT IS THE ONLY ONE. Check 5 is the only
 * check that WRITES anything, and it is run against the seeded test
 * fixture rather than against Cat. Cat is a real member with a real
 * mailbox who signed in today, and an assignment is not a private
 * rehearsal: it appears on her phone, it is what the daily notification
 * job reads, and cancelling it afterwards leaves a withdrawn row on her
 * ledger forever rather than leaving her account clean. Every read-only
 * check above runs on Cat's own page, against her own data, as asked.
 *
 * Environment:
 *   BASE_URL         default https://app.mefwellness.com
 *   STAFF_EMAIL      the coach whose caseload holds both accounts
 *   CLIENT_ID        the client to READ (Cat)
 *   ASSIGN_CLIENT_ID the seeded test client to WRITE to
 *   TEST_MEMBER_EMAIL           the member whose Home is checked
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const CLIENT_ID = process.env.CLIENT_ID;
const ASSIGN_CLIENT_ID = process.env.ASSIGN_CLIENT_ID;
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/detail-sections';

const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';

const SECTIONS = [
  { id: 'detail-section-intelligence', title: 'Intelligence and Signals', proof: 'Coaching Insights' },
  { id: 'detail-section-assessments', title: 'Assessments and Findings', proof: 'Assign an Assessment' },
  { id: 'detail-section-progress', title: 'Progress and History', proof: 'Check-in History' },
  { id: 'detail-section-weekly-reflection', title: 'Weekly Reflection', proof: 'Weekly Reflection' },
  { id: 'detail-section-coach-tools', title: 'Coach Tools', proof: 'Coach Notes' },
  { id: 'detail-section-app-controls', title: 'App Controls', proof: 'Daily Wellness Index' },
];

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

async function visibleText(page) {
  return page.evaluate(() => document.body.innerText ?? '');
}

/**
 * innerText reports the text as CSS TRANSFORMED it, not as it was written.
 *
 * Every group label and card heading on this page carries `uppercase`, so
 * "On this page" reads back as "ON THIS PAGE" and a case sensitive match
 * fails against a screen that is perfectly correct. Same trap as the
 * 2026-09-06 note about it. Every text assertion here is deliberately
 * case insensitive for that reason.
 */
function says(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** The header button for one section, addressed by the section's own accessible name. */
function header(page, section) {
  return page.locator(`section[aria-label="${section.title}"] > button`);
}

async function main() {
  if (!canMintSessions() || !STAFF_EMAIL || !CLIENT_ID || !ASSIGN_CLIENT_ID) {
    console.error('Set STAFF_EMAIL, CLIENT_ID, ASSIGN_CLIENT_ID and the PROD_* key paths.');
    process.exit(2);
  }
  mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const errors = [];
  const emDashes = [];
  let staff = null;
  let member = null;

  try {
    staff = await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!staff) throw new Error(`Could not mint a session for ${STAFF_EMAIL}`);
    const page = await staff.context.newPage();
    watch(page, errors);

    /* ---------- 1. It arrives folded ---------- */
    const detailUrl = `${BASE}/coach/clients/${CLIENT_ID}/detail`;
    await page.goto(detailUrl, { waitUntil: 'networkidle' });
    await shot(page, '01-arrives-folded');

    const headerCount = await page.locator('section[id^="detail-section-"] > button').count();
    check('six section headers are on the page', headerCount === 6, `found ${headerCount}`);

    const collapsed = await page
      .locator('section[id^="detail-section-"] > button[aria-expanded="false"]')
      .count();
    check('every section arrives folded', collapsed === 6, `${collapsed} folded`);

    const firstScreen = await visibleText(page);
    check(
      'no panel contents are in the document while folded',
      !firstScreen.includes('Assign a questionnaire for this client to complete'),
      'the Assign panel description is absent'
    );

    for (const section of SECTIONS) {
      const digest = await page
        .locator(`section[aria-label="${section.title}"] > button p, section[aria-label="${section.title}"] > button span`)
        .allInnerTexts();
      const joined = digest.join(' ').replace(/\s+/g, ' ').trim();
      const hasLine = joined.replace(section.title, '').trim().length > 0;
      check(`"${section.title}" carries a digest line`, hasLine, joined.slice(0, 90));
    }

    const dots = await page
      .locator('section[id^="detail-section-"] > button [role="img"]')
      .count();
    check('every header carries a status dot', dots === 6, `${dots} dots`);

    const dotLabels = await page
      .locator('section[id^="detail-section-"] > button [role="img"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
    check(
      'the dot is labelled, never colour alone',
      dotLabels.every((l) => typeof l === 'string' && l.length > 0),
      dotLabels.join(' | ')
    );

    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    check('the folded page is about one screen tall', pageHeight < 1600, `${pageHeight}px`);
    note(`folded page height ${pageHeight}px against a ${PHONE.height}px viewport`);

    /* ---------- 2. Every section opens and folds ---------- */
    for (const section of SECTIONS) {
      const button = header(page, section);
      await button.click();
      await page.locator(`#${section.id}-content`).waitFor({ state: 'visible', timeout: 8000 });
      const text = await page.locator(`#${section.id}-content`).innerText();
      check(
        `"${section.title}" opens onto ${section.proof}`,
        new RegExp(section.proof.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text),
        text.replace(/\s+/g, ' ').slice(0, 70)
      );
      await shot(page, `02-open-${section.id}`);
      await button.click();
      await page.locator(`#${section.id}-content`).waitFor({ state: 'detached', timeout: 8000 });
      check(`"${section.title}" folds again on a second tap`, true);
      const t = await visibleText(page);
      if (t.includes(EM_DASH)) emDashes.push(`${section.title} :: ${t.slice(t.indexOf(EM_DASH) - 40, t.indexOf(EM_DASH) + 40)}`);
    }

    /* ---------- 3. The pinned search ---------- */
    const field = page.locator('[data-detail-page-search="true"] input');
    check('the pinned search is on the page', (await field.count()) === 1);

    const searchTop = await page
      .locator('[data-detail-page-search="true"]')
      .evaluate((n) => n.getBoundingClientRect().top);
    const firstSectionTop = await page
      .locator(`#${SECTIONS[0].id}`)
      .evaluate((n) => n.getBoundingClientRect().top);
    check('it sits above the first section', searchTop < firstSectionTop);

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);
    const stuckTop = await page
      .locator('[data-detail-page-search="true"]')
      .evaluate((n) => n.getBoundingClientRect().top);
    check('it stays on screen after scrolling', stuckTop >= 0 && stuckTop < 120, `top ${Math.round(stuckTop)}px`);
    await page.evaluate(() => window.scrollTo(0, 0));

    await field.fill('coach notes');
    await page.waitForTimeout(200);
    await shot(page, '03-search-page-results');
    const dropdown = page.locator('[aria-label="Search results"]');
    check(
      'typing shows results grouped under On this page',
      says(await dropdown.innerText(), 'On this page')
    );

    await dropdown.getByRole('button', { name: /Coach Notes/i }).first().click();
    await page.waitForTimeout(900);
    const toolsOpen = await page.locator('#detail-section-coach-tools-content').count();
    check('choosing a page result opens the section that holds it', toolsOpen === 1);
    const notesInView = await page
      .locator('#detail-card-coach-notes')
      .evaluate((n) => {
        const r = n.getBoundingClientRect();
        return r.top > -200 && r.top < window.innerHeight;
      })
      .catch(() => false);
    check('and scrolls to the card itself', notesInView === true);
    await shot(page, '04-jumped-to-coach-notes');

    await field.fill('joy');
    await page.waitForTimeout(250);
    const questionnaireRow = page.locator('[data-questionnaire-result]', {
      hasText: 'Where Your Joy Lives',
    });
    check(
      'typing "joy" offers Where Your Joy Lives under Questionnaires',
      (await questionnaireRow.count()) > 0 && says(await dropdown.innerText(), 'Questionnaires')
    );
    await shot(page, '05-search-questionnaires');

    await questionnaireRow.first().click();
    await page.waitForTimeout(1200);
    const assignPanel = page.locator('section[aria-label="Assign an Assessment"]');
    check('choosing it opens Assign an Assessment', (await assignPanel.count()) === 1);
    const prefilled = await assignPanel.locator('input[type="search"]').inputValue();
    check('the panel\'s own field arrives pre-filled', prefilled === 'joy', `"${prefilled}"`);
    const rows = await assignPanel
      .locator('[aria-label="Questionnaires for this client"] > *')
      .allInnerTexts();
    check(
      'and its list is already filtered to that row',
      rows.length > 0 && rows.every((r) => /Where Your Joy Lives/i.test(r)),
      `${rows.length} row(s)`
    );
    await shot(page, '06-assign-prefilled');

    await field.fill('zzzznothinghere');
    await page.waitForTimeout(200);
    check(
      'a query nothing answers says one honest line',
      says(await dropdown.innerText(), 'Nothing on this page matches that.')
    );
    await field.fill('');

    /* ---------- 4. The check-in chart ---------- */
    await page.reload({ waitUntil: 'networkidle' });
    await header(page, SECTIONS[2]).click();
    await page.locator('#detail-card-checkin-history').waitFor({ state: 'visible' });
    await page.locator('#detail-card-checkin-history').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, '07-checkin-chart');

    const chartCard = page.locator('#detail-card-checkin-history');
    const chartText = await chartCard.innerText();
    check(
      'the chart labels its two scales',
      says(chartText, 'Mood, Energy, Stress (1 to 5)') && says(chartText, 'Sleep (hours)'),
      chartText.replace(/\s+/g, ' ').slice(0, 110)
    );
    check(
      'the legend names all four series',
      ['Mood', 'Energy', 'Stress', 'Sleep'].every((label) => says(chartText, label))
    );

    const pathCount = await chartCard.locator('svg path').count();
    check('the lines are drawn', pathCount > 0, `${pathCount} paths`);
    check(
      'the lines break rather than joining across a day she skipped',
      /days? in this span (has|have) no check-in/.test(chartText),
      (chartText.match(/\d+ days? in this span[^.]*/) ?? [''])[0]
    );
    check(
      'more than one path per series, which is what a real hole looks like',
      pathCount > 4,
      `${pathCount} paths for four series`
    );

    await chartCard.getByRole('button', { name: 'Show all days' }).click();
    await page.waitForTimeout(250);
    const listed = await chartCard.locator('li').count();
    check('the full day by day list is still reachable', listed > 0, `${listed} days listed`);
    await shot(page, '08-checkin-list');

    const detailText = await visibleText(page);
    if (detailText.includes(EM_DASH)) emDashes.push(`client detail :: ${detailText.slice(detailText.indexOf(EM_DASH) - 40, detailText.indexOf(EM_DASH) + 40)}`);

    /* ---------- the deep link the coach brief still uses ---------- */
    await page.goto(`${detailUrl}#member-visibility`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const visibilityOpen = await page.locator('#detail-section-app-controls-content').count();
    check('the coach brief deep link still opens the panel it points at', visibilityOpen === 1);
    await shot(page, '09-deep-link-member-visibility');

    /* ---------- 5. The assign flow, on the test fixture ---------- */
    const assignUrl = `${BASE}/coach/clients/${ASSIGN_CLIENT_ID}/detail`;
    await page.goto(assignUrl, { waitUntil: 'networkidle' });
    await page.locator('[data-detail-page-search="true"] input').fill('joy');
    await page.waitForTimeout(250);
    await page.locator('[data-questionnaire-result]', { hasText: 'Where Your Joy Lives' }).first().click();
    await page.waitForTimeout(1200);
    const fixturePanel = page.locator('section[aria-label="Assign an Assessment"]');
    const beforeRows = await fixturePanel.locator('> div:last-of-type > div').count();
    // Where Your Joy Lives is assigned from its own card, so this proves
    // the row is reachable and honest about where its button is, and the
    // WRITE below is done through a row this panel can really send.
    check(
      'a row this panel cannot send says where its button is',
      /Assigned from its own card on this page/.test(await fixturePanel.innerText())
    );

    await fixturePanel.locator('input[type="search"]').fill('Whole-Body');
    await page.waitForTimeout(250);
    const sendable = fixturePanel.locator('[aria-label="Questionnaires for this client"] button').first();
    const sendableName = (await sendable.innerText()).split('\n')[0];
    await sendable.click();
    await page.waitForTimeout(200);
    check('a sendable row can be selected', /Selected:/.test(await fixturePanel.innerText()), sendableName);

    await fixturePanel.getByRole('button', { name: 'Assign' }).click();
    await fixturePanel
      .locator('text=Pending')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
    const afterRows = await fixturePanel.locator('> div:last-of-type > div').count();
    check('assigning adds a row to the ledger', afterRows > beforeRows, `${beforeRows} then ${afterRows}`);
    await shot(page, '10-assigned');

    /*
      The wait is on the withdrawn row appearing, not on a clock. An
      earlier run gave this a fixed 2.5 seconds, screenshotted a server
      action that was still in flight, and reported a FAIL against a
      cancel the database had actually recorded.
    */
    const cancelledRow = fixturePanel.locator('div', { hasText: /^Cancelled/ });
    await fixturePanel.getByRole('button', { name: 'Cancel' }).first().click();
    let cancelled = false;
    try {
      await cancelledRow.first().waitFor({ state: 'visible', timeout: 20000 });
      cancelled = true;
    } catch {
      cancelled = /Cancelled/.test(await fixturePanel.innerText());
    }
    check('cancelling withdraws it again', cancelled);
    note(`the fixture account keeps one withdrawn "${sendableName}" row, which is what a cancel leaves behind`);
    await shot(page, '11-cancelled');

    await page.close();

    /* ---------- 6. The member's own Home ---------- */
    if (MEMBER_EMAIL) {
      member = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
      if (member) {
        const home = await member.context.newPage();
        watch(home, errors);
        await home.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
        await home.waitForTimeout(1500);
        const homeText = await visibleText(home);
        check('the member Home still loads', homeText.length > 200, `${homeText.length} characters`);
        check(
          'nothing from this build reached a member screen',
          !/detail-section-|detail-page-search|Intelligence and Signals/.test(
            await home.evaluate(() => document.body.innerHTML)
          )
        );
        if (homeText.includes(EM_DASH)) emDashes.push(`member Home :: ${homeText.slice(homeText.indexOf(EM_DASH) - 40, homeText.indexOf(EM_DASH) + 40)}`);
        await shot(home, '12-member-home');
        await home.close();
      } else {
        note(`could not mint a member session for ${MEMBER_EMAIL}, Home not checked`);
      }
    }

    check('zero console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('zero em dashes on any screen visited', emDashes.length === 0, emDashes.slice(0, 2).join(' | '));
  } catch (error) {
    check('the run completed', false, error.message);
    console.error(error);
  } finally {
    if (staff) await retireSession(staff).catch(() => {});
    if (member) await retireSession(member).catch(() => {});
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`  FAILED: ${f.name}`);
  console.log(`screenshots in ${SHOTS}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
