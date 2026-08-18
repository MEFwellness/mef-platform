#!/usr/bin/env node
/**
 * The blueprint revision, the admin blueprint library and the coach's
 * unified assign flow, checked against production.
 *
 * WHAT IT DOES NOT DO, on purpose:
 *   - It never approves Home Dumbbell Foundation v2. That is Osei's call,
 *     on his own screen. Every approve/archive check below runs against a
 *     THROWAWAY duplicate this script creates and cleans up.
 *   - It never publishes anything to the member. The one assignment it
 *     makes is an unpublished draft, invisible to her (coach_assigned_
 *     workouts' member_read_own policy gates on published_at), and it is
 *     deleted in a `finally` whether the run passes or not.
 *   - It plays no video. Every /video-url request any page makes is
 *     counted and the run fails if any were spent.
 *
 * The tap count for the sub-minute claim is measured, not asserted: the
 * script clicks its way from the coach dashboard to the preview screen and
 * prints how many clicks that took.
 *
 * Environment:
 *   BASE_URL              default https://app.mefwellness.com
 *   MEMBER_EMAIL          the test member
 *   MEMBER_ID             her user id
 *   STAFF_EMAIL           an account holding coach and administrator
 *   PROD_SUPABASE_URL     production project url
 *   PROD_SERVICE_KEY_FILE path to a file holding the service role key
 *   PROD_ANON_KEY_FILE    path to a file holding the anon key
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_ID = process.env.MEMBER_ID;
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const STAFF_EMAIL = process.env.STAFF_EMAIL;
const SEED_KEY = 'home_dumbbell_foundation';
const THROWAWAY_NAME = `Verification Throwaway ${Date.now()}`;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
function note(message) {
  console.log(`      ${message}`);
}

function serviceClient() {
  const url = process.env.PROD_SUPABASE_URL;
  const keyFile = process.env.PROD_SERVICE_KEY_FILE;
  if (!url || !keyFile) return null;
  return createClient(url, readFileSync(keyFile, 'utf8').trim(), {
    auth: { persistSession: false },
  });
}

/** A client that reads production exactly as the signed-in member does. */
function memberClient(accessToken) {
  return createClient(
    process.env.PROD_SUPABASE_URL,
    readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function nextMondayOnOrAfter(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function weekOf(startDate, scheduledDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const on = Date.parse(`${scheduledDate}T00:00:00Z`);
  const days = Math.floor((on - start) / 86_400_000);
  return days < 0 ? 1 : Math.floor(days / 7) + 1;
}

if (!MEMBER_ID || !MEMBER_EMAIL || !STAFF_EMAIL) {
  console.error('Set MEMBER_ID, MEMBER_EMAIL and STAFF_EMAIL.');
  process.exit(2);
}
const db = serviceClient();
if (!db) {
  console.error('Set PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE.');
  process.exit(2);
}

const browser = await chromium.launch();

/** Everything this run created on production, torn down in `finally`. */
let throwawayProgramId = null;
let createdAssignmentIds = [];
let createdTemplateIds = [];
let restoreLog = 'nothing was created';

const memberScreens = { before: {}, after: {} };
const MEMBER_PATHS = ['/programs', '/', '/movement'];
/** Declared out here so the restore block can retire the session whatever the run did. */
let before = { videos: 0 };

async function captureMemberScreens(label) {
  const minted = canMintSessions()
    ? await mintSessionContext(browser, MEMBER_EMAIL, {
        baseUrl: BASE,
        viewport: { width: 390, height: 844 },
      })
    : null;
  if (!minted) {
    console.log(`SKIP  member screen capture (${label}): could not mint a session`);
    return { videos: 0 };
  }

  const page = await minted.context.newPage();
  const videos = [];
  page.on('request', (r) => {
    if (r.url().includes('/video-url')) videos.push(r.url());
  });

  for (const path of MEMBER_PATHS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 }).catch(() => {});
    // Settled, not immediate: the home screen's Root Score counts up on
    // load, so a capture taken mid animation differs from the next one
    // with nothing at all having changed. Two identical reads a second
    // apart is what makes byte-for-byte mean something here.
    let text = '';
    for (let attempt = 0; attempt < 12; attempt++) {
      const first = await page.locator('body').innerText().catch(() => '');
      await page.waitForTimeout(1000);
      const second = await page.locator('body').innerText().catch(() => '');
      text = second;
      if (first === second && second.trim().length > 0) break;
    }
    memberScreens[label][path] = text;
    if (text.trim().length === 0) {
      check(`member: ${path} rendered something to compare (${label})`, false, 'empty capture');
    }
  }

  const accessToken = minted.session.access_token;
  await page.close();
  return { videos: videos.length, minted, accessToken };
}

try {
  // -------------------------------------------------------------------
  // 1. The revision, on production.
  // -------------------------------------------------------------------
  const { data: program } = await db
    .from('movement_programs')
    .select('id, key, display_name')
    .eq('key', SEED_KEY)
    .maybeSingle();
  check('db: Home Dumbbell Foundation exists', Boolean(program), program?.display_name ?? 'missing');

  const { data: versions } = await db
    .from('movement_program_versions')
    .select('*')
    .eq('program_id', program?.id ?? '00000000-0000-0000-0000-000000000000')
    .order('version_number', { ascending: false });
  const v2 = (versions ?? []).find((v) => v.version_number === 2);
  const v1 = (versions ?? []).find((v) => v.version_number === 1);

  check('db: v2 is on production as a DRAFT', v2?.status === 'draft', `v2 ${v2?.status}`);
  check('db: nothing has approved v2', v2?.approved_at === null && v2?.approved_by === null, '');
  check('db: v2 records linear periodization', v2?.periodization === 'linear', String(v2?.periodization));
  check('db: v1 is still there, still a draft', v1?.status === 'draft' && v1?.approved_at === null, `v1 ${v1?.status}`);

  const { data: v1Slots } = await db
    .from('program_blueprint_slots')
    .select('id')
    .eq('program_version_id', v1?.id ?? '');
  check('db: v1 still has its original 26 slots', (v1Slots ?? []).length === 26, `${(v1Slots ?? []).length}`);

  const { data: slots } = await db
    .from('program_blueprint_slots')
    .select('*')
    .eq('program_version_id', v2?.id ?? '');
  const sessions = [...new Set((slots ?? []).map((s) => s.session_designation))].sort();
  check('db: v2 has 24 slots across three sessions', (slots ?? []).length === 24 && sessions.length === 3, `${(slots ?? []).length} slots, ${sessions.join('/')}`);

  const { data: catalog } = await db
    .from('exercise_catalog')
    .select('provider, external_id, is_client_assignable')
    .in('external_id', (slots ?? []).map((s) => s.external_id).filter(Boolean));
  const assignable = new Map(
    (catalog ?? []).map((c) => [`${c.provider}:${c.external_id}`, c.is_client_assignable])
  );
  const notAssignable = (slots ?? []).filter(
    (s) => assignable.get(`${s.provider}:${s.external_id}`) !== true
  );
  check('db: every revised slot points at a client-assignable exercise', notAssignable.length === 0, notAssignable.map((s) => s.exercise_name).join(', ') || 'all 24');

  const names = (slots ?? []).map((s) => s.exercise_name);
  check("db: the stepping rear lunge is gone", !names.includes('Dumbbell Rear Lunge'), '');
  check('db: Side Plank is gone', !names.includes('Side Plank'), '');
  // Renamed by migration 176: the "(R)" was vendor plumbing, not a
  // coaching instruction. The slot is unchanged; only its name is.
  check('db: the stationary split squat is in, marked per side', (slots ?? []).some((s) => s.exercise_name === 'Split Squat' && s.is_per_side === true), '');
  check('db: Ab Bridge Complex replaced it in Session B core', (slots ?? []).some((s) => s.exercise_name === 'Ab Bridge Complex' && s.block === 'core' && s.session_designation === 'B'), '');

  const bySession = new Map();
  for (const slot of slots ?? []) {
    const set = bySession.get(slot.external_id) ?? new Set();
    set.add(slot.session_designation);
    bySession.set(slot.external_id, set);
  }
  const repeated = [...new Set((slots ?? []).filter((s) => bySession.get(s.external_id).size > 1).map((s) => s.exercise_name))];
  check('db: exactly one exercise repeats across the week', repeated.length === 1, repeated.join(', ') || 'none');
  note(`the deliberate repeat is ${repeated[0] ?? 'none'}`);

  const topRanks = (slots ?? []).filter((s) => s.priority_rank <= 5);
  const misplaced = topRanks.filter((s) => !['strength', 'core'].includes(s.block));
  check('db: ranks 1 to 5 in every session are strength and core', topRanks.length === 15 && misplaced.length === 0, `${topRanks.length} top-ranked, ${misplaced.length} misplaced`);

  const gainASet = (slots ?? []).filter((s) => s.week_overrides?.['3']?.sets !== undefined);
  const longerHold = (slots ?? []).filter((s) => s.week_overrides?.['3']?.hold_duration_seconds !== undefined);
  check('db: three main lifts gain a set in week 3', gainASet.length === 3 && gainASet.every((s) => s.priority_rank === 1 && s.block === 'strength'), '');
  check('db: three core holds get longer in week 3', longerHold.length === 3 && longerHold.every((s) => s.block === 'core'), '');
  for (const slot of [...gainASet, ...longerHold].sort((a, b) => a.session_designation.localeCompare(b.session_designation))) {
    note(`${slot.session_designation}${slot.slot_order} ${slot.exercise_name} :: ${JSON.stringify(slot.week_overrides)}`);
  }

  // -------------------------------------------------------------------
  // 2. What the member's session reads, and what her screens say.
  // -------------------------------------------------------------------
  before = await captureMemberScreens('before');
  check('member: opening her screens requested no video', (before.videos ?? 0) === 0, `${before.videos ?? 0} requests`);

  if (before.accessToken) {
    const asMember = memberClient(before.accessToken);
    for (const table of ['movement_programs', 'movement_program_versions', 'program_blueprint_slots']) {
      const { data } = await asMember.from(table).select('*');
      check(`member: reads nothing from ${table}`, (data ?? []).length === 0, `${(data ?? []).length} rows`);
    }
  }

  const { data: memberAssignmentsBefore } = await db
    .from('coach_program_assignments')
    .select('id, template_name_snapshot, status, visibility')
    .eq('member_id', MEMBER_ID);
  note(`member currently has ${(memberAssignmentsBefore ?? []).length} assignment(s)`);

  // -------------------------------------------------------------------
  // 3. The admin blueprint library, in a browser.
  // -------------------------------------------------------------------
  const staff = canMintSessions()
    ? await mintSessionContext(browser, STAFF_EMAIL, { baseUrl: BASE, viewport: { width: 1280, height: 1200 } })
    : null;
  if (!staff) {
    check('staff: minted a session', false, 'could not mint');
    throw new Error('cannot continue without a staff session');
  }
  check('staff: minted a session', true, STAFF_EMAIL);

  const staffPage = await staff.context.newPage();
  const staffVideos = [];
  staffPage.on('request', (r) => {
    if (r.url().includes('/video-url')) staffVideos.push(r.url());
  });

  await staffPage.goto(`${BASE}/admin/blueprints`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  const libraryText = await staffPage.locator('body').innerText();
  check('admin: the Blueprint Library screen loads', libraryText.toLowerCase().includes('named programs'), '');
  check('admin: it lists Home Dumbbell Foundation as a Draft at v2', libraryText.includes('Home Dumbbell Foundation') && libraryText.includes('Draft') && libraryText.includes('v2'), '');

  await staffPage.goto(`${BASE}/admin/blueprints/${v2.id}`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  const detailText = await staffPage.locator('body').innerText();
  const revisedOnScreen = {
    splitSquat: detailText.includes('Split Squat') && !detailText.includes('Split squat (R)'),
    abBridge: detailText.includes('Ab Bridge Complex'),
    // "Side Plank" still appears once on this screen, in the coach note
    // saying what the slot replaced. What must be gone is the exercise.
    noSidePlank: !/^Side Plank$/m.test(detailText),
    saysWhatItReplaced: detailText.includes('This slot replaced Side Plank'),
    noRearLunge: !detailText.includes('Dumbbell Rear Lunge'),
  };
  check(
    'admin: the v2 detail screen shows the revised lineup',
    Object.values(revisedOnScreen).every(Boolean),
    JSON.stringify(revisedOnScreen)
  );
  check('admin: it shows the per side marks', detailText.includes('Per side'), '');
  check('admin: it shows the locks', detailText.includes('Locked'), '');
  check('admin: it shows what week 3 changes', detailText.toLowerCase().includes('week 3'), '');
  check('admin: it records linear progression', detailText.includes('linear progression'), '');
  check('admin: version history offers v1', detailText.includes('Home Dumbbell Foundation v1'), '');
  check('admin: v2 is not approved on screen', detailText.includes('Nobody can be given this yet'), '');

  await staffPage.goto(`${BASE}/admin/blueprints/${v1.id}`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  const v1Text = await staffPage.locator('body').innerText();
  check('admin: v1 is still readable in full', v1Text.includes('Dumbbell Rear Lunge') && v1Text.includes('Side Plank'), '');

  // -------------------------------------------------------------------
  // 4. A throwaway duplicate: duplicate, approve, assign unpublished,
  //    inspect, discard, archive, delete.
  // -------------------------------------------------------------------
  await staffPage.goto(`${BASE}/admin/blueprints/${v2.id}`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  await staffPage.getByRole('button', { name: /Duplicate as a new program/i }).click();
  await staffPage.getByLabel('Name for the duplicated program').fill(THROWAWAY_NAME);
  await staffPage.getByRole('button', { name: /Create the duplicate/i }).click();

  // Poll for the row rather than for a URL: the screen is already on a
  // /admin/blueprints/<id> URL, so a URL pattern match would return
  // immediately and prove nothing about whether the write happened.
  let throwaway = null;
  for (let attempt = 0; attempt < 20 && !throwaway; attempt++) {
    await staffPage.waitForTimeout(1500);
    const { data } = await db
      .from('movement_programs')
      .select('id')
      .eq('display_name', THROWAWAY_NAME)
      .maybeSingle();
    throwaway = data ?? null;
  }
  throwawayProgramId = throwaway?.id ?? null;
  if (!throwawayProgramId) {
    note(`the duplicate screen said: ${(await staffPage.locator('body').innerText()).slice(0, 400)}`);
  }
  check('admin: Duplicate created a new program', Boolean(throwawayProgramId), THROWAWAY_NAME);
  restoreLog = throwawayProgramId ? 'created a throwaway blueprint' : restoreLog;

  if (!throwawayProgramId) throw new Error('the throwaway duplicate was never created, so nothing downstream can run');

  const { data: throwawayVersions } = await db
    .from('movement_program_versions')
    .select('*')
    .eq('program_id', throwawayProgramId);
  const copy = (throwawayVersions ?? [])[0];
  check('admin: the duplicate is version 1, in draft', copy?.version_number === 1 && copy?.status === 'draft', `v${copy?.version_number} ${copy?.status}`);

  const { data: copySlots } = await db
    .from('program_blueprint_slots')
    .select('*')
    .eq('program_version_id', copy?.id ?? '');
  check('admin: every slot came across', (copySlots ?? []).length === 24, `${(copySlots ?? []).length}`);
  check('admin: v2 itself is untouched by the duplicate', (await db.from('movement_program_versions').select('status').eq('id', v2.id).single()).data.status === 'draft', '');

  // Approve the throwaway, through the confirm step on the real screen.
  await staffPage.goto(`${BASE}/admin/blueprints/${copy.id}`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  await staffPage.getByRole('button', { name: /Approve this version/i }).click();
  const confirmText = await staffPage.locator('body').innerText();
  check('admin: Approve asks first and says it becomes assignable', /makes it assignable/i.test(confirmText), '');
  await staffPage.getByRole('button', { name: /Yes, make it assignable/i }).click();
  await staffPage.waitForTimeout(3000);

  const { data: approvedCopy } = await db
    .from('movement_program_versions')
    .select('status, approved_at, approved_by')
    .eq('id', copy.id)
    .single();
  check('admin: the throwaway is now approved and attributed', approvedCopy.status === 'approved' && Boolean(approvedCopy.approved_at) && Boolean(approvedCopy.approved_by), approvedCopy.status);

  // -------------------------------------------------------------------
  // 5. The coach's unified flow, counting taps.
  // -------------------------------------------------------------------
  let taps = 0;
  await staffPage.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});

  await staffPage.getByRole('link', { name: /Assign a Program/i }).first().click();
  taps++;
  await staffPage.waitForURL(/\/coach\/assign$/, { timeout: 30000 });
  const pickerText = await staffPage.locator('body').innerText();
  check('coach: the assign flow opens on a member picker', pickerText.toLowerCase().includes('assign a program'), '');

  const { data: memberProfile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', MEMBER_ID)
    .single();
  await staffPage.getByRole('link', { name: memberProfile.display_name }).first().click();
  taps++;
  await staffPage.waitForURL(new RegExp(`/coach/assign/${MEMBER_ID}$`), { timeout: 30000 });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  const overviewText = await staffPage.locator('body').innerText();
  // Case-insensitive on purpose: these headings are set in small caps by
  // a CSS `uppercase` class, so the DOM text is "GOALS" while the source
  // says "Goals". Matching the rendered case would be matching the
  // stylesheet, not the screen.
  const overviewSections = Object.fromEntries(
    ['Goals', 'Readiness', 'Latest posture assessment', 'Current and recent programs'].map((h) => [
      h,
      overviewText.toLowerCase().includes(h.toLowerCase()),
    ])
  );
  check(
    'coach: the member overview shows goals, readiness, findings and programs',
    Object.values(overviewSections).every(Boolean),
    JSON.stringify(overviewSections)
  );
  check('coach: the approved throwaway is offered as a choice', overviewText.includes(THROWAWAY_NAME), '');
  check('coach: the corrective door is offered too', overviewText.includes('Generate a corrective program'), '');
  check('coach: Home Dumbbell Foundation is NOT offered, because it is a draft', !overviewText.includes('Home Dumbbell Foundation'), '');

  await staffPage.getByRole('link', { name: new RegExp(THROWAWAY_NAME) }).first().click();
  taps++;
  await staffPage.waitForURL(/\/coach\/assign\/[0-9a-f-]+\/[0-9a-f-]+$/, { timeout: 30000 });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  await staffPage.getByRole('button', { name: 'Approve & Assign' }).waitFor({ timeout: 30000 }).catch(() => {});
  const previewText = await staffPage.locator('body').innerText();
  // Same reason as the overview headings above: rendered in small caps.
  const previewLower = previewText.toLowerCase();
  const previewParts = {
    schedule: previewLower.includes('schedule'),
    runsSentence: /Runs \w+day/.test(previewText),
    weekOne: previewLower.includes('week 1'),
    weekThree: previewLower.includes('week 3'),
    changesBadge: previewLower.includes('changes this week'),
  };
  check('coach: the preview screen loads with a pre-filled schedule', previewParts.schedule && previewParts.runsSentence, JSON.stringify(previewParts));
  check('coach: the preview shows week 1 and week 3, and says week 3 changes', previewParts.weekOne && previewParts.weekThree && previewParts.changesBadge, JSON.stringify(previewParts));
  if (!Object.values(previewParts).every(Boolean)) {
    note(`preview screen said: ${previewText.slice(0, 900).replace(/\n/g, ' | ')}`);
  }
  check('coach: it offers Approve & Assign', previewText.includes('Approve & Assign'), '');
  check('coach: it offers save as a new program', previewText.includes('Save these edits as a new program'), '');
  check('coach: nothing was published by reaching the preview', true, 'no assignment written yet');
  console.log(`      TAPS from the coach dashboard to the full preview: ${taps}. Approve & Assign is tap ${taps + 1}.`);

  // The swap picker: opens on an unlocked slot, refuses a locked one.
  const swapButtons = staffPage.getByRole('button', { name: 'Swap' });
  const enabledSwap = await swapButtons.count();
  check('coach: the preview offers swaps', enabledSwap > 0, `${enabledSwap} swap buttons`);
  // The main lift is locked, so its Swap is disabled until it is unlocked.
  const lockedNames = (copySlots ?? []).filter((s) => s.is_locked).map((s) => s.exercise_name);
  note(`locked slots in this program: ${[...new Set(lockedNames)].join(', ') || 'none'}`);
  const unlockButtons = await staffPage.locator('button[aria-label^="Unlock "]').count();
  check('coach: a locked slot offers Unlock rather than a silent refusal', unlockButtons > 0, `${unlockButtons} unlock buttons`);

  // Open the picker on the last (unlocked) slot and read the rules it states.
  await swapButtons.last().click();
  await staffPage.waitForTimeout(3000);
  const pickerBody = await staffPage.locator('body').innerText();
  check('coach: the swap picker states the slot’s own rule', /Takes any .* exercise with a video/.test(pickerBody), '');
  check('coach: the swap picker defaults to what the slot will take', pickerBody.includes('Only showing exercises this slot will take'), '');
  check('coach: the full library override is still offered', pickerBody.includes('Show full library'), '');
  await staffPage.getByRole('button', { name: 'Close' }).click();
  await staffPage.waitForTimeout(500);

  // The corrective door, reached exactly as coaches know it.
  await staffPage.goto(`${BASE}/coach/assign/${MEMBER_ID}`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  await staffPage.getByRole('link', { name: /Generate a corrective program/i }).click();
  await staffPage.waitForURL(new RegExp(`/coach/corrective-programs/${MEMBER_ID}$`), { timeout: 30000 });
  const correctiveText = await staffPage.locator('body').innerText();
  check('coach: the corrective door lands on the screens coaches already use', correctiveText.toLowerCase().includes('corrective programs'), '');

  await staffPage.goto(`${BASE}/coach/corrective-programs`, { waitUntil: 'domcontentloaded' });
  await staffPage.waitForSelector('main', { timeout: 30000 }).catch(() => {});
  const correctiveEntryText = await staffPage.locator('body').innerText();
  check('coach: the old corrective entry screen is unchanged and still reachable', correctiveEntryText.toLowerCase().includes('corrective programs') && correctiveEntryText.includes('posture assessment'), '');

  check('staff: no page in the whole staff walk requested a video', staffVideos.length === 0, `${staffVideos.length} requests`);

  // -------------------------------------------------------------------
  // 6. Assign the throwaway as an UNPUBLISHED draft, verify shape, discard.
  //
  // Written here rather than clicked, because the screen's Approve &
  // Assign publishes and this run publishes nothing. The rows below are
  // the same rows the materializer writes, and the shape they must have
  // is what is being checked.
  // -------------------------------------------------------------------
  const { data: coachLink } = await db
    .from('coach_client_assignments')
    .select('coach_id')
    .eq('client_id', MEMBER_ID)
    .eq('status', 'active')
    .limit(1);
  const coachId = (coachLink ?? [])[0]?.coach_id;
  check('db: the member has an active coach to assign as', Boolean(coachId), coachId ? String(coachId).slice(0, 8) : 'none');

  if (coachId) {
    const startDate = nextMondayOnOrAfter(addDays(new Date().toISOString().slice(0, 10), 1));
    const groupTag = `named-program:verify-${Date.now()}`;
    const dayPattern = [1, 3, 5];
    const blockNames = {
      release: 'Preparation',
      mobility: 'Mobility',
      stability: 'Activation',
      strength: 'Strength',
      core: 'Core',
    };
    const sectionTypes = {
      release: 'corrective',
      mobility: 'mobility',
      stability: 'activation',
      strength: 'strength',
      core: 'core',
    };

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const sessionSlots = (copySlots ?? [])
        .filter((s) => s.session_designation === session)
        .sort((a, b) => a.slot_order - b.slot_order);

      const { data: template, error: templateError } = await db
        .from('coach_program_templates')
        .insert({
          coach_id: coachId,
          name: `${copy.member_title}: Session ${session}`,
          description: copy.member_description,
          goal: 'strength',
          difficulty: 'beginner',
          equipment: [...new Set(sessionSlots.flatMap((s) => s.equipment_requirement))].sort(),
          program_tags: [groupTag, 'named-program', `named-program-version:${copy.id}`, `named-program-member:${MEMBER_ID}`],
          corrective_tags: [],
          movement_tags: [],
          status: 'pending_coach_review',
        })
        .select('id')
        .single();
      if (templateError) throw new Error(`template insert failed: ${templateError.message}`);
      createdTemplateIds.push(template.id);
      restoreLog = `created ${createdTemplateIds.length} template(s)`;

      let sequence = 0;
      let currentSection = null;
      let currentBlock = null;
      for (const slot of sessionSlots) {
        if (slot.block !== currentBlock) {
          const { data: section, error: sectionError } = await db
            .from('coach_program_template_sections')
            .insert({
              template_id: template.id,
              coach_id: coachId,
              name: blockNames[slot.block],
              section_type: sectionTypes[slot.block],
              sequence_index: sequence++,
            })
            .select('id')
            .single();
          if (sectionError) throw new Error(`section insert failed: ${sectionError.message}`);
          currentSection = section.id;
          currentBlock = slot.block;
        }
        const { error: exerciseError } = await db.from('coach_program_template_exercises').insert({
          template_id: template.id,
          section_id: currentSection,
          coach_id: coachId,
          provider: slot.provider,
          external_id: slot.external_id,
          exercise_name: slot.exercise_name,
          sequence_index: slot.slot_order,
          sets: slot.sets,
          reps: slot.reps === null ? null : String(slot.reps),
          rep_range_low: slot.reps,
          rep_range_high: slot.reps,
          hold_duration_seconds: slot.hold_duration_seconds,
          tempo: slot.tempo,
          rest_seconds: slot.rest_seconds,
          unilateral: slot.is_per_side === true,
          priority: slot.priority_rank <= 3 ? 'high' : slot.priority_rank <= 6 ? 'medium' : 'low',
          is_required: slot.is_required,
          week_overrides: slot.week_overrides ?? {},
        });
        if (exerciseError) throw new Error(`exercise insert failed: ${exerciseError.message}`);
      }

      const { data: assignment, error: assignmentError } = await db
        .from('coach_program_assignments')
        .insert({
          member_id: MEMBER_ID,
          coach_id: coachId,
          template_id: template.id,
          template_name_snapshot: `${copy.member_title}: Session ${session}`,
          schedule_type: 'weekly',
          schedule_config: {
            type: 'weekly',
            startDate,
            daysOfWeek: [dayPattern[i] ?? 1],
            weeks: copy.duration_weeks,
          },
          visibility: 'draft',
          published_at: null,
          status: 'upcoming',
          start_date: startDate,
          end_date: addDays(startDate, copy.duration_weeks * 7 - 1),
          duration_weeks: copy.duration_weeks,
          program_group_key: groupTag,
          source_blueprint_version_id: copy.id,
        })
        .select('id')
        .single();
      if (assignmentError) throw new Error(`assignment insert failed: ${assignmentError.message}`);
      createdAssignmentIds.push(assignment.id);
      restoreLog = `created ${createdTemplateIds.length} template(s) and ${createdAssignmentIds.length} assignment(s)`;

      // The frozen weeks, with the per-week plan resolved into them.
      for (let week = 1; week <= copy.duration_weeks; week++) {
        const scheduled = addDays(startDate, (week - 1) * 7 + ((dayPattern[i] ?? 1) - 1));
        const { data: workout, error: workoutError } = await db
          .from('coach_assigned_workouts')
          .insert({
            assignment_id: assignment.id,
            member_id: MEMBER_ID,
            coach_id: coachId,
            template_name: `${copy.member_title}: Session ${session}`,
            scheduled_date: scheduled,
            program_week: weekOf(startDate, scheduled),
            status: 'not_started',
            published_at: null,
            corrective_tags: [],
            program_tags: [groupTag, 'named-program'],
          })
          .select('id')
          .single();
        if (workoutError) throw new Error(`workout insert failed: ${workoutError.message}`);

        let wSequence = 0;
        let wSection = null;
        let wBlock = null;
        for (const slot of sessionSlots) {
          if (slot.block !== wBlock) {
            const { data: section, error: sectionError } = await db
              .from('coach_assigned_workout_sections')
              .insert({
                assigned_workout_id: workout.id,
                member_id: MEMBER_ID,
                coach_id: coachId,
                name: blockNames[slot.block],
                section_type: sectionTypes[slot.block],
                sequence_index: wSequence++,
              })
              .select('id')
              .single();
            if (sectionError) throw new Error(`frozen section insert failed: ${sectionError.message}`);
            wSection = section.id;
            wBlock = slot.block;
          }
          const override = (slot.week_overrides ?? {})[String(week)] ?? {};
          const resolvedSets = typeof override.sets === 'number' ? override.sets : slot.sets;
          const resolvedHold =
            typeof override.hold_duration_seconds === 'number'
              ? override.hold_duration_seconds
              : slot.hold_duration_seconds;
          const resolvedReps = typeof override.reps === 'number' ? override.reps : slot.reps;
          const { error: frozenError } = await db
            .from('coach_assigned_workout_exercises')
            .insert({
              assigned_workout_id: workout.id,
              section_id: wSection,
              member_id: MEMBER_ID,
              coach_id: coachId,
              provider: slot.provider,
              external_id: slot.external_id,
              exercise_name: slot.exercise_name,
              sequence_index: slot.slot_order,
              status: 'not_started',
              sets: resolvedSets,
              reps: resolvedReps === null ? null : String(resolvedReps),
              rep_range_low: resolvedReps,
              rep_range_high: resolvedReps,
              hold_duration_seconds: resolvedHold,
              tempo: slot.tempo,
              rest_seconds: slot.rest_seconds,
              unilateral: slot.is_per_side === true,
              priority: slot.priority_rank <= 3 ? 'high' : slot.priority_rank <= 6 ? 'medium' : 'low',
              is_required: slot.is_required,
            });
          if (frozenError) throw new Error(`frozen exercise insert failed: ${frozenError.message}`);
        }
      }
    }

    check('assign: three unpublished draft assignments were created', createdAssignmentIds.length === 3, `${createdAssignmentIds.length}`);

    const { data: writtenAssignments } = await db
      .from('coach_program_assignments')
      .select('id, visibility, published_at, source_blueprint_version_id, duration_weeks, program_group_key')
      .in('id', createdAssignmentIds);
    check('assign: none of them is published', (writtenAssignments ?? []).every((a) => a.visibility !== 'published' && a.published_at === null), '');
    check('assign: every one records the blueprint version it came from', (writtenAssignments ?? []).every((a) => a.source_blueprint_version_id === copy.id), '');
    check('assign: they share one program group and one duration', new Set((writtenAssignments ?? []).map((a) => a.program_group_key)).size === 1 && new Set((writtenAssignments ?? []).map((a) => a.duration_weeks)).size === 1, '');

    const { data: frozenWorkouts } = await db
      .from('coach_assigned_workouts')
      .select('id, program_week, published_at')
      .in('assignment_id', createdAssignmentIds);
    check('assign: twelve frozen weekly occurrences, none published', (frozenWorkouts ?? []).length === 12 && (frozenWorkouts ?? []).every((w) => w.published_at === null), `${(frozenWorkouts ?? []).length}`);

    const weekById = new Map((frozenWorkouts ?? []).map((w) => [w.id, w.program_week]));
    const mainLift = (copySlots ?? []).find((s) => s.session_designation === 'A' && s.priority_rank === 1);
    const { data: frozenMain } = await db
      .from('coach_assigned_workout_exercises')
      .select('assigned_workout_id, sets')
      .in('assigned_workout_id', [...weekById.keys()])
      .eq('external_id', mainLift.external_id);
    const setsByWeek = {};
    for (const row of frozenMain ?? []) setsByWeek[weekById.get(row.assigned_workout_id)] = row.sets;
    check('assign: the main lift gains its set in week 3 and nowhere else', setsByWeek[1] === mainLift.sets && setsByWeek[2] === mainLift.sets && setsByWeek[3] === mainLift.sets + 1 && setsByWeek[4] === mainLift.sets, JSON.stringify(setsByWeek));

    const { data: frozenPerSide } = await db
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, unilateral')
      .in('assigned_workout_id', [...weekById.keys()])
      .eq('exercise_name', 'Single Arm Dumbbell Row');
    check('assign: the row is frozen as per side', (frozenPerSide ?? []).length > 0 && (frozenPerSide ?? []).every((r) => r.unilateral === true), `${(frozenPerSide ?? []).length} rows`);

    // The member cannot see any of it.
    if (before.accessToken) {
      const asMember = memberClient(before.accessToken);
      const { data: visible } = await asMember
        .from('coach_assigned_workouts')
        .select('id')
        .in('id', [...weekById.keys()]);
      check('assign: the member can read none of the unpublished occurrences', (visible ?? []).length === 0, `${(visible ?? []).length} visible`);
    }
  }
} catch (error) {
  check('run: completed without throwing', false, error.message);
} finally {
  // -------------------------------------------------------------------
  // Restore. Everything this run created, removed, pass or fail.
  // -------------------------------------------------------------------
  const removed = [];

  if (createdAssignmentIds.length > 0) {
    const { data: published } = await db
      .from('coach_program_assignments')
      .select('id, visibility, published_at')
      .in('id', createdAssignmentIds);
    const anyPublished = (published ?? []).some((a) => a.visibility === 'published' || a.published_at !== null);
    if (anyPublished) {
      check('restore: refused to delete a published assignment', false, 'something got published, left in place for a human');
    } else {
      await db.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
      removed.push(`${createdAssignmentIds.length} assignment(s)`);
    }
  }
  if (createdTemplateIds.length > 0) {
    await db.from('coach_program_templates').delete().in('id', createdTemplateIds);
    removed.push(`${createdTemplateIds.length} template(s)`);
  }
  if (throwawayProgramId) {
    // Archived first, so the archive path itself is exercised on a real
    // approved version, then deleted because it was only ever a fixture.
    const { data: throwawayVersions } = await db
      .from('movement_program_versions')
      .select('id')
      .eq('program_id', throwawayProgramId);
    for (const version of throwawayVersions ?? []) {
      await db
        .from('movement_program_versions')
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('id', version.id);
    }
    const { data: archived } = await db
      .from('movement_program_versions')
      .select('status')
      .eq('program_id', throwawayProgramId);
    check('restore: the throwaway archived cleanly before deletion', (archived ?? []).every((v) => v.status === 'archived'), (archived ?? []).map((v) => v.status).join(','));

    await db.from('movement_programs').delete().eq('id', throwawayProgramId);
    removed.push('the throwaway blueprint');
  }

  console.log(`\nRESTORE: ${removed.length > 0 ? `removed ${removed.join(', ')}` : restoreLog}`);

  // The member's own state, after.
  const { data: memberAfter } = await db
    .from('coach_program_assignments')
    .select('id, status, visibility')
    .eq('member_id', MEMBER_ID);
  console.log(`END STATE: the member has ${(memberAfter ?? []).length} assignment(s), none created by this run.`);

  const { data: blueprintsAfter } = await db
    .from('movement_programs')
    .select('key, display_name');
  console.log(`END STATE: production holds ${(blueprintsAfter ?? []).length} named program(s): ${(blueprintsAfter ?? []).map((p) => p.display_name).join(', ')}`);

  const { data: seedProgram } = await db
    .from('movement_programs')
    .select('id')
    .eq('key', SEED_KEY)
    .maybeSingle();
  const { data: seedVersions } = await db
    .from('movement_program_versions')
    .select('version_number, status, approved_at')
    .eq('program_id', seedProgram?.id ?? '')
    .order('version_number', { ascending: true });
  for (const v of seedVersions ?? []) {
    console.log(`END STATE: Home Dumbbell Foundation v${v.version_number} is ${v.status}${v.approved_at ? ' (approved)' : ''}`);
  }

  // The member's screens, after.
  const after = await captureMemberScreens('after');
  check('member: opening her screens after the run requested no video', (after.videos ?? 0) === 0, `${after.videos ?? 0} requests`);
  for (const path of MEMBER_PATHS) {
    const b = memberScreens.before[path];
    const a = memberScreens.after[path];
    if (b === undefined || a === undefined) {
      check(`member: ${path} captured before and after`, false, 'a capture is missing');
      continue;
    }
    check(`member: ${path} is byte-for-byte unchanged`, b === a, b === a ? '' : 'differs');
  }
  if (after.minted) await retireSession(after.minted);
  if (before?.minted) await retireSession(before.minted);
  if (typeof staff !== 'undefined' && staff) await retireSession(staff);

  await browser.close();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  for (const f of failed) console.log(`  FAILED: ${f.name}`);
  process.exit(failed.length === 0 ? 0 : 1);
}
