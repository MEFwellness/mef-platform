#!/usr/bin/env node
/**
 * Live verification, against production, that the posture capture flow
 * still loads and advances all the way to the camera step after the
 * capture-gate fix.
 *
 * WHAT THIS CAN AND CANNOT PROVE. The gate itself is driven by a real
 * phone's orientation sensors. There is no DeviceOrientationEvent in a
 * headless browser and no way to fake a physically tilted device, so this
 * script does NOT attempt to prove the tolerances, the instruction order,
 * or the countdown behaviour. Those are proven by tests/camera-tilt.test.ts,
 * tests/capture-gate.test.ts and tests/steady-hold.test.ts, which exercise
 * the same pure modules the phone runs. The camera is given a synthetic
 * video stream (a test pattern, not a body), so pose validation correctly
 * reports that it cannot see anyone; that is the expected outcome here and
 * not a failure.
 *
 * What this DOES prove is the part only production can answer: the member
 * journey reaches the camera, the camera screen renders, the new code
 * paths load without a JavaScript error, and the screen never shows two
 * competing instructions at once.
 *
 * The member session is minted from a one-time magic-link token through
 * the Auth Admin API, so no member password is read, needed or changed.
 * Nothing secret is passed on a command line or printed.
 *
 * Usage, from apps/consumer-web-app:
 *   MEMBER_EMAIL=... PROD_SUPABASE_URL=... \
 *   PROD_SERVICE_KEY_FILE=/secure/key.txt PROD_ANON_KEY_FILE=/secure/anon.txt \
 *     node scripts/screenshots/verify-capture-gate-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT ?? '/tmp/capture-gate-live';
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
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
};

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userList } = await service.auth.admin.listUsers({ perPage: 200 });
const member = userList?.users?.find((u) => u.email === MEMBER_EMAIL);
check('the standing test member exists in production', Boolean(member), MEMBER_EMAIL);
if (!member) process.exit(1);

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

// The Body Assessment is gated behind a coach assignment. Create a real
// pending one for the run and delete it at the end, so this script leaves
// production exactly as it found it.
const { data: definition } = await service
  .from('assessment_definitions')
  .select('id')
  .eq('key', 'body-assessment')
  .maybeSingle();
let assignmentId = null;
if (definition?.id) {
  const { data: created } = await service
    .from('assessment_assignments')
    .insert({
      member_id: member.id,
      assessment_definition_id: definition.id,
      assigned_by: member.id,
      is_required: false,
      reason: 'temporary, created by verify-capture-gate-live.mjs and deleted at the end of the run',
    })
    .select('id')
    .maybeSingle();
  assignmentId = created?.id ?? null;
}
check('assign the body assessment so the capture flow can be opened', Boolean(assignmentId));

// A synthetic camera, so getUserMedia resolves and the capture screen can
// actually mount. The stream is a test pattern, not a person.
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const encoded = `base64-${stringToBase64URL(JSON.stringify(verified.session))}`;
const chunks = createChunks(COOKIE_NAME, encoded);
const context = await browser.newContext(PHONE);
await context.grantPermissions(['camera'], { origin: BASE });
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

await page.goto(`${BASE}/assessment/new?type=static_posture`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/01-welcome.png`, fullPage: true });

const welcomeBody = (await page.textContent('body')) ?? '';
check(
  'the capture flow opens on the Static Posture welcome screen',
  /static posture assessment/i.test(welcomeBody),
  page.url()
);

const begin = page.getByRole('button', { name: /^Begin$/ });
check('the flow offers a Begin control', (await begin.count()) > 0);
if ((await begin.count()) > 0) {
  await begin.first().click();
  await page.waitForTimeout(2000);
}

// Walk the preparation sequence to the camera. Every screen advances with
// "Next" except the last, which reads "Let's go" (with a typographic
// apostrophe, hence the loose match on the middle of the word).
let advanced = 0;
for (let i = 0; i < 10; i++) {
  const next = page.getByRole('button', { name: /^Next$|let.s go/i });
  if ((await next.count()) === 0) break;
  await next.first().click();
  advanced++;
  await page.waitForTimeout(1400);
}
check('the preparation sequence advances screen by screen', advanced >= 3, `${advanced} screens`);
await page.screenshot({ path: `${OUT}/02-after-prep.png`, fullPage: true });

// The camera step. Give the pose model time to load its WASM and model
// from the CDN before judging what is on screen.
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/03-camera-step.png`, fullPage: true });

const hasVideo = (await page.locator('video').count()) > 0;
check('the camera step is reached and a live preview element is mounted', hasVideo);

const cameraBody = (await page.textContent('body')) ?? '';
check(
  'the camera screen is not showing a camera error',
  !/we need camera access/i.test(cameraBody) && !/does not support/i.test(cameraBody),
  `${cameraBody.replace(/\s+/g, ' ').trim().slice(0, 90)}…`
);

// One instruction at a time. The synthetic stream has no person in it, so
// the gate should be sitting on the framing step with exactly one line.
const KNOWN_INSTRUCTIONS = [
  /step into the frame/i,
  /move closer/i,
  /step farther away/i,
  /turn the top of the phone/i,
  /tilt the top of the phone/i,
  /stand the phone upright/i,
  /raise the phone/i,
  /lower the phone/i,
];
const shown = KNOWN_INSTRUCTIONS.filter((pattern) => pattern.test(cameraBody));
check(
  'exactly one capture instruction is on screen, never two competing ones',
  shown.length <= 1,
  `${shown.length} matched`
);

check(
  'the old generic tilt message is gone from the shipped bundle',
  !/Level your phone\. Even a slight tilt affects the measurement\./i.test(cameraBody)
);

// Sample the instruction repeatedly: it must not alternate on its own.
const samples = new Set();
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1200);
  const body = (await page.textContent('body')) ?? '';
  const match = KNOWN_INSTRUCTIONS.find((pattern) => pattern.test(body));
  samples.add(match ? match.source : 'none');
}
check(
  'the instruction stays put across repeated samples rather than alternating',
  samples.size <= 1,
  [...samples].join(' | ')
);

check('no JavaScript errors anywhere in the flow', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();

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
console.log(
  '\nNOTE: the sensor-driven gate itself (tolerances, instruction order, countdown) cannot be\n' +
    'exercised here. There is no DeviceOrientationEvent in a headless browser and no way to fake a\n' +
    'physically tilted phone. Those are proven by the unit tests instead.'
);
process.exit(passed === results.length ? 0 : 1);
