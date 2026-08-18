#!/usr/bin/env node
/**
 * Catalog safety, checked against a running app.
 *
 * Runs against any host, so the same script proves the same properties on
 * a local dev server and on app.mefwellness.com:
 *
 *   BASE_URL          default https://app.mefwellness.com
 *   MEMBER_EMAIL      a member account to sign in as (optional)
 *   MEMBER_PASSWORD
 *   COACH_EMAIL       a coach or admin account (optional)
 *   COACH_PASSWORD
 *
 * With no credentials it still runs the signed-out half, which is the half
 * that needs no secret: /api/exercises must never answer with data, and the
 * member screens must ask for a sign-in.
 *
 * SIGNING IN WITHOUT THE LOGIN FORM. Bot protection is live on
 * production's auth forms and refuses a scripted browser, which is exactly
 * what it is for. So when PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and
 * PROD_ANON_KEY_FILE are set (file PATHS, never the secrets themselves),
 * both halves mint a one-time magic-link session through the Auth Admin
 * API instead of typing into the form, and retire it locally at the end.
 * A password is still used when one is given and minting is unavailable,
 * which is what makes this work unchanged against a local dev server.
 *
 * PLAYS AT MOST ONE VIDEO. Your Move's allowance is 350 plays a month, so
 * this taps play on exactly one exercise and only when a member session
 * exists. Set SKIP_VIDEO=1 to play none.
 */
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
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

/** Fetch from inside the page so the session cookies travel with it. */
async function apiStatus(page, path) {
  return page.evaluate(async (p) => {
    const res = await fetch(p, { credentials: 'include' });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, rows: Array.isArray(body?.data) ? body.data.length : null, body };
  }, path);
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------
// 1. Signed out. No credentials needed, so this always runs.
// ---------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const anon = await apiStatus(await (async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    return page;
  })(), '/api/exercises?q=squat&limit=20');
  check(
    'signed out: /api/exercises returns no data',
    anon.status !== 200 || (anon.rows ?? 0) === 0,
    `status ${anon.status}, rows ${anon.rows ?? 'none'}`
  );

  await page.goto(`${BASE}/exercises`, { waitUntil: 'domcontentloaded' });
  check(
    'signed out: /exercises does not render the library',
    page.url().includes('/login'),
    page.url().replace(BASE, '')
  );

  await page.goto(`${BASE}/movement`, { waitUntil: 'domcontentloaded' });
  check(
    'signed out: /movement asks for a sign-in',
    page.url().includes('/login'),
    page.url().replace(BASE, '')
  );

  await page.close();
}

// ---------------------------------------------------------------------
// 2. As a member.
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

  let landed;
  if (memberMinted) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    landed = page.url();
  } else {
    landed = await signIn(page, process.env.MEMBER_EMAIL, process.env.MEMBER_PASSWORD);
  }
  check('member: signed in', !landed.includes('/login'), landed.replace(BASE, ''));

  // 2a. The route.
  const api = await apiStatus(page, '/api/exercises?q=squat&limit=20');
  check('member: /api/exercises answers 403', api.status === 403, `status ${api.status}`);
  check('member: /api/exercises returns no exercises', (api.rows ?? 0) === 0, `rows ${api.rows ?? 'none'}`);

  const resources = await apiStatus(page, '/api/exercises?resource=muscles');
  check('member: the filter-vocabulary route is closed too', resources.status === 403, `status ${resources.status}`);

  // 2b. The screen.
  await page.goto(`${BASE}/exercises`, { waitUntil: 'domcontentloaded' });
  check(
    'member: /exercises is not reachable',
    !page.url().includes('/exercises'),
    page.url().replace(BASE, '')
  );

  // 2c. The Movement surface serves a real session.
  await page.goto(`${BASE}/movement`, { waitUntil: 'domcontentloaded' });
  const movementText = await page.locator('main').innerText();
  check('member: Movement screen loads', page.url().includes('/movement'), page.url().replace(BASE, ''));
  check(
    'member: Movement screen offers a real Root Movement session',
    /There if you want it/i.test(movementText),
    movementText.split('\n').slice(0, 6).join(' | ')
  );
  check(
    'member: no trace of the retired generated session',
    !/Movement Intelligence|Intelligently composed|Why this session was selected|Recovery/i.test(movementText),
    ''
  );

  const openSession = page.getByRole('link', { name: /Open this session/i });
  const hasOpen = (await openSession.count()) > 0;
  check('member: the suggestion has a working entry point', hasOpen);

  if (hasOpen) {
    await openSession.first().click();
    await page.waitForURL(/\/movement\/sessions\//, { timeout: 30000 });
    // Wait for the lineup itself rather than for the document, so a slow
    // render reads as slow rather than as an empty session.
    await page.waitForSelector('text=/WHAT IS IN IT/i', { timeout: 30000 }).catch(() => {});
    const sessionText = await page.locator('main').innerText();
    const lineupCount = (sessionText.match(/\n\d+\n/g) ?? []).length;
    check(
      'member: the session player opens on a real lineup',
      /WHAT IS IN IT/i.test(sessionText) && lineupCount >= 5,
      `${page.url().replace(BASE, '')}, ${lineupCount} exercises listed`
    );

    // 2d. One video, and only one.
    if (!process.env.SKIP_VIDEO) {
      const begin = page.getByRole('button', { name: /begin|start/i });
      if ((await begin.count()) > 0) await begin.first().click().catch(() => {});
      await page.waitForTimeout(1500);

      const play = page.getByRole('button', { name: /play|tap to play/i });
      if ((await play.count()) > 0) {
        const videoUrlResponse = page.waitForResponse(
          (r) => r.url().includes('/video-url'),
          { timeout: 30000 }
        );
        await play.first().click();
        const res = await videoUrlResponse.catch(() => null);
        check(
          'member: tapping play resolves a video URL (ONE play spent)',
          res !== null && res.status() === 200,
          res ? `status ${res.status()}` : 'no /video-url request seen'
        );
      } else {
        check('member: a play control is present in the player', false, 'no play button found');
      }
    }
  }

  // 2e. Assigned programs still load.
  await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
  check(
    'member: assigned programs screen loads',
    page.url().includes('/programs'),
    page.url().replace(BASE, '')
  );

  check('member: no uncaught page errors during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
  await retireSession(memberMinted);
} else {
  console.log('SKIP  member checks (set MEMBER_EMAIL with MEMBER_PASSWORD, or with the PROD_* key files)');
}

// ---------------------------------------------------------------------
// 3. As a coach or administrator.
// ---------------------------------------------------------------------
const staffMinted = process.env.COACH_EMAIL && canMintSessions()
  ? await mintSessionContext(browser, process.env.COACH_EMAIL, {
      baseUrl: BASE,
      viewport: { width: 1280, height: 900 },
    })
  : null;

if (process.env.COACH_EMAIL && (process.env.COACH_PASSWORD || staffMinted)) {
  const page = staffMinted
    ? await staffMinted.context.newPage()
    : await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  let landed;
  if (staffMinted) {
    await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
    landed = page.url();
  } else {
    landed = await signIn(page, process.env.COACH_EMAIL, process.env.COACH_PASSWORD);
  }
  check('staff: signed in', !landed.includes('/login'), landed.replace(BASE, ''));

  const api = await apiStatus(page, '/api/exercises?q=squat&limit=20');
  check('staff: /api/exercises still answers 200', api.status === 200, `status ${api.status}`);
  check('staff: and still returns exercises', (api.rows ?? 0) > 0, `rows ${api.rows ?? 0}`);

  const assignability = await page.evaluate(async () => {
    const res = await fetch('/api/exercises?q=&limit=100', { credentials: 'include' });
    const json = await res.json();
    const rows = json.data ?? [];
    return {
      total: rows.length,
      withFlag: rows.filter((r) => typeof r.isClientAssignable === 'boolean').length,
      notAssignable: rows.filter((r) => r.isClientAssignable === false).length,
    };
  });
  check(
    'staff: every search result carries its assignability',
    assignability.total > 0 && assignability.total === assignability.withFlag,
    `${assignability.withFlag} of ${assignability.total}`
  );

  await page.goto(`${BASE}/exercises`, { waitUntil: 'domcontentloaded' });
  check(
    'staff: the Exercise Library still opens',
    page.url().includes('/exercises'),
    page.url().replace(BASE, '')
  );

  await page.goto(`${BASE}/coach/corrective-programs`, { waitUntil: 'domcontentloaded' });
  check(
    'staff: the Corrective Programs screen still opens',
    page.url().includes('/coach/corrective-programs'),
    page.url().replace(BASE, '')
  );

  check('staff: no uncaught page errors during the run', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();

  await retireSession(staffMinted);
} else {
  console.log('SKIP  staff checks (set COACH_EMAIL with COACH_PASSWORD, or with the PROD_* key files)');
}

await browser.close();

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} of ${results.length} checks passed against ${BASE}`);
process.exit(passed === results.length ? 0 : 1);
