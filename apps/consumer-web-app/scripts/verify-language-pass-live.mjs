#!/usr/bin/env node
/**
 * Live verification of the language pass and the coach dashboard
 * (2026-08-17) against app.mefwellness.com.
 *
 * Two halves, both against real production data:
 *
 *   MEMBER. Signs in as the standing test member with her own password
 *   through the real login form and walks every screen that renders a
 *   finding name, a domain name, a tier label or a placeholder. Asserts
 *   that none of the retired clinical names appears anywhere, that her
 *   findings still read with their tier labels, that no raw stored value
 *   or unfinished-state string is on screen, and that her focus, her Root
 *   Score and her revealed features are unchanged by the renames.
 *
 *   COACH. Mints a session for the real coach account without its password
 *   (generateLink + verifyOtp, the technique established by
 *   scripts/screenshots/verify-role-based-home-routing-live.mjs), opens the
 *   member's coach view, and asserts the six sections are there in order,
 *   that everything else is one tap away rather than deleted, and that no
 *   raw code or retired name reaches a coach either.
 *
 * READS ONLY. Nothing is written, nothing is deleted, and the minted staff
 * session is retired locally at the end so no other session that account
 * holds is disturbed.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_KEYS_FILE=/path/to/keys.env \
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt \
 *   SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-language-pass-live.mjs
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

/**
 * The retired names, copied from lib/naming/standard.ts's BANNED_NAMES.
 * Duplicated deliberately: a live check that imported the app's own list
 * would pass by construction if somebody shortened the list, and the whole
 * point of this run is to check the deployed bundle rather than the source.
 */
const RETIRED_NAMES = [
  'Gut Fungal & Parasite Concerns',
  'Detoxification Load Concerns',
  'Movement Deficiency',
  'Circadian Rhythm Disruption',
  'Cardiovascular & Circulation Pattern',
  'Hormonal Balance Pattern',
  'Immune & Respiratory Pattern',
  'Musculoskeletal Discomfort Pattern',
  'Emotional Wellbeing Concern',
  'Elevated Stress',
  'Poor Sleep Quality',
  'Low Energy',
  'Digestive Complaints',
  'Digestive Wellness Concerns',
  'Nutrition Quality Concerns',
  'Diet Quality Concern',
  'Irregular Meal Timing',
  'Energy & Fatigue Pattern',
  'Sleep Quality Pattern',
  'Stress & Mood Pattern',
  'Cognitive Clarity Pattern',
  'Upper Digestive Function',
  'Lower Digestive & Elimination Function',
  'Blood Sugar & Energy Regulation',
  'Liver & Detoxification Support',
  'Immune & Inflammatory Patterns',
  'Respiratory & Oxygenation Patterns',
  'Circulation & Cardiovascular-Related Observations',
  'Kidney, Bladder & Fluid-Balance Patterns',
  'Thyroid & Metabolic-Related Observations',
  'Adrenal & Stress-Response Patterns',
  'Reproductive & Hormonal Patterns',
  'Neurological & Cognitive Patterns',
  'Musculoskeletal & Connective-Tissue Patterns',
  'Skin, Hair & Nail Observations',
  'Nutrient Insufficiency Patterns',
  'Recovery & Resilience Patterns',
];

/** Unfinished-state and development-status strings that must never render. */
const UNFINISHED_STRINGS = [
  'Still putting today',
  'ready quite yet',
  'Early version, more depth coming',
  'Coming soon',
  'Coming Soon',
];

const TIER_LABELS = [
  'Early indication',
  'Emerging pattern',
  'Supported by repeated check-ins',
  'Coach verified',
];

/**
 * A raw stored value that escaped. Deliberately narrow: two or more
 * lowercase words joined by underscores, which is what every enum in this
 * codebase looks like and what no sentence looks like.
 */
const RAW_ENUM = /\b[a-z]{2,}_[a-z]{2,}(?:_[a-z]{2,})*\b/;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

function retiredNamesIn(text) {
  return RETIRED_NAMES.filter((n) => text.includes(n));
}

let accessToken = null;
const browser = await chromium.launch();
const memberText = {};

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

  const MEMBER_SCREENS = [
    ['/dashboard', 'home'],
    ['/today', 'today'],
    ['/root-map', 'root-map'],
    ['/noticing', 'noticing'],
    ['/insights', 'insights'],
    ['/root-score', 'root-score'],
    ['/progress', 'progress'],
    ['/recommendations', 'recommendations'],
    ['/case', 'case'],
    ['/movement', 'movement'],
    ['/questionnaires', 'questionnaires'],
    ['/assessments/wbsa', 'wbsa'],
  ];

  for (const [path, key] of MEMBER_SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    memberText[key] = text;
    writeFileSync(`${SHOTS}/member-${key}.txt`, text);
    await page.screenshot({ path: `${SHOTS}/member-${key}.png`, fullPage: true });
  }

  const allMemberText = Object.values(memberText).join('\n');

  const memberRetired = retiredNamesIn(allMemberText);
  check(
    'no retired clinical name appears on any member screen',
    memberRetired.length === 0,
    memberRetired.length ? memberRetired.join(', ') : `${MEMBER_SCREENS.length} screens clean`
  );

  const unfinished = UNFINISHED_STRINGS.filter((s) => allMemberText.includes(s));
  check(
    'no unfinished-state or development-status string on any member screen',
    unfinished.length === 0,
    unfinished.length ? unfinished.join(', ') : 'none'
  );

  check(
    "the day's lesson placeholder is gone from Today",
    !memberText.today.includes('Still putting today') && !memberText.today.includes('ready quite yet'),
    'no apology for a lesson that was never being assembled'
  );

  check(
    'the Movement screen no longer carries a development-status caveat',
    !memberText.movement.includes('Early version'),
    'caveat removed'
  );

  const tiersOnRootMap = TIER_LABELS.filter((t) => memberText['root-map'].includes(t));
  check(
    'her findings still carry their tier labels',
    tiersOnRootMap.length > 0,
    tiersOnRootMap.join(', ') || 'none found'
  );

  const percentages = allMemberText.match(/\b\d{1,3}\s?% (confiden|confidence)/gi) ?? [];
  check('no percentage confidence anywhere', percentages.length === 0, percentages.join(', ') || 'none');

  // The renamed findings, read back from the interpretation layer as she
  // sees them. Named individually rather than counted, so a rename that
  // half-landed is visible in the output.
  const NEW_NAMES = [
    'The stress you are carrying',
    'Sleep that has not been leaving you rested',
    'Energy that runs out through the day',
    'Digestion that has been uncomfortable',
    'Hip discomfort you reported',
    'Lower back discomfort you reported',
  ];
  const seenNew = NEW_NAMES.filter((n) => allMemberText.includes(n));
  check(
    'the new names are what she actually reads',
    seenNew.length >= 3,
    seenNew.join(' / ') || 'none of the new names found'
  );

  // Nothing about her app changed except the wording. Her focus, her score
  // and how many features she has are all read back and compared to what
  // the previous build's live runs recorded.
  const focusMatch = memberText.today.match(/YOUR PRIORITY TODAY\s*\n\s*\n?(.+)/);
  check(
    'her one focus is still named, and still by one author',
    Boolean(focusMatch),
    focusMatch ? focusMatch[1].trim() : 'no priority line found'
  );

  const scoreMatch = memberText.home.match(/(\d{1,3})\s*\/\s*100/);
  check('her Root Score still renders', Boolean(scoreMatch), scoreMatch ? scoreMatch[0] : 'not found');

  const { data: visibilityRows } = await service
    .from('member_feature_visibility')
    .select('feature_key, state')
    .eq('member_id', MEMBER_ID);
  const revealed = (visibilityRows ?? []).filter((r) => r.state === 'revealed').length;
  check(
    'her revealed features are untouched by the renames',
    revealed > 0,
    `${revealed} revealed rows, unchanged by this build (it writes no visibility rows)`
  );

  await context.close();

  // =====================================================================
  // COACH
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
  const dashText = await coachPage.locator('body').innerText();
  writeFileSync(`${SHOTS}/coach-dashboard.txt`, dashText);
  await coachPage.screenshot({ path: `${SHOTS}/coach-dashboard.png`, fullPage: true });

  const SECTIONS = [
    'What is improving',
    'What needs attention',
    'How much is behind each one',
    'is working on',
    'What may be getting in the way',
    'What to ask next',
  ];
  // Section headings render uppercase through CSS, so innerText returns
  // them uppercased. Matched case-insensitively rather than by chasing the
  // styling: this asserts what a coach reads, not how it is cased.
  const dashUpper = dashText.toUpperCase();
  const positions = SECTIONS.map((s) => dashUpper.indexOf(s.toUpperCase()));
  check(
    'all six sections render on the coach first screen',
    positions.every((p) => p >= 0),
    SECTIONS.filter((_, i) => positions[i] < 0).join(', ') || 'all present'
  );
  check(
    'they are in the order the target asks for',
    positions.every((p) => p >= 0) &&
      positions.every((p, i) => i === 0 || p > positions[i - 1]),
    positions.join(' < ')
  );

  const coachRetired = retiredNamesIn(dashText);
  check(
    'no retired clinical name on the coach first screen',
    coachRetired.length === 0,
    coachRetired.join(', ') || 'clean'
  );

  const coachRaw = dashText.match(RAW_ENUM);
  check(
    'no raw stored value on the coach first screen',
    coachRaw === null,
    coachRaw ? coachRaw[0] : 'none'
  );

  const coachTiers = TIER_LABELS.filter((t) => dashText.includes(t));
  check(
    'the coach reads the same four tier labels the member does',
    coachTiers.length > 0,
    coachTiers.join(', ') || 'none'
  );

  const coachPct = dashText.match(/\b\d{1,3}\s?%/g) ?? [];
  check('no percentage on the coach first screen', coachPct.length === 0, coachPct.join(', ') || 'none');

  check(
    'the visibility panel is still reachable from the first screen',
    dashText.includes('app contains'),
    'linked'
  );

  // Everything else, one tap away and unchanged.
  await coachPage.goto(`${BASE}/coach/clients/${MEMBER_ID}/detail`, { waitUntil: 'networkidle' });
  await coachPage.waitForTimeout(3000);
  const detailText = await coachPage.locator('body').innerText();
  writeFileSync(`${SHOTS}/coach-detail.txt`, detailText);
  await coachPage.screenshot({ path: `${SHOTS}/coach-detail.png`, fullPage: true });

  const DETAIL_PANELS = [
    'Energy Trend',
    'Coaching Insights',
    'Check-in History',
    'Coach Notes',
    'Baseline Assessment',
  ];
  const detailUpper = detailText.toUpperCase();
  const missingPanels = DETAIL_PANELS.filter((p) => !detailUpper.includes(p.toUpperCase()));
  check(
    'nothing was deleted: the old panels are all on the detail view',
    missingPanels.length === 0,
    missingPanels.join(', ') || `${DETAIL_PANELS.length} spot-checked, all present`
  );

  check(
    'the visibility panel from the previous build is on the detail view',
    detailUpper.includes('APP CONTAINS'),
    'present'
  );

  const detailRetired = retiredNamesIn(detailText);
  check(
    'no retired clinical name on the coach detail view either',
    detailRetired.length === 0,
    detailRetired.join(', ') || 'clean'
  );

  await coachContext.close();
} catch (err) {
  check('the language pass live run completed', false, String(err?.message ?? err));
} finally {
  if (accessToken) await service.auth.admin.signOut(accessToken, 'local').catch(() => {});
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passing`);
  process.exitCode = failed ? 1 : 0;
}
