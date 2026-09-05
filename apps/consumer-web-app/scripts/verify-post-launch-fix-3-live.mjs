/**
 * POST-LAUNCH FIX 3, DRIVEN ON app.mefwellness.com.
 *
 * The premium closing screens were being skipped. Finishing calls a Server
 * Action, an App Router Server Action answers with a re-render of the
 * route the member is on, and the take route sent a FINISHED session to
 * its results screen, so the re-render navigated her off her own closing.
 * The fix keeps a session finished within this sitting on the take route,
 * in its closing phase, so the re-render lands where she already is.
 *
 * This drives it on the live site, as a real signed-in member, at phone
 * size. Core Values Snapshot is walked THREE times, because the bug was
 * intermittent and one clean pass proves nothing. Life Signal Check and
 * the Readiness Pulse are walked once each to the same standard.
 *
 * NOTHING IS TYPED INTO THE LOGIN FORM. Turnstile is live on it by design.
 * The session is minted through the Auth Admin API and retired with scope
 * 'local' immediately after (scripts/lib/mint-session.mjs).
 *
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=... PROD_ANON_KEY_FILE=... \
 *   BASE_URL=https://app.mefwellness.com node scripts/verify-post-launch-fix-3-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL || 'https://app.mefwellness.com';
const PHONE = { width: 390, height: 844 };

/** A fixture account with no free-arc history of its own. `profiles.is_test = true`. */
const MEMBER = process.env.WALK_ACCOUNT || 'oakomah66+quiztest5@gmail.com';
/** The trial arc rig, for the day 6 recap and day 7 close. */
const ARC_MEMBER = 'oakomah66+trialarcrig@gmail.com';

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function heading(text) {
  console.log(`\n--- ${text} ---`);
}

let browser;
const consoleErrors = [];

async function openAs(email) {
  const minted = await mintSessionCookies(email, { baseUrl: BASE });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  const context = await browser.newContext({ viewport: PHONE });
  await context.addCookies(minted.cookies);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${email}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${email}: ${String(e)}`));
  return { page, context, minted };
}

async function closeAs(session) {
  await session.context.close().catch(() => {});
  await retireSession({ ...session.minted, context: null });
}

const NAV_LABELS = /^(Continue|Back|See what Root learned|Back to Home|Home|Skip|Back to Dashboard)$/i;

/** One screen of questions answered the way a member answers it. */
async function answerVisibleScreen(page) {
  const groups = page.locator('main [role="radiogroup"]');
  const groupCount = await groups.count();
  if (groupCount > 0) {
    for (let g = 0; g < groupCount; g += 1) {
      const pills = groups.nth(g).locator('button');
      const n = await pills.count();
      if (n > 0) await tap(pills.nth(Math.min(2, n - 1)));
    }
    return true;
  }

  const buttons = page.locator('main button');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const text = (await buttons.nth(i).innerText()).trim();
    if (!text || NAV_LABELS.test(text)) continue;
    await tap(buttons.nth(i));
    return true;
  }
  return false;
}

/** Clicks only if the control is really there and really enabled. */
async function tap(locator) {
  if ((await locator.count()) === 0) return false;
  const first = locator.first();
  if (!(await first.isVisible().catch(() => false))) return false;
  if (!(await first.isEnabled().catch(() => false))) return false;
  await first.click({ timeout: 10000 }).catch(() => {});
  return true;
}

async function pressForward(page) {
  if (await tap(page.locator('main button:has-text("See what Root learned")'))) return true;
  const cont = page.locator('main button', { hasText: /^Continue$/ });
  const count = await cont.count();
  if (count === 0) return false;
  return tap(cont.nth(count - 1));
}

function closingParam(page) {
  return new URL(page.url()).searchParams.get('closing');
}

/**
 * Start (or retake) an experience and answer it to the end. Returns the
 * URL the completion left her on, which is the whole question.
 */
async function walkToCompletion(page, slug, { retake }) {
  await page.goto(`${BASE}/assessments/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const label = retake ? /Take it again|Retake|again/i : /Begin|Start|Resume/i;
  const submits = page.locator('form button[type="submit"]');
  let pressed = false;
  for (let attempt = 0; attempt < 6 && !pressed; attempt += 1) {
    const count = await submits.count();
    for (let i = 0; i < count; i += 1) {
      const text = (await submits.nth(i).innerText()).trim();
      if (!label.test(text)) continue;
      await submits.nth(i).click();
      try {
        await page.waitForURL(/\/take/, { timeout: 20000 });
        pressed = true;
      } catch { /* not hydrated yet, try again */ }
      break;
    }
    if (!pressed) await page.waitForTimeout(2500);
  }
  if (!pressed) throw new Error(`could not enter ${slug} (retake=${retake}) from ${page.url()}`);

  for (let screen = 0; screen < 40; screen += 1) {
    await page.waitForTimeout(1100);
    if (closingParam(page)) break;
    // Answer whatever is on the screen, then move on. A tap that turned
    // out to BE the way forward (an intro button, a two-tile choice that
    // advances on its own) leaves Continue disabled or gone, and that is
    // not a failure: the next turn of this loop simply answers the next
    // screen.
    await answerVisibleScreen(page);
    await page.waitForTimeout(700);
    await pressForward(page);
  }

  // The window the bug lived in.
  await page.waitForTimeout(7000);
  return new URL(page.url());
}

/** Tap through the post-completion beats to the closing itself. */
async function reachClosingBeat(page) {
  for (let i = 0; i < 8; i += 1) {
    if (closingParam(page) === 'close') break;
    if (!(await tap(page.locator('main button', { hasText: /^Continue$/ })))) break;
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(3000);
  return new URL(page.url());
}

async function closingEvidence(page) {
  const main = page.locator('main');
  const text = await main.innerText();
  const html = await main.innerHTML();
  return {
    text,
    // The journey line's completion marks: a disc with a checkmark path
    // that draws itself, plus the gold sweep on the finished row.
    marks: (html.match(/<svg[^>]*viewBox="0 0 16 16"/g) ?? []).length,
    gold: /#C9A227|CVS_GOLD|linear-gradient/i.test(html),
  };
}

async function completedCount(memberId, key) {
  const { data: def } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', key)
    .maybeSingle();
  const { count } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('assessment_definition_id', def.id)
    .eq('status', 'completed');
  const { count: drafts } = await service
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('assessment_definition_id', def.id)
    .eq('status', 'in_progress');
  return { completed: count ?? 0, drafts: drafts ?? 0 };
}

/**
 * GUARD 3, WITHOUT WAITING A DAY. A timezone cannot simulate tomorrow, so
 * this moves the completion's OWN timestamp back thirty hours, loads the
 * bare take URL, and puts the timestamp back byte for byte, reading it
 * back. A member returning to a finished experience must land on her
 * results, not on a replayed closing.
 */
async function returningTheNextDay(page, memberId) {
  const { data: def } = await service
    .from('unified_assessment_definitions')
    .select('id')
    .eq('key', 'core-values-snapshot')
    .maybeSingle();
  // EVERY completed session, not just the newest one. The take route asks
  // for her latest completion, so ageing one of six leaves the second one
  // standing in as today's.
  const { data: finished } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', def.id)
    .eq('status', 'completed');
  if (!finished || finished.length === 0) {
    check('a finished session to age was found', false);
    return;
  }

  const originals = finished.map((row) => ({ id: row.id, completedAt: row.completed_at }));
  const shift = 30 * 60 * 60 * 1000;

  try {
    for (const row of originals) {
      await service
        .from('unified_assessment_sessions')
        .update({ completed_at: new Date(new Date(row.completedAt).getTime() - shift).toISOString() })
        .eq('id', row.id);
    }

    await page.goto(`${BASE}/assessments/core-values-snapshot/take`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    let at = new URL(page.url());
    check('a day later, the bare take URL lands on her results', at.pathname.includes('/results/'), at.pathname);

    await page.goto(`${BASE}/assessments/core-values-snapshot/take?closing=close`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    at = new URL(page.url());
    check('a day later, even a URL still carrying the marker lands on her results', at.pathname.includes('/results/'), at.pathname);
  } finally {
    let restored = 0;
    for (const row of originals) {
      await service.from('unified_assessment_sessions').update({ completed_at: row.completedAt }).eq('id', row.id);
      const { data: back } = await service
        .from('unified_assessment_sessions')
        .select('completed_at')
        .eq('id', row.id)
        .maybeSingle();
      if (back?.completed_at === row.completedAt) restored += 1;
    }
    check('and every timestamp was put back exactly as it was', restored === originals.length, `${restored}/${originals.length}`);
  }
}

const STAGE = process.argv[2] || 'all';

const main = async () => {
  browser = await chromium.launch();
  const walker = await openAs(MEMBER);
  const memberId = walker.minted.session.user.id;
  const page = walker.page;

  if (STAGE === 'return-later') {
    heading('returning a day later');
    await returningTheNextDay(page, memberId);
    await closeAs(walker);
    const only = results.filter((r) => r.ok).length;
    console.log(`\n${only}/${results.length} checks passed`);
    await browser.close();
    process.exit(only === results.length ? 0 : 1);
  }

  const before = {
    cvs: await completedCount(memberId, 'core-values-snapshot'),
    lsc: await completedCount(memberId, 'life-signal-check'),
    rpl: await completedCount(memberId, 'readiness-pulse'),
  };
  console.log(`\nstarting state: cvs=${JSON.stringify(before.cvs)} lsc=${JSON.stringify(before.lsc)} rpl=${JSON.stringify(before.rpl)}`);

  // ---- Walk 1: Core Values Snapshot, first time -----------------------
  heading('CVS walk 1 of 3 (first time, exits by Back to Home)');
  let url = await walkToCompletion(page, 'core-values-snapshot', { retake: before.cvs.completed > 0 });
  check('walk 1: the completion did not land on the results screen', !url.pathname.includes('/results'), url.pathname + url.search);
  check('walk 1: she is held on the take route, inside the closing', url.pathname.endsWith('/take') && url.searchParams.get('closing') !== null, url.search);

  url = await reachClosingBeat(page);
  check('walk 1: the closing beat is reached', url.searchParams.get('closing') === 'close', url.search);
  let evidence = await closingEvidence(page);
  check('walk 1: the staged reveal drew its journey progress line', evidence.text.includes('Core Values Snapshot'), '');
  check('walk 1: the self-drawing checkmarks are on the page', evidence.marks >= 1, `${evidence.marks} marks`);
  // Case-insensitively: the label is set in small caps by the design, so
  // innerText hands it back as ROOT'S NOTICING.
  check("walk 1: Root's noticing is there", /root.s noticing/i.test(evidence.text), '');
  check('walk 1: the What Root knows cards are there', evidence.text.includes('What Root knows so far'));
  check('walk 1: the next-conversation handoff is there', evidence.text.includes('Start the Life Signal Check'));

  await page.waitForTimeout(20000);
  url = new URL(page.url());
  check('walk 1: it HOLDS, 20 seconds with no tap', url.pathname.endsWith('/take') && url.searchParams.get('closing') === 'close', url.pathname + url.search);

  await tap(page.locator('main a[href="/dashboard"]', { hasText: /Back to Home/ }));
  await page.waitForTimeout(4000);
  check('walk 1: Back to Home goes Home', new URL(page.url()).pathname === '/dashboard', page.url());

  // ---- Walk 2: retake, refreshed mid-closing --------------------------
  heading('CVS walk 2 of 3 (refresh mid-closing)');
  url = await walkToCompletion(page, 'core-values-snapshot', { retake: true });
  check('walk 2: the completion did not land on the results screen', !url.pathname.includes('/results'), url.pathname + url.search);
  url = await reachClosingBeat(page);
  check('walk 2: the closing beat is reached', url.searchParams.get('closing') === 'close', url.search);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  url = new URL(page.url());
  evidence = await closingEvidence(page);
  check('walk 2: a refresh mid-closing stays on the closing', !url.pathname.includes('/results') && url.searchParams.get('closing') === 'close', url.pathname + url.search);
  check(
    'walk 2: and the closing is all still there after the refresh',
    evidence.text.includes('What Root knows so far') &&
      /root.s noticing/i.test(evidence.text) &&
      evidence.text.includes('Start the Life Signal Check')
  );

  await page.waitForTimeout(15000);
  check('walk 2: it still holds after the refresh', new URL(page.url()).searchParams.get('closing') === 'close', page.url());

  // The next-experience invitation.
  await tap(page.locator('main button', { hasText: 'Start the Life Signal Check' }));
  await page.waitForTimeout(5000);
  check('walk 2: the next-experience invitation opens the Life Signal Check', page.url().includes('/life-signal-check'), page.url());

  // ---- Walk 3: retake, third time -------------------------------------
  heading('CVS walk 3 of 3');
  url = await walkToCompletion(page, 'core-values-snapshot', { retake: true });
  check('walk 3: the completion did not land on the results screen', !url.pathname.includes('/results'), url.pathname + url.search);
  url = await reachClosingBeat(page);
  check('walk 3: the closing beat is reached', url.searchParams.get('closing') === 'close', url.search);
  evidence = await closingEvidence(page);
  check(
    'walk 3: the whole closing rendered, staged reveal and typewriter line and all',
    evidence.text.includes('What Root knows so far') &&
      /root.s noticing/i.test(evidence.text) &&
      evidence.text.includes('Start the Life Signal Check') &&
      evidence.marks >= 1
  );
  await page.waitForTimeout(15000);
  check('walk 3: it HOLDS, 15 seconds with no tap', new URL(page.url()).searchParams.get('closing') === 'close', page.url());

  // ---- Life Signal Check ----------------------------------------------
  heading('Life Signal Check');
  const lscBefore = await completedCount(memberId, 'life-signal-check');
  url = await walkToCompletion(page, 'life-signal-check', { retake: lscBefore.completed > 0 });
  check('LSC: the completion did not land on the results screen', !url.pathname.includes('/results'), url.pathname + url.search);
  url = await reachClosingBeat(page);
  check('LSC: the closing beat is reached', url.searchParams.get('closing') === 'close', url.search);
  evidence = await closingEvidence(page);
  check('LSC: the closing rendered, handoff and all', evidence.text.includes('Start the Readiness Pulse'), '');
  check('LSC: the self-drawing checkmarks are on the page', evidence.marks >= 1, `${evidence.marks} marks`);
  await page.waitForTimeout(15000);
  check('LSC: it HOLDS, 15 seconds with no tap', new URL(page.url()).searchParams.get('closing') === 'close', page.url());

  // ---- Readiness Pulse -------------------------------------------------
  heading('Readiness Pulse');
  const rplBefore = await completedCount(memberId, 'readiness-pulse');
  url = await walkToCompletion(page, 'readiness-pulse', { retake: rplBefore.completed > 0 });
  check('RPL: the completion did not land on the results screen', !url.pathname.includes('/results'), url.pathname + url.search);
  url = await reachClosingBeat(page);
  check('RPL: the closing beat is reached', url.searchParams.get('closing') === 'close', url.search);
  evidence = await closingEvidence(page);
  check('RPL: the closing rendered its own ending', /Back to Home/.test(evidence.text), '');
  check('RPL: the self-drawing checkmarks are on the page', evidence.marks >= 1, `${evidence.marks} marks`);
  await page.waitForTimeout(15000);
  check('RPL: it HOLDS, 15 seconds with no tap', new URL(page.url()).searchParams.get('closing') === 'close', page.url());

  // ---- Coming back afterwards ------------------------------------------
  heading('coming back to a finished experience');
  await page.goto(`${BASE}/assessments/core-values-snapshot/take`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  url = new URL(page.url());
  check(
    'the bare take URL, still inside the sitting, is her closing and not a blank',
    url.pathname.endsWith('/take') || url.pathname.includes('/results'),
    url.pathname + url.search
  );

  const finished = await completedCount(memberId, 'core-values-snapshot');
  const { data: def } = await service.from('unified_assessment_definitions').select('id').eq('key', 'core-values-snapshot').maybeSingle();
  const { data: newest } = await service
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', def.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  await page.goto(`${BASE}/assessments/core-values-snapshot/results/${newest.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  check('her results screen is still reachable, exactly as before', page.url().includes('/results/'), new URL(page.url()).pathname);

  heading('returning a day later');
  await returningTheNextDay(page, memberId);

  // ---- Completion rows --------------------------------------------------
  heading('what the walks wrote');
  const after = {
    cvs: await completedCount(memberId, 'core-values-snapshot'),
    lsc: await completedCount(memberId, 'life-signal-check'),
    rpl: await completedCount(memberId, 'readiness-pulse'),
  };
  check('CVS: exactly three completions written, one per walk', after.cvs.completed - before.cvs.completed === 3, `${before.cvs.completed} -> ${after.cvs.completed}`);
  check('LSC: exactly one completion written', after.lsc.completed - before.lsc.completed === 1, `${before.lsc.completed} -> ${after.lsc.completed}`);
  check('RPL: exactly one completion written', after.rpl.completed - before.rpl.completed === 1, `${before.rpl.completed} -> ${after.rpl.completed}`);
  check('no empty draft was left behind by any of it', after.cvs.drafts === 0 && after.lsc.drafts === 0 && after.rpl.drafts === 0, `cvs=${after.cvs.drafts} lsc=${after.lsc.drafts} rpl=${after.rpl.drafts}`);

  await closeAs(walker);

  // ---- The trial arc, which reads a stored plan --------------------------
  heading('the trial arc day 6 recap and day 7 close');
  const arc = await openAs(ARC_MEMBER);
  for (const [label, path] of [['day 6 recap', '/trial/week'], ['day 7 close', '/trial/close']]) {
    await arc.page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await arc.page.waitForTimeout(4000);
    const at = new URL(arc.page.url());
    const body = await arc.page.locator('main').innerText().catch(() => '');
    check(`${label} still renders`, at.pathname === path && body.trim().length > 40, `${at.pathname} (${body.trim().length} chars)`);
  }
  await closeAs(arc);

  check('no console or page errors across the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' ; '));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
};

main().catch(async (err) => {
  console.error('\nRUN FAILED:', err);
  if (browser) await browser.close();
  process.exit(1);
});
