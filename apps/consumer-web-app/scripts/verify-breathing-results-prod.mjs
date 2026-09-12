/**
 * The breathing results screen, on production, without destroying a row.
 *
 * WHY THIS IS A SECOND SCRIPT AND NOT A FLAG ON THE FIRST ONE.
 * `verify-breathing-check-in-live.mjs` opens and closes with a `clean()`
 * that DELETES every sitting the member has, which is right against a
 * local database seeded from scratch and wrong against production, where
 * the rows belong to somebody. This one deletes nothing, ever. It reads
 * what is already stored, walks one NEW sitting onto the end of her
 * history, and leaves both standing.
 *
 * WHAT IT PROVES, and none of it can be proved off production:
 *
 *   PHASE A, entirely read only. Her existing finished sitting is opened
 *     as her, on the real domain, and every number on the screen is
 *     compared to the row read independently with the service key. The
 *     expectations are DERIVED FROM THE STORED ANSWERS rather than typed,
 *     so this script cannot drift into asserting a number it also
 *     invented.
 *   PHASE B, additive. The coach sends it again with the real control, the
 *     member walks all sixteen with high answers, and the other side of
 *     the reference threshold is read on a real screen. The earlier
 *     sitting is still there afterwards, which is the history rule.
 *
 * BOTH PHASES TAP "Review With My Coach" and follow it into Root.
 *
 * WHERE IT RUNS:
 *   BPC_BASE_URL          default https://app.mefwellness.com
 *   PROD_SUPABASE_URL     the database behind it
 *   PROD_SERVICE_KEY_FILE a PATH to the service role key
 *   PROD_ANON_KEY_FILE    a PATH to the anon key
 *   BPC_MEMBER / BPC_MEMBER_EMAIL      the member whose stored sitting
 *                                      phase A reads back
 *   BPC_MEMBER_B / BPC_MEMBER_B_EMAIL  the member who walks a fresh high
 *                                      sitting in phase B
 *   BPC_COACH                          the coach the seeded assignment is
 *                                      attributed to
 *
 * KEYS ARRIVE AS FILE PATHS, never on a command line, and the sessions it
 * mints are retired locally the moment it is done.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BPC_BASE_URL ?? 'https://app.mefwellness.com';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'https://piafgqstbibvllsnuike.supabase.co';
process.env.PROD_SUPABASE_URL = SUPA;

const MEMBER = process.env.BPC_MEMBER;
const MEMBER_EMAIL = process.env.BPC_MEMBER_EMAIL;
const COACH = process.env.BPC_COACH;
const BPC = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405';
const EM = '—';
const MAX_SCORE = 64;
const REFERENCE_THRESHOLD = 23;

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exitCode = 1;
  throw new Error('missing key file paths');
}
if (!MEMBER || !MEMBER_EMAIL || !COACH) {
  console.error('Set BPC_MEMBER, BPC_MEMBER_EMAIL and BPC_COACH.');
  process.exitCode = 1;
  throw new Error('missing identities');
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok: Boolean(ok), note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${String(e)}`));
}

/** The instrument's own order, and the plain names her results screen prints. */
const ITEMS = [
  ['chest_pain', 'Chest pain', 'Pain in the chest'],
  ['feeling_tense', 'Feeling tense', 'Feeling tense'],
  ['blurred_vision', 'Blurred vision', 'Blurred vision'],
  ['dizzy_spells', 'Dizzy spells', 'Dizziness'],
  ['feeling_confused', 'Feeling confused', 'Feeling foggy or unclear'],
  ['faster_deeper_breathing', 'Faster or deeper breathing', 'Faster or deeper breathing'],
  ['short_of_breath', 'Short of breath', 'Feeling short of breath'],
  ['tight_chest', 'Tight feelings in chest', 'Tightness in the chest'],
  ['bloated_stomach', 'Bloated feeling in stomach', 'A bloated feeling in the stomach'],
  ['tingling_fingers', 'Tingling fingers', 'Tingling in the fingers'],
  ['unable_to_breathe_deeply', 'Unable to breathe deeply', 'Not being able to breathe deeply'],
  ['stiff_fingers_arms', 'Stiff fingers or arms', 'Stiffness in the fingers or arms'],
  ['tight_round_mouth', 'Tight feelings round mouth', 'Tightness around the mouth'],
  ['cold_hands_feet', 'Cold hands or feet', 'Cold hands or feet'],
  ['palpitations', 'Palpitations', 'A racing or pounding heartbeat'],
  ['feelings_of_anxiety', 'Feelings of anxiety', 'Feeling anxious'],
];
const POINTS = { never: 0, rarely: 1, sometimes: 2, often: 3, very_often: 4 };
const LABELS = { never: 'Never', rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often', very_often: 'Very often' };

/** What her screen should say, worked out from the stored answers alone. */
function expectationsFor(answers) {
  const rows = ITEMS.map(([itemId, , name], index) => ({
    itemId,
    name,
    valueKey: answers[itemId],
    points: POINTS[answers[itemId]] ?? 0,
    position: index + 1,
  }));
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  const strongest = rows
    .filter((row) => row.points >= 3)
    .sort((a, b) => (b.points === a.points ? a.position - b.position : b.points - a.points))
    .slice(0, 4)
    .map((row) => ({ name: row.name, answer: LABELS[row.valueKey] }));
  return { total, above: total >= REFERENCE_THRESHOLD, strongest, rows };
}

async function screenKey(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
}

async function settled(page, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return last ?? '';
}

async function waitForScreenChange(page, previous, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const now = await screenKey(page);
    if (now !== previous && now === last && now.length > 0) return now;
    last = now;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`the screen never settled away from ${String(previous).slice(0, 80)}`);
}

/** Tap an answer and WAIT FOR THE APP TO AGREE it was tapped. */
async function tap(page, name) {
  const radios = page.getByRole('radio', { name, exact: true });
  const target = (await radios.count()) > 0 ? radios : page.getByRole('button', { name, exact: true });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await target.first().click({ timeout: 10000 }).catch(() => {});
    const [checked, pressed] = await Promise.all([
      target.first().getAttribute('aria-checked').catch(() => null),
      target.first().getAttribute('aria-pressed').catch(() => null),
    ]);
    if (checked === 'true' || pressed === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tap never registered: ${name}`);
}

/** Every inline left percentage on the drawn bar. Read off the DOM, not the caption. */
async function markPercents(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[style*="left"]'))
      .map((node) => Number.parseFloat(node.style.left))
      .filter((value) => Number.isFinite(value))
  );
}

/** Everything her reading must say for one sitting. Used by both phases. */
async function assertReading(page, label, expected, screen) {
  const flat = screen.replace(/\s+/g, ' ');
  check(
    `${label}: the score on screen is the score in the row`,
    new RegExp(`${expected.total}\\s*/\\s*${MAX_SCORE}`).test(flat),
    flat.slice(0, 140)
  );
  check(
    `${label}: the threshold line names the right side`,
    expected.above
      ? /above the traditional reference threshold/i.test(screen) &&
          !/below the traditional reference threshold/i.test(screen)
      : /below the traditional reference threshold/i.test(screen) &&
          !/above the traditional reference threshold/i.test(screen)
  );
  check(
    `${label}: the paragraph explaining it matches that side`,
    expected.above
      ? /occurring frequently enough to be worth exploring further/i.test(screen)
      : /showing up less frequently/i.test(screen)
  );
  check(
    `${label}: the sentence saying what the score is NOT is there`,
    /this is not a diagnosis of a breathing disorder/i.test(screen)
  );
  check(
    `${label}: the scale names both landmarks`,
    new RegExp(`traditional reference threshold:\\s*${REFERENCE_THRESHOLD}`, 'i').test(screen) &&
      new RegExp(`your score:\\s*${expected.total}`, 'i').test(screen)
  );

  const marks = await markPercents(page);
  const near = (target) => marks.some((mark) => Math.abs(mark - target) < 0.01);
  check(
    `${label}: her marker sits at her own share of the scale`,
    near((expected.total / MAX_SCORE) * 100),
    `expected ~${((expected.total / MAX_SCORE) * 100).toFixed(2)}%, found ${marks.map((m) => m.toFixed(2)).join(', ')}`
  );
  check(
    `${label}: the reference figure is marked at its own share`,
    near((REFERENCE_THRESHOLD / MAX_SCORE) * 100)
  );
  check(
    `${label}: no severity band and no warning vocabulary`,
    !/severe|moderate|mild|warning|danger|abnormal/i.test(screen)
  );

  check(`${label}: the strongest signals section is there`, /your strongest signals/i.test(screen));
  check(
    `${label}: it lists exactly what she answered highest`,
    expected.strongest.every((row) => screen.includes(row.name)),
    expected.strongest.map((row) => `${row.name} / ${row.answer}`).join(' | ')
  );
  check(
    `${label}: strongest first`,
    expected.strongest.every((row, index) =>
      index === 0 ? true : screen.indexOf(row.name) > screen.indexOf(expected.strongest[index - 1].name)
    )
  );
  check(
    `${label}: the intro matches how many qualified`,
    expected.strongest.length >= 3
      ? /these came back most often in your answers/i.test(screen)
      : expected.strongest.length === 2
        ? /two came back at the higher end of the scale/i.test(screen)
        : expected.strongest.length === 1
          ? /one came back at the higher end of the scale/i.test(screen)
          : /nothing came back at the higher end of the scale/i.test(screen)
  );
  check(
    `${label}: nothing she answered Sometimes or lower is listed`,
    expected.rows.every((row) => (row.points >= 3 ? true : !screen.includes(row.name)))
  );

  check(
    `${label}: the three areas are still there, under their new heading`,
    /what stood out in your responses/i.test(screen) &&
      /breathing sensations/i.test(screen) &&
      /tension signals/i.test(screen) &&
      /body sensations/i.test(screen)
  );
  check(`${label}: the disclaimer card is there`, /this check-in is not a diagnosis/i.test(screen));
  check(`${label}: it never names the underlying instrument`, !/nijmegen/i.test(screen));
  check(`${label}: no em dash anywhere she reads`, !screen.includes(EM));
}

/** Follows Review With My Coach into Root and back. */
async function assertConversation(page, label) {
  await page.getByRole('link', { name: /review with my coach/i }).first().click({ timeout: 25000 });
  await page.waitForURL(/\/conversation/, { timeout: 40000 }).catch(() => {});
  const url = page.url();
  /*
    WAIT ON THE APP, NOT ON THE CLOCK. `settled` stabilises on whatever is
    painted, and on a slow production render that is the bottom navigation
    over an empty skeleton: two samples of the same nothing read as
    settled. The composer is the thing that says this route finished.
  */
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
  const screen = await settled(page);

  check(
    `${label}: Review With My Coach opens a Root conversation with its own entry point`,
    /\/conversation\?entry=breathing_check_in/.test(url),
    url
  );
  check(
    `${label}: Root opens on the check-in she just read`,
    /you just finished your breathing pattern check-in/i.test(screen),
    screen.slice(0, 140)
  );
  check(`${label}: there is somewhere to type`, (await page.locator('textarea').count()) > 0);
  check(`${label}: no em dash on the conversation screen`, !screen.includes(EM));
  check(`${label}: Root never names the instrument`, !/nijmegen/i.test(screen));
}

// ---------------------------------------------------------------------

const { data: guard } = await admin
  .from('profiles')
  .select('is_test, display_name')
  .eq('id', MEMBER)
  .maybeSingle();
if (guard?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a test account`);
}
console.log(`target is the test account "${guard.display_name}" on ${BASE}`);

const browser = await chromium.launch();
let memberSession = null;
let memberSessionB = null;

try {
  // -------------------------------------------------------------------
  // PHASE A. Her existing sitting, read only.
  // -------------------------------------------------------------------
  const { data: before } = await admin
    .from('member_breathing_check_in_sessions')
    .select('id, answers, results, completed_at')
    .eq('member_id', MEMBER)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  check('A: there is a finished sitting already stored to read back', Boolean(before));
  if (!before) throw new Error('no stored sitting to verify against');

  const expectedA = expectationsFor(before.answers ?? {});
  check(
    'A: the stored total and the total derived from the stored answers agree',
    before.results?.totalScore === expectedA.total,
    `row ${before.results?.totalScore}, derived ${expectedA.total}`
  );

  const memberCtx = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!memberCtx) throw new Error('could not mint a member session');
  memberSession = memberCtx.session;
  const page = await memberCtx.context.newPage();
  watch(page, 'member');

  await page.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
  let screen = await settled(page);
  check('A: opening a finished check-in gives her the reading back', /your breathing pattern/i.test(screen));
  await assertReading(page, 'A', expectedA, screen);
  await assertConversation(page, 'A');

  await page.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
  await settled(page);
  await page.getByRole('button', { name: /return home/i }).first().click({ timeout: 25000 });
  await page.waitForURL(/\/dashboard/, { timeout: 40000 }).catch(() => {});
  check('A: Return Home goes Home', /\/dashboard/.test(page.url()), page.url());

  const { count: unchanged } = await admin
    .from('member_breathing_check_in_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER);
  check('A: reading her results wrote nothing and removed nothing', unchanged >= 1);

  // -------------------------------------------------------------------
  // PHASE B. A second test member walks a HIGH sitting, live.
  //
  // WHY IT IS A DIFFERENT MEMBER AND NOT THE SAME ONE SENT IT AGAIN. The
  // Breathing Pattern Check-In is deliberately NOT in
  // REASSIGNABLE_ROW_IDS (lib/assignments/assignableCatalog.ts): only the
  // Whole-Body Signal Assessment and the Whole-Body Check-In can be sent
  // again from the coach's status block today. So once a member has
  // finished this one there is no control on any screen that sends her
  // another, and a run that wanted a second sitting from her would have to
  // delete the first, which this script will not do.
  //
  // WHAT IS SEEDED, AND WHAT IS NOT. One pending assessment_assignments
  // row, written with exactly the columns assignBreathingCheckInAction
  // writes. Everything after it is the real app: her Home card, her
  // sixteen taps, the real submit, the real score and the real screen.
  // The coach's own Assign control is driven for real in
  // verify-breathing-check-in-live.mjs against a local database.
  // -------------------------------------------------------------------
  const MEMBER_B = process.env.BPC_MEMBER_B;
  const MEMBER_B_EMAIL = process.env.BPC_MEMBER_B_EMAIL;

  if (!MEMBER_B || !MEMBER_B_EMAIL) {
    check('B: a second test member was named for the high sitting', false, 'set BPC_MEMBER_B');
    throw new Error('BPC_MEMBER_B and BPC_MEMBER_B_EMAIL are required');
  }

  const { data: guardB } = await admin
    .from('profiles')
    .select('is_test, display_name')
    .eq('id', MEMBER_B)
    .maybeSingle();
  check('B: the second member is a test account too', guardB?.is_test === true, guardB?.display_name ?? '');
  if (guardB?.is_test !== true) throw new Error(`REFUSING TO RUN: ${MEMBER_B} is not a test account`);

  const { count: existingB } = await admin
    .from('member_breathing_check_in_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER_B);
  check('B: the second member has no breathing history this run could damage', existingB === 0, String(existingB));

  const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  dueAt.setUTCHours(0, 0, 0, 0);
  const { error: seedError } = await admin.from('assessment_assignments').insert({
    member_id: MEMBER_B,
    assessment_definition_id: BPC,
    assigned_by: COACH,
    is_required: true,
    reason: null,
    stage: 'standard',
    due_at: dueAt.toISOString(),
  });
  check('B: the check-in was opened for her', !seedError || seedError.code === '23505', seedError?.message ?? '');

  /*
    A HIGH SITTING, MIXED RATHER THAN SIXTEEN OF THE SAME, so the total is
    a real sum: four Very often, four Often, four Sometimes, four Never
    = 16 + 12 + 8 + 0 = 36, which is above the reference figure.
  */
  const ANSWERS = ITEMS.map((_, index) =>
    index < 4 ? 'Very often' : index < 8 ? 'Often' : index < 12 ? 'Sometimes' : 'Never'
  );
  const keyOf = { 'Very often': 'very_often', Often: 'often', Sometimes: 'sometimes', Never: 'never' };
  const expectedB = expectationsFor(
    Object.fromEntries(ITEMS.map(([itemId], index) => [itemId, keyOf[ANSWERS[index]]]))
  );
  console.log(`B: walking a sitting worth ${expectedB.total} / ${MAX_SCORE}`);

  const ctxB = await mintSessionContext(browser, MEMBER_B_EMAIL, {
    baseUrl: BASE,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  if (!ctxB) throw new Error('could not mint a session for the second member');
  memberSessionB = ctxB.session;
  const pageB = await ctxB.context.newPage();
  watch(pageB, 'memberB');

  await pageB.goto(`${BASE}/breathing-check-in`, { waitUntil: 'domcontentloaded' });
  let screenB = await settled(pageB);
  if (/begin check-in/i.test(screenB)) {
    await pageB.getByRole('button', { name: /begin check-in/i }).first().click({ timeout: 25000 });
    screenB = await waitForScreenChange(pageB, screenB);
  }

  for (let index = 0; index < 16; index += 1) {
    const prompt = ITEMS[index][1];
    check(`B: question ${index + 1} is "${prompt}"`, screenB.toLowerCase().includes(prompt.toLowerCase()));
    check(
      `B: question ${index + 1} shows no score`,
      (screenB.replace(/Question \d+ of \d+/gi, '').match(/\d+/g) ?? []).length === 0
    );
    await tap(pageB, ANSWERS[index]);
    screenB = await waitForScreenChange(pageB, screenB);
    if (/you're doing well|halfway|almost there/i.test(screenB)) {
      screenB = await waitForScreenChange(pageB, screenB);
    }
  }

  check('B: the completion moment plays', /your breathing pattern is ready/i.test(screenB));
  screenB = await waitForScreenChange(pageB, screenB);
  check('B: her reading appears', /your breathing pattern/i.test(screenB));
  await assertReading(pageB, 'B', expectedB, screenB);
  await assertConversation(pageB, 'B');

  const { data: storedB } = await admin
    .from('member_breathing_check_in_sessions')
    .select('id, results, completed_at')
    .eq('member_id', MEMBER_B)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  check('B: the sitting saved to production', Boolean(storedB));
  check(
    'B: the stored total is the real sum of what she tapped',
    storedB?.results?.totalScore === expectedB.total,
    `got ${storedB?.results?.totalScore}, expected ${expectedB.total}`
  );
  check(
    'B: the number she read is the number in the row',
    new RegExp(`${storedB?.results?.totalScore}\\s*/\\s*${MAX_SCORE}`).test(screenB.replace(/\s+/g, ' '))
  );

  const { count: stillThere } = await admin
    .from('member_breathing_check_in_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', MEMBER);
  check("B: the first member's history was not touched by any of this", stillThere >= 1);

  await pageB.close();
  await ctxB.context.close();

  await page.close();
  await memberCtx.context.close();
} catch (error) {
  check('the run completed without throwing', false, String(error));
} finally {
  if (memberSession) await retireSession(memberSession).catch(() => {});
  if (memberSessionB) await retireSession(memberSessionB).catch(() => {});
  await browser.close();

  for (const line of consoleErrors) console.log(`CONSOLE  ${line}`);
  check('no console or page errors on any screen', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length}`);
  process.exitCode = passed === results.length ? 0 : 1;
}
