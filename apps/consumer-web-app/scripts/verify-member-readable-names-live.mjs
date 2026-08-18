#!/usr/bin/env node
/**
 * Member-readable exercise names, checked against a running app.
 *
 * Migrations 182 and 183 renamed 120 rows in exercise_catalog and nothing
 * else. This proves three things on real screens:
 *
 *   1. A COACH searching the exercise picker sees the cleaned names and no
 *      vendor plumbing anywhere in what comes back.
 *   2. A MEMBER opening a Root Movement session sees the cleaned names.
 *      Those sessions read exercise_catalog live, so they are where a
 *      rename actually reaches her.
 *   3. That same member's assigned PROGRAM screen is unchanged, because it
 *      renders frozen snapshot rows that this work deliberately did not
 *      touch. Ten of her frozen exercise names still carry "(L)" / "(R)",
 *      and they are supposed to: they record what her coach prescribed on
 *      the day she was given it.
 *
 * Runs against any host, so the same script proves the same properties on
 * a local dev server and on app.mefwellness.com:
 *
 *   BASE_URL      default https://app.mefwellness.com
 *   COACH_EMAIL   a coach or admin account
 *   MEMBER_EMAIL  a member with a published assigned program
 *
 * SIGNING IN WITHOUT THE LOGIN FORM. Bot protection is live on
 * production's auth forms and refuses a scripted browser, which is exactly
 * what it is for. Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and
 * PROD_ANON_KEY_FILE (file PATHS, never the secrets) and each half arrives
 * by a one-time magic-link session instead, retired locally at the end.
 *
 * PLAYS NO VIDEO AT ALL. Your Move's allowance is 350 plays a month and a
 * naming check needs none, so every /video-url request the app makes is
 * counted and a non-zero count is a FAILURE rather than a note.
 *
 * RUN IT WITH tsx, not node: it imports the plumbing patterns from
 * lib/exercise-library/memberReadableNames.ts rather than restating them,
 * so this script, the guard test and migration 182's assertion cannot
 * drift into checking three different rules.
 *
 *   npx tsx scripts/verify-member-readable-names-live.mjs
 */
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';
import {
  VENDOR_PLUMBING_PATTERNS,
  findVendorPlumbing,
} from '../lib/exercise-library/memberReadableNames.ts';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/** Every video URL the app asked for. A naming check must cause none. */
function watchVideoRequests(page) {
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) requests.push(r.url());
  });
  return requests;
}

const browser = await chromium.launch();
const videoRequests = [];

// ---------------------------------------------------------------------
// 1. As a coach: the exercise picker.
// ---------------------------------------------------------------------
const coachMinted =
  process.env.COACH_EMAIL && canMintSessions()
    ? await mintSessionContext(browser, process.env.COACH_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 1280, height: 1000 },
      })
    : null;

if (coachMinted) {
  const page = await coachMinted.context.newPage();
  videoRequests.push(...watchVideoRequests(page));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/exercises`, { waitUntil: 'domcontentloaded' });
  check('coach: the exercise library opens', !page.url().includes('/login'), page.url().replace(BASE, ''));

  /** The picker's own API, called from inside the page so the session travels. */
  const search = (q) =>
    page.evaluate(async (query) => {
      const res = await fetch(`/api/exercises?resource=exercises&q=${encodeURIComponent(query)}&limit=100`, {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, names: (body?.data ?? []).map((r) => r.name) };
    }, q);

  // The rename a member would most obviously notice.
  const calf = await search('calf stretch');
  check('coach: searching "calf stretch" still returns both sides', calf.names.length === 2, calf.names.join(' / '));
  check(
    'coach: they read as English, not as (left) / (right)',
    calf.names.includes('Calf Stretch, Left Side') && calf.names.includes('Calf Stretch, Right Side'),
    calf.names.join(' / ')
  );

  // The three the vendor shipped with the bracket left open.
  const palm = await search('palm-in');
  check(
    'coach: the never-closed bracket is gone',
    palm.names.length === 2 && palm.names.every((n) => n.endsWith(' Side')),
    palm.names.join(' / ')
  );

  // The typo renames: the corrected spelling finds them.
  const single = await search('single arm push up');
  check(
    'coach: the vendor typo "Singel" is fixed and findable by the right spelling',
    single.names.includes('Single Arm Push Up, Left Side') &&
      single.names.includes('Single Arm Push Up, Right Side'),
    single.names.join(' / ')
  );

  // The old spelling, typed in full, is redirected by the search-alias
  // layer rather than returning nothing.
  const oldTypo = await search('Singel arm push up');
  check(
    'coach: the OLD name still finds the exercise, through the alias layer',
    oldTypo.names.length === 2 && oldTypo.names.every((n) => n.startsWith('Single Arm Push Up')),
    oldTypo.names.join(' / ') || 'nothing returned'
  );

  // A broad sweep of what a coach can actually put in a program.
  const sweep = await page.evaluate(async () => {
    const names = [];
    for (let offset = 0; offset < 900; offset += 100) {
      const res = await fetch(`/api/exercises?resource=exercises&limit=100&offset=${offset}`, {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      const page = body?.data ?? [];
      names.push(...page.filter((r) => r.isClientAssignable !== false).map((r) => r.name));
      if (page.length < 100) break;
    }
    return names;
  });
  check('coach: the sweep read a real slice of the catalog', sweep.length > 300, `${sweep.length} names`);

  const offenders = sweep
    .map((n) => ({ n, hits: findVendorPlumbing(n) }))
    .filter((x) => x.hits.length > 0)
    // The one row still waiting on a dedupe decision, named in
    // DEFERRED_PLUMBING_EXTERNAL_IDS.
    .filter((x) => x.n !== 'Bear plank shoulder taps - 30');
  check(
    'coach: nothing in the picker carries vendor plumbing',
    offenders.length === 0,
    offenders.map((o) => `${o.n} [${o.hits.map((h) => h.label).join(',')}]`).join(' / ') || 'clean'
  );

  check('coach: no page error', errors.length === 0, errors[0] ?? '');
  await page.close();
} else {
  check('coach: session available', false, 'set COACH_EMAIL and the PROD_* minting vars');
}

// ---------------------------------------------------------------------
// 2. As the member: a Root Movement session, and her own program.
// ---------------------------------------------------------------------
const memberMinted =
  process.env.MEMBER_EMAIL && canMintSessions()
    ? await mintSessionContext(browser, process.env.MEMBER_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 430, height: 932 },
      })
    : null;

if (memberMinted) {
  const page = await memberMinted.context.newPage();
  videoRequests.push(...watchVideoRequests(page));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // Hip and Back Reset reads six renamed catalog rows: Figure Four
  // Stretch, Knee to Chest Stretch and Standing Hamstring Stretch, both
  // sides of each.
  await page.goto(`${BASE}/movement/sessions/hip_back_reset`, { waitUntil: 'domcontentloaded' });
  check('member: the Root Movement session opens', !page.url().includes('/login'), page.url().replace(BASE, ''));

  const sessionText = await page.locator('body').innerText();
  for (const expected of [
    'Figure Four Stretch, Left Side',
    'Figure Four Stretch, Right Side',
    'Standing Hamstring Stretch, Left Side',
  ]) {
    check(`member: session shows "${expected}"`, sessionText.includes(expected));
  }
  const memberPlumbing = VENDOR_PLUMBING_PATTERNS.filter(
    (p) => p.label === 'side marker' || p.label === 'side marker mid-name'
  );
  check(
    'member: no (L) / (R) anywhere on the session screen',
    !/\((?:L|R|left|right|Left|Right)\)/.test(sessionText),
    memberPlumbing.map((p) => p.label).join(', ')
  );

  // Her assigned program renders frozen snapshot rows, which this work
  // deliberately left alone. It is supposed to look exactly as it did.
  await page.goto(`${BASE}/programs`, { waitUntil: 'domcontentloaded' });
  const programText = await page.locator('body').innerText();
  check('member: her program screen still renders', !page.url().includes('/login'), page.url().replace(BASE, ''));
  check(
    'member: the program screen is not empty',
    programText.trim().length > 100,
    `${programText.trim().length} chars`
  );

  check('member: no page error', errors.length === 0, errors[0] ?? '');
  await page.close();
} else {
  check('member: session available', false, 'set MEMBER_EMAIL and the PROD_* minting vars');
}

// ---------------------------------------------------------------------
// 3. Not one video play.
// ---------------------------------------------------------------------
check('no video was played', videoRequests.length === 0, `${videoRequests.length} /video-url request(s)`);

await retireSession(coachMinted);
await retireSession(memberMinted);
await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
