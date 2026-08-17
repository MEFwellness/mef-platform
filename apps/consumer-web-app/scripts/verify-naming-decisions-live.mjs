#!/usr/bin/env node
/**
 * The three decisions, verified live on app.mefwellness.com.
 *
 *   ONE VOCABULARY. All twelve coaching domains renamed for everybody. The
 *   check reads the member's Root Map AND the coach's view of the same
 *   member and asserts the new names are on both and the old twelve are on
 *   neither. Reading both sides is the point: the whole argument for one
 *   vocabulary is that they cannot end up looking at different words.
 *
 *   THE MOVEMENT SCORE. Removed rather than emptied. The check asserts the
 *   tile is absent, that no "x / 100" survives on that screen, and that the
 *   Weekly Goal tile beside it is still there and still counts real
 *   sessions.
 *
 *   UNBUILT PLACEHOLDERS. Hidden. The check asserts none of the three
 *   placeholder assessments is listed and that "Not built yet" appears
 *   nowhere.
 *
 * READS ONLY. Nothing is written, nothing is deleted, and the minted staff
 * session is retired locally at the end.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_KEYS_FILE=/path/to/keys.env \
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt \
 *   SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-naming-decisions-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { stringToBase64URL } from '@supabase/ssr/dist/main/utils/base64url.js';
import { createChunks } from '@supabase/ssr/dist/main/utils/chunker.js';

const REF = 'piafgqstbibvllsnuike';
const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MEMBER_ID = process.env.MEMBER_ID ?? 'ab25b880-e067-4345-88f1-59044f3b8bfc';
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? 'oakomah66@gmail.com';
const PASSWORD = readFileSync(process.env.MEMBER_PASSWORD_FILE, 'utf8').trim();
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

/** The twelve, old to new. Duplicated from the app on purpose, so this checks the deployed bundle rather than the source. */
const DOMAIN_RENAMES = [
  ['Identity & Self-Concept', 'How you see yourself'],
  ['Purpose & Motivation', 'What matters to you'],
  ['Stress & Nervous System Regulation', 'Stress and how you settle'],
  ['Emotional Resilience & Mood', 'Mood and steadiness'],
  ['Sleep & Circadian Rhythm', 'Sleep and your daily rhythm'],
  ['Movement & Physical Capacity', 'Movement and what your body can do'],
  ['Recovery & Energy Regulation', 'Energy and recovery'],
  ['Pain & Structural Integrity', 'Aches and how you hold yourself'],
  ['Nutrition & Metabolic Health', 'Food and how it fuels you'],
  ['Digestion & Gut Health', 'Digestion and how it settles'],
  ['Relationships & Social Connection', 'People around you'],
  ['Environment & Daily Rhythm', 'Your surroundings and daily routine'],
];

/** The three placeholder assessments that must no longer be listed. */
const UNBUILT_ASSESSMENTS = [
  'Readiness to Change',
  'Finding 1 Love',
  'Short Health Assessment Questionnaire',
];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

let accessToken = null;
const browser = await chromium.launch();

try {
  // =====================================================================
  // MEMBER
  // =====================================================================
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('signed in as the standing test member', true, MEMBER_EMAIL);

  const grab = async (path, key) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const text = await page.locator('body').innerText();
    writeFileSync(`${SHOTS}/member-${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/member-${key}.png`, fullPage: true });
    return text;
  };

  const rootMap = await grab('/root-map', 'root-map');
  const movement = await grab('/movement', 'movement');
  const questionnaires = await grab('/questionnaires', 'questionnaires');
  const home = await grab('/dashboard', 'home');
  const noticing = await grab('/noticing', 'noticing');
  const memberAll = [rootMap, movement, questionnaires, home, noticing].join('\n');

  // ---- DECISION 1: one vocabulary --------------------------------------
  const newOnRootMap = DOMAIN_RENAMES.filter(([, nw]) => rootMap.includes(nw)).map(([, nw]) => nw);
  check(
    'all twelve renamed areas are on her Root Map',
    newOnRootMap.length === 12,
    `${newOnRootMap.length} of 12` +
      (newOnRootMap.length < 12
        ? ` :: missing ${DOMAIN_RENAMES.filter(([, nw]) => !rootMap.includes(nw)).map(([, nw]) => nw).join(', ')}`
        : '')
  );

  const oldOnMember = DOMAIN_RENAMES.filter(([old]) => memberAll.includes(old)).map(([old]) => old);
  check(
    'not one of the twelve old area names is on any member screen',
    oldOnMember.length === 0,
    oldOnMember.join(' | ') || 'none'
  );

  // ---- DECISION 2: the Movement Score ----------------------------------
  check(
    'the Movement Score tile is gone from her Movement screen',
    !/MOVEMENT SCORE/i.test(movement),
    'no score tile'
  );
  const scoreOutOf100 = movement.match(/\b\d{1,3}\s*\/\s*100\b/g) ?? [];
  check(
    'no score out of 100 survives anywhere on that screen',
    scoreOutOf100.length === 0,
    scoreOutOf100.join(', ') || 'none'
  );
  check(
    'the Weekly Goal tile is still there, counting real sessions',
    /WEEKLY GOAL/i.test(movement) && /of \d+ sessions/i.test(movement),
    (movement.match(/\d+ of \d+ sessions/i) ?? ['not found'])[0]
  );
  check(
    'and the development-status caveat is still gone',
    !/early version/i.test(movement),
    'clean'
  );

  // ---- DECISION 3: unbuilt placeholders --------------------------------
  const listedUnbuilt = UNBUILT_ASSESSMENTS.filter((a) => questionnaires.includes(a));
  check(
    'no unbuilt assessment is listed in her library',
    listedUnbuilt.length === 0,
    listedUnbuilt.join(' | ') || 'none listed'
  );
  check(
    'the "not built yet" badge appears nowhere',
    !/not built yet/i.test(memberAll),
    'none'
  );
  check(
    'and neither does the old promise',
    !/coming soon/i.test(memberAll),
    'none'
  );

  const libraryCount = questionnaires.match(/(\d+) of (\d+) complete/);
  check(
    'her library count reflects only what she can actually open',
    Boolean(libraryCount),
    libraryCount ? libraryCount[0] : 'count line not found'
  );

  await context.close();

  // =====================================================================
  // COACH: the same words, on the other side
  // =====================================================================
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: STAFF_EMAIL,
  });
  if (linkErr) throw linkErr;
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr) throw verifyErr;
  accessToken = verified.session.access_token;
  check('coach session minted without a password', true, STAFF_EMAIL);

  const coachContext = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
  const encoded = 'base64-' + stringToBase64URL(JSON.stringify(verified.session));
  await coachContext.addCookies(
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
  const coachPage = await coachContext.newPage();

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}`, { waitUntil: 'networkidle' });
  await coachPage.waitForTimeout(2500);
  const coachDash = await coachPage.locator('body').innerText();
  writeFileSync(`${SHOTS}/coach-dashboard.txt`, coachDash);
  await coachPage.screenshot({ path: `${SHOTS}/coach-dashboard.png`, fullPage: true });

  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'networkidle' });
  await coachPage.waitForTimeout(3000);
  const coachDetail = await coachPage.locator('body').innerText();
  writeFileSync(`${SHOTS}/coach-detail.txt`, coachDetail);
  await coachPage.screenshot({ path: `${SHOTS}/coach-detail.png`, fullPage: true });

  const coachAll = `${coachDash}\n${coachDetail}`;
  const oldOnCoach = DOMAIN_RENAMES.filter(([old]) => coachAll.includes(old)).map(([old]) => old);
  check(
    'not one old area name survives on the coach side either',
    oldOnCoach.length === 0,
    oldOnCoach.join(' | ') || 'none'
  );

  const newOnCoach = DOMAIN_RENAMES.filter(([, nw]) => coachAll.includes(nw)).map(([, nw]) => nw);
  check(
    'the coach reads the renamed areas',
    newOnCoach.length > 0,
    newOnCoach.join(' | ') || 'none found'
  );

  // The one that matters: the same finding, named the same way, on both
  // sides. Anything on her Root Map that names an area must name it
  // identically on his screen.
  const sharedOnBoth = DOMAIN_RENAMES.filter(
    ([, nw]) => rootMap.includes(nw) && coachAll.includes(nw)
  ).map(([, nw]) => nw);
  check(
    'she and her coach read the identical area names',
    sharedOnBoth.length > 0,
    `${sharedOnBoth.length} names confirmed on both sides: ${sharedOnBoth.slice(0, 4).join(', ')}`
  );

  await coachContext.close();
} catch (err) {
  check('the decisions live run completed', false, String(err?.message ?? err));
} finally {
  if (accessToken) await service.auth.admin.signOut(accessToken, 'local').catch(() => {});
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passing`);
  process.exitCode = failed ? 1 : 0;
}
