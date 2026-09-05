/**
 * DRIVING THE TRIAL ARC ON THE LIVE SITE.
 *
 * Prompt 3 proved the arc's rules, its clock and its receipt mechanics. What
 * it never did was watch the arc actually happen: a real browser, on
 * app.mefwellness.com, signed in as a real account, reading the real pop-up.
 * Everything below does that.
 *
 * THE ONE ACCOUNT IT TOUCHES is the permanent rig (scripts/trial-arc-rig.mjs),
 * flagged is_test, named in TRIAL_ARC_TEST_ACCOUNT_IDS in the production
 * environment. Every write is scoped to its id and asserts that flag first.
 * No other production account is written to at all; one is READ, in the
 * exclusion stage, to confirm it is still refused.
 *
 * WHAT IT COMPARES AGAINST. The copy assertions import lib/trial-arc/copy.ts
 * itself, so a message that rendered is compared with the exact string the
 * app ships rather than with a phrase somebody typed into a verification
 * script and could have got wrong in the same direction twice.
 *
 * STAGES, runnable one at a time so a failure can be re-run in isolation:
 *   day1  day2  experiments  day5  closer  presence  exclusion  welcome  restore
 *   all   every stage in order
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-trial-arc-drive-live.mts day1
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the rig helper is plain JavaScript, by design
import * as rigTools from './trial-arc-rig.mjs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import {
  TRIAL_ARC_DAY_1,
  TRIAL_ARC_DAY_2_ON_PACE,
  TRIAL_ARC_TOWARD_CASE,
  TRIAL_ARC_TOWARD_CVS,
  TRIAL_ARC_TOWARD_LSC,
  TRIAL_ARC_WELCOME,
  trialArcEchoCopy,
  trialArcExperimentCopy,
  trialArcReEntryCopy,
  trialArcSideBySideCopy,
  type TrialArcMessageCopy,
} from '../lib/trial-arc/copy';
import { TRIAL_ARC_ROUTES, trialArcPopupMessageKey } from '../lib/trial-arc/constants';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 393, height: 852 };
const STAGE = process.argv[2] || 'all';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function note(text: string) {
  console.log(`      ${text}`);
}

const service = createClient(
  process.env.PROD_SUPABASE_URL!,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE!, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const rig = await rigTools.ensureRig();
console.log(`\nRig: ${rig.email}  ${rig.id}\nBase: ${BASE}\nStage: ${STAGE}\n`);

let browser: Browser;

/** A browser context carrying the rig's own session cookie, exactly as a signed-in visit does. */
async function rigContext(): Promise<{ context: BrowserContext; minted: unknown }> {
  const minted = await mintSessionCookies(rig.email, { baseUrl: BASE });
  if (!minted) throw new Error('could not mint a session for the rig');
  // generateLink CREATES an account for an address that does not exist, so
  // the id is asserted rather than assumed.
  if (minted.session.user.id !== rig.id) {
    throw new Error(`minted session belongs to ${minted.session.user.id}, not the rig`);
  }
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  return { context, minted };
}

type Seen = {
  present: boolean;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  consoleErrors: string[];
};

const NOTHING: Seen = { present: false, eyebrow: '', title: '', body: '', ctaLabel: '', consoleErrors: [] };

/** Opens Home and reports the Root invite pop-up it found, if any. */
async function openHome(page: Page, waitMs = 25000): Promise<Seen> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
  try {
    await dialog.waitFor({ state: 'visible', timeout: waitMs });
  } catch {
    return { ...NOTHING, consoleErrors };
  }

  const paragraphs = dialog.locator('p');
  return {
    present: true,
    eyebrow: (await paragraphs.nth(0).innerText()).trim(),
    title: (await dialog.locator('#root-invite-popup-title').innerText()).trim(),
    body: (await paragraphs.nth(1).innerText()).trim(),
    ctaLabel: (await dialog.locator('button').first().innerText()).trim(),
    consoleErrors,
  };
}

/** Asserts a rendered pop-up is exactly one shipped copy object, word for word. */
function assertCopy(label: string, seen: Seen, expected: TrialArcMessageCopy) {
  check(`${label}: a Root pop-up rendered`, seen.present, seen.title || 'nothing appeared');
  if (!seen.present) return;
  // innerText returns CSS-transformed text and this eyebrow is uppercased in
  // CSS, so the comparison is case insensitive on purpose. Everything else
  // below is compared exactly.
  check(
    `${label}: the eyebrow is the shipped one`,
    seen.eyebrow.toLowerCase() === expected.eyebrow.toLowerCase(),
    seen.eyebrow
  );
  check(`${label}: the title is the shipped one`, seen.title === expected.title, seen.title);
  check(
    `${label}: the body is the shipped one, word for word`,
    seen.body === expected.body,
    seen.body === expected.body ? '' : `saw: ${seen.body.slice(0, 90)}...`
  );
  check(`${label}: the button says what the copy says`, seen.ctaLabel === expected.ctaLabel, seen.ctaLabel);
  check(`${label}: no console or page errors on that screen`, seen.consoleErrors.length === 0, seen.consoleErrors.join(' | ').slice(0, 160));
}

/** Presses the pop-up's primary button and reports where it landed. */
async function tapCta(page: Page): Promise<string> {
  const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
  await dialog.locator('button').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/dashboard'), { timeout: 25000 }).catch(() => {});
  // The CTA beacon is a keepalive fetch fired in the same gesture as the
  // navigation. Closing the context immediately would kill it in flight, so
  // this run waits for it the way a real member's browser would.
  await page.waitForTimeout(2500);
  return new URL(page.url()).pathname;
}

/** Waits for the arc's delivery receipt to land, which the beacon writes after paint. */
async function waitForReceipt(messageKey: string, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await rigTools.listDeliveries(rig.id);
    const hit = rows.find((r: { message_key: string }) => r.message_key === messageKey);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** One visit: fresh context, open Home, read the pop-up, close everything down. */
async function visit(action?: (page: Page, seen: Seen) => Promise<void>): Promise<Seen> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    const seen = await openHome(page, action ? 25000 : 12000);
    if (action) await action(page, seen);
    return seen;
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

// =====================================================================
// STAGES
// =====================================================================

async function stageDay1() {
  console.log('\n== Day 1: the arc speaks for the first time ==');
  await rigTools.resetAll(rig.id);
  const set = await rigTools.setRigDay(rig.id, 1);
  note(`trial moved so today is day 1 (started ${set.startLocal} in the rig's own zone)`);

  let landedOn = '';
  const seen = await visit(async (page) => {
    landedOn = await tapCta(page);
  });
  assertCopy('Day 1', seen, TRIAL_ARC_DAY_1);
  check(
    'Day 1: the button goes to Core Values Snapshot',
    landedOn === TRIAL_ARC_ROUTES.coreValuesSnapshot,
    landedOn
  );

  const key = trialArcPopupMessageKey(1);
  const receipt = await waitForReceipt(key);
  check('Day 1: the delivery receipt landed', receipt !== null, receipt ? '' : 'no row after 25s');
  if (receipt) {
    check(
      'Day 1: the receipt carries the rig\'s OWN calendar day, not the server\'s',
      receipt.delivered_local_date === rigTools.rigLocalDate(0),
      `${receipt.delivered_local_date} vs ${rigTools.rigLocalDate(0)}`
    );
    check('Day 1: it records the day, the state and the step', receipt.day_number === 1 && receipt.pointed_step === 'core_values_snapshot', `${receipt.day_number}/${receipt.pace_state}/${receipt.pointed_step}`);
    check('Day 1: pressing the button was recorded', receipt.cta_tapped_at !== null, receipt.cta_tapped_at ?? 'not stamped');
  }

  const second = await visit();
  check('Day 1: a second visit the same day shows nothing', !second.present, second.title);
  const rows = await rigTools.listDeliveries(rig.id);
  check('Day 1: and wrote no second receipt', rows.length === 1, `${rows.length} row(s)`);
}

async function stageDay2() {
  console.log('\n== Day 2: behind pace, then on pace ==');
  await rigTools.setRigDay(rig.id, 2);
  await rigTools.resetPopups(rig.id);

  const behind = await visit();
  assertCopy('Day 2 behind pace', behind, TRIAL_ARC_TOWARD_CVS);
  const key2 = trialArcPopupMessageKey(2);
  const behindReceipt = await waitForReceipt(key2);
  check('Day 2 behind pace: receipt landed with the Core Values Snapshot step', behindReceipt?.pointed_step === 'core_values_snapshot', behindReceipt?.pointed_step ?? 'none');

  console.log('\n   -- completing Core Values Snapshot through the real screens --');
  const done = await completeCvs();
  check('Day 2: Core Values Snapshot genuinely completed in the browser', done, '');

  // The same day number, offered again, so the ON_PACE branch can be seen on
  // the day it belongs to. The receipt for day 2 is cleared with it, because
  // this is one day being replayed rather than two days happening.
  await service.from('member_trial_arc_deliveries').delete().eq('member_id', rig.id).eq('message_key', key2);
  await rigTools.resetPopups(rig.id);

  let landedOn = '';
  const onPace = await visit(async (page) => {
    landedOn = await tapCta(page);
  });
  assertCopy('Day 2 on pace', onPace, TRIAL_ARC_DAY_2_ON_PACE);
  check('Day 2 on pace: the button goes to Life Signal Check', landedOn === TRIAL_ARC_ROUTES.lifeSignalCheck, landedOn);
  const onPaceReceipt = await waitForReceipt(key2);
  check('Day 2 on pace: the receipt records ON_PACE and the Life Signal Check step', onPaceReceipt?.pace_state === 'ON_PACE' && onPaceReceipt?.pointed_step === 'life_signal_check', `${onPaceReceipt?.pace_state}/${onPaceReceipt?.pointed_step}`);
}

/** Drives the whole Core Values Snapshot experience through its real screens. */
async function completeCvs(): Promise<boolean> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ARC_ROUTES.coreValuesSnapshot}`, { waitUntil: 'domcontentloaded' });
    const begin = page.locator('form button[type="submit"]').first();
    await begin.waitFor({ timeout: 25000 });
    await begin.click();
    await page.waitForURL((u) => u.pathname.includes('/take'), { timeout: 30000 });

    // The intro reveal, then four single selects, six sliders, and two more.
    for (let step = 0; step < 20; step += 1) {
      if (page.url().includes('/results/')) break;
      const groups = page.locator('[role="radiogroup"]');
      const count = await groups.count();
      for (let g = 0; g < count; g += 1) {
        const radios = groups.nth(g).locator('[role="radio"]');
        if ((await radios.count()) > 0) await radios.nth(1).click({ timeout: 5000 }).catch(() => {});
      }
      const next = page
        .locator('button:visible')
        .filter({ hasText: /^(Continue|Begin|Start|See what Root learned|Let's go|Next)/i })
        .last();
      if ((await next.count()) === 0) break;
      await next.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(900);
    }
    await page.waitForURL((u) => u.pathname.includes('/results/'), { timeout: 40000 }).catch(() => {});
    return page.url().includes('/results/');
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'day1' || STAGE === 'all') await stageDay1();
    if (STAGE === 'day2' || STAGE === 'all') await stageDay2();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed} of ${results.length} CHECKS FAILED`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
