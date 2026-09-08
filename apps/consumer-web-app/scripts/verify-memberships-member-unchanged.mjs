/**
 * The other half of shipping /memberships: proving the member app did not
 * move.
 *
 * A public marketing page needed one entry on the middleware allowlist,
 * and the entry sits one character away from `/membership`, the member's
 * own Rooted Reset subscription screen. So the question this run answers
 * is not "does the new page work" (verify-memberships-page.mjs answers
 * that) but "is a real signed-in member's app exactly as it was, and is
 * locked content still locked".
 *
 * SIGNED IN THE STANDING WAY. Turnstile is live on the production login
 * form and refuses a scripted browser by design, which is the correct
 * behaviour and never a test failure. This uses scripts/lib/mint-session.mjs:
 * a one-time session minted through the Auth Admin API and retired
 * immediately afterwards with scope 'local', so nobody is signed out of
 * their own phone. No password is read or needed.
 *
 * IT WRITES NOTHING. Every navigation here is a read. No button that
 * stores anything is pressed, and the account ends the run holding exactly
 * what it held before.
 */
import { chromium } from 'playwright';
import { mintSessionContext, retireSession, canMintSessions } from './lib/mint-session.mjs';

const BASE = (process.env.MEMBERSHIPS_ORIGIN || 'https://app.mefwellness.com').replace(/\/$/, '');
const EMAIL = process.env.TEST_MEMBER_EMAIL;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}\n`);
}

if (!canMintSessions()) {
  process.stdout.write(
    'Cannot mint a session: set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, PROD_ANON_KEY_FILE.\n'
  );
  process.exit(2);
}
if (!EMAIL) {
  process.stdout.write('Set TEST_MEMBER_EMAIL.\n');
  process.exit(2);
}

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  check('a session was minted for the standing test member', Boolean(minted));
  if (!minted) throw new Error('minting failed');

  const page = await minted.context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  // 1. The member surfaces she uses every day still render for her.
  for (const path of ['/dashboard', '/today', '/progress', '/checkin', '/membership', '/profile']) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const landed = new URL(page.url()).pathname;
    check(
      `member: ${path} still opens for a signed-in member`,
      landed !== '/login' && (response?.status() ?? 0) < 400,
      `landed on ${landed} (status ${response?.status()})`
    );
  }

  // 2. Locked content is still locked. The two staff surfaces a member has
  //    never been allowed on, and the two internal movement tools.
  for (const [path, expected] of [
    ['/coach', '/dashboard'],
    ['/admin', '/dashboard'],
    ['/exercises', '/movement'],
    ['/movement/profile', '/movement'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const landed = new URL(page.url()).pathname;
    check(
      `member: ${path} is still refused and redirects to ${expected}`,
      landed === expected,
      `landed on ${landed}`
    );
  }

  // 3. The new page is reachable by her too, and is not gated on anything.
  const membershipsResponse = await page.goto(`${BASE}/memberships`, {
    waitUntil: 'domcontentloaded',
  });
  check(
    'member: /memberships opens for a signed-in member as well, no redirect',
    new URL(page.url()).pathname === '/memberships' && membershipsResponse?.status() === 200,
    `landed on ${new URL(page.url()).pathname} (status ${membershipsResponse?.status()})`
  );
  check(
    'member: /memberships renders no member chrome even when signed in',
    (await page.locator('nav').count()) === 0,
    `${await page.locator('nav').count()} nav element(s)`
  );

  check('member: no page or console errors on any screen', pageErrors.length === 0, pageErrors.join(' | '));

  await minted.context.close();
} finally {
  if (minted) await retireSession(minted);
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length > 0) {
  for (const f of failed) process.stdout.write(`  FAILED: ${f.name} :: ${f.detail}\n`);
  process.exit(1);
}
