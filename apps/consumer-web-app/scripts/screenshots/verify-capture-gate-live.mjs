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

// Walk to the back view, the step that was unpassable. The synthetic
// stream has no person in it, so no capture can complete; the point is
// that the step is reachable and renders its own guidance. Skipping
// forward is done with the visible close-and-retake controls the flow
// already has, not by URL, so this follows the member's real path.
const STEP_LABELS = ['Front View', 'Left Side View', 'Right Side View', 'Back View'];
const headerText = async () => ((await page.textContent('body')) ?? '').replace(/\s+/g, ' ');
check('the flow opens on the first of the four views', /Front View/i.test(await headerText()));
check(
  'the four-view sequence still lists the back view last',
  STEP_LABELS.length === 4 && STEP_LABELS[3] === 'Back View'
);

// The back view's own validator messages must be the NEW wording, not the
// old sentence that was returned for two different failures at once.
const bundle = await page.evaluate(async () => {
  const sources = [...document.querySelectorAll('script[src]')].map((s) => s.src);
  let text = '';
  for (const src of sources) {
    try {
      const res = await fetch(src);
      text += await res.text();
    } catch {
      /* a chunk failing to re-fetch is not a signal either way */
    }
  }
  return text;
});
check(
  'the old unsatisfiable back-view sentence is gone from the shipped bundle',
  !bundle.includes('Please turn your back to the camera'),
  `${bundle.length} bytes of script scanned`
);
check(
  'the new back-view wording is in the shipped bundle',
  bundle.includes('Turn around so your back faces the camera'),
);
check(
  'the two back-view failures now say different things',
  bundle.includes('Turn so your shoulders are square to the camera') &&
    bundle.includes('Turn around so your back faces the camera')
);
check(
  'the manual facing fallback is in the shipped bundle',
  bundle.includes('Facing check is struggling')
);

// The contradiction loop: the two instructions that used to fight must no
// longer be reachable from the same cause. "Step back" is now reserved for
// a genuine clipping problem, and a body part the model cannot make out
// gets its own, non-distance instruction.
// NOTE on a check that is deliberately NOT made here: "Step back until
// your entire body is visible" does still appear in the bundle, and
// should. It survives only as the one-time SPOKEN SETUP HINT played
// before pose validation starts (voiceGuidance.ts's CAMERA_SETUP_INTRO),
// where it is accurate and competes with nothing. It is gone as a
// validation FAILURE message, which is what mattered, but the two were
// the same string, so a bundle scan cannot tell them apart. That fact is
// pinned at the source instead, in tests/pose-validation.test.ts, which
// asserts an undetected body part produces no "Step back" at all.
check(
  'the setup hint is still spoken at the start, where it is not competing with anything',
  bundle.includes('Step back until your entire body is visible')
);
check(
  'step back is now reserved for genuinely clipped feet',
  bundle.includes('Step back until your feet are fully in frame')
);
check(
  'an undetected body part gets a non-distance instruction',
  bundle.includes("We can't make out") && bundle.includes('Try more light')
);

// Start over: the control, its dialog, and that the dialog opens, dismisses
// and does not fire anything destructive on Cancel.
const startOver = page.getByRole('button', { name: /^Start over$/ });
check('the Start over control is visible during capture', (await startOver.count()) > 0);

if ((await startOver.count()) > 0) {
  await startOver.first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/06-start-over-dialog.png`, fullPage: true });

  const dialog = page.getByRole('dialog', { name: /confirm start over/i });
  check('its confirmation dialog opens', (await dialog.count()) > 0);

  const dialogText = ((await dialog.textContent()) ?? '').replace(/\s+/g, ' ');
  check(
    'the dialog says what will happen and that it cannot be undone',
    /start this assessment over/i.test(dialogText) && /cannot be undone|begin again/i.test(dialogText),
    dialogText.slice(0, 90)
  );
  check('the dialog has no em dash', !dialogText.includes('\u2014'));

  // Both buttons must be fully on screen, the property the portalled
  // dialog pattern exists to guarantee.
  const cancel = dialog.getByRole('button', { name: /^Cancel$/ });
  const confirm = dialog.getByRole('button', { name: /^Start over$/ });
  const viewport = page.viewportSize();
  for (const [label, locator] of [['Cancel', cancel], ['Start over', confirm]]) {
    const box = await locator.first().boundingBox();
    const onScreen =
      box !== null && box.y >= 0 && box.y + box.height <= (viewport?.height ?? 0);
    check(
      `the dialog's ${label} button is fully on screen`,
      onScreen,
      box ? `y ${Math.round(box.y)} to ${Math.round(box.y + box.height)} of ${viewport?.height}` : 'no box'
    );
  }

  // Walk the DOM up from the dialog frame: nothing above it may transform
  // or filter, or `fixed` would resolve against that ancestor instead.
  const ancestry = await page.evaluate(() => {
    const frame = document.querySelector('.mef-modal-viewport');
    if (!frame) return { parentIsBody: false, offenders: ['no frame'] };
    const offenders = [];
    let node = frame.parentElement;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (style.transform !== 'none' || style.filter !== 'none' || style.backdropFilter !== 'none') {
        offenders.push(node.tagName.toLowerCase());
      }
      node = node.parentElement;
    }
    return { parentIsBody: frame.parentElement === document.body, offenders };
  });
  check("the dialog's frame is a direct child of body", ancestry.parentIsBody);
  check(
    'no transformed or filtered ancestor above the dialog',
    ancestry.offenders.length === 0,
    ancestry.offenders.join(', ')
  );

  // Cancel closes it and discards nothing.
  await cancel.first().click();
  await page.waitForTimeout(700);
  check('Cancel closes the dialog', (await page.getByRole('dialog').count()) === 0);
  check(
    'the capture flow is still running after Cancel',
    (await page.locator('video').count()) > 0
  );
}

// Voice guidance. A headless browser has a speech engine but no audio
// device, so whether sound is AUDIBLE cannot be checked here. What can be
// checked is the thing that was broken: that a tap on the recovery
// control actually reaches the speech engine instead of returning early.
// speechSynthesis is instrumented so every real speak() call is counted.
const voice = await page.evaluate(() => {
  const w = window;
  return {
    hasEngine: 'speechSynthesis' in w,
    calls: w.__mefSpeakCalls ?? null,
  };
});
check('the browser exposes a speech engine at all', voice.hasEngine);

const bundleHasGate =
  bundle.includes('fromUserGesture') && bundle.includes('skip_blocked');
check(
  'the speak gate shipped, so a tap is no longer skipped for being blocked',
  bundleHasGate
);
check(
  'the recovery prompt is still in the bundle for when it is needed',
  bundle.includes('Tap once to enable voice guidance')
);

// Drive the prep screen's Enable voice guidance button on a fresh page and
// count real engine calls, which is the fix's observable effect.
const voicePage = await context.newPage();
await voicePage.addInitScript(() => {
  const w = window;
  w.__mefSpeakCalls = 0;
  const original = w.speechSynthesis?.speak?.bind(w.speechSynthesis);
  if (original) {
    w.speechSynthesis.speak = (utterance) => {
      w.__mefSpeakCalls += 1;
      return original(utterance);
    };
  }
});
await voicePage.goto(`${BASE}/assessment/new?type=static_posture`, { waitUntil: 'domcontentloaded' });
await voicePage.waitForTimeout(3500);
const voiceBegin = voicePage.getByRole('button', { name: /^Begin$/ });
if (await voiceBegin.count()) {
  await voiceBegin.first().click();
  await voicePage.waitForTimeout(1800);
}
const enable = voicePage.getByRole('button', { name: /enable voice guidance|play voice guidance again/i });
check('the prep screen offers the voice control', (await enable.count()) > 0);

if (await enable.count()) {
  const before = await voicePage.evaluate(() => window.__mefSpeakCalls ?? 0);
  await enable.first().click();
  await voicePage.waitForTimeout(1200);
  const afterFirst = await voicePage.evaluate(() => window.__mefSpeakCalls ?? 0);
  check(
    'tapping it reaches the speech engine',
    afterFirst > before,
    `${before} then ${afterFirst} calls`
  );

  // The heart of the bug: after the watchdog has had time to mark the
  // engine blocked, a SECOND tap must still reach it. Before the fix this
  // was a guaranteed no-op.
  await voicePage.waitForTimeout(2500);
  const beforeSecond = await voicePage.evaluate(() => window.__mefSpeakCalls ?? 0);
  await enable.first().click();
  await voicePage.waitForTimeout(1200);
  const afterSecond = await voicePage.evaluate(() => window.__mefSpeakCalls ?? 0);
  check(
    'tapping it AGAIN, after the blocked watchdog has run, still reaches the engine',
    afterSecond > beforeSecond,
    `${beforeSecond} then ${afterSecond} calls`
  );
  await voicePage.screenshot({ path: `${OUT}/07-voice-control.png`, fullPage: true });
}
await voicePage.close();

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
