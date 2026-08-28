/**
 * Live proof of the top rung of the plan map (Build 2, 2026-08-27).
 *
 * STRICTLY READ-ONLY. It signs in as the one production member who is
 * genuinely on the 24 week program, loads her Questionnaires screen, and
 * reads it. It changes no plan, opens no questionnaire and writes nothing;
 * her row counts are taken before and after and must match.
 *
 * WHY NOT A SCRATCH ACCOUNT. /admin/access deliberately lists only real,
 * non-staff members, so there is no admin path to move a test account onto
 * a plan, and moving a real member's plan to look at a screen is not
 * something a verification run should do. The Monthly rung is therefore
 * proved by the gate matrix and the real-RLS integration tests instead,
 * and this run proves the program rung on a member who is already there.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const EMAIL = process.env.LIVE_PROGRAM_MEMBER_EMAIL;
const TIMEOUT = 60000;
const SHOTS = process.env.SHOT_DIR ?? '.verify-shots';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL ?? '')) {
  console.error('LIVE_PROGRAM_MEMBER_EMAIL must be a plain email address');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    failures.push(name);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
}

const CLINICAL = [
  'Health Check-In',
  'Primal Pattern',
  'Nutrition & Lifestyle',
  'Four Doctors',
  'Whole-Body Check-In',
];

function text(body) {
  return (body || '').replace(/\s+/g, ' ');
}

let MEMBER_ID;
async function rowCounts() {
  const out = {};
  for (const table of [
    'wellness_assessments',
    'primal_pattern_assessments',
    'body_assessments',
    'unified_assessment_sessions',
    'assessment_attempts',
  ]) {
    const { count } = await service
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER_ID);
    out[table] = count ?? 0;
  }
  return out;
}

const browser = await chromium.launch();
let minted = null;

try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) throw new Error('could not mint a session for the member under test');
  MEMBER_ID = minted.session.user.id;

  const { data: sub } = await service
    .from('member_subscriptions')
    .select('tier, status')
    .eq('member_id', MEMBER_ID)
    .maybeSingle();
  console.log(`\nPlan on record: tier=${sub?.tier ?? 'none'} status=${sub?.status ?? 'none'}`);
  check('0. this account is genuinely on the 24 week program', sub?.tier === 'program');

  const before = await rowCounts();
  console.log('Row counts before:', JSON.stringify(before));

  const page = await minted.context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/questionnaires`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${SHOTS}/20_program_questionnaires.png`, fullPage: true });
  const screen = text(await page.textContent('main'));

  const shown = [];
  const notAdvertised = [];
  for (const title of CLINICAL) (screen.includes(title) ? shown : notAdvertised).push(title);
  console.log('\nOn her Questionnaires screen: ' + (shown.join(', ') || 'none of the clinical ones'));
  console.log(
    'Not advertised by the visibility layer: ' + (notAdvertised.join(', ') || 'none')
  );

  for (const title of shown) {
    const locked = (await page.locator(`button[aria-label*="${title}"][aria-label*="locked"]`).count()) > 0;
    check(`1. ${title} is not plan-locked on the 24 week program`, !locked);
  }

  check(
    '2. no plan lock sentence appears anywhere on her Questionnaires screen',
    !screen.includes('This one comes with a Monthly plan') &&
      !screen.includes('This one is part of the 24 week program')
  );
  check('3. the retired coach sentence appears nowhere', !screen.includes('Your coach opens this one for you'));
  check('4. no em dash on the screen', !screen.includes('—'));
  check('5. no browser console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  const after = await rowCounts();
  console.log('Row counts after:', JSON.stringify(after));
  check('6. this run wrote nothing at all', JSON.stringify(before) === JSON.stringify(after));
} finally {
  await retireSession(minted);
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('failed checks:\n  ' + failures.join('\n  '));
process.exit(fail === 0 ? 0 : 1);
