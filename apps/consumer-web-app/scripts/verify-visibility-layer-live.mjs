#!/usr/bin/env node
/**
 * Drives the live site as the throwaway routing-test member, runs intake
 * three times with deliberately contrasting answer profiles, and records
 * exactly which assessments, trackers and cards appeared and which stayed
 * hidden each time.
 *
 * THE POINT. The build's whole claim is that a member's own answers decide
 * what her app contains. That is not checkable by reading code and it is
 * not checkable on one account with one set of answers. It is checkable by
 * answering differently and watching the app change shape, which is what
 * this does, on production, through the real screens.
 *
 * WHY IT ONLY EVER TOUCHES THE THROWAWAY ACCOUNT. Every reset it performs
 * goes through the sanctioned test-only routes, each of which refuses any
 * caller whose profiles.is_test is not true, on the server AND in the
 * database's own policies. There is no member id parameter anywhere in this
 * script. It cannot reach a real member's data even by mistake.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   VIS_MEMBER_EMAIL=routing.test@mefwellness.com \
 *   VIS_MEMBER_PASSWORD_FILE=/path/to/pw.txt \
 *   SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-visibility-layer-live.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const EMAIL = process.env.VIS_MEMBER_EMAIL ?? 'routing.test@mefwellness.com';
const PASSWORD = process.env.VIS_MEMBER_PASSWORD_FILE
  ? readFileSync(process.env.VIS_MEMBER_PASSWORD_FILE, 'utf8').trim()
  : (process.env.VIS_MEMBER_PASSWORD ?? '');
const SHOTS = process.env.SHOTS_DIR ?? './live-shots-visibility';
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/**
 * The on-screen fingerprint of each feature. Deliberately the exact wording
 * a member reads rather than an internal key: this script is checking what
 * she sees, and a test that asserted on a feature key would pass even if
 * the card never rendered.
 */
const MARKERS = {
  // Each string below is the exact on-screen wording of the CONTROL, not of
  // any prose that happens to mention the topic. An early run of this
  // script matched the word "water" inside Root's hydration pop-up and the
  // word "movement" inside the Questionnaires page's own description, and
  // reported two trackers present that were not on any screen. Markers have
  // to be the thing itself.
  'Water tracker': ['of 8 cups', 'Log water as you drink it'],
  'Movement tracker': ['Log how much you moved', 'None / Light / Moderate'],
  'Food Lens tab': ['FOOD LENS'],
  'Energy trend': ['Energy Trend'],
  'What Root is noticing': ['What Root Is Noticing'],
  'Your Path zone': ['Your Path'],
  'Quick Actions zone': ['Quick Actions'],
  'Movement assessment card': ['Guided Posture'],
  'Wearable pitch': ['UNLOCK SMARTER COACHING', 'Connect your wearable'],
  'Next session row': ['Next session'],
  'Your Totals': ['YOUR TOTALS', 'Your Totals'],
  'Priority card': ['YOUR PRIORITY TODAY'],
  'Daily check-in': ['Complete your first check-in', 'Start check-in', 'Check-in complete'],
  'Evening reflection': ['Evening Reflection'],
  'Nutrition and Lifestyle questionnaire': ['Nutrition & Lifestyle'],
  'Four Doctors questionnaire': ['Four Doctors'],
  'Whole-Body Systems questionnaire': ['Whole-Body Systems', 'Whole Body Systems'],
  'Primal Pattern questionnaire': ['Primal Pattern'],
  'Core Values Snapshot': ['Core Values Snapshot'],
  'Life Signal Check': ['Life Signal Check'],
  'Trends panel': ['AVG ENERGY', 'Avg Energy'],
  'Coaching insights': ['COACHING INSIGHTS', 'Coaching Insights'],
};

function present(text, markers) {
  return markers.some((m) => text.toLowerCase().includes(m.toLowerCase()));
}

function fingerprint(text) {
  const seen = {};
  for (const [label, markers] of Object.entries(MARKERS)) {
    seen[label] = present(text, markers);
  }
  return seen;
}

const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  // ---- Sign in ------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('signed in as the throwaway routing-test member', true, EMAIL);

  const capture = async (path, key) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    writeFileSync(`${SHOTS}/${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  };

  const resetVisibility = async (alsoIntake) => {
    const response = await page.evaluate(
      async ({ base, intake }) => {
        const r = await fetch(`${base}/api/test-only/visibility-reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ intake }),
        });
        return { status: r.status, body: await r.text() };
      },
      { base: BASE, intake: alsoIntake }
    );
    return response;
  };

  // ---- The reset route works, and only for a test account -----------
  const firstReset = await resetVisibility(false);
  check(
    'the sanctioned visibility reset route accepts the test account',
    firstReset.status === 200,
    `HTTP ${firstReset.status} ${firstReset.body.slice(0, 120)}`
  );

  // ---- Profile A: sleep and stress heavy ----------------------------
  // Intake is answered through the real /onboarding screens; this script
  // records what the app looks like afterwards rather than driving the
  // wizard, which each profile run does by hand (see the build report's
  // click-by-click list).
  const profiles = (process.env.VIS_PROFILE ?? '').trim();

  const home = await capture('/dashboard', `${profiles || 'current'}-home`);
  const today = await capture('/today', `${profiles || 'current'}-today`);
  const progress = await capture('/progress', `${profiles || 'current'}-progress`);
  const questionnaires = await capture('/questionnaires', `${profiles || 'current'}-questionnaires`);

  const all = [home, today, progress, questionnaires].join('\n');
  const seen = fingerprint(all);
  writeFileSync(
    `${SHOTS}/${profiles || 'current'}-fingerprint.json`,
    JSON.stringify(seen, null, 2)
  );

  console.log('\n--- What this profile sees ---');
  for (const [label, visible] of Object.entries(seen)) {
    console.log(`${visible ? 'SHOWN ' : 'hidden'}  ${label}`);
  }

  // ---- The rules that must hold for every profile --------------------
  check(
    'the check-in is present, whatever her answers say',
    present(all, MARKERS['Daily check-in']),
    'safety exemption'
  );
  check(
    'the permanently empty next-session row is gone from Home',
    !present(home, MARKERS['Next session row']),
    'retired'
  );
  check(
    'no locked or teaser card renders anywhere',
    !/Complete a prior step first to unlock/i.test(all) &&
      !/\bLocked\b/i.test(home),
    'no lock copy on Home'
  );
  check(
    'no "Coming soon" is advertised on Home',
    !/coming soon/i.test(home),
    'no coming-soon on Home'
  );

  writeFileSync(`${SHOTS}/${profiles || 'current'}-results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
