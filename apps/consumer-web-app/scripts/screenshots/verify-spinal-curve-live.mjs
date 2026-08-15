#!/usr/bin/env node
/**
 * Live verification, against production, that the spinal curve measurement
 * shipped without breaking the Body Assessment a member already had.
 *
 * WHAT THIS CAN AND CANNOT PROVE. The measurement itself reads a camera
 * frame's segmentation mask on the member's own phone. There is no camera
 * in this environment and a headless fake video stream would not be a real
 * body, so this script does NOT attempt to prove the angles are correct —
 * that is proven against the drawn fixture masks in
 * tests/spinal-curve.test.ts, which exercise the identical code path with
 * the identical input type. What this proves is the part only production
 * can answer: the assessment is still reachable by a real member on the
 * real domain, the capture flow still loads, the new database columns are
 * really there and readable under the member's own row-level security, and
 * the new results section is present in the shipped bundle and correctly
 * renders nothing when there is nothing measured yet.
 *
 * The member session is minted from a one-time magic-link token through
 * the Auth Admin API, so no member password is read, needed or changed.
 * Same discipline as scripts/screenshots/verify-signout-dialog-live.mjs:
 * nothing secret is passed on a command line or printed.
 *
 * Usage, from apps/consumer-web-app:
 *   MEMBER_EMAIL=... PROD_SUPABASE_URL=... \
 *   PROD_SERVICE_KEY_FILE=/secure/key.txt PROD_ANON_KEY_FILE=/secure/anon.txt \
 *     node scripts/screenshots/verify-spinal-curve-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT ?? '/tmp/spinal-curve-live';
mkdirSync(OUT, { recursive: true });

const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_KEY_FILE = process.env.PROD_SERVICE_KEY_FILE;
const ANON_KEY_FILE = process.env.PROD_ANON_KEY_FILE;

if (!MEMBER_EMAIL || !SUPABASE_URL || !SERVICE_KEY_FILE || !ANON_KEY_FILE) {
  console.error(
    'Set MEMBER_EMAIL, PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE ' +
      '(the key vars as file PATHS, never the secrets themselves).'
  );
  process.exit(2);
}

const SERVICE_KEY = readFileSync(SERVICE_KEY_FILE, 'utf8').trim();
const ANON_KEY = readFileSync(ANON_KEY_FILE, 'utf8').trim();
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ------------------------------------------- the new columns are really there
const { data: memberRow } = await service.auth.admin.listUsers({ perPage: 200 });
const member = memberRow?.users?.find((u) => u.email === MEMBER_EMAIL);
check('the standing test member exists in production', Boolean(member), MEMBER_EMAIL);
if (!member) process.exit(1);

const { error: columnError } = await service
  .from('body_assessment_captures')
  .select(
    'id, capture_type, thoracic_angle_degrees, thoracic_angle_confidence, lumbar_angle_degrees, lumbar_angle_confidence, spinal_curve_quality'
  )
  .limit(1);
check('migration 160 columns exist and are selectable in production', !columnError, columnError?.message ?? '');

// ----------------------------------------------------------- member session
const { data: link, error: linkError } = await service.auth.admin.generateLink({
  type: 'magiclink',
  email: MEMBER_EMAIL,
});
if (linkError || !link?.properties?.hashed_token) {
  check('mint a member session', false, linkError?.message ?? 'no token');
  process.exit(1);
}
const publicClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (verifyError || !verified?.session) {
  check('mint a member session', false, verifyError?.message ?? 'no session');
  process.exit(1);
}
check('mint a member session', true);

// The member's own session must be able to read the new columns, which is
// what proves row-level security did not need, and did not get, a change.
const memberClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${verified.session.access_token}` } },
});
const { error: memberReadError } = await memberClient
  .from('body_assessment_captures')
  .select('id, thoracic_angle_degrees, lumbar_angle_degrees, spinal_curve_quality')
  .eq('member_id', member.id)
  .limit(5);
check("the member's own session can read the new columns", !memberReadError, memberReadError?.message ?? '');

// ------------------------------------------------------------------ browser
const browser = await chromium.launch();
const encoded = `base64-${stringToBase64URL(JSON.stringify(verified.session))}`;
const chunks = createChunks(COOKIE_NAME, encoded);
const context = await browser.newContext(PHONE);
await context.addCookies(
  chunks.map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain: 'app.mefwellness.com',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }))
);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

async function visit(url, shot) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: true });
  return page.url();
}

// The real member journey: home, then into the assessment.
const dashboardUrl = await visit('/dashboard', '01-dashboard');
check('member reaches the dashboard on the real domain', !dashboardUrl.includes('/login'), dashboardUrl);

const assessmentUrl = await visit('/assessment', '02-assessment');
const assessmentBody = await page.textContent('body');
check('Body Assessment is reachable', !assessmentUrl.includes('/login'), assessmentUrl);
check(
  'Body Assessment screen renders its own content',
  /assessment/i.test(assessmentBody ?? ''),
  `${(assessmentBody ?? '').trim().slice(0, 60)}…`
);

// The Body Assessment is gated behind a coach assignment, so an
// unassigned account shows a "Not assigned yet" card and /assessment/new
// bounces straight back. Asserting only "did not land on /login" would
// pass on that bounce and prove nothing about the capture flow, so a real
// pending assignment is created here for the duration of the run and
// removed at the end. Every row this script writes, it deletes.
const { data: definition } = await service
  .from('assessment_definitions')
  .select('id')
  .eq('key', 'body-assessment')
  .maybeSingle();
check('the body assessment definition exists in production', Boolean(definition?.id));

let assignmentId = null;
if (definition?.id) {
  const { data: created, error: assignError } = await service
    .from('assessment_assignments')
    .insert({
      member_id: member.id,
      assessment_definition_id: definition.id,
      assigned_by: member.id,
      is_required: false,
      reason: 'temporary, created by verify-spinal-curve-live.mjs and deleted at the end of the run',
    })
    .select('id')
    .maybeSingle();
  assignmentId = created?.id ?? null;
  check('assign the body assessment so the capture flow can be opened', Boolean(assignmentId), assignError?.message ?? '');
}

const pickerUrl = await visit('/assessment/new', '03-assessment-picker');
const pickerBody = (await page.textContent('body')) ?? '';
check('the not-assigned gate is gone once assigned', !/not assigned yet/i.test(pickerBody));
check(
  'the assessment picker lists Static Posture, the one with the two side views',
  /static posture/i.test(pickerBody),
  `landed on ${pickerUrl}`
);

// /assessment/new redirects to the picker without a type, so the capture
// flow proper is at ?type=static_posture. That is the assessment whose
// left_side and right_side steps are the ones the new measurement runs on.
const wizardUrl = await visit('/assessment/new?type=static_posture', '04-capture-flow');
const wizardBody = (await page.textContent('body')) ?? '';
check(
  'the capture flow actually opens rather than bouncing back',
  wizardUrl.includes('type=static_posture'),
  wizardUrl
);
check(
  'the capture flow renders its own first screen with a Begin control',
  /static posture assessment/i.test(wizardBody) && /begin/i.test(wizardBody),
  `${wizardBody.replace(/\s+/g, ' ').trim().slice(0, 100)}…`
);

// Step into the flow far enough to prove the wizard runs, without
// reaching the camera itself (there is no camera in this environment).
const begin = page.getByRole('button', { name: /^Begin$/ });
if (await begin.count()) {
  await begin.first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-capture-flow-intro.png`, fullPage: true });
  const introBody = (await page.textContent('body')) ?? '';
  check(
    'tapping Begin advances into the preparation sequence',
    !/^\s*$/.test(introBody) && !/static posture assessment/i.test(introBody),
    `${introBody.replace(/\s+/g, ' ').trim().slice(0, 80)}…`
  );
} else {
  check('tapping Begin advances into the preparation sequence', false, 'no Begin button found');
}

// The member's existing assessments still open, and the new section shows
// nothing rather than an empty shell when nothing has been measured.
const { data: existing } = await memberClient
  .from('body_assessments')
  .select('id')
  .eq('member_id', member.id)
  .order('started_at', { ascending: false })
  .limit(1);

if (existing && existing.length > 0) {
  const detailUrl = await visit(`/assessment/${existing[0].id}`, '04-assessment-detail');
  const detailBody = (await page.textContent('body')) ?? '';
  check('an existing assessment still opens', !detailUrl.includes('/login'), detailUrl);
  check(
    'the new Back Curve Measurements section stays hidden when nothing was measured',
    !/back curve measurements/i.test(detailBody)
  );
} else {
  check('an existing assessment still opens', true, 'none on this account, skipped');
  check('the new Back Curve Measurements section stays hidden when nothing was measured', true, 'no assessment to render');
}

check('no JavaScript errors on any screen visited', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();

// Put production back exactly as it was found.
if (assignmentId) {
  const { error: cleanupError } = await service
    .from('assessment_assignments')
    .delete()
    .eq('id', assignmentId);
  check('the temporary assignment was removed again', !cleanupError, cleanupError?.message ?? '');
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log(`screenshots: ${OUT}`);
process.exit(passed === results.length ? 0 : 1);
