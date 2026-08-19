#!/usr/bin/env node
// Walks the member experience with Playwright and saves a full-page
// screenshot of every screen to /docs/screens/, so future UI work can be
// visually verified instead of shipping "no browser available." See
// docs/BUILD_STATUS.md for the full writeup and docs/screens/INDEX.md for
// what each captured file shows.
//
// Usage (from repo root):
//   npm run screenshots                       # mobile viewport, local dev
//   npm run screenshots:tablet                # tablet viewport, local dev
//   SCREENSHOT_TARGET=live npm run screenshots # against app.mefwellness.com
//
// Prerequisites for the local target (the default): `supabase start` +
// `supabase db reset` from the repo root, and `npm run dev` running in
// apps/consumer-web-app (or pass LOCAL_BASE_URL if it's on another port).
// This script drives the seeded dev accounts from supabase/seed/02_users.sql
// — it never creates or touches a production member.
//
// This DOES leave real writes in the local dev database: member.two's
// welcome/consent/onboarding/check-ins genuinely get completed by walking
// the real UI, the same way a real member's would. Several integration
// tests assert member.two's pristine, nothing-completed seed state
// (`tests/server-actions.test.ts`, `tests/welcome.test.ts`) — run
// `supabase db reset` again before `npm test` if you've just run this.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  ACCOUNTS,
  BASE_URL,
  OUTPUT_DIR,
  TARGET,
  VIEWPORT,
  VIEWPORT_NAME,
  USER_AGENT,
} from './config.mjs';
import {
  shot,
  recordFailure,
  login,
  answerVisibleQuestions,
  lastResortFill,
  walkCheckinWizard,
  index,
  failures,
} from './lib.mjs';

const TABLET_SPOT_CHECK = VIEWPORT_NAME === 'tablet';

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    isMobile: VIEWPORT.isMobile,
    hasTouch: VIEWPORT.hasTouch,
    userAgent: USER_AGENT,
    reducedMotion: 'reduce', // deterministic: no auto-advance timers, no typewriter delays, no scroll-reveal races
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { context, page };
}

async function captureLoginScreen(browser) {
  const { context, page } = await newPage(browser);
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
    await shot(page, 'login.png', { screen: 'Login', state: 'signed out' });
  } catch (e) {
    recordFailure('login screen', e);
  } finally {
    await context.close();
  }
}

async function captureErrorStates(browser, account) {
  const { context, page } = await newPage(browser);
  try {
    // Unauthenticated + unknown route hits middleware's auth gate before
    // Next.js's own not-found page ever gets a chance to render (confirmed:
    // an unauthenticated request to an unknown path 307s to /login) — so a
    // real 404 needs an authenticated session first.
    await login(page, BASE_URL, account);
    await page.goto(`${BASE_URL}/this-page-does-not-exist`, { waitUntil: 'load' });
    await shot(page, 'error-404.png', { screen: 'Not found', state: 'error' });
  } catch (e) {
    recordFailure('404 error state', e);
  }
  // A true network-offline capture was tried and dropped: Playwright's
  // context.setOffline(true) + a real page.goto() does fail with
  // net::ERR_INTERNET_DISCONNECTED as expected, but headless Chromium
  // navigates to chrome-error://chromewebdata/ and renders zero visible
  // content there (confirmed: document.body.innerText is empty) — a
  // headless-Chromium limitation, not something fixable from here without
  // running headed (no display server in this environment) or changing
  // app code. A handful of malformed dynamic-route params were also tried
  // to reach app/error.tsx's real error boundary (`/assessments/wbsa/
  // results/not-a-real-uuid`, `/coach/clients/not-a-real-uuid`, etc.) —
  // every one of them was handled gracefully by the app itself (redirect
  // or a real 404), which is a good sign about this app's error handling
  // but means there was no naturally-reachable error.tsx trigger to
  // screenshot without deliberately breaking something.
  await context.close();
}

/** Welcome (steps 1-9) + onboarding (consent, intro, questions, completion) for a brand-new-state member. */
async function captureWelcomeAndOnboarding(browser, account) {
  const { context, page } = await newPage(browser);
  try {
    await login(page, BASE_URL, account);
    await page.goto(`${BASE_URL}/welcome`, { waitUntil: 'load' });

    const welcomeSteps = [
      'welcome-01-logo',
      'welcome-02-story',
      'welcome-03-connected',
      'welcome-04-benefit',
      'welcome-05-benefit',
      'welcome-06-benefit',
      'welcome-07-benefit',
    ];
    // The seven cinematic pages advance by tapping anywhere; under the
    // `reducedMotion: 'reduce'` context this tool always uses, that is
    // replaced by a real button, and CinematicPage labels it "I'm ready",
    // not "Continue". This walk asked for "Continue" and so stopped dead
    // on welcome page 1, taking the whole welcome + onboarding leg of the
    // capture with it.
    for (const name of welcomeSteps) {
      await shot(page, `${name}-new.png`, { screen: name, state: 'new member' });
      await page
        .locator('button', { hasText: /^(I'm ready|Continue)$/ })
        .last()
        .click();
      await page.waitForTimeout(200);
    }

    // Step 8: goal selection. Pick two so step 9 (primary goal) also appears.
    await shot(page, 'welcome-08-goal-selection-new.png', {
      screen: 'welcome goal selection',
      state: 'new member',
    });
    const goalGroup = page.getByRole('group', { name: 'Areas you would like help with' });
    const goalTiles = goalGroup.locator('button');
    await goalTiles.nth(0).click();
    await goalTiles.nth(1).click();
    await page.getByRole('button', { name: "Let's find out" }).click();

    await page
      .getByRole('radiogroup', { name: 'Which area matters most right now' })
      .waitFor({ timeout: 10000 });
    await shot(page, 'welcome-09-primary-goal-new.png', {
      screen: 'welcome primary goal',
      state: 'new member',
    });
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: "I'm ready" }).click();

    // Lands back on '/', which routes to /onboarding's consent gate for a fresh member.
    await page.waitForURL((url) => url.pathname === '/onboarding', { timeout: 15000 });

    await shot(page, 'onboarding-01-consent-new.png', {
      screen: 'onboarding consent',
      state: 'new member',
    });
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Accept and continue' }).click();

    await page.waitForTimeout(500);
    await shot(page, 'onboarding-02-intro-new.png', {
      screen: 'onboarding intro',
      state: 'new member',
    });
    await page.getByRole('button').last().click();

    // Onboarding does not have one advance label, it has four, because a
    // question step, a branch interstitial and the final step are three
    // different components: "Keep going", "See what happens next", and
    // OnboardingFlow's submit label "See my reflection". This walk asked
    // for "Continue" and "Submit onboarding", neither of which the member
    // is ever shown, so the whole onboarding leg died on question 1.
    // Matching the set instead of one label means a future copy change on
    // any single screen cannot take the capture down again.
    for (let i = 1; i <= 40; i++) {
      await page.waitForTimeout(300);
      const submitButton = page
        .locator('button', { hasText: /^(Submit onboarding|See my reflection)$/ })
        .last();
      const isFinal = await submitButton.isVisible().catch(() => false);
      await shot(page, `onboarding-03-question-${String(i).padStart(2, '0')}-new.png`, {
        screen: `onboarding question ${i}`,
        state: 'new member',
      });

      const stillTrue = page.getByRole('button', { name: 'Still true' });
      if (await stillTrue.isVisible().catch(() => false)) {
        await stillTrue.click();
      } else {
        await answerVisibleQuestions(page);
      }

      // OnboardingForm's Continue/Submit button is only ever disabled by
      // `submitting`, never by answer-completeness (confirmed by reading
      // the component) — an unanswered required question instead lets the
      // click through, then rejects it client-side and marks the question
      // `aria-invalid="true"` without advancing. So "did it work" has to be
      // checked after the click, not before it.
      const advanceButton = isFinal
        ? submitButton
        : page
            .locator('button', { hasText: /^(Keep going|See what happens next)$/ })
            .last();
      let advanced = false;
      for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
        await advanceButton.click();
        await page.waitForTimeout(300);
        advanced = (await page.locator('[aria-invalid="true"]').count()) === 0;
        if (!advanced) {
          await answerVisibleQuestions(page);
          await lastResortFill(page);
        }
      }
      if (!advanced) {
        throw new Error(
          `Onboarding question ${i} still invalid after answering — could not advance`
        );
      }

      if (isFinal) break;
    }

    await page.waitForTimeout(500);
    await shot(page, 'onboarding-completion-new.png', {
      screen: 'onboarding completion',
      state: 'new member',
    });
  } catch (e) {
    recordFailure('welcome + onboarding flow', e);
  } finally {
    await context.close();
  }
}

async function captureCheckinFlows(browser, account, state) {
  const { context, page } = await newPage(browser);
  try {
    await login(page, BASE_URL, account);

    await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
    await walkCheckinWizard(page, { prefix: 'checkin-morning', state });

    await page.waitForURL(/\/checkin\/result/, { timeout: 15000 });
    // This route is reached via the wizard's client-side router.push, not a
    // fresh page.goto — waitForURL resolves as soon as the URL changes,
    // well before the async server component's real content streams in
    // behind app/checkin/loading.tsx's skeleton. Confirmed directly
    // (scripts/screenshots — see docs/BUILD_STATUS.md): the real content
    // is normally visible under a second later, but a fixed short delay
    // was catching the skeleton every time. Wait for the actual heading
    // instead of a fixed timeout.
    await page.getByRole('heading', { name: "Today's forecast" }).waitFor({ timeout: 10000 });
    await shot(page, `checkin-result-${state}.png`, { screen: 'checkin result', state });
    await page.getByRole('link', { name: 'Continue' }).click();
  } catch (e) {
    recordFailure(`morning check-in (${state})`, e);
  }

  try {
    await page.goto(`${BASE_URL}/checkin/evening`, { waitUntil: 'load' });
    await walkCheckinWizard(page, { prefix: 'checkin-evening', state });
  } catch (e) {
    recordFailure(`evening check-in (${state})`, e);
  } finally {
    await context.close();
  }
}

async function captureSimpleRoute(browser, account, route, filePrefix, state, screenLabel) {
  const { context, page } = await newPage(browser);
  try {
    await login(page, BASE_URL, account);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load' });
    await shot(page, `${filePrefix}-${state}.png`, { screen: screenLabel, state });
  } catch (e) {
    recordFailure(`${screenLabel} (${state})`, e);
  } finally {
    await context.close();
  }
}

async function run() {
  console.log(`Screenshot capture: target=${TARGET} viewport=${VIEWPORT_NAME} baseUrl=${BASE_URL}`);
  const browser = await chromium.launch();

  try {
    await captureLoginScreen(browser);

    if (TABLET_SPOT_CHECK) {
      // Tablet is a responsive-breakage spot check, not the full walk (see
      // docs/BUILD_STATUS.md for why): dashboard/today/case/coach/profile
      // plus one check-in screen, at both member states.
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/dashboard',
        'dashboard',
        'populated',
        'Home'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/today',
        'today',
        'populated',
        'Today'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/case',
        'case',
        'populated',
        'Your Case'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/profile',
        'profile',
        'populated',
        'Profile'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/food-lens',
        'food-lens',
        'populated',
        'Food Lens'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/progress',
        'progress',
        'populated',
        'Progress'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/dashboard',
        'dashboard',
        'empty',
        'Home'
      );
      await captureSimpleRoute(browser, ACCOUNTS.coach, '/coach', 'coach', 'dashboard', 'Coach');
      const { context, page } = await newPage(browser);
      try {
        await login(page, BASE_URL, ACCOUNTS.memberPopulated);
        await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
        await shot(page, 'checkin-morning-01-populated.png', {
          screen: 'checkin morning screen 1',
          state: 'populated',
        });
      } catch (e) {
        recordFailure('tablet check-in spot check', e);
      } finally {
        await context.close();
      }
    } else {
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/dashboard',
        'dashboard',
        'populated',
        'Home'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/today',
        'today',
        'populated',
        'Today'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/case',
        'case',
        'populated',
        'Your Case'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/profile',
        'profile',
        'populated',
        'Profile'
      );
      // The four member bottom-nav destinations that this walk used to
      // miss entirely. Home, Check-In and Today were already covered;
      // Food Lens and Progress are tabs on the same bar and were only
      // ever audited from source. Movement is where an assigned program
      // is read, and it shares the program hero with Home.
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/food-lens',
        'food-lens',
        'populated',
        'Food Lens'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/progress',
        'progress',
        'populated',
        'Progress'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberPopulated,
        '/movement',
        'movement',
        'populated',
        'Movement'
      );
      await captureCheckinFlows(browser, ACCOUNTS.memberPopulated, 'populated');

      await captureWelcomeAndOnboarding(browser, ACCOUNTS.memberEmpty);
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/dashboard',
        'dashboard',
        'empty',
        'Home'
      );
      await captureSimpleRoute(browser, ACCOUNTS.memberEmpty, '/today', 'today', 'empty', 'Today');
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/food-lens',
        'food-lens',
        'empty',
        'Food Lens'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/progress',
        'progress',
        'empty',
        'Progress'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/movement',
        'movement',
        'empty',
        'Movement'
      );
      await captureCheckinFlows(browser, ACCOUNTS.memberEmpty, 'empty');
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/case',
        'case',
        'empty',
        'Your Case'
      );
      await captureSimpleRoute(
        browser,
        ACCOUNTS.memberEmpty,
        '/profile',
        'profile',
        'empty',
        'Profile'
      );

      await captureSimpleRoute(browser, ACCOUNTS.coach, '/coach', 'coach', 'dashboard', 'Coach');

      await captureErrorStates(browser, ACCOUNTS.memberPopulated);
    }
  } finally {
    await browser.close();
  }

  writeIndex();
  console.log(`\nCaptured ${index.length} screenshot(s) to ${OUTPUT_DIR}`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(`  - ${f.area}: ${f.message}`);
    process.exitCode = 1;
  }
}

// INDEX.md is regenerated from a JSON manifest that accumulates across runs
// (mobile run, then a separate tablet run, both write into the same
// docs/screens/ dir) — otherwise a later run would wipe out the earlier
// run's entries instead of adding to them.
const MANIFEST_PATH = path.join(OUTPUT_DIR, '.manifest.json');

function writeIndex() {
  const date = new Date().toISOString().slice(0, 10);
  let manifest = { entries: {} };
  if (existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
      manifest = { entries: {} };
    }
  }
  for (const entry of index) {
    manifest.entries[entry.file] = { ...entry, target: TARGET, viewport: VIEWPORT_NAME, date };
  }

  // Drop entries whose PNG is no longer on disk. The number of screens a
  // branching flow produces is not fixed — the morning check-in can be
  // eleven screens for one member and ten for another — so a shorter run
  // leaves the previous run's last screen behind, and the index then
  // advertises a screenshot that no longer describes anything. Deleting
  // the file is enough to retire it; the next run cleans up the row.
  for (const file of Object.keys(manifest.entries)) {
    if (!existsSync(path.join(OUTPUT_DIR, file))) delete manifest.entries[file];
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  const sorted = Object.values(manifest.entries).sort((a, b) => a.file.localeCompare(b.file));
  const lines = [
    '# Screenshot Index',
    '',
    `Last regenerated ${date}. Each row shows when/how that specific file was last captured — a repo with both a mobile and tablet run will have rows from both dates.`,
    '',
    'Generated by `npm run screenshots` / `npm run screenshots:tablet` (`scripts/screenshots/capture.mjs`) — do not hand-edit, regenerate instead.',
    '',
    '| File | Screen | State | Viewport | Target | Captured |',
    '|---|---|---|---|---|---|',
  ];
  for (const entry of sorted) {
    lines.push(
      `| ${entry.file} | ${entry.screen} | ${entry.state} | ${entry.viewport} | ${entry.target} | ${entry.date} |`
    );
  }
  if (failures.length > 0) {
    lines.push('', `## Not captured in the ${date} ${VIEWPORT_NAME}/${TARGET} run`, '');
    for (const f of failures) lines.push(`- **${f.area}**: ${f.message}`);
  }
  writeFileSync(path.join(OUTPUT_DIR, 'INDEX.md'), lines.join('\n') + '\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
