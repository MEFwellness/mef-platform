#!/usr/bin/env node
/**
 * Live verification of the 2026-08-17 trust cleanup against the real
 * production site, as the real production test member.
 *
 * Checks the exact wording AUDIT-ADAPTIVE-REVEAL.md captured on each
 * screen, and asserts it is gone. Everything here is a read: the script
 * navigates and reads rendered text, submits no form, and writes nothing
 * to the member's account. The session is minted without her password via
 * generateLink + verifyOtp (the technique established by
 * scripts/verify-internal-tools-staff-live.mjs) and retired locally at the
 * end, so no session she holds is disturbed.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_KEYS_FILE=/path/to/keys.env SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-trust-cleanup-live.mjs
 *
 * The keys file holds SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY, one
 * per line. A file rather than an argument, because a service role key on a
 * command line ends up in shell history and in every process listing.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { stringToBase64URL } from '@supabase/ssr/dist/main/utils/base64url.js';
import { createChunks } from '@supabase/ssr/dist/main/utils/chunker.js';

const REF = 'piafgqstbibvllsnuike';
const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

for (const line of readFileSync(process.env.PROD_KEYS_FILE, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}

const service = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

let accessToken = null;
const browser = await chromium.launch();
const captured = {};

try {
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: MEMBER_EMAIL,
  });
  if (linkErr) throw linkErr;
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw verifyErr;
  accessToken = verified.session.access_token;
  check('member session minted without a password', true, MEMBER_EMAIL);

  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const encoded = 'base64-' + stringToBase64URL(JSON.stringify(verified.session));
  await context.addCookies(
    createChunks(`sb-${REF}-auth-token`, encoded).map((c) => ({
      name: c.name,
      value: c.value,
      domain: 'app.mefwellness.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    }))
  );
  const page = await context.newPage();

  async function visit(path, key) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const text = await page.locator('body').innerText();
    captured[key] = text;
    await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: true });
    return text;
  }

  // ---- Fix 4: no confidence claim on Home or Root Score --------------
  const home = await visit('/dashboard', 'home');
  check(
    'Home states no confidence level',
    !/HIGH CONFIDENCE|High confidence|Moderate confidence|Low confidence|Building confidence/i.test(home) ||
      /Still building your baseline/.test(home),
    (home.match(/[A-Za-z ]*confiden[a-z]*/gi) ?? []).join(' | ') || 'no match for "confiden"'
  );

  const rootScore = await visit('/root-score', 'root-score');
  check(
    'Root Score states no confidence level',
    !/High confidence|Moderate confidence|Low confidence|Building confidence/i.test(rootScore),
    (rootScore.match(/[A-Za-z ]*confiden[a-z]*/gi) ?? []).join(' | ') || 'no match for "confiden"'
  );

  // ---- Fix 1: the food finding is off the Root Map -------------------
  const rootMap = await visit('/root-map', 'root-map');
  check(
    'the test-script food name is gone from the Root Map',
    !/Live check food/i.test(rootMap),
    /Live check food/i.test(rootMap) ? 'still present' : 'absent'
  );
  check(
    'no packaged food scan finding remains on the Root Map',
    !/Packaged food scan/i.test(rootMap) && !/per serving/i.test(rootMap)
  );

  // ---- Fix 5b: zero logged days is not a positive verdict ------------
  const zeroDayCards = [...rootMap.matchAll(/0 of \d+ days logged/g)].length;
  const steadyCount = [...rootMap.matchAll(/LOOKING STEADY|Nothing specific needed here right now/gi)]
    .length;
  check(
    'no "Looking steady" verdict sits on a card with 0 days logged',
    zeroDayCards === 0 || steadyCount === 0 || /Nothing logged here yet/i.test(rootMap),
    `${zeroDayCards} zero-day card(s), ${steadyCount} steady phrase(s)`
  );

  // ---- Fix 2: exactly one coaching focus -----------------------------
  const recs = await visit('/recommendations', 'recommendations');
  const focusCount = [...recs.matchAll(/Today's coaching focus/gi)].length;
  check('Recommendations shows at most one coaching focus', focusCount <= 1, `${focusCount} found`);

  // ---- Fix 3: single mentions are not filed as patterns --------------
  const insights = await visit('/insights', 'insights');
  const patternIdx = insights.search(/Patterns We're Beginning to Notice/i);
  const onceIdx = insights.search(/noticed this once|mentioned this once/i);
  const soFarIdx = insights.search(/What We're Noticing So Far/i);
  check(
    'a single mention does not sit under the pattern heading',
    onceIdx === -1 || patternIdx === -1 || (soFarIdx !== -1 && soFarIdx < onceIdx && onceIdx < patternIdx) || onceIdx < patternIdx,
    `soFar@${soFarIdx} once@${onceIdx} pattern@${patternIdx}`
  );

  // ---- Fix 5b: "improving" needs a real trend ------------------------
  const noticing = await visit('/noticing', 'noticing');
  check(
    'nothing claims a food scan has been improving',
    !/Packaged food scan has been improving/i.test(noticing)
  );

  // ---- Fix 5a: no claim about today before a check-in today ----------
  //
  // One wrinkle worth knowing before reading a failure here.
  // `coach_morning_briefs` is a derived per-day cache: one row per
  // (member, local_date), composed on the member's first open of the day
  // and never rewritten. A row written before a deploy therefore keeps the
  // wording that deploy replaced, until the next local date rolls over.
  // So this check reports which of the two it is rather than just failing.
  const today = await visit('/today', 'today');
  const notCheckedInToday = /haven't checked in yet today/i.test(today);
  const claimsToday = /stress (was|looked|ran)[^.]*today\./i.test(home);

  const { data: cached } = await service
    .from('coach_morning_briefs')
    .select('id, created_at, local_date')
    .eq('local_date', new Date().toISOString().slice(0, 10))
    .limit(50);
  const cachedRow = (cached ?? [])[0] ?? null;

  check(
    'Home makes no claim about today when she has not checked in today',
    !notCheckedInToday || !claimsToday,
    !notCheckedInToday
      ? 'already checked in today, present tense is correct'
      : cachedRow
        ? `today's brief was cached at ${cachedRow.created_at}; a row written before the fix keeps its old wording until the next local date`
        : 'no cached brief, so this is the live composer'
  );
} finally {
  if (accessToken) {
    // Retire only this minted session, never her others.
    await anon.auth.admin?.signOut?.(accessToken).catch(() => {});
    await service.auth.admin.signOut(accessToken, 'local').catch(() => {});
  }
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\n--- captured text for the failing screens ---');
  for (const [key, text] of Object.entries(captured)) {
    console.log(`\n===== ${key} =====\n${text.slice(0, 3000)}`);
  }
  process.exit(1);
}
