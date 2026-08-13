#!/usr/bin/env node
// Live verification for Adaptive Coaching Direction, Part 3 (the grading
// loop, the per-member preference layer, and the coach escalation surface)
// against production.
//
// TWO PHASES, deliberately separated, exactly as the Part 2 script does,
// because the second depends on migration 152 being applied to the
// production database and the first does not:
//
//   PHASE A  The feature is deployed and the member-facing app is
//            UNHARMED. Runs whether or not the migration has landed, and
//            it is the check that matters most while the code ships ahead
//            of the migration: every new read fails closed, so a member
//            sees exactly what she saw before. The Priority Card still
//            appears and behaves, the weekly review still opens from Home,
//            and the review's new grade sentences are correctly ABSENT for
//            an account whose data is too thin to earn them.
//
//   PHASE B  The coach side: the client detail page renders, and the "Root
//            has flagged" section is present. For an account with no
//            escalated threads it must be present and EMPTY, which is the
//            state every production account is in today. Requires
//            migration 152 for the section to read real rows at all;
//            without it the section still renders empty, which is the
//            correct dormant behavior and is reported as such.
//
// Usage:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-coaching-grades-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const PRIORITY_LABEL = 'your priority today';
const REVIEW_LABEL = 'your week with root';
const FLAGGED_LABEL = 'root has flagged';

/**
 * Phrases only the Part 3 grade sentences can produce. Their ABSENCE is
 * what this run asserts for a thin account, so they are matched on the
 * distinctive fragment rather than on a whole sentence, which would let a
 * copy tweak turn a real regression into a passing check.
 */
const GRADE_PHRASES = [
  'looking back further than this week',
  'stop leading with',
  'is going to offer it once more',
];

const checks = [];
const issues = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` :: ${detail}` : ''}`);
}

function note(name, detail) {
  checks.push({ name, passed: null, detail });
  console.log(`  [SKIP] ${name} :: ${detail}`);
}

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push({ label, text: m.text() });
  });
  page.on('pageerror', (e) => issues.push({ label, text: `pageerror: ${e.message}` }));
  page.on('response', (r) => {
    if (r.status() >= 500) issues.push({ label, text: `http${r.status()} ${r.url()}` });
  });
}

/** Dismisses whatever single pop-up owns the screen, if one does. */
async function clearPopup(page) {
  const dialog = page.locator('[role="dialog"]').first();
  if ((await dialog.count()) === 0) return null;
  const text = ((await dialog.innerText().catch(() => '')) || '').toLowerCase();
  // Deliberately NOT 'Done' or 'Continue'. The Priority Card's own pop-up
  // carries a Done button, and a verification pass must never complete a
  // member's priority as a side effect of tidying the screen.
  for (const label of ['Maybe later', 'Got it', 'Not now', 'Close', 'Dismiss']) {
    const button = dialog.getByRole('button', { name: label, exact: false }).first();
    if ((await button.count()) > 0) {
      await button.click().catch(() => {});
      await page.waitForTimeout(700);
      break;
    }
  }
  return text;
}

async function bodyText(page) {
  return ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase();
}

async function main() {
  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // PHASE A — the member-facing app is unharmed.
  // -------------------------------------------------------------------
  console.log(`\nPHASE A: member-facing app unchanged (${BASE_URL})\n`);

  for (const account of [ACCOUNTS.memberPopulated, ACCOUNTS.memberEmpty]) {
    console.log(`\n  ${account.label}`);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    attach(page, account.label);

    try {
      await login(page, BASE_URL, account);
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const popupText = await clearPopup(page);
      check(`${account.label}: signed in and Home rendered`, page.url().includes('/dashboard'));

      const home = await bodyText(page);
      check(
        `${account.label}: Home has real content, not an error page`,
        home.length > 400 && !home.includes('application error'),
        `${home.length} chars`
      );

      // The Priority Card. Part 3 changes how its content is CHOSEN when a
      // rung ties; it must still appear and still behave.
      const seenPriority = home.includes(PRIORITY_LABEL) || (popupText ?? '').includes(PRIORITY_LABEL);
      check(`${account.label}: the Priority Card is still present`, seenPriority);

      if (home.includes(PRIORITY_LABEL)) {
        // The card has three live states and only one of them shows the
        // three action buttons. A priority already completed today renders
        // "Done today." with no actions, and one saved for later renders a
        // single Done. Asserting the buttons unconditionally would report a
        // member who did her thing this morning as a regression.
        const actionable = await page
          .getByRole('button', { name: /^(done|help me|save for later)$/i })
          .count();
        const settled = home.includes('done today') || home.includes('saved for later');
        check(
          `${account.label}: the card is in a real, coherent state`,
          actionable > 0 || settled,
          actionable > 0 ? `${actionable} action buttons` : 'already completed today, so no actions is correct'
        );
      } else {
        note(`${account.label}: Priority Card state`, 'the card arrived as the pop-up, already dismissed above');
      }

      // The weekly review, and the absence of grade sentences.
      const reviewOnHome = home.includes(REVIEW_LABEL) || (popupText ?? '').includes(REVIEW_LABEL);
      if (reviewOnHome) {
        check(`${account.label}: the weekly review is still reachable from Home`, true);
      } else {
        note(
          `${account.label}: weekly review on Home`,
          'not present this visit; the review is week-scoped, so an already-acknowledged week can legitimately show nothing'
        );
      }

      // THE CENTRAL PHASE A ASSERTION. These accounts' data is thin, and
      // thin evidence must produce no grade sentence at all.
      const combined = `${home} ${popupText ?? ''}`;
      const leaked = GRADE_PHRASES.filter((phrase) => combined.includes(phrase));
      check(
        `${account.label}: no grade sentence appears, which thin evidence requires`,
        leaked.length === 0,
        leaked.length ? `leaked: ${leaked.join(', ')}` : 'none of the three phrases present'
      );

      // Nothing member-facing should have gained a coach-only surface.
      check(
        `${account.label}: the coach escalation section is not on a member screen`,
        !combined.includes(FLAGGED_LABEL)
      );
    } catch (error) {
      check(`${account.label}: phase A completed`, false, error.message);
    } finally {
      await context.close();
    }
  }

  // -------------------------------------------------------------------
  // PHASE B — the coach escalation section.
  // -------------------------------------------------------------------
  console.log('\n\nPHASE B: the coach escalation section\n');

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  attach(page, 'coach');

  try {
    await login(page, BASE_URL, ACCOUNTS.coach);
    await page.goto(`${BASE_URL}/coach`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await clearPopup(page);

    check('coach: signed in and the client list rendered', page.url().includes('/coach'));

    // Open the first assigned client. The link shape is /coach/clients/<uuid>.
    const clientLink = page.locator('a[href^="/coach/clients/"]').first();
    const hasClient = (await clientLink.count()) > 0;
    check('coach: has at least one assigned client to open', hasClient);

    if (hasClient) {
      await clientLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await clearPopup(page);

      const detail = await bodyText(page);
      check(
        'coach: the client detail view renders',
        page.url().includes('/coach/clients/') && detail.length > 800,
        `${detail.length} chars`
      );

      const sectionPresent = detail.includes(FLAGGED_LABEL);
      check('coach: the "Root has flagged" section is present', sectionPresent);

      if (sectionPresent) {
        const empty = detail.includes('nothing is flagged for this client right now');
        check(
          'coach: it is present and EMPTY, correct for an account with no escalated threads',
          empty,
          empty ? 'empty state rendered' : 'a flagged thread is listed, which this account should not have'
        );

        // Scoped to this section on purpose. MemberIntelligencePanel has
        // carried its own "Resolve" button for coach alerts since migration
        // 34, so a page-wide selector counts someone else's feature.
        const section = page.locator('section', { hasText: /Root has flagged/i }).first();
        const resolveButtons = await section.getByRole('button', { name: /^resolve$/i }).count();
        check(
          'coach: no Resolve button inside this section, since there is nothing to resolve',
          resolveButtons === 0,
          `${resolveButtons} buttons in section`
        );
      }
    }
  } catch (error) {
    check('coach: phase B completed', false, error.message);
  } finally {
    await context.close();
  }

  await browser.close();

  // -------------------------------------------------------------------
  console.log('\n\nRESULT\n');
  const passed = checks.filter((c) => c.passed === true).length;
  const failed = checks.filter((c) => c.passed === false);
  const skipped = checks.filter((c) => c.passed === null).length;
  console.log(`  ${passed} passed, ${failed.length} failed, ${skipped} skipped`);

  if (failed.length > 0) {
    console.log('\n  FAILURES');
    for (const f of failed) console.log(`    - ${f.name}${f.detail ? ` :: ${f.detail}` : ''}`);
  }

  if (issues.length > 0) {
    console.log(`\n  CONSOLE / PAGE / 5xx ISSUES (${issues.length})`);
    for (const i of issues.slice(0, 20)) console.log(`    [${i.label}] ${i.text}`);
  } else {
    console.log('\n  No console errors, page errors or 5xx responses.');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
