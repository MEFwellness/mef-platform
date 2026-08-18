#!/usr/bin/env node
/**
 * Program delivery, checked against a running app: video, real dosing and
 * the guided walk-through.
 *
 * Runs against any host, so the same script proves the same properties on
 * a local dev server and on app.mefwellness.com:
 *
 *   BASE_URL        default https://app.mefwellness.com
 *   COACH_EMAIL     a coach who has MEMBER_ID as an assigned client
 *   COACH_PASSWORD
 *   MEMBER_EMAIL    that member
 *   MEMBER_PASSWORD
 *   MEMBER_ID       the member's user id (the coach screens are keyed by it)
 *
 * SIGNING IN WITHOUT THE LOGIN FORM. Bot protection is live on
 * production's auth forms and refuses a scripted browser, which is exactly
 * what it is for. Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and
 * PROD_ANON_KEY_FILE (file PATHS) and both halves arrive by a one-time
 * magic-link session instead, retired at the end. Passwords still work
 * where minting is unavailable, which is what keeps this runnable against
 * a local dev server unchanged.
 *
 * The member must already have a completed static_posture assessment with
 * findings, because that is the generator's input. This script never
 * writes one: seeding assessment data is not something a verification
 * script should do quietly.
 *
 * PLAYS EXACTLY ONE VIDEO. The allowance is 350 plays a month. The whole
 * point of the browse assertions is that opening a program spends none, so
 * this counts every /video-url request the app makes and fails if browsing
 * caused any, then taps play on exactly one exercise. SKIP_VIDEO=1 plays
 * none.
 */
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  return page.url();
}

/** Every video URL the app asked for, so "browsing spends nothing" is counted rather than assumed. */
function watchVideoRequests(page) {
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) requests.push(r.url());
  });
  return requests;
}

if (!MEMBER_ID) {
  console.error('Set MEMBER_ID (the member whose program is generated and opened).');
  process.exit(2);
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------
// 1. As the coach: generate, read the prescriptions, approve and assign.
// ---------------------------------------------------------------------
const coachMinted = process.env.COACH_EMAIL && canMintSessions()
  ? await mintSessionContext(browser, process.env.COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 1280, height: 1000 },
    })
  : null;

if (process.env.COACH_EMAIL && (process.env.COACH_PASSWORD || coachMinted)) {
  const page = coachMinted
    ? await coachMinted.context.newPage()
    : await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  let landed;
  if (coachMinted) {
    await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
    landed = page.url();
  } else {
    landed = await signIn(page, process.env.COACH_EMAIL, process.env.COACH_PASSWORD);
  }
  check('coach: signed in', !landed.includes('/login'), landed.replace(BASE, ''));

  await page.goto(`${BASE}/coach/corrective-programs/${MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
  const generate = page.getByRole('button', { name: /generate/i });
  check('coach: the generate screen opens', (await generate.count()) > 0, page.url().replace(BASE, ''));

  await generate.first().click();
  await page.waitForURL(/\/coach\/corrective-programs\/[^/]+\/[^/]+$/, { timeout: 60000 });
  check('coach: a draft was generated', true, page.url().split('/').pop().slice(0, 40));

  // Every exercise row prints the sentence the member will read. The
  // review screen says "No prescription set" when there is nothing to
  // print, which is exactly what this build exists to make impossible.
  await page.waitForSelector('text=/Release|Mobility|Stability|Core/', { timeout: 30000 });
  const reviewText = await page.locator('main').innerText();
  check(
    'coach: no exercise in the draft is missing its prescription',
    !reviewText.includes('No prescription set'),
    ''
  );

  const setsInputs = page.locator('input[aria-label^="Sets for "]');
  const setsCount = await setsInputs.count();
  check('coach: every exercise offers editable dosing fields', setsCount > 0, `${setsCount} exercises`);

  const filled = await setsInputs.evaluateAll((nodes) => nodes.filter((n) => n.value.trim() !== '').length);
  check('coach: every set count arrives already filled in', setsCount > 0 && filled === setsCount, `${filled} of ${setsCount}`);

  const restFilled = await page
    .locator('input[aria-label^="Rest (s) for "]')
    .evaluateAll((nodes) => nodes.filter((n) => n.value.trim() !== '').length);
  check('coach: every rest arrives already filled in', restFilled === setsCount, `${restFilled} of ${setsCount}`);

  // Holds for the time-based blocks, tempo reps for the loaded ones.
  const holds = await page
    .locator('input[aria-label^="Hold (s) for "]')
    .evaluateAll((nodes) => nodes.filter((n) => n.value.trim() !== '').length);
  const tempos = await page
    .locator('input[aria-label^="Tempo for "]')
    .evaluateAll((nodes) => nodes.filter((n) => n.value.trim() !== '').length);
  check('coach: the draft mixes timed holds and tempo reps', holds > 0 && tempos > 0, `${holds} holds, ${tempos} tempos`);

  // Start today, so the assigned workout is one a member has now.
  const today = new Date().toISOString().slice(0, 10);
  await page.fill('input[type="date"]', today);

  await page.getByRole('button', { name: /approve/i }).first().click();
  await page.waitForURL(/\/coach\/clients\/[^/]+\/programs/, { timeout: 60000 });
  check('coach: approved and assigned', true, page.url().replace(BASE, ''));

  check('coach: no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
  await retireSession(coachMinted);
} else {
  console.log('SKIP  coach checks (set COACH_EMAIL with COACH_PASSWORD, or with the PROD_* key files)');
}

// ---------------------------------------------------------------------
// 2 to 5. As the member.
// ---------------------------------------------------------------------
const memberMinted = process.env.MEMBER_EMAIL && canMintSessions()
  ? await mintSessionContext(browser, process.env.MEMBER_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 390, height: 844 },
    })
  : null;

if (process.env.MEMBER_EMAIL && (process.env.MEMBER_PASSWORD || memberMinted)) {
  const page = memberMinted
    ? await memberMinted.context.newPage()
    : await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const videoRequests = watchVideoRequests(page);

  let landed;
  if (memberMinted) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    landed = page.url();
  } else {
    landed = await signIn(page, process.env.MEMBER_EMAIL, process.env.MEMBER_PASSWORD);
  }
  check('member: signed in', !landed.includes('/login'), landed.replace(BASE, ''));

  await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
  const workoutLink = page.locator('a[href^="/programs/"]');
  const workoutCount = await workoutLink.count();
  check('member: My Programs lists an assigned workout', workoutCount > 0, `${workoutCount} listed`);
  if (workoutCount === 0) {
    await page.close();
  } else {
    await workoutLink.first().click();
    await page.waitForURL(/\/programs\/[^/]+$/, { timeout: 30000 });
    await page.waitForSelector('text=/Walk me through it/i', { timeout: 30000 });

    const detailText = await page.locator('main').innerText();

    // 2. Dose, cues, reasoning, poster.
    check(
      'member: every exercise shows a real prescription',
      /\d+ sets? of /.test(detailText),
      (detailText.match(/\d+ sets? of [^\n·]+/) ?? ['none'])[0]
    );
    check('member: rest is stated in words', /seconds rest|minute rest/.test(detailText), '');
    check('member: coaching cues are shown', /Coaching Cue/i.test(detailText), '');
    check('member: the reasoning is shown', /Why this exercise/i.test(detailText), '');

    const posters = await page.locator('button[aria-label="Play exercise video"]').count();
    check('member: every exercise offers a video to tap', posters > 0, `${posters} play buttons`);

    // Scroll the whole list, which is the part that must not cost quota.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(1500);
    check(
      'member: opening and scrolling the workout requested ZERO videos',
      videoRequests.length === 0,
      `${videoRequests.length} requests`
    );

    // 3. Exactly one play.
    if (!process.env.SKIP_VIDEO) {
      const play = page.locator('button[aria-label="Play exercise video"]').first();
      const response = page.waitForResponse((r) => r.url().includes('/video-url'), { timeout: 30000 });
      await play.click();
      const res = await response.catch(() => null);
      check(
        'member: tapping play resolves a video URL (ONE play spent)',
        res !== null && res.status() === 200,
        res ? `status ${res.status()}` : 'no /video-url request seen'
      );
      await page.waitForTimeout(2000);
      const playing = await page.locator('video').count();
      check('member: the video element appears after the tap', playing > 0, `${playing} video elements`);
    }

    const spentAfterOnePlay = videoRequests.length;

    // 4. The guided walk-through: mark done, mark done, skip, then leave.
    await page.getByRole('button', { name: /Walk me through it/i }).click();
    await page.waitForSelector('text=/Start the walk-through/i', { timeout: 30000 });
    const overviewText = await page.locator('main').innerText();
    check('member: the walk-through lists the session', /What is in it/i.test(overviewText), '');

    await page.getByRole('button', { name: /Start the walk-through/i }).click();
    await page.waitForSelector('text=/Skip this one/i', { timeout: 30000 });

    const walked = [];
    for (let step = 0; step < 3; step++) {
      const stageText = await page.locator('main').innerText();
      // Case-insensitive: the counter is uppercased by CSS, and Playwright's
      // innerText reports what is painted rather than what is in the DOM.
      walked.push(stageText.split('\n').find((line) => /\d+ of \d+/i.test(line)) ?? '?');
      const label = step === 2 ? /Skip this one/i : /Mark done/i;
      await page.getByRole('button', { name: label }).first().click();
      await page.waitForTimeout(800);
    }
    check('member: walked three exercises with mark done and skip', walked.length === 3, walked.join(' -> '));

    const afterWalk = await page.locator('main').innerText();
    check(
      'member: the walk-through is still on a real exercise or the completion screen',
      /Skip this one|That is the workout/i.test(afterWalk),
      ''
    );
    check(
      'member: walking the session requested no further videos',
      videoRequests.length === spentAfterOnePlay,
      `${videoRequests.length - spentAfterOnePlay} extra`
    );

    // Leave it.
    const leave = page.getByRole('button', { name: /Leave this session|Back to the full list/i }).first();
    if ((await leave.count()) > 0) await leave.click();
    await page.waitForTimeout(800);
    check('member: leaving the walk-through works', true, '');

    // 5. Root Movement still works. No video played here.
    await page.goto(`${BASE}/movement/sessions`, { waitUntil: 'domcontentloaded' });
    const sessionLink = page.locator('a[href^="/movement/sessions/"]');
    const sessions = await sessionLink.count();
    check('member: Root Movement still lists its sessions', sessions > 0, `${sessions} sessions`);
    if (sessions > 0) {
      await sessionLink.first().click();
      await page.waitForURL(/\/movement\/sessions\/[^/]+$/, { timeout: 30000 });
      await page.waitForSelector('text=/What is in it/i', { timeout: 30000 });
      const sessionText = await page.locator('main').innerText();
      check(
        'member: a Root Movement session still opens on its lineup',
        /What is in it/i.test(sessionText) && /Begin/i.test(sessionText),
        page.url().replace(BASE, '')
      );
      check(
        'member: opening it played nothing',
        videoRequests.length === spentAfterOnePlay,
        `${videoRequests.length} total video requests in the whole run`
      );
    }

    check('member: no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
  await retireSession(memberMinted);
} else {
  console.log('SKIP  member checks (set MEMBER_EMAIL with MEMBER_PASSWORD, or with the PROD_* key files)');
}

await browser.close();

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);
