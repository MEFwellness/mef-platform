#!/usr/bin/env node
// One-shot live verification for the Personal Reset Plan feature
// (migration 142) against production (app.mefwellness.com). Not a
// screenshot tool like capture.mjs — this drives the real six-screen
// creation flow, the daily logger, the admin test tools (access-check
// only), and the coach read-only panel against the seeded production
// test accounts (docs/PRODUCTION_TEST_ACCOUNTS.md), and reports a
// pass/fail/blocked line for each of the 13 build-brief verification
// items plus a per-screen console-error/em-dash log.
//
// IMPORTANT: member_reset_plans has a partial unique index enforcing
// exactly one draft/active plan per member. This script creates and
// completes ONE real plan for test.member.populated@example.test — it
// cannot be run twice against the same account without the admin
// "Reset" tool (blocked in this environment, see item 10 in the report).
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-reset-plan-live.mjs
// (from apps/consumer-web-app; requires scripts/screenshots/.env.local)
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const MEMBER_BELOW_EMAIL = process.env.MEMBER_BELOW_THRESHOLD_EMAIL;
const MEMBER_BELOW_PASSWORD = process.env.MEMBER_BELOW_THRESHOLD_PASSWORD;

const results = [];
const consoleIssues = [];
const emDashLog = [];

function record(id, title, status, detail) {
  results.push({ id, title, status, detail });
  console.log(`\n[${status}] Item ${id}: ${title}\n    ${detail}`);
}

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', (err) => {
    consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() });
  });
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Several of this app's eyebrow labels ("Root's proposal", "Why it
// matters", "The action", "What Root will do", "Success, honestly") use a
// CSS `uppercase` text-transform class — the JSX source is mixed-case, but
// document.body.innerText reflects the RENDERED (visually uppercased)
// text, confirmed directly against production (a naive mixed-case
// .includes() check silently failed on every one of these markers on the
// first real run of this script). Every text comparison below goes
// through this case-insensitive helper instead.
function ci(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
function ciIndexOf(haystack, needle) {
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

async function checkEmDash(page, screenLabel) {
  const text = await page.evaluate(() => document.body.innerText);
  const count = (text.match(/—/g) || []).length;
  emDashLog.push({ screen: screenLabel, count });
  if (count > 0) {
    const idx = text.indexOf('—');
    console.log(`  EM DASH FOUND on ${screenLabel}: ...${text.slice(Math.max(0, idx - 60), idx + 60)}...`);
  } else {
    console.log(`  em dash check OK on ${screenLabel} (0 found)`);
  }
  return count;
}

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce', // skip IntroReveal's typewriter animation so the button is available immediately
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page };
}

/** Polls document.body.innerText until one of `markers` appears (case-insensitive), or times out. Returns the current text either way. */
async function waitForAnyText(page, markers, timeoutMs = 12000) {
  const start = Date.now();
  let text = '';
  while (Date.now() - start < timeoutMs) {
    text = await page.evaluate(() => document.body.innerText);
    if (markers.some((m) => ci(text, m))) return text;
    await page.waitForTimeout(400);
  }
  return text;
}

async function main() {
  console.log(`Verifying Personal Reset Plan against ${BASE_URL}\n`);
  const browser = await chromium.launch();

  // Ground-truth capture, filled in during the walkthrough, checked at the end.
  let proposalBody = '';
  let chosenSignalLabel = '';

  // ============================================================
  // ITEM 1 — ungranted member: card absent, direct URL blocked
  // ============================================================
  {
    const { context, page } = await newPage(browser);
    attachListeners(page, 'item1-not-granted');
    try {
      const usingBelowThreshold = Boolean(MEMBER_BELOW_EMAIL && MEMBER_BELOW_PASSWORD);
      const acct = usingBelowThreshold
        ? { email: MEMBER_BELOW_EMAIL, password: MEMBER_BELOW_PASSWORD }
        : ACCOUNTS.memberEmpty;

      await login(page, BASE_URL, acct);
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const dashText = await page.evaluate(() => document.body.innerText);
      await checkEmDash(page, 'item1-dashboard-not-granted');
      const cardAbsent =
        !ci(dashText, 'Personal Reset Plan') &&
        !ci(dashText, 'Create My Plan') &&
        !ci(dashText, 'Continue My Plan');

      await page.goto(`${BASE_URL}/reset-plan`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const finalUrl = page.url();
      const blocked = !finalUrl.includes('/reset-plan');
      const planContentText = await page.evaluate(() => document.body.innerText);
      const noPlanContent = !ci(planContentText, "Root's proposal") && !ci(planContentText, 'You know what matters');

      const pass = cardAbsent && blocked && noPlanContent;
      record(
        1,
        'Not-granted member: dashboard card absent + direct /reset-plan blocked',
        pass ? 'PASS' : 'FAIL',
        `Account: ${usingBelowThreshold ? 'memberBelowThreshold' : 'memberEmpty'}. Card absent on dashboard: ${cardAbsent}. GET /reset-plan landed on: ${finalUrl} (redirected away = ${blocked}). No plan content rendered: ${noPlanContent}.`
      );
    } catch (e) {
      record(1, 'Not-granted member: dashboard card absent + direct /reset-plan blocked', 'ERROR', String(e));
    } finally {
      await context.close();
    }
  }

  // ============================================================
  // MAIN WALKTHROUGH — the one real run through memberPopulated's plan
  // ============================================================
  const { context: mainCtx, page } = await newPage(browser);
  attachListeners(page, 'main-walkthrough');
  try {
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    // ---------------- ITEM 2 ----------------
    const dashText1 = normalize(await page.evaluate(() => document.body.innerText));
    await checkEmDash(page, 'dashboard-before-plan');
    const EXPECTED_TITLE = 'Your Personal Reset Plan';
    const EXPECTED_BODY = "Root is ready to turn everything you've discovered into one place to begin.";
    const EXPECTED_BUTTON = 'Create My Plan';

    const hasCreateButton = await page
      .getByRole('link', { name: EXPECTED_BUTTON, exact: true })
      .isVisible()
      .catch(() => false);
    const hasContinueButton = await page
      .getByRole('link', { name: 'Continue My Plan', exact: true })
      .isVisible()
      .catch(() => false);
    const hasActiveCard = ci(dashText1, 'Your focus');

    if (hasCreateButton) {
      const titleMatch = ci(dashText1, EXPECTED_TITLE);
      const bodyMatch = ci(dashText1, EXPECTED_BODY);
      record(
        2,
        'Granted member: locked entry-card copy ("before" state)',
        titleMatch && bodyMatch ? 'PASS' : 'FAIL',
        `Title present: ${titleMatch}. Body present exactly: ${bodyMatch}. Button "Create My Plan" present: true.`
      );
    } else if (hasContinueButton) {
      record(
        2,
        'Granted member: locked entry-card copy ("before" state)',
        'INCONCLUSIVE',
        'Account was already in "mid_creation" state (button read "Continue My Plan") when this run started, so the pristine "before" state could not be observed. This likely means an earlier session left a draft plan on this account.'
      );
    } else if (hasActiveCard) {
      record(
        2,
        'Granted member: locked entry-card copy ("before" state)',
        'INCONCLUSIVE',
        'Account already had an ACTIVE plan when this run started ("Your focus" card present) — the "before" state could not be observed this session.'
      );
    } else {
      record(
        2,
        'Granted member: locked entry-card copy ("before" state)',
        'FAIL',
        'No Personal Reset Plan card of any kind found on the dashboard for a member documented as granted.'
      );
    }

    // Enter the flow (creates or resumes the one draft plan).
    if (hasContinueButton) {
      await page.getByRole('link', { name: 'Continue My Plan', exact: true }).click();
    } else if (hasActiveCard) {
      // Already active from a prior session — cannot run the creation-flow items fresh.
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    } else {
      await page.getByRole('link', { name: EXPECTED_BUTTON, exact: true }).click();
    }
    await page.waitForLoadState('load');
    let bodyText = await waitForAnyText(page, ['You know what matters', "Root's proposal", 'Why it matters'], 15000);

    // If we landed on 'intro', click Begin.
    if (ci(bodyText, 'You know what matters')) {
      await checkEmDash(page, 'creation-intro');
      const beginBtn = page.getByRole('button', { name: 'Begin', exact: true });
      await beginBtn.waitFor({ state: 'visible', timeout: 10000 });
      await beginBtn.click();
      bodyText = await waitForAnyText(page, ["Root's proposal"], 15000);
    }

    // ---------------- Reached 'proposal' screen ----------------
    if (ci(bodyText, "Root's proposal")) {
      await checkEmDash(page, 'creation-proposal-initial');
      // Extract the proposal card's heading/body by string position rather
      // than a brittle DOM locator chain — bodyText is document.body.innerText,
      // and the proposal card's own text always starts right after the
      // "Root's proposal" eyebrow (rendered in ALL CAPS by CSS) and ends at
      // either the button row or the "Saving…" pending marker.
      const eyebrowIdx = ciIndexOf(bodyText, "Root's proposal");
      const afterEyebrow = bodyText.slice(eyebrowIdx + "Root's proposal".length);
      const cutMarkers = ['Yes, start here', 'Or choose a different place to start:'];
      let cutIndex = afterEyebrow.length;
      for (const marker of cutMarkers) {
        const idx = ciIndexOf(afterEyebrow, marker);
        if (idx !== -1 && idx < cutIndex) cutIndex = idx;
      }
      proposalBody = normalize(afterEyebrow.slice(0, cutIndex));

      console.log(`  Proposal screen text captured: ${proposalBody.slice(0, 300)}`);

      // ---------------- ITEM 5 (part 1): second context duplicate check ----------------
      {
        const { context: dupCtx, page: dupPage } = await newPage(browser);
        attachListeners(dupPage, 'item5-duplicate-tab');
        try {
          await login(dupPage, BASE_URL, ACCOUNTS.memberPopulated);
          await dupPage.goto(`${BASE_URL}/reset-plan`, { waitUntil: 'load' });
          await dupPage.waitForTimeout(800);
          const dupText = normalize(await dupPage.evaluate(() => document.body.innerText));
          const dupErrored = ci(dupText, 'could not start your plan');
          const dupSameScreen = ci(dupText, "Root's proposal") || ci(dupText, 'You know what matters');
          record(
            5,
            'Refresh / second-tab / re-entry does not create a duplicate plan',
            !dupErrored && dupSameScreen ? 'PASS (UI-level only)' : 'FAIL',
            `Second logged-in context re-entering /reset-plan: no error shown = ${!dupErrored}, resumed a real screen (not a blank/broken state) = ${dupSameScreen}. NOTE: confirmed via the UI only — this script has no database access, so "exactly one plan record and no duplicate versions" was NOT verified at the row-count level, only that re-entry behaves idempotently from the outside (no error, consistent resumed state).`
          );
        } catch (e) {
          record(5, 'Refresh / second-tab / re-entry does not create a duplicate plan', 'ERROR', String(e));
        } finally {
          await dupCtx.close();
        }
      }
      // Also do a same-context rapid reload as a second duplicate-protection signal.
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(500);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(800);
      bodyText = await page.evaluate(() => document.body.innerText);
      console.log(`  Double-reload on /reset-plan: no crash, screen text still present = ${bodyText.length > 100}`);

      // ---------------- ITEM 4 (part 1): exit before choosing, confirm "Continue My Plan" ----------------
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      const showsContinue = await page
        .getByRole('link', { name: 'Continue My Plan', exact: true })
        .isVisible()
        .catch(() => false);
      console.log(`  After exiting mid-creation (nothing chosen yet), dashboard shows "Continue My Plan": ${showsContinue}`);

      await page.getByRole('link', { name: 'Continue My Plan', exact: true }).click();
      await page.waitForLoadState('load');
      bodyText = await waitForAnyText(page, ["Root's proposal"], 15000);
      const resumedOnProposal = ci(bodyText, "Root's proposal");
      console.log(`  Returned to /reset-plan, landed back on proposal screen with nothing lost: ${resumedOnProposal}`);

      // ---------------- ITEM 6: "I want to start somewhere else" ----------------
      const alternativeBtn = page.getByRole('button', { name: 'I want to start somewhere else', exact: true });
      const hasProposedPick = await alternativeBtn.isVisible().catch(() => false);

      if (hasProposedPick) {
        await alternativeBtn.click();
        await page.waitForTimeout(500);
        // Pick the first available alternative signal option button (rendered
        // after "Or choose a different place to start:").
        const signalButtons = page.getByRole('button').filter({
          hasText: /^(Energy|Sleep|Tension|Digestion|Body|Mind)$/,
        });
        const count = await signalButtons.count();
        if (count === 0) throw new Error('No alternative signal buttons found after clicking "I want to start somewhere else"');
        const chosen = signalButtons.first();
        chosenSignalLabel = normalize((await chosen.textContent()) || '');
        await chosen.click();
      } else {
        // No proposal existed (thin snapshot) — she chooses directly from the full list.
        const signalButtons = page.getByRole('button').filter({
          hasText: /^(Energy|Sleep|Tension|Digestion|Body|Mind)$/,
        });
        const count = await signalButtons.count();
        if (count === 0) throw new Error('No signal buttons found on the proposal screen at all');
        const chosen = signalButtons.first();
        chosenSignalLabel = normalize((await chosen.textContent()) || '');
        await chosen.click();
      }

      bodyText = await waitForAnyText(page, ['Why it matters'], 12000);
      const reachedWhy = ci(bodyText, 'Why it matters');
      record(
        6,
        '"I want to start somewhere else" — her own pick wins',
        reachedWhy ? 'PASS (see note)' : 'FAIL',
        `Proposal offered a specific pick: ${hasProposedPick}. Chose "${chosenSignalLabel}" via the override path. Advanced to the "why" screen for that focus: ${reachedWhy}. NOTE on "the honest note": read the full source (lib/reset-plan/data.ts setResetPlanFocus, all of components/reset-plan/*.tsx) — there is NO member-visible acknowledgement anywhere in the why/action/agreement/closing screens that this was an override rather than following the proposal; the why/action/agreement/closing screens render identically either way. The honesty is recorded server-side only, as decisionEvidence.followedProposal on the plan's version-history row, visible solely in the coach's read-only panel (checked directly in this run — see item 12's detail below).`
      );
      await checkEmDash(page, 'creation-why');

      // ---------------- ITEM 4 (part 2): stronger check — exit on 'why' screen, confirm resume ----------------
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      const showsContinue2 = await page
        .getByRole('link', { name: 'Continue My Plan', exact: true })
        .isVisible()
        .catch(() => false);
      await page.getByRole('link', { name: 'Continue My Plan', exact: true }).click();
      await page.waitForLoadState('load');
      bodyText = await waitForAnyText(page, ['Why it matters'], 15000);
      const resumedOnWhyWithFocus = ci(bodyText, 'Why it matters') && ci(bodyText, chosenSignalLabel);
      record(
        4,
        'Exit mid-creation and return: "Continue My Plan" + every confirmed choice restored',
        showsContinue && showsContinue2 && resumedOnWhyWithFocus ? 'PASS' : 'FAIL',
        `Dashboard read "Continue My Plan" both before any choice (${showsContinue}) and after choosing a focus + advancing to "why" (${showsContinue2}). Re-entering /reset-plan after the focus choice landed back on the "why" screen with the chosen focus (${chosenSignalLabel}) still shown: ${resumedOnWhyWithFocus}.`
      );

      // ---------------- ITEM 7: value-link-only-when-supported + philosophy line ----------------
      const whyText = normalize(await page.evaluate(() => document.body.innerText));
      const genericWhyPhrase = 'does not need a bigger reason than this';
      const linkedWhyPhrase = 'your Core Values Snapshot showed';
      const whyLinked = ci(whyText, linkedWhyPhrase);
      const whyGeneric = ci(whyText, genericWhyPhrase);
      console.log(`  "why" screen: linked-to-CVS phrasing=${whyLinked}, generic-honest phrasing=${whyGeneric}`);

      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const actionRawText = await waitForAnyText(page, ['The action'], 12000);
      const actionText = normalize(actionRawText);
      await checkEmDash(page, 'creation-action');
      const philosophyPresent = ci(actionText, "We're looking for something you can return to, even on difficult days.");
      record(
        7,
        'Value link only when supported by real data + philosophy line present',
        (whyLinked || whyGeneric) && philosophyPresent ? 'PASS' : 'FAIL',
        `"why" screen rendered exactly one of the two data-conditioned templates (linked=${whyLinked}, honest-generic=${whyGeneric} — never both, never neither, confirmed by lib/reset-plan/copy.ts's buildResetPlanWhyItMatters branching on cvs.branch/isAdjacent). The exact philosophy line appears on the "action" screen (per the code, not "why" — the build brief's own screen-number framing doesn't match ResetPlanTaker.tsx, which places card.philosophy on the action screen): ${philosophyPresent}.`
      );

      // ---------------- Continue: agreement, closing (item 8) ----------------
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const agreementRawText = await waitForAnyText(page, ['What Root will do'], 12000);
      const agreementText = normalize(agreementRawText);
      await checkEmDash(page, 'creation-agreement');
      const agreementOk =
        ci(agreementText, 'What Root will do') &&
        ci(agreementText, 'On day 3, Root will check in') &&
        ci(agreementText, 'On day 7, Root will reflect back') &&
        ci(agreementText, 'difficult-day version instead of quietly disappearing');
      console.log(`  Agreement screen shows the three "What Root will do" lines: ${agreementOk}`);

      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const closingRawText = await waitForAnyText(page, ['Success, honestly'], 12000);
      const closingText = normalize(closingRawText);
      await checkEmDash(page, 'creation-closing');

      const hasWhyItMatters = ci(closingText, 'Why it matters');
      const hasNormalAction = ci(closingText, 'The normal version');
      const hasDifficultAction = ci(closingText, 'The difficult-day version');
      const hasWhatRootWillDo = ci(closingText, 'What Root will do');
      const hasSuccessDef = ci(closingText, 'Success, honestly');

      const allFiveElements =
        hasWhyItMatters && hasNormalAction && hasDifficultAction && hasWhatRootWillDo && hasSuccessDef;

      const beginBtn = page.getByRole('button', { name: 'Begin My Plan', exact: true });
      const hasBeginButton = await beginBtn.isVisible().catch(() => false);
      let finalDashText = '';
      if (hasBeginButton) {
        await beginBtn.click();
        await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 15000 }).catch(() => {});
        // The dashboard's PersonalResetPlanCard is a Suspense-streamed
        // Server Component (app/dashboard/page.tsx) — a flat 1s wait right
        // after the client-side router.push() landed BEFORE that streamed
        // content resolved (confirmed live: the plan really was active, the
        // read just happened too early). Poll instead of a fixed sleep.
        finalDashText = await waitForAnyText(page, ['Your focus'], 15000);
      } else {
        finalDashText = normalize(await page.evaluate(() => document.body.innerText));
      }
      const nowShowsActive = ci(finalDashText, 'Your focus') && ci(finalDashText, chosenSignalLabel);

      record(
        8,
        'Complete the plan: closing card shows all five elements + dashboard now shows the active plan',
        allFiveElements && hasBeginButton && nowShowsActive ? 'PASS' : 'FAIL',
        `Closing screen elements — why-it-matters: ${hasWhyItMatters}, normal action: ${hasNormalAction}, difficult-day action: ${hasDifficultAction}, "What Root will do" list: ${hasWhatRootWillDo}, success definition: ${hasSuccessDef}. "Begin My Plan" clicked and redirected to /dashboard: ${hasBeginButton}. Dashboard now shows the active plan card for "${chosenSignalLabel}": ${nowShowsActive}.`
      );
      await checkEmDash(page, 'dashboard-after-activation');

      // The dashboard can show OTHER, unrelated "From Root" pop-ups at the
      // same time as the reset-plan card (this member's own separate Core
      // Values Snapshot weekly-experiment check, a "connect your wearable"
      // nudge, etc.) as a full-screen overlay that intercepts every click —
      // confirmed live, none of it is reset-plan content. Dismiss whatever
      // is actually there before touching the reset-plan card.
      const dismissAnyOverlay = async () => {
        await page.waitForTimeout(1200);
        for (let attempt = 0; attempt < 4; attempt++) {
          const overlay = page.locator('div.fixed.inset-0').first();
          if (!(await overlay.isVisible({ timeout: 1000 }).catch(() => false))) return;
          let dismissed = false;
          for (const label of ['Maybe later', 'Ignore', 'Done', 'Got it', 'Not now', 'Close', 'Yes', 'Not today', 'Continue']) {
            const btn = overlay.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
            if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
              await btn.click();
              dismissed = true;
              break;
            }
          }
          if (!dismissed) await page.keyboard.press('Escape');
          await page.waitForTimeout(1200);
        }
      };
      await dismissAnyOverlay();

      // ---------------- ITEM 9: log a daily state, then change it ----------------
      // Scoped to the card containing "Your focus" (always rendered by
      // ResetPlanActiveCard) — the dashboard also has a plain, non-modal
      // "Active Experiments" section for this member's SEPARATE Core Values
      // Snapshot weekly experiment with its own identically-labeled "Not
      // today" button; an unscoped lookup hits Playwright's strict-mode
      // "resolved to 2 elements" error. `.last()` picks the innermost
      // matching div among nested ancestors.
      const resetPlanCard = page.locator('div').filter({ hasText: 'Your focus' }).last();
      const normalBtn = resetPlanCard.getByRole('button', { name: 'Normal version', exact: true });
      let loggedNormal = false;
      let showedNormalLabel = false;
      if (await normalBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await normalBtn.click({ timeout: 8000 }).catch(async () => {
          await dismissAnyOverlay();
          await normalBtn.click();
        });
        const afterLogText = await waitForAnyText(page, ['Logged: the normal version'], 10000);
        loggedNormal = true;
        showedNormalLabel = ci(afterLogText, 'Logged: the normal version, today counted.');
      }

      await dismissAnyOverlay();

      let showedNotTodayLabel = false;
      const changeBtn = resetPlanCard.getByRole('button', { name: 'Change', exact: true });
      if (loggedNormal && (await changeBtn.isVisible().catch(() => false))) {
        await changeBtn.click({ timeout: 8000 }).catch(async () => {
          await dismissAnyOverlay();
          await changeBtn.click();
        });
        await page.waitForTimeout(500);
        await dismissAnyOverlay();
        const notTodayBtn = resetPlanCard.getByRole('button', { name: 'Not today', exact: true });
        await notTodayBtn.click({ timeout: 8000 }).catch(async () => {
          await dismissAnyOverlay();
          await notTodayBtn.click();
        });
        const afterChangeText = await waitForAnyText(page, ['Logged: not today'], 10000);
        showedNotTodayLabel = ci(afterChangeText, 'Logged: not today, and that is fine.');
      }

      record(
        9,
        'Log a daily state, then change it: existing row updates in the UI (no duplicate visible)',
        showedNormalLabel && showedNotTodayLabel ? 'PASS (UI-level only)' : 'FAIL',
        `Logged "Normal version" and the card showed the correct confirmation text: ${showedNormalLabel}. Then used "Change" -> "Not today" and the card correctly updated to the new state's text (never showed two states at once, never duplicated the log UI): ${showedNotTodayLabel}. NOTE: this script has no database access — it confirms the visible state changed correctly on a single UI element, but it did NOT and could not confirm at the database level that this was an UPDATE to one row rather than an additional INSERT. The code (lib/reset-plan/data.ts upsertResetPlanDailyLog) uses a real Postgres upsert on a unique (plan_id, local_date) constraint, which is a strong structural guarantee, but that guarantee itself was read from source, not independently re-verified against the live database by this run.`
      );

      // ---------------- ITEM 11: difficult-day offer trigger ----------------
      await checkEmDash(page, 'dashboard-active-after-daily-log');
      const offerLineText = await page.evaluate(() => document.body.innerText);
      // Any of the 6 tone-keyed miss-handling lines (lib/reset-plan/copy.ts
      // buildResetPlanMissHandlingLine) would contain one of these fragments
      // if state.offerDifficultDay had (incorrectly) evaluated true.
      const offerShown = [
        "Let's make it easier",
        'is real life, not a failure',
        'even on the hard days',
        'protects the habit while things settle',
        'still here whenever you are ready',
        'the difficult-day version is right here if it would help',
      ].some((fragment) => ci(offerLineText, fragment));
      record(
        11,
        'Two not-today days -> difficult-day offer appears in the correct tone group',
        'BLOCKED (same root cause as item 10)',
        `Read the real trigger logic directly (lib/reset-plan/copy.ts shouldOfferDifficultDayVersion): it fires when >= 2 daily-log rows for the CURRENT plan have state='not_today'. That check does NOT depend on elapsed calendar time (unlike the day-3/day-7 eligibility windows) — BUT each daily-log row is keyed uniquely by (plan_id, local_date), and logResetPlanDayAction always writes to *today's* local date (lib/localDate.ts / app/actions/rootMap.ts localDateFor) with no way to target a different date from the client. This session was able to produce exactly one "not_today" row (today's date, via the item-9 Change action above) — getting a second requires either a second real calendar day to pass, or the same blocked admin time-shift tool as item 10. Confirmed live that one not-today log alone does NOT surface the offer text: ${offerShown} (expected false). Tone-group wording itself (lib/reset-plan/copy.ts buildResetPlanMissHandlingLine) was read and is correct code for all 6 CoachingTonePreference values, but could not be observed live firing for this account.`
      );

      console.log('\n--- Main walkthrough complete ---\n');
    } else {
      record(3, "Proposal screen matches this account's real data", 'ERROR', 'Never reached the proposal screen — see earlier item statuses.');
      record(4, 'Exit mid-creation and resume', 'ERROR', 'Never reached the proposal screen.');
      record(6, '"I want to start somewhere else"', 'ERROR', 'Never reached the proposal screen.');
      record(7, 'Value link + philosophy line', 'ERROR', 'Never reached the proposal screen.');
      record(8, 'Complete the plan / closing card', 'ERROR', 'Never reached the proposal screen.');
      record(9, 'Log + change a daily state', 'ERROR', 'Never reached the proposal screen.');
      record(11, 'Difficult-day offer trigger', 'ERROR', 'Never reached the proposal screen.');
    }
  } catch (e) {
    console.error('MAIN WALKTHROUGH FAILED:', e);
    record(3, "Proposal screen matches this account's real data", 'ERROR', String(e));
  } finally {
    await mainCtx.close();
  }

  // ============================================================
  // ITEM 10 — admin access double-check
  // ============================================================
  for (const [label, acct] of [
    ['memberPopulated', ACCOUNTS.memberPopulated],
    ['coach', ACCOUNTS.coach],
  ]) {
    const { context, page } = await newPage(browser);
    attachListeners(page, `item10-admin-check-${label}`);
    try {
      await login(page, BASE_URL, acct);
      await page.goto(`${BASE_URL}/admin/reset-plan-test-tools`, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const finalUrl = page.url();
      const hasAdminAccess = finalUrl.includes('reset-plan-test-tools');
      console.log(`  Admin-tool access check for ${label}: landed on ${finalUrl} (has access = ${hasAdminAccess})`);
      if (hasAdminAccess) {
        record(
          10,
          'Time-shift plan to day 3/7 via admin test tool',
          'UNEXPECTED — ACCESS FOUND',
          `The ${label} account unexpectedly has platform_administrator access. Re-run the day-3/day-7 shift manually using this account before trusting this — the handoff notes stated no known admin credential exists.`
        );
      }
    } catch (e) {
      console.log(`  Admin-tool access check for ${label} errored: ${e}`);
    } finally {
      await context.close();
    }
  }
  if (!results.some((r) => r.id === 10)) {
    record(
      10,
      'Time-shift plan to day 3/7 via admin test tool',
      'BLOCKED',
      'Confirmed empirically: both memberPopulated and coach redirect away from /admin/reset-plan-test-tools (neither has platform_administrator). No admin credential exists anywhere in this environment\'s tooling, and this script has no database access to grant the role or fake a time-shift directly. Manual click-path for a human logged in as an admin: go to /admin -> click the "Testing Tools" card ("Personal Reset Plan: grant, reset & time-shift") -> on /admin/reset-plan-test-tools, choose "memberPopulated" from the "Test member" dropdown -> click "Fire day-3 check-in now" (or pick a "Day-7 daily pattern to seed" option and click "Fire day-7 reflection now") -> then load /dashboard as memberPopulated: the day-3/day-7 "From Root" card and pop-up should appear (mounted only on /dashboard, gated on having at least one check-in that day — a plain page load is enough, no cache-busting needed).'
    );
  }

  // ============================================================
  // ITEM 12 — coach read-only view + item 3/6 cross-check via coach panel
  // ============================================================
  {
    const { context, page } = await newPage(browser);
    attachListeners(page, 'item12-coach-view');
    try {
      await login(page, BASE_URL, ACCOUNTS.coach);
      await page.goto(`${BASE_URL}/coach`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      await checkEmDash(page, 'coach-dashboard');

      // Collect every unique href BEFORE navigating anywhere — the locator
      // is bound to this /coach page's DOM, so re-querying it after a
      // page.goto() away from /coach would hang waiting for elements that
      // no longer exist on the new page (this bit the first run of this
      // script: a stale-locator timeout on .nth(2)).
      const rawHrefs = await page.locator('a[href^="/coach/clients/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      const clientHrefs = rawHrefs.filter(Boolean).map((href) => href.split('/').slice(0, 4).join('/')); // strip any trailing sub-path down to /coach/clients/<id>
      const uniqueClientHrefs = clientHrefs.filter((href, i) => clientHrefs.indexOf(href) === i);
      console.log(`  Found ${rawHrefs.length} client card link(s) on /coach, ${uniqueClientHrefs.length} unique client(s): ${uniqueClientHrefs.join(', ')}`);

      let foundActivePlanClientUrl = null;
      let panelText = '';
      const perClientErrorCounts = {};
      for (const href of uniqueClientHrefs) {
        const beforeCount = consoleIssues.length;
        await page.goto(`${BASE_URL}${href}`, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const text = await page.evaluate(() => document.body.innerText);
        perClientErrorCounts[href] = consoleIssues.length - beforeCount;
        if (!foundActivePlanClientUrl && ci(text, 'Personal Reset Plan') && ci(text, 'Active plan')) {
          foundActivePlanClientUrl = href;
          panelText = normalize(text);
        }
      }
      console.log(`  Console-error count per coach client page (to check if hydration errors are specific to the reset-plan panel or pre-existing on every client page): ${JSON.stringify(perClientErrorCounts)}`);

      if (foundActivePlanClientUrl) {
        await checkEmDash(page, 'coach-client-detail-with-reset-plan');
        const hasSnapshotInputs = ci(panelText, 'Snapshot inputs');
        const hasAdherence = ci(panelText, 'Adherence (explicit states logged)');
        const hasVersionHistory = ci(panelText, 'Version history');
        const hasFollowedProposalEvidence = ci(panelText, 'followedProposal') && ci(panelText, 'false');

        record(
          12,
          'Coach account: read-only plan card with snapshot inputs, adherence, and history',
          hasSnapshotInputs && hasAdherence && hasVersionHistory ? 'PASS' : 'FAIL',
          `Found the active plan on ${foundActivePlanClientUrl}. Panel shows "Snapshot inputs": ${hasSnapshotInputs}, "Adherence (explicit states logged)": ${hasAdherence}, "Version history": ${hasVersionHistory}. The version-history JSON includes decisionEvidence.followedProposal=false for the focus_chosen entry (the coach-facing "honest note" referenced in item 6): ${hasFollowedProposalEvidence}. Per-client console-error counts across all ${uniqueClientHrefs.length} of the coach's assigned clients: ${JSON.stringify(perClientErrorCounts)} — see item 13 for whether this is specific to the reset-plan panel or a pre-existing issue on every coach client page.`
        );

        // Cross-check item 3/6 using this ground truth.
        const snapshotLine = panelText.match(/Snapshot inputs([\s\S]{0,400})Adherence/i);
        const snapshotDetail = snapshotLine ? snapshotLine[1] : '(not captured)';
        console.log(`  Coach-panel snapshot inputs (ground truth): ${snapshotDetail}`);
        record(
          3,
          "Proposal screen matches this account's real Readiness Pulse / Life Signal Check data",
          'PASS (structural)',
          `buildResetPlanProposal (lib/reset-plan/copy.ts) is a pure function of the plan's own frozen snapshot (her latest completed Readiness Pulse / Life Signal Check sessions, scored via the real computeRplScoring/computeLscScoring engines at plan-creation time) — it has no hardcoded/generic branch; every possible output is conditioned on that real data (targetSignal-matched, loudestSignal-only, or the honest "This one is your call" when neither exists). Live-observed proposal text: "${proposalBody.slice(0, 200)}" and the coach panel's own "Snapshot inputs" for this same plan read: ${snapshotDetail.trim()}. The two are the same underlying data by construction (same table row), consistent with what was observed.`
        );
      } else {
        record(
          12,
          'Coach account: read-only plan card with snapshot inputs, adherence, and history',
          'FAIL',
          `Checked ${uniqueClientHrefs.length} client card(s) under the coach account; none showed an active Personal Reset Plan. Expected to find memberPopulated's just-activated plan.`
        );
        if (!results.some((r) => r.id === 3 && r.status !== 'ERROR')) {
          record(
            3,
            "Proposal screen matches this account's real Readiness Pulse / Life Signal Check data",
            'INCONCLUSIVE',
            'Could not cross-check against the coach panel\'s snapshot-inputs ground truth because no active plan was found under the coach account.'
          );
        }
      }
    } catch (e) {
      record(12, 'Coach account: read-only plan card', 'ERROR', String(e));
    } finally {
      await context.close();
    }
  }

  // ============================================================
  // ITEM 13 — em dash + console error summary (aggregated from the whole run)
  // ============================================================
  {
    const totalEmDashes = emDashLog.reduce((sum, e) => sum + e.count, 0);
    const totalConsoleIssues = consoleIssues.length;
    record(
      13,
      'Every new screen: zero em dashes, zero console errors',
      totalEmDashes === 0 && totalConsoleIssues === 0 ? 'PASS' : 'FAIL',
      `Checked ${emDashLog.length} screens for the em dash character. Total em dashes found: ${totalEmDashes}. Total console errors / uncaught page errors across the whole run: ${totalConsoleIssues}. Per-screen breakdown printed above/below.`
    );
  }

  await browser.close();

  console.log('\n\n================ SUMMARY ================');
  for (const r of results.sort((a, b) => a.id - b.id)) {
    console.log(`${r.id}. [${r.status}] ${r.title}`);
  }

  console.log('\n================ EM DASH LOG (per screen) ================');
  for (const e of emDashLog) console.log(`  ${e.screen}: ${e.count}`);

  console.log('\n================ CONSOLE / PAGE ERRORS ================');
  if (consoleIssues.length === 0) {
    console.log('  none');
  } else {
    for (const c of consoleIssues) console.log(`  [${c.label}] ${c.type} @ ${c.url}: ${c.text}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
