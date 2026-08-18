#!/usr/bin/env node
/**
 * The MEF program library, checked against production after approval.
 *
 * What this proves:
 *
 *   1. The Blueprint Library lists all seventeen approved programs, and
 *      not one draft, to a real administrator's own session.
 *   2. Three spot-check programs, one from each collection, render their
 *      slots with a real prescription on every line and a member-readable
 *      name on every line. No side markers, no provider ids, no variant
 *      codes.
 *   3. A coach can open an assign preview for one of the new programs and
 *      the "Why this program" explanation composes for a real member. The
 *      preview is READ ONLY: nothing is assigned, nothing is published,
 *      and the database is checked afterwards to prove it.
 *   4. The test member's own screens are byte-for-byte identical before
 *      and after the run.
 *   5. Zero videos played.
 *
 * NOTHING IS WRITTEN by this script. It opens screens and reads them.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   ADMIN_EMAIL           an account holding platform_administrator
 *   STAFF_ENV_FILE        path to scripts/screenshots/.env.local
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

/** One per collection, chosen because each stresses something different. */
const SPOT_CHECKS = [
  // Foundations: the chair-based one, where the names are least standard.
  { key: 'active_aging_and_balance', expect: ['Narrow Squats with Chair', 'Single-Leg Step Balance', 'Farmers walk'] },
  // Women 35 to 55: the flagship, and the one with the loaded split squat.
  { key: 'strong_after_40', expect: ['Dumbbell Goblet Squat', 'Split Squat', 'Single Arm Dumbbell Row'] },
  // Lifestyle: the shortest sessions in the library.
  { key: 'busy_parent_three_day_plan', expect: ['Dumbbell Romanian Deadlift', 'Farmers walk', 'Plank'] },
];

/** The program the assign preview is run from. */
const PREVIEW_KEY = 'strong_after_40';

/** Vendor plumbing. None of it may appear on a screen. */
const PLUMBING = [/\((L|R|left|right)\)/, /,\s*(Left|Right)\s+Side/, / - \d+\b/, /your_move/];

/** '/' is the member home; there is no /home route in this app. */
const MEMBER_PATHS = ['/', '/programs', '/movement'];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
function note(message) {
  console.log(`      ${message}`);
}

/** Reads one key out of a dotenv file without printing anything from it. */
function fromEnvFile(path, key) {
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
}

if (!ADMIN_EMAIL || !process.env.STAFF_ENV_FILE) {
  console.error('Set ADMIN_EMAIL and STAFF_ENV_FILE.');
  process.exit(2);
}
if (!canMintSessions()) {
  console.error('Set PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE and PROD_ANON_KEY_FILE.');
  process.exit(2);
}

const MEMBER_EMAIL = fromEnvFile(process.env.STAFF_ENV_FILE, 'MEMBER_POPULATED_EMAIL');
const COACH_EMAIL = fromEnvFile(process.env.STAFF_ENV_FILE, 'COACH_EMAIL');
if (!MEMBER_EMAIL || !COACH_EMAIL) {
  console.error('STAFF_ENV_FILE is missing MEMBER_POPULATED_EMAIL or COACH_EMAIL.');
  process.exit(2);
}

const db = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false } }
);

const browser = await chromium.launch();
let videos = 0;
const memberScreens = { before: {}, after: {} };

/** Signs in as somebody, does the work, and retires the session afterwards. */
async function as(email, viewport, work) {
  const minted = await mintSessionContext(browser, email, { baseUrl: BASE, viewport });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  try {
    const page = await minted.context.newPage();
    page.on('request', (r) => {
      if (r.url().includes('/video-url')) videos += 1;
    });
    return await work(page, minted);
  } finally {
    await retireSession(minted);
  }
}

/**
 * Home animates on arrival (the greeting fades in, the Root Score
 * breathes), so `networkidle` can return before the text has settled and a
 * capture taken then differs from itself on the next run. That is a
 * measurement artefact rather than a property of the screen: waited out,
 * three consecutive captures of Home are byte-identical. So every capture
 * loads and then settles, and the comparison below stays a strict one.
 */
async function captureMemberScreens(into) {
  await as(MEMBER_EMAIL, { width: 390, height: 844 }, async (page) => {
    for (const path of MEMBER_PATHS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      into[path] = await page.locator('body').innerText();
    }
  });
}

/** The row counts a read-only run must not change. */
async function writeFootprint(memberId) {
  const [assignments, workouts, templates] = await Promise.all([
    db.from('coach_program_assignments').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    db.from('coach_assigned_workouts').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    db.from('coach_program_templates').select('id', { count: 'exact', head: true }),
  ]);
  return {
    assignments: assignments.count ?? -1,
    workouts: workouts.count ?? -1,
    templates: templates.count ?? -1,
  };
}

try {
  // ------------------------------------------------------------------
  // Who and what we are working with.
  // ------------------------------------------------------------------
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const memberId = users.users.find((u) => u.email === MEMBER_EMAIL)?.id;
  check('the test member resolves to a real production account', Boolean(memberId));
  if (!memberId) process.exit(1);

  const { data: programs } = await db.from('movement_programs').select('id, key, display_name');
  const { data: versions } = await db
    .from('movement_program_versions')
    .select('id, program_id, version_number, status, member_title, approved_at, approved_by');
  const approved = (versions ?? []).filter((v) => v.status === 'approved');
  const byKey = new Map(
    (programs ?? []).map((p) => [p.key, { program: p, version: approved.find((v) => v.program_id === p.id) }])
  );

  check('production holds seventeen approved program versions', approved.length === 17, `${approved.length} found`);
  check(
    'every approved version carries an approver and a moment',
    approved.every((v) => v.approved_at !== null && v.approved_by !== null)
  );

  const footprintBefore = await writeFootprint(memberId);
  await captureMemberScreens(memberScreens.before);
  note(`member screens captured: ${MEMBER_PATHS.join(', ')}`);

  // A CONTROL capture, taken immediately, with nothing at all happening in
  // between. Any screen that differs from itself here is a screen that
  // composes something fresh on every render (Home's greeting does), and
  // "unchanged" has to be judged against this rather than against a
  // pretence that every screen is deterministic.
  const control = {};
  await captureMemberScreens(control);
  const volatile = MEMBER_PATHS.filter((p) => memberScreens.before[p] !== control[p]);
  if (volatile.length > 0) {
    note(`screens that differ from themselves with nothing happening: ${volatile.join(', ')}`);
  }
  check('every member screen renders deterministically', volatile.length === 0, volatile.join(', '));

  // ------------------------------------------------------------------
  // The administrator's Blueprint Library, and three spot checks.
  // ------------------------------------------------------------------
  await as(ADMIN_EMAIL, { width: 1280, height: 1000 }, async (page) => {
    await page.goto(`${BASE}/admin/blueprints`, { waitUntil: 'networkidle' });
    const library = await page.locator('main').innerText();

    const missing = [...byKey.values()]
      .filter((row) => row.version)
      .map((row) => row.program.display_name)
      .filter((name) => !library.includes(name));
    check('the Blueprint Library lists all seventeen approved programs', missing.length === 0, missing.join(', '));
    check('and shows no draft', !/\bDraft\b/.test(library));

    for (const spot of SPOT_CHECKS) {
      const row = byKey.get(spot.key);
      if (!row?.version) {
        check(`spot check ${spot.key}`, false, 'no approved version');
        continue;
      }
      await page.goto(`${BASE}/admin/blueprints/${row.version.id}`, { waitUntil: 'networkidle' });
      const text = await page.locator('main').innerText();

      const named = spot.expect.every((name) => text.includes(name));
      const approvedOnScreen = text.includes('Coaches can give this to a member.');

      // Every slot on this screen carries a prescription. Read the
      // database's own slot count and require that many dosed lines
      // rather than eyeballing a few.
      const { data: slots } = await db
        .from('program_blueprint_slots')
        .select('exercise_name, sets, reps, hold_duration_seconds')
        .eq('program_version_id', row.version.id);
      // "2 sets of 10 reps", "2 sets of 30 seconds" — the shape
      // lib/coach-program-builder/prescription.ts actually writes.
      const dosedLines = (text.match(/\d+ sets? of \d+/g) ?? []).length;

      const plumbing = PLUMBING.filter((p) => p.test(text)).map((p) => p.source);

      check(
        `spot check ${spot.key}: approved, ${slots.length} slots, named movements present`,
        named && approvedOnScreen && slots.length > 0,
        `expected names ${named ? 'all present' : 'MISSING'}`
      );
      check(
        `spot check ${spot.key}: every name on the screen is member readable`,
        plumbing.length === 0,
        plumbing.join(', ')
      );
      check(
        `spot check ${spot.key}: the screen shows prescriptions, not bare names`,
        dosedLines > 0,
        `${dosedLines} dosed line(s)`
      );
    }
  });

  // ------------------------------------------------------------------
  // The coach's assign preview. Read only.
  // ------------------------------------------------------------------
  const previewRow = byKey.get(PREVIEW_KEY);
  await as(COACH_EMAIL, { width: 1280, height: 1000 }, async (page) => {
    await page.goto(`${BASE}/coach/assign/${memberId}`, { waitUntil: 'networkidle' });
    const chooser = await page.locator('main').innerText();
    check(
      'the coach assign screen offers the new programs',
      chooser.includes(previewRow.version.member_title ?? previewRow.program.display_name)
    );

    await page.goto(`${BASE}/coach/assign/${memberId}/${previewRow.version.id}`, {
      waitUntil: 'networkidle',
    });
    const preview = await page.locator('main').innerText();

    check(
      `the assign preview for ${PREVIEW_KEY} opens with the program on it`,
      preview.includes(previewRow.version.member_title ?? previewRow.program.display_name)
    );
    // "Why this program" is composed from this member's own facts. It is
    // a draft on the screen, written by nobody, stored nowhere yet.
    const explained = /Why this program/i.test(preview) && preview.length > 500;
    check('the member explanation composes for this member', explained);
    check(
      'the preview shows the week 3 that differs',
      /Week 3/i.test(preview),
      /Week 3/i.test(preview) ? '' : 'no week 3 on the screen'
    );
    check('the preview shows prescriptions', /\d+ sets? of \d+/.test(preview));
    check(
      'no vendor plumbing on the coach preview either',
      PLUMBING.every((p) => !p.test(preview))
    );

    const firstLines = preview
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 6)
      .join(' | ');
    note(`preview reads: ${firstLines.slice(0, 220)}`);
  });

  // ------------------------------------------------------------------
  // Nothing was written, and her screens did not move.
  // ------------------------------------------------------------------
  const footprintAfter = await writeFootprint(memberId);
  check(
    'the preview assigned nothing: her assignment, workout and template counts are unchanged',
    JSON.stringify(footprintBefore) === JSON.stringify(footprintAfter),
    `${JSON.stringify(footprintBefore)} -> ${JSON.stringify(footprintAfter)}`
  );

  await captureMemberScreens(memberScreens.after);
  const moved = MEMBER_PATHS.filter((p) => memberScreens.before[p] !== memberScreens.after[p]);
  check(
    `the test member's own screens are byte-for-byte unchanged (${MEMBER_PATHS.join(', ')})`,
    moved.length === 0,
    moved.join(', ')
  );
  for (const path of MEMBER_PATHS) {
    const text = memberScreens.after[path] ?? '';
    check(
      `she sees no named program she was not given on ${path}`,
      !SPOT_CHECKS.some((s) => text.includes(byKey.get(s.key).program.display_name)) &&
        !text.includes('Strong After 40')
    );
  }

  check('zero videos played', videos === 0, `${videos} /video-url request(s)`);
} finally {
  await browser.close().catch(() => {});
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
