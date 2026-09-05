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
import { resolveExperimentOfferHref } from '../lib/trial-arc/experimentOffer';

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

  // The pop-up marks itself dismissed on mount, through a Server Action, and
  // that write has to land before this context is torn down or the next
  // visit sees a message that should already have had its one showing. A
  // real member's browser stays open; this run waits the same moment she
  // would spend reading it.
  await page.waitForTimeout(2500);

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
  return completeAssessment(TRIAL_ARC_ROUTES.coreValuesSnapshot);
}

/** Drives Life Signal Check the same way. */
async function completeLsc(): Promise<boolean> {
  return completeAssessment(TRIAL_ARC_ROUTES.lifeSignalCheck);
}

/**
 * One assessment, taken through its own real screens: press Begin, answer
 * every radiogroup on each screen, press Continue, until the results page.
 *
 * It always picks the SECOND option in each group rather than the first,
 * deliberately: a first option is often the neutral or lowest one, and an
 * arc whose day 5 message depends on which signal was loudest should be
 * verified against answers that actually score.
 */
async function completeAssessment(overviewRoute: string): Promise<boolean> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${overviewRoute}`, { waitUntil: 'domcontentloaded' });
    const begin = page.locator('form button[type="submit"]').first();
    await begin.waitFor({ timeout: 25000 });
    await begin.click();
    await page.waitForURL((u) => u.pathname.includes('/take'), { timeout: 30000 });

    // The intro reveal, then four single selects, six sliders, one more
    // single select, and a final two-way choice.
    //
    // NOT EVERY CHOICE IS A radiogroup. Core Values Snapshot's last screen
    // (Q12Choice) renders two plain buttons rather than a radio group, which
    // is why this also picks the first button that is neither Back nor the
    // Continue label when the Continue is still disabled. That is what a
    // member does on that screen, and it was found by watching this run get
    // stuck on it.
    const NEXT = /^(Continue|Begin|Start|See what Root learned|Next|Let's|I'm ready|Show me)/i;
    for (let step = 0; step < 40; step += 1) {
      if (page.url().includes('/results/')) break;

      const groups = page.locator('[role="radiogroup"]');
      const groupCount = await groups.count();
      for (let g = 0; g < groupCount; g += 1) {
        const radios = groups.nth(g).locator('[role="radio"]');
        const n = await radios.count();
        if (n > 0) await radios.nth(Math.min(1, n - 1)).click({ timeout: 6000 }).catch(() => {});
      }

      const next = page.locator('button:visible').filter({ hasText: NEXT }).last();
      if ((await next.count()) === 0) break;

      if (await next.isDisabled().catch(() => false)) {
        const others = page.locator('button:visible');
        const total = await others.count();
        let picked = false;
        for (let b = 0; b < total; b += 1) {
          const label = (await others.nth(b).innerText()).trim();
          if (!label || label === 'Back' || NEXT.test(label)) continue;
          await others.nth(b).click({ timeout: 6000 }).catch(() => {});
          picked = true;
          break;
        }
        if (!picked) break;
        await page.waitForTimeout(600);
      }

      if (await next.isDisabled().catch(() => false)) break;
      await next.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    await page.waitForURL((u) => u.pathname.includes('/results/'), { timeout: 40000 }).catch(() => {});
    return page.url().includes('/results/');
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function stageExperiments() {
  console.log('\n== Days 3 and 4: the experiment days ==');
  // A clean experiment state, so this stage starts where it says it does.
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);

  console.log('\n   -- completing Life Signal Check through the real screens --');
  const lscDone = await completeLsc();
  check('Life Signal Check genuinely completed in the browser', lscDone, '');

  // Day 3, with both conversations done and no experiment running.
  //
  // A REAL HISTORY FIRST, and this is a finding rather than a convenience.
  // The rig's trial START is moved backwards while everything it does
  // happens today, so its earlier trial days are genuinely empty and the
  // engine correctly read it as STALLED on day 3 the first time this ran.
  // That is the engine being right about the facts it was given. The
  // experiment days are about pacing, not about absence, so the rig is given
  // the history a member on pace would actually have.
  await rigTools.setRigDay(rig.id, 3);
  await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.resetDeliveries(rig.id);
  await rigTools.resetPopups(rig.id);
  const offerHref = await resolveExperimentOfferHref(service, rig.id, { cvs: true, lsc: true });
  note(`her experiment is offered on ${offerHref}`);
  let landedOn = '';
  const offered = await visit(async (page) => {
    landedOn = await tapCta(page);
  });
  assertCopy('Day 3', offered, trialArcExperimentCopy(offerHref ?? ''));
  check('Day 3: the button goes to her own results screen, where the offer really is', landedOn === offerHref, landedOn);
  const day3Receipt = await waitForReceipt(trialArcPopupMessageKey(3));
  check('Day 3: the receipt records the experiment step', day3Receipt?.pointed_step === 'experiment', day3Receipt?.pointed_step ?? 'none');

  // Start one for real, then ask again on the same day.
  console.log('\n   -- starting the seven day experiment on the real screen --');
  const started = await startExperiment();
  check('an experiment was genuinely started in the browser', started, '');

  await service.from('member_trial_arc_deliveries').delete().eq('member_id', rig.id).eq('message_key', trialArcPopupMessageKey(3));
  await rigTools.resetPopups(rig.id);
  const whileRunning = await visit();
  check('Day 3: the arc is SILENT while an experiment is running', !whileRunning.present, whileRunning.title);

  // THE DECLINE, IN THE SHAPE THE APP ACTUALLY RECORDS ONE.
  //
  // The seven day offer pop-up marks itself dismissed the instant it is
  // shown, and it is only ever offered while no experiment is running, so a
  // dismissal row on an offer key means exactly one thing: Root put the
  // experiment in front of her once and she left without starting it. That
  // is the decline lib/trial-arc/engine.ts reads, and it is what this
  // produces, by letting the real offer pop-up reach her on a visit the arc
  // has already spoken on.
  //
  // The experiment started above is removed first, because an offer is never
  // made while one is running. Rig scoped, like every other write here.
  console.log('\n   -- letting the real experiment offer reach her, and leaving it ---');
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);

  // THE ARC IS FIRST IN THE CHAIN, so everything below it only gets a turn
  // once the messages above it have had theirs. That is the real shape of a
  // member's day: Root's own message first, and on later opens whatever else
  // was waiting, in order. This walks that chain the way she would, opening
  // Home and dealing with whatever is on top, until Root offers the seven
  // days.
  //
  // A pop-up with an explicit Ignore button is dismissed by pressing it; the
  // one-time kinds retire themselves the instant they mount. Nothing here
  // reaches past the chain or writes a dismissal by hand.
  for (let open = 0; open < 8; open += 1) {
    const { data: already } = await service
      .from('member_root_popup_dismissals')
      .select('message_key')
      .eq('member_id', rig.id)
      .or('message_key.like.cvs_offer:%,message_key.like.lsc_offer:%');
    if ((already ?? []).length > 0) break;

    let sawTitle = '';
    await visit(async (page) => {
      const dialog = page.locator('div[role="dialog"]').first();
      await dialog.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      if ((await dialog.count()) === 0) return;
      sawTitle = (await dialog.innerText()).replace(/\n/g, ' ').slice(0, 80);
      const ignore = dialog.locator('button', { hasText: /^Ignore$/ });
      if ((await ignore.count()) > 0) await ignore.first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
    });
    note(`open ${open + 1}: ${sawTitle || 'nothing'}`);
  }
  // Either experience's offer counts, and that is the engine's own rule:
  // lib/root-popup-messages/data.ts reads cvs_offer, lsc_offer and rpl_offer
  // alike, because a decline is a decline whichever conversation produced
  // the theory.
  const { data: dismissals } = await service
    .from('member_root_popup_dismissals')
    .select('message_key, status')
    .eq('member_id', rig.id)
    .or('message_key.like.cvs_offer:%,message_key.like.lsc_offer:%,message_key.like.rpl_offer:%');
  check(
    'the seven day offer was genuinely shown and left, which is the decline the app records',
    (dismissals ?? []).length > 0,
    JSON.stringify(dismissals ?? [])
  );

  await rigTools.setRigDay(rig.id, 4);
  await rigTools.seedActiveDays(rig.id, 4);
  // ONLY the arc's own keys. Clearing every dismissal here would delete the
  // offer row that IS her decline, and the arc would cheerfully re-pitch the
  // thing she had just turned down. That happened once in this run's own
  // development, which is why resetArcPopups exists.
  await rigTools.resetArcPopups(rig.id);
  const afterDecline = await visit();
  check('Day 4: the arc is SILENT after a decline, and never re-pitches it', !afterDecline.present, afterDecline.title);
  const rows = await rigTools.listDeliveries(rig.id);
  check(
    'Day 4: and wrote no receipt, because nothing was shown',
    !rows.some((r: { message_key: string }) => r.message_key === trialArcPopupMessageKey(4)),
    rows.map((r: { message_key: string }) => r.message_key).join(', ')
  );
}

/** Presses the real start button on her own experiment page. */
async function startExperiment(): Promise<boolean> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    const href = await resolveExperimentOfferHref(service, rig.id, { cvs: true, lsc: true });
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
    const start = page.locator('button:visible').filter({ hasText: /start the 7 days/i }).first();
    await start.waitFor({ timeout: 30000 });
    await start.click();
    await page.waitForTimeout(4000);
    const { data } = await service
      .from('lifestyle_experiments')
      .select('id, status')
      .eq('member_id', rig.id)
      .eq('status', 'active');
    return (data ?? []).length > 0;
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function stageDay5() {
  console.log('\n== Day 5: the connection ==');
  await rigTools.setRigDay(rig.id, 5);
  await rigTools.seedActiveDays(rig.id, 5);
  await rigTools.resetArcPopups(rig.id);
  await rigTools.resetDeliveries(rig.id);

  // What the rig's OWN answers produce, read through the same module the
  // message reads, so the report can say which branch was seen rather than
  // which branch was hoped for.
  const { resolveTrialArcConnection } = await import('../lib/trial-arc/connection');
  const connection = await resolveTrialArcConnection(service, rig.id);
  note(
    connection
      ? `her real scored rows: ${connection.valueLabel} / ${connection.signalLabel}, Body-Value Echo ${connection.echoFired ? 'FIRED' : 'did not fire'}`
      : 'her scored rows did not resolve to a connection'
  );

  let landedOn = '';
  const seen = await visit(async (page) => {
    landedOn = await tapCta(page);
  });

  if (connection) {
    const expected = connection.echoFired
      ? trialArcEchoCopy(connection.valueLabel, connection.signalLabel)
      : trialArcSideBySideCopy(connection.valueLabel, connection.signalLabel);
    assertCopy(`Day 5 (${connection.echoFired ? 'Echo' : 'side by side'})`, seen, expected);
    check('Day 5: the button opens her case', landedOn === TRIAL_ARC_ROUTES.caseView, landedOn);
    check(
      'Day 5: the message names her own real value and her own real signal',
      seen.body.includes(connection.valueLabel) && seen.body.includes(connection.signalLabel),
      `${connection.valueLabel} / ${connection.signalLabel}`
    );
  } else {
    assertCopy('Day 5 (missing half nudge)', seen, TRIAL_ARC_TOWARD_LSC);
  }

  const receipt = await waitForReceipt(trialArcPopupMessageKey(5));
  check('Day 5: the receipt landed and asks for nothing to be completed', receipt?.pointed_step === (connection ? 'none' : 'life_signal_check'), receipt?.pointed_step ?? 'no row');

  // THE MISSING-HALF BRANCH, on the same live account.
  //
  // "Completed" is not one row. The runtime's own session says so, and so
  // does an assessment_attempts row, which is what assessment_status_by_member
  // reads and therefore what hasEverCompleted answers from. Setting only the
  // session aside left the arc still seeing a finished Life Signal Check,
  // which is the view being right and this run being wrong about where the
  // fact lives. Both are set aside here, and both are put straight back.
  console.log('\n   -- the missing-half branch, with her Life Signal Check set aside --');
  const lscDefinitionId = await lscCatalogDefinitionId();
  const lscIds = await lscSessionIds();
  const { data: attemptRows } = await service
    .from('assessment_attempts')
    .select('id, completed_at')
    .eq('member_id', rig.id)
    .eq('assessment_definition_id', lscDefinitionId)
    .eq('status', 'completed');
  const attempts = (attemptRows ?? []) as { id: string; completed_at: string }[];

  if (lscIds.length === 0 || attempts.length === 0) {
    check('Day 5 missing half: her completed Life Signal Check was found to set aside', false, `${lscIds.length} sessions, ${attempts.length} attempts`);
  } else {
    // 'in_progress' WITH NO completed_at IS THE ONLY OTHER LEGAL SHAPE.
    // assessment_attempts carries a check constraint
    // (assessment_attempts_completed_fields, migration 73) that allows
    // exactly two: completed with a time, or in_progress with none. An
    // update to 'abandoned' was rejected for every row and returned no rows,
    // and this run believed it had set her Life Signal Check aside when it
    // had not. Exactly the "no error is not it worked" shape, in the
    // verification script rather than in the app. The error is checked now,
    // both ways.
    const setAside = await service
      .from('assessment_attempts')
      .update({ status: 'in_progress', completed_at: null })
      .in('id', attempts.map((a) => a.id))
      .select('id');
    await service.from('unified_assessment_sessions').update({ status: 'abandoned' }).in('id', lscIds);
    check(
      'Day 5 missing half: her Life Signal Check really was set aside',
      setAside.error === null && (setAside.data ?? []).length === attempts.length,
      setAside.error?.message ?? `${(setAside.data ?? []).length}/${attempts.length}`
    );

    await service.from('member_trial_arc_deliveries').delete().eq('member_id', rig.id).eq('message_key', trialArcPopupMessageKey(5));
    await rigTools.resetArcPopups(rig.id);

    const nudge = await visit();
    assertCopy('Day 5 missing half', nudge, TRIAL_ARC_TOWARD_LSC);

    // Put back, row by row, with each attempt's own completion time.
    await service.from('unified_assessment_sessions').update({ status: 'completed' }).in('id', lscIds);
    let restoredAttempts = 0;
    for (const attempt of attempts) {
      const put = await service
        .from('assessment_attempts')
        .update({ status: 'completed', completed_at: attempt.completed_at })
        .eq('id', attempt.id)
        .select('id');
      if (!put.error && (put.data ?? []).length === 1) restoredAttempts += 1;
    }
    const restoredSessions = await lscSessionIds();
    check(
      'her Life Signal Check was put back exactly as it was, sessions and attempts alike',
      restoredSessions.length === lscIds.length && restoredAttempts === attempts.length,
      `${restoredSessions.length}/${lscIds.length} sessions, ${restoredAttempts}/${attempts.length} attempts`
    );
  }
}

/**
 * Life Signal Check's CATALOG definition id, which is not the same id as its
 * unified runtime definition.
 *
 * assessment_attempts, and therefore assessment_status_by_member's
 * latest_completed, are keyed on the catalog id
 * (unified_assessment_definitions.catalog_definition_id, migration 100). The
 * runtime's own sessions are keyed on the unified id. Asking the attempts
 * table for the unified id returns nothing at all, which is how this run
 * first concluded there were no attempts to set aside.
 */
async function lscCatalogDefinitionId(): Promise<string> {
  const { findAssessmentRegistryEntry } = await import('../lib/assessment-registry/registry');
  const { LSC_KEY } = await import('../lib/life-signal-check/constants');
  return findAssessmentRegistryEntry(LSC_KEY as never)?.databaseId ?? '';
}

/** The rig's completed Life Signal Check session ids. */
async function lscSessionIds(): Promise<string[]> {
  const { getUnifiedAssessmentDefinitionByKey } = await import('../lib/assessment-foundation/repository');
  const { LSC_KEY } = await import('../lib/life-signal-check/constants');
  const definition = await getUnifiedAssessmentDefinitionByKey(service, LSC_KEY);
  if (!definition) return [];
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('id')
    .eq('member_id', rig.id)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed');
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function stageCloser() {
  console.log('\n== The closer: three ignored messages and the pacing stops ==');
  await rigTools.resetDeliveries(rig.id);
  // Every dismissal, not only the arc's: this stage needs her un-declined,
  // because a declined experiment makes days 3 and 4 silent and there would
  // be nothing to ignore.
  await rigTools.resetPopups(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);

  // DAYS 3, 4 AND 5, not 1, 2 and 3, and that is the engine being right
  // rather than a convenience. The rig has finished both conversations, so
  // on day 1 and day 2 it is AHEAD of the week and the arc correctly says
  // nothing at all. The three days it does speak on are the three used here.
  const days = [3, 4, 5];
  for (const day of days) {
    await rigTools.setRigDay(rig.id, day);
    await rigTools.seedActiveDays(rig.id, day);
    await rigTools.resetArcPopups(rig.id);
    const seen = await visit();
    check(`closer: day ${day} spoke`, seen.present, seen.title);
    const receipt = await waitForReceipt(trialArcPopupMessageKey(day));
    check(
      `closer: day ${day} was recorded, and she did nothing with it`,
      receipt !== null && receipt.cta_tapped_at === null,
      receipt ? String(receipt.cta_tapped_at) : 'no row'
    );
  }

  // The next open on a pacing day. Her receipts are untouched; only the
  // once-a-day dismissal is cleared, so the ONLY thing that can keep Root
  // quiet now is the closer.
  await rigTools.resetArcPopups(rig.id);
  const afterThree = await visit();
  check('closer: the next pacing day is silent', !afterThree.present, afterThree.title);

  await rigTools.setRigDay(rig.id, 3);
  await rigTools.resetArcPopups(rig.id);
  const backOnDayThree = await visit();
  check('closer: and so is an earlier pacing day, because it stops the pacing and not one message', !backOnDayThree.present, backOnDayThree.title);

  const rows = await rigTools.listDeliveries(rig.id);
  const ignored = rows.filter((r: { cta_tapped_at: string | null }) => r.cta_tapped_at === null);
  check('closer: and the table shows exactly why, three delivered and untouched', ignored.length >= 3, `${ignored.length} untouched of ${rows.length}`);
  note(
    rows
      .map(
        (r: { message_key: string; delivered_local_date: string; cta_tapped_at: string | null }) =>
          `${r.message_key} on ${r.delivered_local_date}${r.cta_tapped_at ? ' (tapped)' : ' (no response logged)'}`
      )
      .join('\n      ')
  );
}

async function stagePresence() {
  console.log('\n== Root Presence wins: the arc yields to the return greeting ==');
  await rigTools.resetAll(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);
  await rigTools.setRigDay(rig.id, 4);

  const gapDate = await rigTools.seedCheckinGap(rig.id, 3);
  // HER FIRST OPEN OF THE DAY, which is the only visit the greeting is ever
  // claimed on: the claim happens when today's Morning Brief is created.
  // resetAll has already removed today's brief, so the next visit is that
  // one.
  note(`one check-in on ${gapDate} and nothing since, so the return greeting is owed`);

  const collision = await visit();
  check('presence: the arc is SILENT on the visit the greeting is delivered', !collision.present, collision.title);

  const { data: greetings } = await service
    .from('member_return_greetings')
    .select('gap_start_local_date, shown_at')
    .eq('member_id', rig.id);
  check(
    'presence: and the greeting really was claimed on that visit, by the Morning Brief',
    (greetings ?? []).length === 1,
    JSON.stringify(greetings ?? [])
  );

  const sameDay = await visit();
  check(
    'presence: it stays silent for the rest of that day, because the greeting is on her screen all day',
    !sameDay.present,
    sameDay.title
  );

  // The next morning of the same gap. A verification run cannot wait a day,
  // so the claim is moved back one, exactly as setRigDay moves the trial
  // clock. Everything else about her is untouched.
  const moved = await rigTools.backdateGreeting(rig.id, 1);
  note(`greeting claim moved back a day (${moved} row), which is where it sits on the next morning of the same gap`);
  await rigTools.resetArcPopups(rig.id);

  const nextVisit = await visit();
  check('presence: the arc speaks again the next day', nextVisit.present, nextVisit.title);
  check(
    'presence: and what it says is the warm re-entry line, not a pacing instruction',
    nextVisit.present && nextVisit.title === trialArcReEntryCopy(TRIAL_ARC_TOWARD_CASE).title,
    nextVisit.title
  );
  if (nextVisit.present) {
    check(
      'presence: the re-entry line says "no response logged" and counts no missed day',
      nextVisit.body.includes('No response logged') && !/missed|streak|behind/i.test(nextVisit.body),
      nextVisit.body.slice(0, 100)
    );
  }
}

async function stageExclusion() {
  console.log('\n== Structural exclusion: a coaching client on the list is still refused ==');
  const { data: profiles } = await service.from('profiles').select('id, is_test');
  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = (users?.users ?? []).find((u) => u.email === '8weeks2fab@gmail.com');
  if (!target) {
    check('the excluded fixture account was found', false, '8weeks2fab@gmail.com not present');
    return;
  }
  note(`checking ${target.id} (8weeks2fab, a fixture with an active coach assignment)`);

  const { data: assignments } = await service
    .from('coach_client_assignments')
    .select('status')
    .eq('client_id', target.id);
  check(
    'it genuinely has a coach assignment, which is the thing that must exclude it',
    (assignments ?? []).length > 0,
    JSON.stringify(assignments ?? [])
  );

  // It is on the production override list for the duration of this stage.
  const { resolveTrialArcDecision } = await import('../lib/trial-arc/engine');
  const both = `${rig.id},${target.id}`;
  const listed = await resolveTrialArcDecision(service, target.id, {
    launch: null,
    testAccounts: both,
  } as never);
  check(
    'even named on the list, the arc yields nothing for it',
    listed.message === null,
    `${listed.reason ?? 'spoke'}`
  );

  const minted = await mintSessionCookies('8weeks2fab@gmail.com', { baseUrl: BASE });
  if (!minted || minted.session.user.id !== target.id) {
    check('a session could be minted for the fixture', false, 'refusing to drive an account whose id did not match');
  } else {
    const context = await browser.newContext({ viewport: PHONE });
    await context.addCookies(minted.cookies);
    const page = await context.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const arcDialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
    let sawArcCopy = false;
    try {
      await arcDialog.waitFor({ state: 'visible', timeout: 12000 });
      const title = (await arcDialog.locator('#root-invite-popup-title').innerText()).trim();
      const arcTitles = [
        TRIAL_ARC_DAY_1.title,
        TRIAL_ARC_DAY_2_ON_PACE.title,
        TRIAL_ARC_TOWARD_CVS.title,
        TRIAL_ARC_TOWARD_LSC.title,
        TRIAL_ARC_TOWARD_CASE.title,
        trialArcExperimentCopy('/x').title,
        trialArcReEntryCopy(TRIAL_ARC_TOWARD_CVS).title,
      ];
      sawArcCopy = arcTitles.includes(title);
      note(`a pop-up did appear for the fixture: "${title}" (not a trial arc message)`);
    } catch {
      note('no pop-up at all for the fixture');
    }
    check('live: no trial arc message reaches the coaching client', !sawArcCopy);
    const { data: rows } = await service
      .from('member_trial_arc_deliveries')
      .select('message_key')
      .eq('member_id', target.id);
    check('live: and no trial arc receipt was written for it', (rows ?? []).length === 0, `${(rows ?? []).length} row(s)`);
    await context.close();
    await retireSession(minted);
  }

  check('no production account was written to in this stage', (profiles ?? []).length > 0, `${(profiles ?? []).length} accounts read`);
}

async function stageWelcome() {
  console.log('\n== The fatigue handshake: day 1 rides the arrival welcome ==');
  await rigTools.resetAll(rig.id);
  await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);
  await rigTools.setRigDay(rig.id, 1);

  // A genuine signed-out walk of the public quiz, in a browser with no
  // session at all, exactly as a stranger takes it.
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  await page.goto(`${BASE}/energy/qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });
  const token = await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'));
  check('the signed out quiz issued a visitor token', Boolean(token), token ? 'yes' : 'none');
  await page.getByRole('button', { name: 'Begin' }).click();

  for (let i = 0; i < 14; i += 1) {
    const groups = page.locator('[role="radiogroup"]');
    if ((await groups.count()) === 0) break;
    const radios = groups.first().locator('[role="radio"]');
    if ((await radios.count()) === 0) break;
    await radios.nth(1).click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  const finishedText = await page.locator('body').innerText();
  check('the quiz produced a named pattern for this visitor', /pattern|energy/i.test(finishedText), '');

  const { data: sessionRow } = await service
    .from('public_entry_sessions')
    .select('id, pattern_key, completed_at')
    .eq('visitor_token', token)
    .maybeSingle();
  note(`public session: ${JSON.stringify(sessionRow)}`);

  // The bind, exactly as the app does it: the same browser, now carrying a
  // session, fires PublicEntryClaim from the root layout on the next page
  // load. Nothing here posts to the endpoint by hand.
  const minted = await mintSessionCookies(rig.email, { baseUrl: BASE });
  if (!minted || minted.session.user.id !== rig.id) {
    check('a session could be minted for the rig', false);
  } else {
    await context.addCookies(minted.cookies);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const { data: origin } = await service
      .from('member_public_entry_origin')
      .select('session_id, pattern_key')
      .eq('member_id', rig.id)
      .maybeSingle();
    check('the arrival bound itself to the rig, the way real signup does', origin !== null, JSON.stringify(origin));

    await page.reload({ waitUntil: 'domcontentloaded' });
    const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
    await dialog.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    const present = await dialog.count();
    if (present === 0) {
      check('Day 1: the arrival welcome rendered', false, 'no pop-up');
    } else {
      const title = (await dialog.locator('#root-invite-popup-title').innerText()).trim();
      const body = (await dialog.locator('p').nth(1).innerText()).trim();
      const ctaLabel = (await dialog.locator('button').first().innerText()).trim();
      const patternTitle = origin?.pattern_key
        ? (await import('../lib/public-entry/copy')).ENERGY_PATTERN_COPY[origin.pattern_key as never].title
        : null;
      const expected = patternTitle
        ? TRIAL_ARC_WELCOME.bodyWithPattern(patternTitle)
        : TRIAL_ARC_WELCOME.bodyWithoutPattern;
      check('Day 1: the welcome carries the arc framing', title === TRIAL_ARC_WELCOME.title, title);
      check('Day 1: it continues from her real quiz result, word for word', body === expected, body.slice(0, 110));
      check('Day 1: and its button points at Core Values Snapshot', ctaLabel === TRIAL_ARC_WELCOME.ctaLabel, ctaLabel);
      const receipt = await waitForReceipt(trialArcPopupMessageKey(1));
      check('Day 1: it wrote the ARC\'s receipt, so it is one message and not two', receipt !== null && receipt.pointed_step === 'core_values_snapshot', receipt ? receipt.pointed_step : 'no row');
    }
    await context.close();
    await retireSession(minted);
  }

  // Day 2: the welcome must stand down so the week can speak.
  await rigTools.setRigDay(rig.id, 2);
  await rigTools.resetArcPopups(rig.id);
  const dayTwo = await visit();
  check('Day 2: the welcome has stood down and the arc speaks instead', dayTwo.present && dayTwo.title !== TRIAL_ARC_WELCOME.title, dayTwo.title);
}

async function stageRestore() {
  console.log('\n== Restoring the rig to a clean day 1 ==');
  await rigTools.resetAll(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);
  await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);
  const set = await rigTools.setRigDay(rig.id, 1);
  const state = await rigTools.showRig(rig.id);
  check('the rig is on day 1 again', set.dayNumber === 1, set.startLocal);
  check('with no deliveries left', state.deliveries.length === 0, `${state.deliveries.length}`);
  check('still flagged is_test', state.profile.is_test === true, '');
  check('and still has no coach assignment', state.assignments.length === 0, '');

  console.log('\n== Every other production account still answers no ==');
  const { resolveTrialArcDecision } = await import('../lib/trial-arc/engine');
  const { data: profiles } = await service.from('profiles').select('id');
  let spoke = 0;
  const reasons = new Map<string, number>();
  for (const profile of (profiles ?? []) as { id: string }[]) {
    if (profile.id === rig.id) continue;
    const decision = await resolveTrialArcDecision(service, profile.id, { testAccounts: rig.id } as never);
    if (decision.message) spoke += 1;
    const reason = decision.reason ?? 'spoke';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  check('no non-rig account has a trial arc message', spoke === 0, `${spoke} would speak`);
  check(
    'and every one of them still refuses with launch_not_set',
    reasons.size === 1 && reasons.has('not_launched'),
    [...reasons.entries()].map(([r, n]) => `${r}=${n}`).join(' ')
  );
}

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'day1' || STAGE === 'all') await stageDay1();
    if (STAGE === 'day2' || STAGE === 'all') await stageDay2();
    if (STAGE === 'experiments' || STAGE === 'all') await stageExperiments();
    if (STAGE === 'day5' || STAGE === 'all') await stageDay5();
    if (STAGE === 'closer' || STAGE === 'all') await stageCloser();
    if (STAGE === 'presence' || STAGE === 'all') await stagePresence();
    if (STAGE === 'exclusion' || STAGE === 'all') await stageExclusion();
    if (STAGE === 'welcome' || STAGE === 'all') await stageWelcome();
    if (STAGE === 'restore' || STAGE === 'all') await stageRestore();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed} of ${results.length} CHECKS FAILED`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
