/**
 * DRIVING DAY 7 ON THE LIVE SITE.
 *
 * Prompt 5 built "Your 7-Day Reset": a pop-up on day 7, a closing screen
 * behind it, and a close composed once from her real rows and stored. This
 * run watches all of that happen on app.mefwellness.com, in a real browser,
 * signed in as a real account.
 *
 * THE ONE ACCOUNT IT TOUCHES is the permanent rig (scripts/trial-arc-rig.mjs),
 * flagged is_test, named in TRIAL_ARC_TEST_ACCOUNT_IDS in the production
 * environment. Every write is scoped to its id and asserts that flag first.
 * No other production account is written to; the exclusion stage READS every
 * other account to confirm the arc still refuses it.
 *
 * WHAT IT COMPARES AGAINST. Not sentences typed into this file. It reads the
 * STORED PLAN out of the database, renders it with the app's own
 * renderTrialArcClose, and asserts the browser is showing exactly that.
 * Separately it recomputes her loudest signal and her readiness from her own
 * completed sessions with the app's own scoring engines, and asserts the
 * stored focus carries those. So "the focus is her real signal and her real
 * readiness" is checked against the rows, twice, from two directions.
 *
 * STAGES, runnable one at a time so a failure can be re-run in isolation:
 *   day7  stored  thin  closer  fatigue  pricing  widget  exclusion  restore
 *   all   every stage in order
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com npx tsx scripts/verify-trial-arc-day7-live.mts all
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
// @ts-expect-error the rig helper is plain JavaScript, by design
import * as rigTools from './trial-arc-rig.mjs';
// @ts-expect-error the shared minting helper is plain JavaScript, by design
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';
import { TRIAL_ARC_DAY_7, type TrialArcMessageCopy } from '../lib/trial-arc/copy';
import { TRIAL_ARC_ROUTES, trialArcPopupMessageKey } from '../lib/trial-arc/constants';
import { renderTrialArcClose } from '../lib/trial-arc/closeCopy';
import { sanitizeClosePlan } from '../lib/trial-arc/closePlan';
import type { RenderedTrialArcClose } from '../lib/trial-arc/closeTypes';
import { computeCvsScoring } from '../lib/core-values-snapshot/scoring';
import { computeLscScoring } from '../lib/life-signal-check/scoring';
import { computeRplScoring } from '../lib/readiness-pulse/scoring';
import { CVS_KEY } from '../lib/core-values-snapshot/constants';
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

type CloseScreen = {
  reached: boolean;
  heading: string;
  lines: string[];
  /** Every anchor on the screen: its text and its href. */
  links: { text: string; href: string }[];
  fullText: string;
  consoleErrors: string[];
};

async function readClose(page: Page): Promise<CloseScreen> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const main = page.locator('main');
  await main.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

  // WAITING OUT THE WHOLE REVEAL, TYPEWRITER INCLUDED. The staged fade runs a
  // couple of seconds on a first view and the completion line then types
  // itself at the app's own rate. Reading the screen early would be reading a
  // half drawn one, so this waits for the text to stop growing rather than
  // guessing at a number.
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

  const texts = await main.locator('h1, h2, h3, p, a, span').allInnerTexts();
  const anchors = main.locator('a');
  const links: { text: string; href: string }[] = [];
  for (let i = 0; i < (await anchors.count()); i += 1) {
    links.push({
      text: (await anchors.nth(i).innerText()).trim(),
      href: (await anchors.nth(i).getAttribute('href')) ?? '',
    });
  }

  return {
    reached: new URL(page.url()).pathname === TRIAL_ARC_ROUTES.weekClose,
    heading: (await main.locator('h1').first().innerText().catch(() => '')).trim(),
    lines: texts.map(normalize).filter(Boolean),
    links,
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
 * Case insensitive, and for one reason only: the small card labels are
 * uppercased in CSS, and `innerText` reports what the member sees rather than
 * what the markup says. Every other property of the comparison is exact.
 */
function onScreen(screen: CloseScreen, line: string): boolean {
  const wanted = normalize(line).toLowerCase();
  if (screen.lines.some((seen) => seen.toLowerCase() === wanted)) return true;
  return screen.fullText.toLowerCase().includes(wanted);
}

/**
 * One visit to the close screen, from a fresh session.
 *
 * IT WAITS FOR THE REAL HEADING BEFORE IT READS ANYTHING, and that is a fix
 * for a real misread in this file rather than a precaution. A member who
 * arrives before her close has been composed sees the quiet "Putting this
 * together" screen while the mounted effect composes it and refreshes. The
 * text-stability loop below can legitimately conclude that the QUIET screen
 * has settled, and the refresh then lands part way through the read, giving
 * back one screen's anchors and the other screen's text. Waiting for the
 * heading first means every read is of one settled screen.
 */
async function visitClose(): Promise<CloseScreen> {
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${TRIAL_ARC_ROUTES.weekClose}`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('main h1', { hasText: 'Your 7-Day Reset' })
      .first()
      .waitFor({ timeout: 40000 })
      .catch(() => {});
    return await readClose(page);
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

async function waitForCloseRow(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await rigTools.listCloses(rig.id);
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
 * Written out longhand rather than calling the app's own accessor, on
 * purpose: the point of this read is to be a SECOND opinion about what her
 * rows say, so it resolves the question ids itself rather than trusting the
 * mapping the app uses to compose the close.
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
  if (Object.keys(answers).length === 0) return null;
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

/** Drives one assessment through its own real screens. */
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
 * Her finished conversations, set aside for the length of one stage and put
 * straight back. The only way to see the thin data branch on an account that
 * has already done the work.
 */
async function withConversationsSetAside<T>(fn: () => Promise<T>): Promise<T> {
  const keys = [CVS_KEY, LSC_KEY, RPL_KEY];
  const kept: { id: string; completed_at: string }[] = [];

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
    kept.push(...rows);
  }

  if (kept.length > 0) {
    // 'in_progress' AND completed_at nulled, together: the table's own
    // completed-fields check constraint refuses one without the other.
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
    // because that timestamp is the row's own fact.
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

/** Everything about day 7, cleared, so a stage can watch it happen from the start. */
async function clearDay7() {
  await rigTools.resetCloses(rig.id);
  await rigTools.resetRecaps(rig.id);
  await rigTools.resetDeliveries(rig.id);
  await rigTools.resetArcPopups(rig.id);
}

/**
 * Everything a member could read on the close, checked for the one
 * vocabulary this screen may never use.
 *
 * The same list tests/trial-arc-close.test.ts holds, applied to the real
 * rendered DOM rather than to a fixture, because a screen can put words on
 * itself that no copy module wrote (a shared banner, a nav label, an error).
 */
const ACCESS_ENDING = [
  'days left', 'days remaining', 'day left', 'last day', 'final day', 'last chance',
  'expires', 'expiring', 'expired', 'ends today', 'ends tomorrow', 'trial ends',
  'access ends', 'lose access', 'runs out', 'act now', 'hurry', 'deadline',
  'countdown', 'limited time',
];

function assertNoUrgency(label: string, screen: CloseScreen) {
  const text = screen.fullText.toLowerCase();
  const hits = ACCESS_ENDING.filter((term) => text.includes(term));
  check(`${label}: nothing on the screen says access is ending`, hits.length === 0, hits.join(', '));
  check(`${label}: no em dash on the screen`, !screen.fullText.includes(String.fromCharCode(0x2014)), '');
  check(
    `${label}: no placeholder href and no dead link anywhere`,
    screen.links.every((l) => l.href.startsWith('http') || l.href.startsWith('/') || l.href.startsWith('mailto:')) &&
      !text.includes('pricing_link'),
    screen.links.map((l) => l.href).join(' ')
  );
}

/** Every line the stored plan renders, asserted present on the real screen. */
function assertRendersPlan(label: string, screen: CloseScreen, expected: RenderedTrialArcClose) {
  const missing = [
    expected.completionLine,
    expected.completionBody,
    expected.arrivalLine ?? '',
    expected.focus.label,
    expected.focus.title,
    expected.focus.body,
    expected.focus.nextStep ?? '',
    expected.focus.cta?.label ?? '',
    expected.doorsIntro,
    ...expected.doors.flatMap((d) => [d.label, d.body]),
    expected.exitLabel,
  ]
    .filter(Boolean)
    .filter((line) => !onScreen(screen, line));

  check(
    `${label}: every line the stored plan renders is on the screen, word for word`,
    missing.length === 0,
    missing.length === 0 ? `${expected.doors.length} door(s)` : `missing ${missing.length}: ${missing[0]!.slice(0, 90)}`
  );
}

// =====================================================================
// STAGES
// =====================================================================

async function stageDay7() {
  console.log('\n== Day 7: the pop-up, and the close behind it ==');

  await rigTools.setRigDay(rig.id, 7);
  const seeded = await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.clearMorningBriefs(rig.id);
  await clearDay7();
  note(`trial moved so today is day 7, check-ins seeded on ${seeded.join(', ')}`);

  // The whole free arc, so the focus branch with a real signal AND a real
  // readiness is genuinely reachable rather than assumed.
  const before = await herRealResults();
  if (!before.lsc) {
    console.log('\n   -- completing Life Signal Check through the real screens --');
    check('Life Signal Check genuinely completed', await completeAssessment(TRIAL_ARC_ROUTES.lifeSignalCheck), '');
    await clearDay7();
  }
  if (!before.rpl) {
    console.log('\n   -- completing Readiness Pulse through the real screens --');
    check('Readiness Pulse genuinely completed', await completeAssessment(TRIAL_ARC_ROUTES.readinessPulse), '');
    await clearDay7();
  }

  let landedOn = '';
  let screen: CloseScreen | null = null;
  const seen = await visitHome(async (page) => {
    const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
    await dialog.locator('button').first().click();
    await page.waitForURL((u) => u.pathname !== '/dashboard', { timeout: 30000 }).catch(() => {});
    landedOn = new URL(page.url()).pathname;
    screen = await readClose(page);
  });

  assertCopy('Day 7', seen, TRIAL_ARC_DAY_7);
  check('Day 7: the button opens the close', landedOn === TRIAL_ARC_ROUTES.weekClose, landedOn);

  const receipt = await waitForReceipt(trialArcPopupMessageKey(7));
  check('Day 7: the delivery receipt landed', receipt !== null, receipt ? '' : 'no row after 30s');
  if (receipt) {
    check(
      "Day 7: the receipt carries the rig's OWN calendar day",
      receipt.delivered_local_date === rigTools.rigLocalDate(0),
      `${receipt.delivered_local_date} vs ${rigTools.rigLocalDate(0)}`
    );
    check(
      'Day 7: it records day 7 and asks for no step',
      receipt.day_number === 7 && receipt.pointed_step === 'none',
      `${receipt.day_number}/${receipt.pace_state}/${receipt.pointed_step}`
    );
    check('Day 7: pressing the button was recorded', receipt.cta_tapped_at !== null, receipt.cta_tapped_at ?? 'not stamped');
  }

  const row = await waitForCloseRow();
  check('Day 7: her close was composed and stored', row !== null, row ? `${row.completion}/${row.focus_kind}` : 'no row after 30s');
  if (!row || !screen) return;

  const stored = sanitizeClosePlan(row.plan);
  check('Day 7: the stored plan is one this build would accept back', stored !== null, '');
  if (!stored) return;

  // -------- what the rows actually say, computed independently --------
  const real = await herRealResults();
  const conversations = [real.cvs, real.lsc, real.rpl].filter(Boolean).length;
  check(
    `Day 7: the completion branch matches her real history (${row.completion})`,
    row.completion === (conversations === 3 ? 'full' : 'partial'),
    `${conversations}/3 conversations finished`
  );

  if (real.lsc) {
    check(
      `Day 7: the focus names her real chosen signal (${SIGNAL_LABEL[real.lsc.chosenSignal]})`,
      stored.focus.kind === 'signal' && stored.focus.signal === real.lsc.chosenSignal,
      stored.focus.kind === 'signal' ? stored.focus.signal : 'thin'
    );
  }
  if (real.rpl) {
    check(
      `Day 7: and is sized by her real readiness (${READINESS_PATTERN_LABEL[real.rpl.finalPattern]})`,
      stored.focus.kind === 'signal' && stored.focus.readinessPattern === real.rpl.finalPattern,
      stored.focus.kind === 'signal' ? String(stored.focus.readinessPattern) : 'thin'
    );
    const readyLeads = real.rpl.finalPattern === 'ready_now' || real.rpl.finalPattern === 'ready_if_small';
    check(
      'Day 7: the doors are emphasised the way her readiness asks',
      stored.leadDoor === (readyLeads && stored.doors.includes('membership') ? 'membership' : 'conversation'),
      `lead ${stored.leadDoor}, doors ${stored.doors.join('+')}`
    );
  }

  check(
    'Day 7: the counted claim counted the days she really logged',
    stored.counts.checkinDays === seeded.length && stored.counts.trialDays === 7,
    `${stored.counts.checkinDays} of ${stored.counts.trialDays}`
  );

  // -------- the screen shows exactly the stored plan --------
  const shown: CloseScreen = screen;
  const expected = renderTrialArcClose(stored, {
    // The addresses the SCREEN is actually serving, read back off it, so
    // this comparison is about the words rather than about guessing what
    // Vercel has configured. The door hrefs are asserted separately below.
    discoveryCallUrl: shown.links.find((l) => l.text === 'Talk with Osei')?.href ?? '',
    membershipPricingUrl: shown.links.find((l) => l.text === 'Continue with Rooted Reset')?.href ?? null,
  });

  check('Day 7: the close screen was reached', shown.reached, '');
  check('Day 7: the heading is the shipped one', shown.heading === 'Your 7-Day Reset', shown.heading);
  assertRendersPlan('Day 7', shown, expected);
  assertNoUrgency('Day 7', shown);

  const conversationDoor = shown.links.find((l) => l.text === 'Talk with Osei');
  check(
    'Day 7: the conversation door opens a real booking address',
    Boolean(conversationDoor && /^https?:\/\//.test(conversationDoor.href)),
    conversationDoor?.href ?? 'no door'
  );
  note(`the conversation door points at ${conversationDoor?.href ?? 'nothing'}`);

  const membershipDoor = shown.links.find((l) => l.text === 'Continue with Rooted Reset');
  note(
    membershipDoor
      ? `the membership door points at ${membershipDoor.href} (MEMBERSHIP_PRICING_URL is set in this environment)`
      : 'the membership door is not drawn (MEMBERSHIP_PRICING_URL is unset in this environment)'
  );
  check(
    'Day 7: the membership door is drawn if and only if the stored plan offered it, and points somewhere real',
    stored.doors.includes('membership')
      ? Boolean(membershipDoor && /^https?:\/\//.test(membershipDoor.href))
      : membershipDoor === undefined,
    `stored doors ${stored.doors.join('+')}, drawn ${membershipDoor ? 'yes' : 'no'}`
  );

  check(
    'Day 7: the quiet exit is on the screen',
    shown.links.some((l) => l.text === 'Back to Home'),
    ''
  );
  check('Day 7: no console or page errors on the close', shown.consoleErrors.length === 0, shown.consoleErrors.join(' | ').slice(0, 160));

  const opened = await rigTools.listCloses(rig.id);
  check('Day 7: that she opened it was recorded', opened[0]?.opened_at != null, String(opened[0]?.opened_at));

  // -------- the door tap --------
  {
    const { context, minted } = await rigContext();
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${TRIAL_ARC_ROUTES.weekClose}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main a', { hasText: 'Talk with Osei' }).first().waitFor({ timeout: 30000 });
      // The href is external, so the click is intercepted: the beacon still
      // fires, which is the thing being verified.
      await page.evaluate(() => {
        for (const a of Array.from(document.querySelectorAll('main a'))) {
          if (a.textContent?.trim() === 'Talk with Osei') a.setAttribute('href', '#');
        }
      });
      await page.locator('main a', { hasText: 'Talk with Osei' }).first().click();
      await page.waitForTimeout(4000);
    } finally {
      await context.close();
      await retireSession(minted);
    }
  }
  const tapped = (await rigTools.listCloses(rig.id))[0];
  check('Day 7: the door she took was recorded', tapped?.door_tapped === 'conversation', String(tapped?.door_tapped));
  check('Day 7: and stamped with a time', tapped?.door_tapped_at != null, String(tapped?.door_tapped_at));

  // -------- offered exactly once --------
  await rigTools.clearMorningBriefs(rig.id);
  const second = await visitHome();
  check('Day 7: a second visit the same day shows nothing', !second.present, second.title);
  const sevens = (await rigTools.listDeliveries(rig.id)).filter((r: { day_number: number }) => r.day_number === 7);
  check('Day 7: one day 7 receipt, not two', sevens.length === 1, `${sevens.length}`);
}

async function stageStored() {
  console.log('\n== The stored close: it re-renders, it does not recompute ==');

  const before = (await rigTools.listCloses(rig.id))[0];
  if (!before) {
    check('there is a stored close to re-read', false, 'run the day7 stage first');
    return;
  }

  const first = await visitClose();
  const again = await visitClose();

  check('the close renders identically on a reload', first.fullText === again.fullText, '');

  const after = (await rigTools.listCloses(rig.id))[0];
  check(
    'and nothing about the stored row moved',
    JSON.stringify(after.plan) === JSON.stringify(before.plan) &&
      after.composed_at === before.composed_at &&
      after.completion === before.completion &&
      after.lead_door === before.lead_door,
    `${before.composed_at} vs ${after.composed_at}`
  );
  check('there is still exactly one close row', (await rigTools.listCloses(rig.id)).length === 1, '');
  check('the open stamp did not move on a re-read', after.opened_at === before.opened_at, `${before.opened_at}`);
  check(
    'and the door she already took was not rewritten',
    after.door_tapped === before.door_tapped,
    `${before.door_tapped} vs ${after.door_tapped}`
  );

  const stored = sanitizeClosePlan(after.plan);
  const expected = stored
    ? renderTrialArcClose(stored, {
        discoveryCallUrl: again.links.find((l) => l.text === 'Talk with Osei')?.href ?? '',
        membershipPricingUrl: again.links.find((l) => l.text === 'Continue with Rooted Reset')?.href ?? null,
      })
    : null;
  check(
    'a direct read of the row renders the screen that was displayed',
    expected !== null && onScreen(again, expected.completionLine),
    expected?.completionLine ?? 'unreadable plan'
  );
}

async function stageThin() {
  console.log('\n== Thin data: Root refuses to pick a focus, live ==');

  await withConversationsSetAside(async () => {
    await rigTools.clearCheckins(rig.id);
    await service.from('member_public_entry_origin').delete().eq('member_id', rig.id);
    await rigTools.clearMorningBriefs(rig.id);
    await clearDay7();
    await rigTools.setRigDay(rig.id, 7);

    let landedOn = '';
    let screen: CloseScreen | null = null;
    const seen = await visitHome(async (page) => {
      const dialog = page.locator('div[role="dialog"][aria-labelledby="root-invite-popup-title"]');
      await dialog.locator('button').first().click();
      await page.waitForURL((u) => u.pathname !== '/dashboard', { timeout: 30000 }).catch(() => {});
      landedOn = new URL(page.url()).pathname;
      screen = await readClose(page);
    });

    assertCopy('Thin', seen, TRIAL_ARC_DAY_7);
    check('Thin: the button still opens the close', landedOn === TRIAL_ARC_ROUTES.weekClose, landedOn);

    const row = await waitForCloseRow();
    check('Thin: a close was composed for an account with nothing on it', row !== null, row ? `${row.completion}/${row.focus_kind}` : 'no row');
    if (!row || !screen) return;

    check('Thin: it is stored as partial, with the thin focus', row.completion === 'partial' && row.focus_kind === 'thin', `${row.completion}/${row.focus_kind}`);

    const stored = sanitizeClosePlan(row.plan)!;
    const shown: CloseScreen = screen;
    const expected = renderTrialArcClose(stored, {
      discoveryCallUrl: shown.links.find((l) => l.text === 'Talk with Osei')?.href ?? '',
      membershipPricingUrl: shown.links.find((l) => l.text === 'Continue with Rooted Reset')?.href ?? null,
    });

    check(
      'Thin: Root says what she would want to know instead of picking a focus',
      onScreen(shown, 'Before I would pick a focus, I would want to know what is loudest for you'),
      expected.focus.body.slice(0, 90)
    );
    check(
      'Thin: and the CTA points at the unfinished conversation',
      expected.focus.cta !== null && shown.links.some((l) => l.href === expected.focus.cta!.href),
      `${expected.focus.cta?.label} -> ${expected.focus.cta?.href}`
    );
    check(
      'Thin: the partial completion line is the generous one, and counts nothing she did not do',
      onScreen(shown, 'This week opened the door. The next one is where it gets specific.') &&
        !/you only|of the three|\d of 3/i.test(shown.fullText),
      ''
    );
    check('Thin: the doors are still both offered as her stored plan says', shown.links.some((l) => l.text === 'Talk with Osei'), '');
    assertNoUrgency('Thin', shown);
    check('Thin: no console or page errors', shown.consoleErrors.length === 0, shown.consoleErrors.join(' | ').slice(0, 160));
  });
}

async function stageCloser() {
  console.log('\n== The closer has tripped, and day 7 is still offered exactly once ==');

  await rigTools.resetDeliveries(rig.id);
  await rigTools.resetCloses(rig.id);
  await rigTools.resetRecaps(rig.id);
  await rigTools.resetPopups(rig.id);
  await service.from('lifestyle_experiments').delete().eq('member_id', rig.id);

  // Three pacing messages, delivered and left alone.
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

  // And day 7 is not.
  await rigTools.setRigDay(rig.id, 7);
  await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.resetArcPopups(rig.id);
  await rigTools.clearMorningBriefs(rig.id);
  const day7 = await visitHome();
  assertCopy('closer: day 7 after the closer', day7, TRIAL_ARC_DAY_7);

  const receipt = await waitForReceipt(trialArcPopupMessageKey(7));
  check('closer: day 7 wrote its own receipt', receipt !== null, receipt ? '' : 'no row');

  await rigTools.clearMorningBriefs(rig.id);
  const again = await visitHome();
  check('closer: and day 7 is offered exactly once, not once per visit', !again.present, again.title);
  const sevens = (await rigTools.listDeliveries(rig.id)).filter((r: { day_number: number }) => r.day_number === 7);
  check('closer: one day 7 receipt, not two', sevens.length === 1, `${sevens.length}`);
}

async function stageFatigue() {
  console.log('\n== The close references her real quiz arrival ==');

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
  check('the quiz produced a named result for this visitor', Boolean(sessionRow?.pattern_key), JSON.stringify(sessionRow));

  // The bind, exactly as the app does it.
  const minted = await mintSessionCookies(rig.email, { baseUrl: BASE });
  if (!minted || minted.session.user.id !== rig.id) {
    check('a session could be minted for the rig', false);
    await context.close();
    return;
  }
  await context.addCookies(minted.cookies);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  // POLLED RATHER THAN SLEPT FOR A FIXED SEVEN SECONDS, and that is a fix for
  // a real misread in this file (2026-09-05). PublicEntryClaim fires from the
  // root layout after Home has painted, and Home is a streaming screen: the
  // bind was measured landing thirty seconds after the quiz on a cold
  // production render, so a fixed wait reported "the arrival did not bind"
  // about a bind that was simply still in flight.
  let bound: { pattern_key: string | null } | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.waitForTimeout(2000);
    const { data } = await service
      .from('member_public_entry_origin')
      .select('pattern_key')
      .eq('member_id', rig.id)
      .maybeSingle();
    if (data?.pattern_key) {
      bound = data as { pattern_key: string | null };
      break;
    }
  }
  await context.close();
  await retireSession(minted);

  const origin = bound;
  check('the arrival bound itself to the rig, the way real signup does', origin?.pattern_key != null, JSON.stringify(origin));
  if (!origin?.pattern_key) return;

  // A fresh day 7, so the close is composed WITH the arrival behind it.
  await rigTools.setRigDay(rig.id, 7);
  await rigTools.seedActiveDays(rig.id, 3);
  await rigTools.clearMorningBriefs(rig.id);
  await clearDay7();

  const screen = await visitClose();
  const row = await waitForCloseRow();
  check('the close composed with the arrival on record', row !== null, '');
  if (!row) return;

  const stored = sanitizeClosePlan(row.plan)!;
  check('the stored plan carries her real arrival', stored.arrivalPatternKey === origin.pattern_key, String(stored.arrivalPatternKey));

  const patternTitle = ENERGY_PATTERN_COPY[origin.pattern_key as keyof typeof ENERGY_PATTERN_COPY].title;
  const expected = renderTrialArcClose(stored, {
    discoveryCallUrl: screen.links.find((l) => l.text === 'Talk with Osei')?.href ?? '',
    membershipPricingUrl: screen.links.find((l) => l.text === 'Continue with Rooted Reset')?.href ?? null,
  });
  check(
    `the close references her real quiz result ("${patternTitle}")`,
    expected.arrivalLine?.includes(patternTitle) === true,
    expected.arrivalLine?.slice(0, 110) ?? 'no arrival line'
  );
  check('and it says "You came in tired" honestly', expected.arrivalLine?.startsWith('You came in tired.') === true, '');
  check(
    'and it is on the screen, word for word',
    expected.arrivalLine !== null && onScreen(screen, expected.arrivalLine),
    ''
  );
  assertNoUrgency('Fatigue', screen);
  check('no console or page errors with the arrival on it', screen.consoleErrors.length === 0, screen.consoleErrors.join(' | ').slice(0, 160));
}

async function stagePricing() {
  console.log('\n== The membership link, on every surface that reads it ==');

  const close = await visitClose();
  const membershipDoor = close.links.find((l) => l.text === 'Continue with Rooted Reset');
  note(
    membershipDoor
      ? `MEMBERSHIP_PRICING_URL IS set in this environment: the door renders and points at ${membershipDoor.href}`
      : 'MEMBERSHIP_PRICING_URL is NOT set in this environment: the door does not render at all'
  );
  check(
    'the membership door either points at a real page or is not drawn at all',
    membershipDoor === undefined || /^https?:\/\//.test(membershipDoor.href),
    membershipDoor?.href ?? 'not drawn'
  );
  check(
    'no placeholder text and no placeholder href on the close',
    !close.fullText.toLowerCase().includes('pricing_link') &&
      !close.fullText.toLowerCase().includes('not linked here yet') &&
      close.links.every((l) => !l.href.includes('PRICING_LINK')),
    ''
  );

  // THE OTHER SWEPT SURFACE: the post-trial lock screen, which is the only
  // other place in the app that reads the membership page.
  //
  // THIS RUN DOES NOT TRY TO LOCK THE RIG, AND THAT IS A CORRECTION RATHER
  // THAN A GAP (2026-09-05). lib/membership/access.ts opens the app
  // unconditionally for a seeded test account on an unassigned trial, so an
  // expired date alone leaves the rig on Home. Moving `source` off 'system'
  // does lock it, and it also makes the row MANUAL, which migration 159's
  // guard_manual_member_subscription trigger then refuses to let any script
  // change back: putting the rig right again needed a SQL session with
  // mef.access_admin_write set. That is the trigger being exactly right, and
  // it is not a thing a repeatable verification run should be doing to a
  // fixture. So this stage reads the screen as the rig actually is.
  //
  // The lock screen itself WAS driven by hand once, on 2026-09-05, with the
  // rig temporarily locked that way: it rendered at /trial-ended with its
  // "Continue with Rooted Reset" button pointing at the real configured
  // membership page and no placeholder token anywhere on it. The unset-URL
  // branch of the same screen is proven by tests/membership-access.test.ts
  // and tests/trial-arc-close-guard.test.ts, because unsetting a live
  // production variable to watch a fallback would take the real membership
  // page away from real members.
  const { context, minted } = await rigContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/trial-ended`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const path = new URL(page.url()).pathname;
    const body = (await page.textContent('body')) ?? '';
    note(`/trial-ended for the rig (a test account the lock never shuts) resolved to ${path}`);
    check('the lock screen never prints a placeholder token, whichever way it resolves', !body.includes('PRICING_LINK'), '');
    const anchors = await page.locator('a').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? '')
    );
    check(
      'and no anchor anywhere on it points at a placeholder',
      anchors.every((href) => !href.includes('PRICING_LINK')),
      anchors.filter((h) => h.includes('PRICING')).join(' ')
    );
  } finally {
    await context.close();
    await retireSession(minted);
  }

  // And the rig's own entitlement row is left exactly as it was found, which
  // after the correction above means untouched.
  const { data: subscription } = await service
    .from('member_subscriptions')
    .select('source, tier, status')
    .eq('member_id', rig.id)
    .maybeSingle();
  check(
    'the rig is still on its own automatic trial, untouched by this stage',
    subscription?.source === 'system' && subscription?.tier === 'trial' && subscription?.status === 'active',
    JSON.stringify(subscription)
  );
}

async function stageWidget() {
  console.log('\n== The lead capture widget still works with its URL served from the shared config ==');

  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${BASE}/lead-widget-test`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // THE WIDGET'S OWN ENDPOINT, CALLED THE WAY THE WIDGET CALLS IT, from
    // this page's own origin. The chat UI lives inside a shadow root, so
    // counting characters in the page's HTML is not a read of whether the
    // agent answered; the response body is.
    //
    // Two turns, because the first is deliberately static (it opens the
    // conversation and returns the quick replies with no model call) and the
    // second is the one that runs the whole module graph, including
    // lib/lead-capture/env.ts, which now reads the booking address from
    // lib/config/conversionLinks.ts.
    const opened = await page.evaluate(async () => {
      const res = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl: window.location.href }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    });
    check(
      'the widget endpoint opens a conversation',
      opened.status === 200 && typeof opened.body.conversationId === 'string',
      `${opened.status} ${JSON.stringify(opened.body).slice(0, 120)}`
    );

    const conversationId = opened.body.conversationId as string | undefined;
    if (conversationId) {
      const replied = await page.evaluate(async (id) => {
        const res = await fetch('/api/lead-capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId: id, message: 'Pain' }),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      }, conversationId);
      check(
        'and the agent answers, so the module graph that reads the shared config still loads in production',
        replied.status === 200 && typeof replied.body.reply === 'string' && (replied.body.reply as string).length > 0,
        `${replied.status} ${String(replied.body.reply ?? replied.body.error).slice(0, 100)}`
      );
    }

    check('the widget page itself rendered with no console or page errors', errors.length === 0, errors.join(' | ').slice(0, 160));
    note(
      'the booking address itself is proven on the close screen above: both surfaces now call the one discoveryCallUrl() in lib/config/conversionLinks.ts, which tests/trial-arc-close-guard.test.ts holds to being the only reader of that variable.'
    );
  } finally {
    await context.close();
  }
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

  const { data: closes } = await service.from('member_trial_arc_closes').select('member_id');
  const others = (closes ?? []).filter((r: { member_id: string }) => r.member_id !== rig.id);
  check('no close row exists for anybody but the rig', others.length === 0, `${(closes ?? []).length} row(s) total`);

  const { data: recaps } = await service.from('member_trial_arc_recaps').select('member_id');
  const otherRecaps = (recaps ?? []).filter((r: { member_id: string }) => r.member_id !== rig.id);
  check('and no recap row does either', otherRecaps.length === 0, `${(recaps ?? []).length} row(s) total`);
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
  check('no recap left', state.recaps.length === 0, `${state.recaps.length}`);
  check('and no close left', state.closes.length === 0, `${state.closes.length}`);
  check('still flagged is_test', state.profile.is_test === true, '');
  check('and still has no coach assignment', state.assignments.length === 0, '');
}

async function main() {
  browser = await chromium.launch();
  try {
    if (STAGE === 'day7' || STAGE === 'all') await stageDay7();
    if (STAGE === 'stored' || STAGE === 'all') await stageStored();
    if (STAGE === 'closer' || STAGE === 'all') await stageCloser();
    if (STAGE === 'fatigue' || STAGE === 'all') await stageFatigue();
    if (STAGE === 'pricing' || STAGE === 'all') await stagePricing();
    if (STAGE === 'widget' || STAGE === 'all') await stageWidget();
    // Last of the driving stages, because it is the only one that touches
    // her completed conversations at all.
    if (STAGE === 'thin' || STAGE === 'all') await stageThin();
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
