#!/usr/bin/env node
/**
 * Approves the sixteen named programs of the MEF library on production,
 * through the REAL approval action.
 *
 * WHY A BROWSER AND NOT A DATABASE UPDATE. Approving a blueprint is
 * `approveBlueprintVersionAction`: it resolves the signed-in user, refuses
 * anybody who is not a platform administrator, refuses a version that is
 * not a draft, refuses a version with an unfilled slot, and only then
 * writes status, approved_at and approved_by. Writing those three columns
 * with a service-role key would produce the same row and skip every one of
 * those checks, and the row would then claim an approval that never
 * happened. So this drives the actual screen: /admin/blueprints, "Approve
 * this version", "Yes, make it assignable".
 *
 * WHO APPROVES. An administrator account, signed in with a one-time minted
 * session (Turnstile blocks scripted form sign-in by design), retired
 * afterwards with scope 'local' so nobody is signed out of their own
 * phone. The coach has pre-authorised these approvals in writing; the note
 * is recorded in docs/BUILD_STATUS.md rather than in a database column,
 * because movement_program_versions has no field for it and inventing one
 * is not this prompt's job.
 *
 * PLAYS NO VIDEO. Every /video-url request is counted and the run fails if
 * any were spent.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   ADMIN_EMAIL           an account holding platform_administrator
 *   PROD_SUPABASE_URL     production project url
 *   PROD_SERVICE_KEY_FILE path to a file holding the service role key
 *   PROD_ANON_KEY_FILE    path to a file holding the anon key
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

/** The sixteen, in the order the coach listed them. */
const LIBRARY_KEYS = [
  'rebuild_your_foundation',
  'beginner_strength_and_stability',
  'back_to_exercise_reset',
  'active_aging_and_balance',
  'gym_strength_foundation',
  'strong_after_40',
  'menopause_strength_foundation',
  'low_impact_strength_and_conditioning',
  'energy_and_recovery_movement_plan',
  'bone_balance_and_strength_support',
  'desk_worker_movement_reset',
  'busy_parent_three_day_plan',
  'low_stress_training_week',
  'travel_and_hotel_program',
  'return_after_illness_or_extended_break',
  'golf_mobility_and_performance_foundation',
];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

if (!ADMIN_EMAIL) {
  console.error('Set ADMIN_EMAIL to an account holding platform_administrator.');
  process.exit(2);
}
if (!canMintSessions()) {
  console.error('Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE.');
  process.exit(2);
}

const db = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false } }
);

/** The draft version 1 of each library program, straight from the database. */
async function draftVersions() {
  const { data: programs } = await db
    .from('movement_programs')
    .select('id, key, display_name')
    .in('key', LIBRARY_KEYS);
  const rows = [];
  for (const program of programs ?? []) {
    const { data: versions } = await db
      .from('movement_program_versions')
      .select('id, version_number, status, approved_at, approved_by')
      .eq('program_id', program.id)
      .order('version_number', { ascending: false });
    rows.push({ program, version: (versions ?? [])[0] });
  }
  return rows.sort((a, b) => LIBRARY_KEYS.indexOf(a.program.key) - LIBRARY_KEYS.indexOf(b.program.key));
}

const browser = await chromium.launch();
let minted = null;
let videos = 0;

try {
  minted = await mintSessionContext(browser, ADMIN_EMAIL, {
    baseUrl: BASE,
    viewport: { width: 1280, height: 1000 },
  });
  if (!minted) {
    console.error(`Could not mint a session for ${ADMIN_EMAIL}.`);
    process.exit(1);
  }

  // The account this run is about to act as really is an administrator,
  // asserted before anything is pressed rather than inferred from a
  // button not erroring.
  const { data: roles } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', minted.session.user.id)
    .is('revoked_at', null);
  const isAdmin = (roles ?? []).some((r) => r.role === 'platform_administrator');
  check(`${ADMIN_EMAIL} holds platform_administrator`, isAdmin);
  if (!isAdmin) process.exit(1);

  const page = await minted.context.newPage();
  page.on('request', (request) => {
    if (request.url().includes('/video-url')) videos += 1;
  });

  const before = await draftVersions();
  check('all sixteen library programs are on production', before.length === 16, `${before.length} found`);
  check(
    'every one of them is an unapproved draft before this run',
    before.every((r) => r.version?.status === 'draft' && r.version?.approved_at === null),
    before.filter((r) => r.version?.status !== 'draft').map((r) => r.program.key).join(', ') || 'all drafts'
  );

  // The library screen lists them all before anything is approved.
  await page.goto(`${BASE}/admin/blueprints`, { waitUntil: 'networkidle' });
  const listedBefore = await page.locator('main').innerText();
  check(
    'the Blueprint Library screen lists all sixteen, plus Home Dumbbell Foundation',
    before.every((r) => listedBefore.includes(r.program.display_name)) &&
      listedBefore.includes('Home Dumbbell Foundation')
  );

  // ------------------------------------------------------------------
  // Approve, one at a time, through the screen.
  // ------------------------------------------------------------------
  for (const row of before) {
    const { program, version } = row;
    if (!version || version.status !== 'draft') {
      check(`approve ${program.key}`, false, `not a draft (${version?.status})`);
      continue;
    }

    await page.goto(`${BASE}/admin/blueprints/${version.id}`, { waitUntil: 'networkidle' });

    const approve = page.getByRole('button', { name: 'Approve this version' });
    await approve.waitFor({ state: 'visible', timeout: 20000 });
    await approve.click();

    const confirm = page.getByRole('button', { name: 'Yes, make it assignable' });
    await confirm.waitFor({ state: 'visible', timeout: 10000 });
    // The screen says what approving means before it is pressed. Read it
    // rather than assume it, because that sentence is the whole point of
    // the confirm step.
    const question = await page.locator('main').innerText();
    const explained =
      question.includes('makes it assignable') && question.includes('any coach can give it to a member');
    await confirm.click();

    // Wait for the screen itself to say Approved, so this asserts what the
    // action did rather than what the database happens to hold.
    await page
      .getByText('Coaches can give this to a member.')
      .waitFor({ state: 'visible', timeout: 20000 });

    const { data: after } = await db
      .from('movement_program_versions')
      .select('status, approved_at, approved_by')
      .eq('id', version.id)
      .maybeSingle();

    check(
      `approved ${program.key}`,
      explained &&
        after?.status === 'approved' &&
        after?.approved_at !== null &&
        after?.approved_by === minted.session.user.id,
      `status=${after?.status} approver=${after?.approved_by === minted.session.user.id ? ADMIN_EMAIL : after?.approved_by}`
    );
  }

  // ------------------------------------------------------------------
  // End state.
  // ------------------------------------------------------------------
  const after = await draftVersions();
  check(
    'all sixteen are approved, each with an approver and a moment',
    after.every(
      (r) =>
        r.version?.status === 'approved' &&
        r.version?.approved_at !== null &&
        r.version?.approved_by === minted.session.user.id
    )
  );

  await page.goto(`${BASE}/admin/blueprints`, { waitUntil: 'networkidle' });
  const listedAfter = await page.locator('main').innerText();
  const draftPills = (listedAfter.match(/\bDraft\b/g) ?? []).length;
  check('the Blueprint Library shows no draft at all', draftPills === 0, `${draftPills} draft pill(s)`);
  check(
    'seventeen approved programs are listed',
    (listedAfter.match(/\bApproved\b/g) ?? []).length === 17,
    `${(listedAfter.match(/\bApproved\b/g) ?? []).length} approved pill(s)`
  );

  check('zero videos played', videos === 0, `${videos} /video-url request(s)`);
} finally {
  await retireSession(minted);
  await browser.close().catch(() => {});
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
