/**
 * DRIVING DAY 6 ON THE LIVE SITE.
 *
 * Prompt 4 built "What This Week Showed": a pop-up on day 6, a recap screen
 * behind it, and a plan composed once from her real rows and stored. This
 * run watches all of that happen on app.mefwellness.com, in a real browser,
 * signed in as a real account.
 *
 * THE ONE ACCOUNT IT TOUCHES is the permanent rig (scripts/trial-arc-rig.mjs),
 * flagged is_test, named in TRIAL_ARC_TEST_ACCOUNT_IDS in the production
 * environment. Every write is scoped to its id and asserts that flag first.
 * No other production account is written to; the exclusion stage READS every
 * other account to confirm the arc still refuses it.
 *
 * WHAT IT COMPARES AGAINST, and this is the part that makes it worth
 * running. It does not compare the screen against sentences somebody typed
 * into this file. It reads the STORED PLAN out of the database, renders it
 * with the app's own renderTrialArcRecap, and asserts the browser is showing
 * exactly that. Separately, it recomputes her top value, her loudest signal
 * and her readiness from her own completed sessions with the app's own
 * scoring engines, and asserts the stored plan carries those. So "the cards
 * match her real rows" is checked against the rows, twice, from two
 * directions.
 *
 * STAGES, runnable one at a time so a failure can be re-run in isolation:
 *   day6  stored  tiera  closer  fatigue  exclusion  restore
 *   all   every stage in order
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-trial-arc-day6-live.mts all
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the rig helper is plain JavaScript, by design
import * as rigTools from './trial-arc-rig.mjs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { TRIAL_ARC_DAY_6, type TrialArcMessageCopy } from '../lib/trial-arc/copy';
import { TRIAL_ARC_ROUTES, trialArcPopupMessageKey } from '../lib/trial-arc/constants';
import { renderTrialArcRecap } from '../lib/trial-arc/recapCopy';
import { sanitizeRecapPlan } from '../lib/trial-arc/recapPlan';
import { computeCvsScoring } from '../lib/core-values-snapshot/scoring';
import { computeLscScoring } from '../lib/life-signal-check/scoring';
import { computeRplScoring } from '../lib/readiness-pulse/scoring';
import { AREA_LABEL, CVS_KEY } from '../lib/core-values-snapshot/constants';
import { LSC_KEY, SIGNAL_LABEL } from '../lib/life-signal-check/constants';
import { RPL_KEY, READINESS_PATTERN_LABEL } from '../lib/readiness-pulse/constants';
import { ENERGY_PATTERN_COPY } from '../lib/public-entry/copy';

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

// =====================================================================
// Reading the two screens.
// =====================================================================

type Seen = {
  present: boolean;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  consoleErrors: string[];
};

const NOTHING: Seen = { present: false, eyebrow: '', title: '', body: '', ctaLabel: '', consoleErrors: [] };

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
  // The pop-up marks itself dismissed on mount and fires its receipt after
  // paint. This run waits the moment a real member spends reading it.
  await page.waitForTimeout(3000);

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

function assertCopy(label: string, seen: Seen, expected: TrialArcMessageCopy) {
  check(`${label}: a Root pop-up rendered`, seen.present, seen.title || 'nothing appeared');
  if (!seen.present) return;
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

type RecapScreen = {
  reached: boolean;
  heading: string;
  /** Every visible paragraph and heading on the recap, in document order. */
  lines: string[];
  /** The one number the bars carry, "3/3" style, one per bar. */
  barLabels: string[];
  ctaLabels: string[];
  /** Everything under main as one string, for the typewriter line. */
  fullText: string;
  consoleErrors: string[];
};

async function readRecap(page: Page): Promise<RecapScreen> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const main = page.locator('main');
  await main.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

  // WAITING OUT THE WHOLE REVEAL, TYPEWRITER INCLUDED. The staged fade runs
  // a couple of seconds on a first view, and Root's noticing then types
  // itself one character at a time at the app's own 45ms rate, which on a
  // sentence this long is another six. Reading the screen early would be
  // reading a half drawn one, so this waits for the line to stop growing
  // rather than guessing at a number.
  const deadline = Date.now() + 30000;
  let previous = '';
  let stableFor = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(700);
    const current = await main.innerText().catch(() => '');
    if (current === previous && current.length > 0) {
      stableFor += 1;
      if (stableFor >= 3) break;
    } else {
      stableFor = 0;
      previous = current;
    }
  }

  // Every text node under main, as its own line. `allInnerTexts` returns
  // CSS-TRANSFORMED text, and the small card labels on this screen are
  // uppercased in CSS, which is why `sameLine` below compares case
  // insensitively rather than this read trying to undo it.
  const texts = await main.locator('h1, h2, h3, p, a, span').allInnerTexts();
  const lines = texts.map(normalize).filter(Boolean);
  const barLabels = (await main.locator('span').allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => /^\d\/3$/.test(t));
  const ctaLabels = (await main.locator('a').allInnerTexts()).map((t) => t.trim());

  return {
    reached: new URL(page.url()).pathname === TRIAL_ARC_ROUTES.weekRecap,
    heading: (await main.locator('h1').first().innerText().catch(() => '')).trim(),
    lines,
    barLabels,
    ctaLabels,
    fullText: normalize(await main.innerText().catch(() => '')),
    consoleErrors,
  };
}

/** Whitespace collapsed, so a line broken across two rendered lines still compares. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Is this exact sentence on the screen.
 *
 * Case insensitive, and for one reason only: the small card labels
 * ("What matters most") are uppercased in CSS, and `innerText` reports what
 * the member sees rather than what the markup says. Every other property
 * of the comparison is exact, so a changed word still fails.
 */
function onScreen(screen: RecapScreen, line: string): boolean {
  const wanted = normalize(line).toLowerCase();
  if (screen.lines.some((seen) => seen.toLowerCase() === wanted)) return true;
  // The typewriter renders its finished text inside an aria-hidden span
  // that `allInnerTexts` may split, so the whole screen's text is the
  // fallback rather than a missing assertion.
  return screen.fullText.toLowerCase().includes(wanted);
}

/** One visit to the recap screen, from a fresh session. */
async function visitRecap(): Promise<RecapScreen> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ARC_ROUTES.weekRecap}`, { waitUntil: 'domcontentloaded' });
    return await readRecap(page);
  } finally {
    await context.close();
    await retireSession(minted);
  }
}

async function visitHome(action?: (page: Page, seen: Seen) => Promise<void>): Promise<Seen> {
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

async function waitForReceipt(messageKey: string, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await rigTools.listDeliveries(rig.id);
    const hit = rows.find((r: { message_key: string }) => r.message_key === messageKey);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function waitForRecapRow(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await rigTools.listRecaps(rig.id);
    if (rows.length > 0) return rows[0];
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// =====================================================================
// What her own rows actually say, computed with the app's own engines.
// =====================================================================

/**
 * Her own answers for one experience, read straight out of the tables.
 *
 * WRITTEN OUT LONGHAND RATHER THAN CALLING THE APP'S OWN ACCESSOR, on
 * purpose. The point of this read is to be a second opinion about what her
 * rows say, so it resolves the question ids itself through
 * unified_assessment_questions rather than trusting the mapping the app
 * uses to compose the recap. An answer stored against the wrong question
 * would show up here as a different scoring.
 */
async function answersFor(key: string): Promise<Record<string, never> | null> {
  const { data: definition } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', key)
    .eq('active', true)
    .maybeSingle();
  if (!definition) return null;

  const { data: session } = await service
    .from('unified_assessment_sessions')
    .select('id')
    .eq('member_id', rig.id)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  const { data: questions } = await service
    .from('unified_assessment_questions')
    .select('id, question_key')
    .eq('assessment_definition_id', definition.id);
  const keyById = new Map(
    ((questions ?? []) as { id: string; question_key: string }[]).map((q) => [q.id, q.question_key])
  );

  const { data: rows, error } = await service
    .from('unified_assessment_answers')
    .select('question_id, value')
    .eq('session_id', session.id);
  if (error) {
    check(`could read ${key}'s stored answers`, false, error.message);
    return null;
  }

  const answers: Record<string, unknown> = {};
  for (const row of (rows ?? []) as { question_id: string; value: unknown }[]) {
    const questionKey = keyById.get(row.question_id);
    if (questionKey) answers[questionKey] = row.value;
  }
  if (Object.keys(answers).length === 0) {
    check(`${key}'s stored answers are readable and non empty`, false, '0 answers');
    return null;
  }
  return answers as Record<string, never>;
}

/** Her real result, from her real answers, through the same scoring the app runs. */
async function herRealResults() {
  const [cvsAnswers, lscAnswers, rplAnswers] = await Promise.all([
    answersFor(CVS_KEY),
    answersFor(LSC_KEY),
    answersFor(RPL_KEY),
  ]);
  const cvs = cvsAnswers ? computeCvsScoring(cvsAnswers) : null;
  const lsc = lscAnswers
    ? computeLscScoring(lscAnswers, cvs ? { topValue: cvs.topValue, branch: cvs.branch } : null)
    : null;
  const rpl = rplAnswers
    ? computeRplScoring(
        rplAnswers,
        lsc
          ? { loudestSignal: lsc.loudestSignal, pattern: lsc.pattern, hardestTimeOfDay: lsc.hardestTimeOfDay }
          : null
      )
    : null;
  return { cvs, lsc, rpl };
}

/** Drives one assessment through its own real screens, exactly as verify-trial-arc-drive-live.mts does. */
async function completeAssessment(overviewRoute: string): Promise<boolean> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${overviewRoute}`, { waitUntil: 'domcontentloaded' });
    const begin = page.locator('form button[type="submit"]').first();
    await begin.waitFor({ timeout: 25000 });
    await begin.click();
    await page.waitForURL((u) => u.pathname.includes('/take'), { timeout: 30000 });

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

/**
 * Her two finished conversations, set aside for the length of one stage and
 * put straight back. The same device verify-trial-arc-drive-live.mts uses,
 * and the only way to see the thin data tier on an account that has already
 * done the work.
 */
async function withConversationsSetAside<T>(fn: () => Promise<T>): Promise<T> {
  const keys = [CVS_KEY, LSC_KEY, RPL_KEY];
  const kept: { id: string; completed_at: string }[] = [];
  let removedDuplicates = 0;

  for (const key of keys) {
    const { data: definition } = await service
      .from('unified_assessment_definitions')
      .select('id')
      .eq('key', key)
      .eq('active', true)
      .maybeSingle();
    if (!definition) continue;

    const { data } = await service
      .from('unified_assessment_sessions')
      .select('id, completed_at')
      .eq('member_id', rig.id)
      .eq('assessment_definition_id', definition.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    const rows = (data ?? []) as { id: string; completed_at: string }[];
    if (rows.length === 0) continue;

    // ONLY ONE DRAFT PER DEFINITION IS ALLOWED, and the rig is carrying
    // eleven completed Life Signal Checks from an earlier verification pass
    // that drove the same conversation over and over. Setting them all aside
    // is impossible by construction, so the newest of each is set aside and
    // put back, and the surplus duplicates of the SAME conversation are
    // removed. Nothing is lost that any run needs: they are repeat sittings
    // of one experience on a fixture account, and what remains afterwards is
    // one completed session per conversation, which is what a real member
    // has.
    const [newest, ...duplicates] = rows;
    kept.push(newest!);
    if (duplicates.length > 0) {
      const { error } = await service
        .from('unified_assessment_sessions')
        .delete()
        .in('id', duplicates.map((d) => d.id));
      if (!error) removedDuplicates += duplicates.length;
    }
  }

  if (removedDuplicates > 0) {
    note(`${removedDuplicates} duplicate sittings of the same conversations removed from the rig`);
  }

  if (kept.length > 0) {
    // 'in_progress' AND completed_at nulled, together.
    //
    // TWO REAL REFUSALS FOUND HERE, one after the other, and both were
    // invisible until the error was read rather than the absence of one. The
    // first attempt wrote status 'abandoned', which the column does not
    // allow: the update matched no row, returned quietly, and the stage
    // asserted tier A against an account whose conversations were all still
    // finished. The second wrote a legal status and left completed_at where
    // it was, which the table's own `unified_assessment_sessions_completed_fields`
    // check constraint refuses, correctly.
    const { data: moved, error } = await service
      .from('unified_assessment_sessions')
      .update({ status: 'in_progress', completed_at: null })
      .in('id', kept.map((k) => k.id))
      .select('id');
    check(
      'her conversations really were set aside for this stage',
      error === null && (moved ?? []).length === kept.length,
      error ? error.message : `${(moved ?? []).length}/${kept.length}`
    );
  }

  try {
    return await fn();
  } finally {
    // Put back one at a time, each with its OWN original completion time,
    // because that timestamp is the row's own fact and a single bulk update
    // would stamp them all with one moment that never happened.
    let restored = 0;
    for (const session of kept) {
      const { data } = await service
        .from('unified_assessment_sessions')
        .update({ status: 'completed', completed_at: session.completed_at })
        .eq('id', session.id)
        .select('id');
      if ((data ?? []).length === 1) restored += 1;
    }
    check(
      'and were put back exactly as they were, each with its own completion time',
      restored === kept.length,
      `${restored}/${kept.length}`
    );
  }
}

/** Everything about day 6, cleared, so a stage can watch it happen from the start. */
async function clearDay6() {
  await rigTools.resetRecaps(rig.id);
  await rigTools.resetDeliveries(rig.id);
  await rigTools.resetArcPopups(rig.id);
}

// =====================================================================
// STAGES
// =====================================================================

async function stageDay6() {
  console.log('\n== Day 6: the pop-up, and the recap behind it ==');

  await rigTools.setRigDay(rig.id, 6);
  // A real week behind her: three days of Daily Resets inside the trial
  // window, written through the ordinary table with the ordinary columns.
  const seeded = await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.clearMorningBriefs(rig.id);
  await clearDay6();
  note(`trial moved so today is day 6, check-ins seeded on ${seeded.join(', ')}`);

  // Readiness Pulse, so tier C is genuinely reachable rather than assumed.
  const results0 = await herRealResults();
  if (!results0.rpl) {
    console.log('\n   -- completing Readiness Pulse through the real screens --');
    const done = await completeAssessment(TRIAL_ARC_ROUTES.readinessPulse);
    check('Readiness Pulse genuinely completed in the browser', done, '');
    await clearDay6();
  }

  let landedOn = '';
  let screen: RecapScreen | null = null;
  const seen = await visitHome(async (page) => {
    const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
    await dialog.locator('button').first().click();
    await page.waitForURL((u) => u.pathname !== '/dashboard', { timeout: 30000 }).catch(() => {});
    landedOn = new URL(page.url()).pathname;
    screen = await readRecap(page);
  });

  assertCopy('Day 6', seen, TRIAL_ARC_DAY_6);
  check('Day 6: the button opens the recap', landedOn === TRIAL_ARC_ROUTES.weekRecap, landedOn);

  const receipt = await waitForReceipt(trialArcPopupMessageKey(6));
  check('Day 6: the delivery receipt landed', receipt !== null, receipt ? '' : 'no row after 30s');
  if (receipt) {
    check(
      "Day 6: the receipt carries the rig's OWN calendar day",
      receipt.delivered_local_date === rigTools.rigLocalDate(0),
      `${receipt.delivered_local_date} vs ${rigTools.rigLocalDate(0)}`
    );
    check(
      'Day 6: it records day 6 and asks for no step',
      receipt.day_number === 6 && receipt.pointed_step === 'none',
      `${receipt.day_number}/${receipt.pace_state}/${receipt.pointed_step}`
    );
    check('Day 6: pressing the button was recorded', receipt.cta_tapped_at !== null, receipt.cta_tapped_at ?? 'not stamped');
  }

  const row = await waitForRecapRow();
  check('Day 6: her recap was composed and stored', row !== null, row ? `tier ${row.tier}` : 'no row after 30s');
  if (!row || !screen) return;

  const stored = sanitizeRecapPlan(row.plan);
  check('Day 6: the stored plan is one this build would accept back', stored !== null, '');
  if (!stored) return;

  // -------- what the rows actually say, computed independently --------
  const real = await herRealResults();
  check(
    `Day 6: the stored tier matches her real history (${row.tier})`,
    row.tier === (real.cvs && real.lsc ? (real.rpl ? 'C' : 'B') : 'A'),
    `stored ${row.tier}`
  );

  const topValueCard = stored.cards.find((c) => c.kind === 'top_value');
  if (real.cvs) {
    check(
      `Day 6: the value card names her real top value (${AREA_LABEL[real.cvs.topValue]})`,
      topValueCard?.kind === 'top_value' && topValueCard.valueArea === real.cvs.topValue,
      topValueCard?.kind === 'top_value' ? topValueCard.valueArea : 'no card'
    );
  }

  const signalCard = stored.cards.find((c) => c.kind === 'loudest_signal');
  if (real.lsc) {
    check(
      `Day 6: the signal card names her real chosen signal (${SIGNAL_LABEL[real.lsc.chosenSignal]})`,
      signalCard?.kind === 'loudest_signal' && signalCard.signal === real.lsc.chosenSignal,
      signalCard?.kind === 'loudest_signal' ? signalCard.signal : 'no card'
    );
    check(
      'Day 6: and carries her real 0 to 3 scores, unchanged',
      signalCard?.kind === 'loudest_signal' &&
        JSON.stringify(signalCard.signalScores) === JSON.stringify(real.lsc.scores),
      JSON.stringify(signalCard?.kind === 'loudest_signal' ? signalCard.signalScores : null)
    );
  }

  const readinessCard = stored.cards.find((c) => c.kind === 'readiness');
  if (real.rpl) {
    check(
      `Day 6: the readiness card names her real answer (${READINESS_PATTERN_LABEL[real.rpl.finalPattern]})`,
      readinessCard?.kind === 'readiness' && readinessCard.readinessPattern === real.rpl.finalPattern,
      readinessCard?.kind === 'readiness' ? readinessCard.readinessPattern : 'no card'
    );
  }

  check(
    'Day 6: the counted line counted the days she really logged',
    stored.counts.checkinDays === seeded.length && stored.counts.trialDays === 6,
    `${stored.counts.checkinDays} of ${stored.counts.trialDays}`
  );

  // -------- the screen shows exactly the stored plan --------
  const expected = renderTrialArcRecap(stored);
  const shown: RecapScreen = screen;

  check('Day 6: the recap screen was reached', shown.reached, '');
  check('Day 6: the heading is the shipped one', shown.heading === expected.heading, shown.heading);

  const missing = [
    expected.intro,
    ...expected.cards.flatMap((c) => [c.label, c.title ?? '', c.body]),
    expected.noticing,
    expected.tomorrow,
  ]
    .filter(Boolean)
    .filter((line) => !onScreen(shown, line));

  check(
    'Day 6: every line the stored plan renders is on the screen, word for word',
    missing.length === 0,
    missing.length === 0 ? `${expected.cards.length} cards` : `missing ${missing.length}: ${missing[0]!.slice(0, 90)}`
  );

  check(
    'Day 6: the reveal order is the plan order',
    (() => {
      const text = shown.fullText.toLowerCase();
      const positions = expected.cards.map((c) => text.indexOf(normalize(c.body).toLowerCase()));
      return positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!));
    })(),
    expected.cards.map((c) => c.kind).join(' > ')
  );

  check(
    'Day 6: her six loudness bars rendered',
    shown.barLabels.length === 6,
    shown.barLabels.join(' ')
  );

  check(
    "Day 6: Root's noticing typed itself out and names the window it counted",
    onScreen(shown, expected.noticing) && /of your first \d+ days|days in/.test(expected.noticing),
    expected.noticing
  );

  check('Day 6: the close points at tomorrow and nothing else', onScreen(shown, expected.tomorrow), expected.tomorrow);
  check(
    'Day 6: no membership language, no price, no countdown anywhere on it',
    !/membership|upgrade|subscribe|price|days left/i.test(shown.fullText),
    ''
  );
  check('Day 6: no em dash on the screen', !shown.fullText.includes(String.fromCharCode(0x2014)), '');
  // TIER C's OBSERVATION CARD, AND WHY IT IS NOT ON THIS SCREEN. It needs a
  // published member_pattern_states row, and those come from the trend and
  // correlation engines over a twenty one day window. A six day old account
  // cannot honestly have one, so this run asserts the absence rather than
  // pretending to have seen the card. Its selection rules are proven by
  // fixtures in tests/trial-arc-recap.test.ts.
  const { data: signals } = await service
    .from('member_pattern_states')
    .select('signal_key')
    .eq('member_id', rig.id);
  check(
    'Day 6: she has no published signal, so there is honestly no observation card',
    (signals ?? []).length === 0 && !stored.cards.some((c) => c.kind === 'checkin_observation'),
    `${(signals ?? []).length} signal(s) on record`
  );
  check(
    'Day 6: and nothing hedged was printed in its place',
    !/not enough information|nothing steady enough/i.test(shown.fullText),
    ''
  );

  check('Day 6: no console or page errors on the recap', shown.consoleErrors.length === 0, shown.consoleErrors.join(' | ').slice(0, 160));

  const opened = await rigTools.listRecaps(rig.id);
  check('Day 6: that she opened it was recorded', opened[0]?.opened_at != null, String(opened[0]?.opened_at));

  // -------- offered exactly once --------
  await rigTools.clearMorningBriefs(rig.id);
  const second = await visitHome();
  check('Day 6: a second visit the same day shows nothing', !second.present, second.title);
  const rows = await rigTools.listDeliveries(rig.id);
  check('Day 6: and wrote no second receipt', rows.length === 1, `${rows.length} row(s)`);
}

async function stageStored() {
  console.log('\n== The stored plan: it re-renders, it does not recompute ==');

  const before = (await rigTools.listRecaps(rig.id))[0];
  if (!before) {
    check('there is a stored recap to re-read', false, 'run the day6 stage first');
    return;
  }

  const first = await visitRecap();
  const again = await visitRecap();

  check('the recap renders identically on a reload', first.fullText === again.fullText, '');

  const after = (await rigTools.listRecaps(rig.id))[0];
  check(
    'and nothing about the stored row moved',
    JSON.stringify(after.plan) === JSON.stringify(before.plan) &&
      after.composed_at === before.composed_at &&
      after.tier === before.tier,
    `${before.composed_at} vs ${after.composed_at}`
  );
  check('there is still exactly one recap row', (await rigTools.listRecaps(rig.id)).length === 1, '');

  // The direct read: what the row holds is what the screen showed.
  const stored = sanitizeRecapPlan(after.plan);
  const expected = stored ? renderTrialArcRecap(stored) : null;
  check(
    'a direct read of the row renders the screen that was displayed',
    expected !== null && onScreen(again, expected.noticing),
    expected?.noticing ?? 'unreadable plan'
  );
  check('the open stamp did not move on a re-read', after.opened_at === before.opened_at, `${before.opened_at}`);
}

async function stageTierA() {
  console.log('\n== Tier A: the thin data recap, live ==');

  await withConversationsSetAside(async () => {
    await rigTools.clearCheckins(rig.id);
    await service.from('member_goal_selections').delete().eq('member_id', rig.id);
    await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);
    await rigTools.clearMorningBriefs(rig.id);
    await clearDay6();
    await rigTools.setRigDay(rig.id, 6);

    let landedOn = '';
    let screen: RecapScreen | null = null;
    const seen = await visitHome(async (page) => {
      const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
      await dialog.locator('button').first().click();
      await page.waitForURL((u) => u.pathname !== '/dashboard', { timeout: 30000 }).catch(() => {});
      landedOn = new URL(page.url()).pathname;
      screen = await readRecap(page);
    });

    assertCopy('Tier A', seen, TRIAL_ARC_DAY_6);
    check('Tier A: the button still opens the recap', landedOn === TRIAL_ARC_ROUTES.weekRecap, landedOn);

    const row = await waitForRecapRow();
    check('Tier A: a recap was composed for an account with nothing on it', row !== null, row ? `tier ${row.tier}` : 'no row');
    if (!row || !screen) return;

    check('Tier A: it is stored as tier A', row.tier === 'A', row.tier);
    const stored = sanitizeRecapPlan(row.plan);
    check('Tier A: it holds no cards, because there is nothing to hold', stored?.cards.length === 0, `${stored?.cards.length} cards`);

    const shown: RecapScreen = screen;
    const expected = renderTrialArcRecap(stored!);
    check(
      'Tier A: Root says plainly that the account is all there is',
      onScreen(shown, expected.intro),
      expected.intro.slice(0, 80)
    );
    check(
      'Tier A: it never claims to have learned anything',
      !/what we learned|here is what we found/i.test(shown.fullText),
      ''
    );
    check(
      'Tier A: the button points at the next unfinished free conversation',
      expected.cta?.href === TRIAL_ARC_ROUTES.coreValuesSnapshot &&
        shown.ctaLabels.includes(expected.cta.label),
      `${expected.cta?.label} -> ${expected.cta?.href}`
    );
    check('Tier A: still points at tomorrow', onScreen(shown, expected.tomorrow), '');
    check('Tier A: no console or page errors', shown.consoleErrors.length === 0, shown.consoleErrors.join(' | ').slice(0, 160));
  });
}

async function stageCloser() {
  console.log('\n== The closer has tripped, and day 6 is still offered ==');

  await rigTools.resetDeliveries(rig.id);
  await rigTools.resetRecaps(rig.id);
  await rigTools.resetPopups(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);

  // Three pacing messages, delivered and left alone. Days 3, 4 and 5,
  // because the rig has finished both conversations and is correctly AHEAD
  // on days 1 and 2.
  for (const day of [3, 4, 5]) {
    await rigTools.setRigDay(rig.id, day);
    await rigTools.seedActiveDays(rig.id, day);
    await rigTools.clearMorningBriefs(rig.id);
    await rigTools.resetArcPopups(rig.id);
    const seen = await visitHome();
    check(`closer: day ${day} spoke`, seen.present, seen.title);
    const receipt = await waitForReceipt(trialArcPopupMessageKey(day));
    check(
      `closer: day ${day} was recorded and she did nothing with it`,
      receipt !== null && receipt.cta_tapped_at === null,
      receipt ? String(receipt.cta_tapped_at) : 'no row'
    );
  }

  // The pacing is now closed. A pacing day proves it.
  await rigTools.setRigDay(rig.id, 4);
  await rigTools.resetArcPopups(rig.id);
  await rigTools.clearMorningBriefs(rig.id);
  const pacing = await visitHome();
  check('closer: a pacing day is silent, so the closer genuinely tripped', !pacing.present, pacing.title);

  // And day 6 is not.
  await rigTools.setRigDay(rig.id, 6);
  await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.resetArcPopups(rig.id);
  await rigTools.clearMorningBriefs(rig.id);
  const day6 = await visitHome();
  assertCopy('closer: day 6 after the closer', day6, TRIAL_ARC_DAY_6);

  const receipt = await waitForReceipt(trialArcPopupMessageKey(6));
  check('closer: day 6 wrote its own receipt', receipt !== null, receipt ? '' : 'no row');

  await rigTools.clearMorningBriefs(rig.id);
  const again = await visitHome();
  check('closer: and day 6 is offered exactly once, not once per visit', !again.present, again.title);
  const sixes = (await rigTools.listDeliveries(rig.id)).filter((r: { day_number: number }) => r.day_number === 6);
  check('closer: one day 6 receipt, not two', sixes.length === 1, `${sixes.length}`);
}

async function stageFatigue() {
  console.log('\n== The arrival callback, from a real quiz she really took ==');

  await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);

  // A genuine signed out walk of the public quiz, in a browser with no
  // session at all, exactly as a stranger takes it.
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  await page.goto(`${BASE}/energy/qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });
  const token = await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'));
  check('the signed out quiz issued a visitor token', Boolean(token), token ? 'yes' : 'none');
  await page.getByRole('button', { name: 'Begin' }).click();

  for (let q = 0; q < 9; q += 1) {
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    const options = page.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 30000 }).catch(() => {});
    const count = await options.count();
    if (count === 0) break;
    await options.nth(Math.min(1, count - 1)).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(450);
  }
  await page.getByText('What we noticed').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const { data: sessionRow } = await service
    .from('public_entry_sessions')
    .select('id, pattern_key')
    .eq('visitor_token', token)
    .maybeSingle();
  check('the quiz produced a named pattern for this visitor', Boolean(sessionRow?.pattern_key), JSON.stringify(sessionRow));

  // The bind, exactly as the app does it: the same browser, now carrying a
  // session, fires PublicEntryClaim from the root layout on the next load.
  const minted = await mintSessionCookies(rig.email, { baseUrl: BASE });
  if (!minted || minted.session.user.id !== rig.id) {
    check('a session could be minted for the rig', false);
    await context.close();
    return;
  }
  await context.addCookies(minted.cookies);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await context.close();
  await retireSession(minted);

  const { data: origin } = await service
    .from('member_public_entry_origin')
    .select('pattern_key')
    .eq('member_id', rig.id)
    .maybeSingle();
  check('the arrival bound itself to the rig, the way real signup does', origin?.pattern_key != null, JSON.stringify(origin));
  if (!origin?.pattern_key) return;

  // A fresh day 6, so the recap is composed WITH the arrival behind it.
  await rigTools.setRigDay(rig.id, 6);
  await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.clearMorningBriefs(rig.id);
  await clearDay6();

  const screen = await visitRecap();
  const row = await waitForRecapRow();
  check('the recap composed with the arrival on record', row !== null, '');
  if (!row) return;

  check('the stored recap says the callback is on it', row.fatigue_callback === true, String(row.fatigue_callback));

  const stored = sanitizeRecapPlan(row.plan)!;
  check('and the callback is the FIRST card', stored.cards[0]?.kind === 'fatigue_callback', stored.cards[0]?.kind ?? 'none');

  const expected = renderTrialArcRecap(stored);
  const patternTitle = ENERGY_PATTERN_COPY[origin.pattern_key as keyof typeof ENERGY_PATTERN_COPY].title;
  check(
    `the callback card references her real quiz result ("${patternTitle}")`,
    expected.cards[0]?.body.includes(patternTitle) === true,
    expected.cards[0]?.body.slice(0, 100) ?? ''
  );
  check(
    'and it is on the screen, first, word for word',
    onScreen(screen, expected.cards[0]!.body) &&
      screen.fullText.toLowerCase().indexOf(normalize(expected.cards[0]!.body).toLowerCase()) <
        Math.min(
          ...expected.cards
            .slice(1)
            .map((c) => screen.fullText.toLowerCase().indexOf(normalize(c.body).toLowerCase()))
            .filter((i) => i >= 0)
            .concat([Number.MAX_SAFE_INTEGER])
        ),
    ''
  );
  check('no console or page errors with the callback on it', screen.consoleErrors.length === 0, screen.consoleErrors.join(' | ').slice(0, 160));
}

async function stageExclusion() {
  console.log('\n== The arc is still launched for no one ==');

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

  const { data: recaps } = await service.from('member_trial_arc_recaps').select('member_id');
  const others = (recaps ?? []).filter((r: { member_id: string }) => r.member_id !== rig.id);
  check('no recap row exists for anybody but the rig', others.length === 0, `${(recaps ?? []).length} row(s) total`);
}

async function stageRestore() {
  console.log('\n== Restoring the rig to a clean day 1 for the next prompt ==');
  await rigTools.resetAll(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);
  await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);
  const set = await rigTools.setRigDay(rig.id, 1);
  const state = await rigTools.showRig(rig.id);
  check('the rig is on day 1 again', set.dayNumber === 1, set.startLocal);
  check('with no deliveries left', state.deliveries.length === 0, `${state.deliveries.length}`);
  check('and no recap left', state.recaps.length === 0, `${state.recaps.length}`);
  check('still flagged is_test', state.profile.is_test === true, '');
  check('and still has no coach assignment', state.assignments.length === 0, '');
}

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'day6' || STAGE === 'all') await stageDay6();
    if (STAGE === 'stored' || STAGE === 'all') await stageStored();
    if (STAGE === 'closer' || STAGE === 'all') await stageCloser();
    if (STAGE === 'fatigue' || STAGE === 'all') await stageFatigue();
    // Last of the driving stages, because it is the only one that touches
    // her completed conversations at all.
    if (STAGE === 'tiera' || STAGE === 'all') await stageTierA();
    if (STAGE === 'exclusion' || STAGE === 'all') await stageExclusion();
    if (STAGE === 'restore' || STAGE === 'all') await stageRestore();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  for (const f of failed) console.log(`  FAIL  ${f.name}  ${f.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
