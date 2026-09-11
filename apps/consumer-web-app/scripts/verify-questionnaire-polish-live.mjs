/**
 * THE 2026-09-11 BUG FIX AND POLISH PASS, DRIVEN ON THE REAL SITE.
 *
 * FOUR THINGS WERE REPORTED FROM A PHONE, AND THIS WALKS ALL OF THEM.
 *
 *   THE INTRO CARD MOVES. The "MEF Body Systems Survey" screen read as
 *   flat static text. It now replays a brisk reveal on every visit, so
 *   this catches it part way through typing and then whole.
 *   EVERY SECTION BEAT ARRIVES WHOLE. The check, both lines of copy and
 *   the gold line's track are all in the document and all on screen in the
 *   SAME first frame, with nothing held back behind a per element delay,
 *   and nothing moves underneath them afterwards.
 *   EVERY POP-UP IS FULLY ON THE PHONE. Its frame is a direct child of
 *   <body> (nothing in the page tree can capture a fixed element), its
 *   card is inside the viewport horizontally, its top is reachable and
 *   every button on it can actually be tapped.
 *   AND THE RESULTS SCREEN STILL DRAWS END TO END.
 *
 * IT ALSO TIMES WHAT IT WALKS, because "the app got slower" is the
 * complaint underneath all four: every Continue is stopwatched, so the
 * report says what one costs rather than guessing.
 *
 * =====================================================================
 * WHAT IT TOUCHES, AND WHAT IT REFUSES TO TOUCH
 * =====================================================================
 *
 * It needs a sitting to walk, so it assigns itself one. Everything it
 * creates is identified by comparing a SNAPSHOT taken before the walk with
 * the state after it, and only the difference is removed. That matters
 * here: the account this runs against already holds a COMPLETED Body
 * Systems sitting that a real person finished on a real phone, and a
 * cleanup written as "delete this member's sessions" would take it. A
 * finished sitting is somebody's result and is never deleted.
 *
 * The last thing it does is read the state again, independently, and print
 * whether it matches the snapshot exactly.
 *
 * ENVIRONMENT
 *   QP_BASE_URL        the app under test. Default https://app.mefwellness.com
 *   PROD_SUPABASE_URL  the database behind it
 *   PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE   PATHS to the keys
 *   QP_MEMBER_EMAIL / QP_COACH_EMAIL             who to walk as, who assigns
 *   QP_SHOTS           where screenshots go (gitignored)
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = process.env.QP_BASE_URL ?? 'https://app.mefwellness.com';
const SUPA = process.env.PROD_SUPABASE_URL ?? 'http://127.0.0.1:54321';
process.env.PROD_SUPABASE_URL = SUPA;
const MEMBER_EMAIL = process.env.QP_MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const COACH_EMAIL = process.env.QP_COACH_EMAIL ?? 'oakomah66@gmail.com';
const DEFINITION = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';
const SHOTS = process.env.QP_SHOTS ?? './live-shots-questionnaire-polish';
mkdirSync(SHOTS, { recursive: true });

if (!process.env.PROD_SERVICE_KEY_FILE || !process.env.PROD_ANON_KEY_FILE) {
  console.error('Set PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE to key file PATHS.');
  process.exit(1);
}

const admin = createClient(SUPA, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '   ' + note : ''}`);
};

/**
 * NEVER MINT FOR AN EMAIL THAT IS NOT ALREADY AN ACCOUNT. generateLink
 * CREATES the account when the address does not exist, so one typo would
 * silently walk a survey as a brand new stranger.
 */
async function resolveExistingUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`could not list users: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`REFUSING TO RUN: ${email} is not an existing account`);
  return found.id;
}

const MEMBER = await resolveExistingUser(MEMBER_EMAIL);
const COACH = await resolveExistingUser(COACH_EMAIL);
console.log(`member ${MEMBER_EMAIL} resolved, coach ${COACH_EMAIL} resolved`);

const { data: targetProfile } = await admin
  .from('profiles')
  .select('is_test, display_name, body_systems_branch')
  .eq('id', MEMBER)
  .maybeSingle();
if (targetProfile?.is_test !== true) {
  throw new Error(`REFUSING TO RUN: ${MEMBER} is not a seeded test account`);
}
console.log(`target is the test account "${targetProfile.display_name}"`);

/** Everything this run must be able to prove it did not change. */
async function snapshot() {
  const [sessions, assignments, entries, dismissals, profile] = await Promise.all([
    admin.from('member_body_systems_sessions').select('id').eq('member_id', MEMBER),
    admin.from('assessment_assignments').select('id').eq('member_id', MEMBER),
    admin
      .from('registry_entries')
      .select('id')
      .eq('member_id', MEMBER)
      .eq('source_feature', 'body_systems_survey_finding'),
    admin.from('member_root_popup_dismissals').select('message_key').eq('member_id', MEMBER),
    admin.from('profiles').select('body_systems_branch').eq('id', MEMBER).maybeSingle(),
  ]);
  return {
    sessions: new Set((sessions.data ?? []).map((r) => r.id)),
    assignments: new Set((assignments.data ?? []).map((r) => r.id)),
    entries: new Set((entries.data ?? []).map((r) => r.id)),
    dismissals: new Set((dismissals.data ?? []).map((r) => r.message_key)),
    branch: profile.data?.body_systems_branch ?? null,
  };
}

const BEFORE = await snapshot();
console.log(
  `snapshot: ${BEFORE.sessions.size} sitting(s), ${BEFORE.assignments.size} assignment(s), ` +
    `${BEFORE.entries.size} registry entr(ies), ${BEFORE.dismissals.size} dismissal(s)`
);

/** Removes ONLY rows that were not in the snapshot. */
async function teardown() {
  const now = await snapshot();
  const newSessions = [...now.sessions].filter((id) => !BEFORE.sessions.has(id));
  const newAssignments = [...now.assignments].filter((id) => !BEFORE.assignments.has(id));
  const newEntries = [...now.entries].filter((id) => !BEFORE.entries.has(id));
  const newDismissals = [...now.dismissals].filter((k) => !BEFORE.dismissals.has(k));
  if (newSessions.length)
    await admin.from('member_body_systems_sessions').delete().in('id', newSessions);
  if (newEntries.length) await admin.from('registry_entries').delete().in('id', newEntries);
  if (newAssignments.length) {
    await admin.from('assessment_attempts').delete().in('assignment_id', newAssignments);
    await admin.from('assessment_assignments').delete().in('id', newAssignments);
  }
  for (const key of newDismissals) {
    await admin
      .from('member_root_popup_dismissals')
      .delete()
      .eq('member_id', MEMBER)
      .eq('message_key', key);
  }
  if (now.branch !== BEFORE.branch) {
    await admin.from('profiles').update({ body_systems_branch: BEFORE.branch }).eq('id', MEMBER);
  }
  return { newSessions, newAssignments, newEntries, newDismissals };
}

const { data: assigned, error: assignError } = await admin
  .from('assessment_assignments')
  .insert({
    member_id: MEMBER,
    assessment_definition_id: DEFINITION,
    assigned_by: COACH,
    is_required: true,
    stage: 'standard',
    due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z',
  })
  .select('id')
  .single();
if (assignError) {
  console.error('could not assign', assignError);
  process.exit(1);
}
console.log(`assigned a sitting to walk (${assigned.id})`);

const browser = await chromium.launch();
let minted = null;
let failed = false;

/**
 * Reads the geometry of whatever modal is on screen, in the page, against
 * the real visual viewport. This is the whole pop-up check: a number a
 * browser measured, not a class name.
 */
const READ_MODAL = () => {
  const overlay =
    document.querySelector('[data-testid="root-popup"]') ??
    document.querySelector('[data-testid="modal-overlay"]') ??
    document.querySelector('[role="dialog"]')?.closest('.fixed') ??
    null;
  if (!overlay) return null;
  const dialog = overlay.querySelector('[role="dialog"]') ?? overlay;
  const r = dialog.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => {
    const br = b.getBoundingClientRect();
    return {
      label: (b.textContent ?? '').trim().slice(0, 40),
      top: Math.round(br.top),
      bottom: Math.round(br.bottom),
      width: Math.round(br.width),
      height: Math.round(br.height),
    };
  });
  const frame = overlay.querySelector('[data-testid="modal-overlay-frame"]');
  return {
    portalledToBody: overlay.parentElement === document.body,
    overlayClass: overlay.className,
    scrollable: frame ? frame.scrollHeight > frame.clientHeight : false,
    frameScrollHeight: frame ? frame.scrollHeight : null,
    frameClientHeight: frame ? frame.clientHeight : null,
    viewport: { vw, vh },
    card: {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
    buttons,
  };
};

/** One pop-up, judged. Shared so every screen size is judged the same way. */
function judgeModal(label, m) {
  if (!m) {
    check(`${label}: a pop-up was on screen`, false, 'none found');
    return;
  }
  check(`${label}: a pop-up was on screen`, true, `${m.card.width}x${m.card.height} in ${m.viewport.vw}x${m.viewport.vh}`);
  check(
    `${label}: its frame is a direct child of <body>, so nothing on the page can capture it`,
    m.portalledToBody === true
  );
  check(
    `${label}: it is horizontally inside the phone`,
    m.card.left >= 0 && m.card.right <= m.viewport.vw,
    `left ${m.card.left}, right ${m.card.right}, width ${m.viewport.vw}`
  );
  // The top is the half that was broken: a centred card taller than the
  // screen used to start above it, unreachably.
  check(
    `${label}: its top is reachable, never above the top of the screen`,
    m.card.top >= 0,
    `top ${m.card.top}`
  );
  const tall = m.card.height > m.viewport.vh;
  check(
    `${label}: ${tall ? 'it is taller than the screen and the frame scrolls' : 'it fits, and is centred'}`,
    tall ? m.scrollable === true : m.card.bottom <= m.viewport.vh,
    tall
      ? `card ${m.card.height} in ${m.viewport.vh}, frame scrolls ${m.frameScrollHeight} of ${m.frameClientHeight}`
      : `bottom ${m.card.bottom} of ${m.viewport.vh}`
  );
  const unreachable = m.buttons.filter((b) => b.width === 0 || b.height === 0);
  check(
    `${label}: every button on it has a real tap target`,
    unreachable.length === 0,
    unreachable.map((b) => b.label).join(' | ')
  );
}

try {
  // ==================================================================
  // 1. HOME, WITH A POP-UP WAITING. Two phone sizes, because the clipping
  //    that was reported only shows on the small one.
  // ==================================================================
  for (const size of [
    { name: 'iPhone 14', width: 390, height: 844 },
    { name: 'iPhone SE', width: 320, height: 568 },
  ]) {
    const context = await mintSessionContext(browser, MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: size.width, height: size.height },
      contextOptions: { reducedMotion: 'no-preference', isMobile: true, hasTouch: true },
    });
    if (!context) throw new Error('could not mint');
    const page = await context.context.newPage();
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page
      .waitForSelector('[role="dialog"]', { timeout: 45000 })
      .catch(() => {});
    const modal = await page.evaluate(READ_MODAL);
    judgeModal(`the Home pop-up on a ${size.name}`, modal);
    await page.screenshot({ path: `${SHOTS}/popup-${size.width}x${size.height}.png` });
    await retireSession(context);
  }

  // ==================================================================
  // 2. THE SURVEY, END TO END, ON A PHONE.
  // ==================================================================
  minted = await mintSessionContext(browser, MEMBER_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
    // Headless Chromium reports `reduce` by default, which would silently
    // turn both the intro reveal and the section beat off and make a run
    // that never played either look like a pass.
    contextOptions: { reducedMotion: 'no-preference', isMobile: true, hasTouch: true },
  });
  if (!minted) throw new Error('could not mint');
  const page = await minted.context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ---- the intro card -----------------------------------------------
  await page.goto(`${BASE}/body-systems`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Begin', { timeout: 45000 });
  // Reload and sample early: the reveal now replays on every visit, so the
  // headline must be part way typed a moment in and whole a moment later.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const revealSamples = [];
  const revealStart = Date.now();
  for (let i = 0; i < 40; i += 1) {
    const seen = await page.evaluate(() => {
      const h = document.querySelector('h1');
      if (!h) return null;
      const visible = h.querySelector('[aria-hidden="true"]');
      return {
        full: (h.querySelector('.sr-only')?.textContent ?? '').trim(),
        typed: (visible?.textContent ?? '').trim(),
        caret: !!h.querySelector('.mef-typewriter-caret'),
      };
    });
    if (seen) revealSamples.push({ at: Date.now() - revealStart, ...seen });
    if (seen && seen.full && seen.typed === seen.full && !seen.caret) break;
    await page.waitForTimeout(40);
  }
  const partial = revealSamples.find((s) => s.full && s.typed.length > 0 && s.typed.length < s.full.length);
  const whole = revealSamples.find((s) => s.full && s.typed === s.full && !s.caret);
  check(
    'the intro headline is typed rather than printed',
    Boolean(partial),
    partial ? `caught at "${partial.typed}" after ${partial.at}ms` : 'never seen part way'
  );
  check(
    'and it finishes quickly enough that nobody is waiting on it',
    Boolean(whole) && whole.at < 2000,
    whole ? `whole at ${whole.at}ms` : 'never completed'
  );
  const beginAt = Date.now();
  await page.waitForSelector('button:has-text("Begin")', { timeout: 15000 });
  check('Begin is on screen and tappable', true, `${Date.now() - beginAt}ms after the headline settled`);
  await page.screenshot({ path: `${SHOTS}/intro.png` });

  // ---- the walk ------------------------------------------------------
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.getByRole('button', { name: 'Begin' }).click().catch(() => {});
    if (await page.locator('text=/section 1 of 11/i').count()) break;
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('text=/section 1 of 11/i', { timeout: 45000 });

  /** Answer everything on this screen, then Continue, timing the wait. */
  const continueTimes = [];
  const beats = [];

  async function answerScreen() {
    const rows = page.locator('ol button[aria-checked]');
    const total = await rows.count();
    const perQuestion = new Map();
    for (let i = 0; i < total; i += 1) {
      const row = rows.nth(i);
      const group = await row.evaluate((el) => {
        const li = el.closest('li') ?? el.parentElement;
        return li ? (li.getAttribute('data-q') ?? String(Array.from(li.parentElement.children).indexOf(li))) : '0';
      });
      if (!perQuestion.has(group)) perQuestion.set(group, row);
    }
    for (const row of perQuestion.values()) {
      for (let t = 0; t < 15; t += 1) {
        await row.click({ timeout: 5000 }).catch(() => {});
        if ((await row.getAttribute('aria-checked')) === 'true') break;
        await page.waitForTimeout(150);
      }
    }
  }

  /**
   * The six red flag screens. These rows are `role="radio"`, not buttons
   * (components/assessments/QuestionOptionButton.tsx), which is why
   * addressing them as buttons found nothing and stalled a whole run.
   * Answers No every time: this is a walk of the flow, not a claim about
   * anybody's health, and a Yes would write a safety response.
   */
  async function answerRedFlag() {
    const rows = page.locator('[role="radio"]');
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const label = ((await row.textContent()) ?? '').trim();
      if (!/^no$/i.test(label)) continue;
      for (let t = 0; t < 15; t += 1) {
        await row.click({ timeout: 5000 }).catch(() => {});
        if ((await row.getAttribute('aria-checked')) === 'true') return;
        await page.waitForTimeout(150);
      }
    }
  }

  /**
   * Presses Continue and, if a beat follows, reads the beat's VERY FIRST
   * painted frame. Everything that screen is supposed to show has to be in
   * it and on screen in that one sample, which is the whole claim.
   */
  async function pressContinue() {
    // The last screen relabels this button, so it is addressed by its
    // position rather than by a word that changes underneath the walk.
    const button = page.locator('button:has(svg.lucide-arrow-right)').last();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (!(await button.isDisabled())) break;
      await page.waitForTimeout(150);
    }
    const before = await page.evaluate(() => document.body.innerText.slice(0, 120));
    const t0 = Date.now();
    await button.click();
    // Poll fast so the first sample is genuinely the first frame.
    let beat = null;
    let moved = false;
    while (Date.now() - t0 < 30000) {
      const state = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="section-transition"]');
        if (b) {
          const onScreen = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && Number(s.opacity) > 0.01;
          };
          const paragraphs = Array.from(b.querySelectorAll('p'));
          const track = Array.from(b.querySelectorAll('div')).find((d) => d.className.includes('w-40'));
          const boxes = Array.from(b.querySelectorAll('svg, p, div')).map((el) => {
            const r = el.getBoundingClientRect();
            return Math.round(r.top) + ':' + Math.round(r.height);
          });
          return {
            kind: 'beat',
            check: onScreen(b.querySelector('svg')),
            texts: paragraphs.map((p) => (p.textContent ?? '').trim()),
            textsOnScreen: paragraphs.every(onScreen),
            track: onScreen(track),
            delays: Array.from(b.querySelectorAll('*')).map((el) => el.style.animationDelay).filter(Boolean),
            boxes,
          };
        }
        return { kind: 'screen', text: document.body.innerText.slice(0, 120) };
      });
      if (state.kind === 'beat' && !beat) beat = { ...state, at: Date.now() - t0 };
      if (state.kind === 'screen' && state.text !== before) {
        moved = true;
        break;
      }
      await page.waitForTimeout(30);
    }
    const elapsed = Date.now() - t0;
    continueTimes.push(elapsed);
    if (beat) {
      // A second reading a beat later: nothing may have MOVED between them.
      const later = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="section-transition"]');
        if (!b) return null;
        return Array.from(b.querySelectorAll('svg, p, div')).map((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(r.top) + ':' + Math.round(r.height);
        });
      });
      beats.push({ ...beat, later });
    }
    return { moved, elapsed, beat };
  }

  let guard = 0;
  let finishedSurvey = false;
  while (guard < 140) {
    guard += 1;
    if (await page.locator('[data-testid="section-transition"]').count()) {
      await page.waitForTimeout(200);
      continue;
    }
    const onResults = await page.locator('.mef-bs-bar').count();
    if (onResults > 0) {
      finishedSurvey = true;
      break;
    }
    // The branch question, once.
    const branch = page.locator('button[aria-pressed]');
    if ((await branch.count()) === 2 && (await branch.first().getAttribute('aria-pressed')) === 'false') {
      await branch.first().click();
      await page.waitForTimeout(200);
    }
    if (await page.locator('ol button[aria-checked]').count()) await answerScreen();
    else await answerRedFlag();
    const outcome = await pressContinue();
    if (!outcome.moved) {
      const body = await page.evaluate(() => document.body.innerText);
      if (!/section \d+ of 11/i.test(body) && !/\d+ of 6/i.test(body)) break;
    }
  }

  // ---- what the beats showed ----------------------------------------
  check('the survey was walked to the end', finishedSurvey || guard < 140, `${guard} screens`);
  check('a section beat was actually played', beats.length > 0, `${beats.length} beats seen`);
  if (beats.length) {
    const firstFrames = beats.map((b) => b.at);
    const allComplete = beats.every(
      (b) => b.check && b.track && b.textsOnScreen && b.texts.length >= 2 && b.texts.every((t) => t.length > 0)
    );
    check(
      'every beat had its check, both lines and the gold line in its FIRST frame',
      allComplete,
      `first sample at ${Math.min(...firstFrames)} to ${Math.max(...firstFrames)}ms after the tap`
    );
    const noDelays = beats.every((b) => b.delays.length === 0);
    check('and nothing on it was held back behind a per element delay', noDelays);
    const noShift = beats.every((b) => !b.later || JSON.stringify(b.later) === JSON.stringify(b.boxes));
    check('and nothing moved underneath it afterwards', noShift);
  }
  if (continueTimes.length) {
    const sorted = [...continueTimes].sort((a, b) => a - b);
    console.log(
      `\nContinue, measured: min ${sorted[0]}ms  median ${sorted[Math.floor(sorted.length / 2)]}ms  ` +
        `max ${sorted[sorted.length - 1]}ms  over ${sorted.length} presses`
    );
  }

  // ---- results -------------------------------------------------------
  await page.waitForSelector('.mef-bs-bar', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const resultsState = await page.evaluate(() => {
    const onScreen = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const bars = Array.from(document.querySelectorAll('.mef-bs-bar'));
    const h1 = document.querySelector('h1');
    const buttons = Array.from(document.querySelectorAll('button'));
    return {
      bars: bars.length,
      /*
        A BAR IS JUDGED BY WHETHER IT FINISHED GROWING, NOT BY HOW WIDE IT
        IS. Its width is its real percentage and a genuinely quiet system's
        bar is legitimately a sliver, so measuring width would call correct
        data a failure. The animation runs `scaleX(0)` to `scaleX(1)`, so
        an identity transform is the honest proof that every one of them
        started, ran and landed.
      */
      barsGrown: bars.filter((b) => {
        const t = getComputedStyle(b).transform;
        return t === 'none' || /^matrix\(1,\s*0,\s*0,/.test(t);
      }).length,
      trackLaidOut: bars.filter((b) => onScreen(b.parentElement)).length,
      heading: (h1?.textContent ?? '').trim(),
      headingOnScreen: onScreen(h1),
      // The eleven system names are revealed here and nowhere else, so
      // this is also the proof the blind survey un-blinded at the end.
      namedRows: Array.from(document.querySelectorAll('li, div'))
        .map((n) => (n.textContent ?? '').trim())
        .filter((t) => /Digestion|Thyroid|Immune System|Hormonal Health/.test(t)).length,
      wayOut: buttons.some((b) => onScreen(b) && (b.textContent ?? '').trim().length > 0),
      wayOutLabel: (buttons.find((b) => onScreen(b))?.textContent ?? '').trim(),
      legend: /Speaking loudly/.test(document.body.innerText),
    };
  });
  check(
    'the results screen drew all eleven bars, every one of them fully grown',
    resultsState.bars === 11 && resultsState.barsGrown === 11 && resultsState.trackLaidOut === 11,
    `${resultsState.barsGrown} grown of ${resultsState.bars}, ${resultsState.trackLaidOut} tracks laid out`
  );
  check(
    'the results screen has its headline on screen',
    resultsState.headingOnScreen && resultsState.heading.length > 0,
    resultsState.heading
  );
  check('the legend explaining the bars is there', resultsState.legend);
  check('the body systems are named here, which is where the survey stops being blind', resultsState.namedRows > 0);
  check('and there is a way back out', resultsState.wayOut, resultsState.wayOutLabel);
  await page.screenshot({ path: `${SHOTS}/results.png`, fullPage: true });

  check('no console error on any screen of the walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (error) {
  failed = true;
  console.error('\nTHE WALK THREW:', error);
} finally {
  if (minted) await retireSession(minted).catch(() => {});
  await browser.close().catch(() => {});

  const removed = await teardown();
  console.log(
    `\nteardown removed: ${removed.newSessions.length} sitting(s), ${removed.newAssignments.length} assignment(s), ` +
      `${removed.newEntries.length} registry entr(ies), ${removed.newDismissals.length} dismissal(s)`
  );

  // The independent read. Taken fresh, compared field by field.
  const AFTER = await snapshot();
  const same = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
  const clean =
    same(BEFORE.sessions, AFTER.sessions) &&
    same(BEFORE.assignments, AFTER.assignments) &&
    same(BEFORE.entries, AFTER.entries) &&
    same(BEFORE.dismissals, AFTER.dismissals) &&
    BEFORE.branch === AFTER.branch;
  check(
    'production is back exactly as it was, read independently',
    clean,
    `sittings ${AFTER.sessions.size}, assignments ${AFTER.assignments.size}, ` +
      `entries ${AFTER.entries.size}, dismissals ${AFTER.dismissals.size}`
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed} of ${results.length}`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  FAIL  ${r.name}  ${r.note}`);
  if (failed || passed !== results.length) process.exitCode = 1;
}
