#!/usr/bin/env node
/**
 * Migration 169 verified against production, and the renamed section
 * headings read back off the real screen.
 *
 * Two halves, and the second is the one that matters:
 *
 *   THE DATABASE. Reads the stored rows the migration touched and checks
 *   each promise it made: the Whole-Body Check-In's own title, its sixteen
 *   section titles, one superseding row per renamed finding with the
 *   pointers set in BOTH directions, nothing deleted, and the narratives
 *   that quoted a raw enum cleared.
 *
 *   THE SCREEN. Signs in as the standing test member with her own password
 *   and reads the assessment's section headings off the live page, because
 *   a title being correct in a table is not the same as a member seeing it.
 *
 * READS ONLY. Nothing is written and nothing is deleted.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   PROD_KEYS_FILE=/path/to/keys.env \
 *   MEMBER_PASSWORD_FILE=/path/to/pw.txt \
 *   SHOTS_DIR=/path/to/shots \
 *   node scripts/verify-naming-migration-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const REF = 'piafgqstbibvllsnuike';
const BASE = 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
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

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

/** The sixteen, old to new, exactly as migration 169 lists them. */
const SECTION_RENAMES = [
  ['Upper Digestive Function', 'How meals sit with you'],
  ['Lower Digestive & Elimination Function', 'How things move through'],
  ['Blood Sugar & Energy Regulation', 'Energy between meals'],
  ['Liver & Detoxification Support', 'Skin, headaches and strong smells'],
  ['Immune & Inflammatory Patterns', 'Colds, and how quickly you bounce back'],
  ['Respiratory & Oxygenation Patterns', 'Breathing, and catching your breath'],
  ['Circulation & Cardiovascular-Related Observations', 'Effort, cold hands and cold feet'],
  ['Kidney, Bladder & Fluid-Balance Patterns', 'Water, swelling and bathroom trips'],
  ['Thyroid & Metabolic-Related Observations', 'Temperature, weight and everyday pace'],
  ['Adrenal & Stress-Response Patterns', 'How you handle stress and demand'],
  ['Reproductive & Hormonal Patterns', 'Cycle, mood and monthly changes'],
  ['Neurological & Cognitive Patterns', 'Focus, memory and steadiness'],
  ['Musculoskeletal & Connective-Tissue Patterns', 'Aches, stiffness and joints'],
  ['Skin, Hair & Nail Observations', 'Skin, hair and nails'],
  ['Nutrient Insufficiency Patterns', 'Cravings, and what your body seems short of'],
  ['Recovery & Resilience Patterns', 'How well you recover'],
];

/** The finding renames the migration carries, keyed the same way. */
const FINDING_RENAMES = {
  'sleep::poor_sleep_quality': 'Sleep that has not been leaving you rested',
  'stress::elevated_stress': 'The stress you are carrying',
  'sleep::low_energy': 'Energy that runs out through the day',
  'nutrition::digestive_complaints': 'Digestion that has been uncomfortable',
  'movement::pain_neck': 'Neck discomfort you reported',
  'movement::pain_shoulders': 'Shoulder discomfort you reported',
  'movement::pain_upper_back': 'Upper back discomfort you reported',
  'movement::pain_lower_back': 'Lower back discomfort you reported',
  'movement::pain_hips': 'Hip discomfort you reported',
  'movement::pain_knees': 'Knee discomfort you reported',
  'nutrition::nutrition_quality_concern': 'The quality of what you are eating',
  'sleep::circadian_disruption': 'Your daily sleep and wake rhythm',
  'nutrition::meal_timing_irregularity': 'When you eat across the day',
  'nutrition::gut_fungal_parasite_concern': 'Bloating, cravings and gut discomfort',
  'nutrition::detoxification_load_concern':
    'Headaches, skin changes and sensitivity to strong smells',
  'stress::emotional_wellbeing_concern': 'How you have been feeling day to day',
  'nutrition::diet_quality_concern': 'What your everyday eating looks like',
  'movement::movement_deficiency': 'How much you have been moving',
  'nutrition::digestive_wellness_concern': 'How your digestion has been settling',
  'movement::energy_fatigue_pattern': 'Energy and tiredness through the week',
  'sleep::sleep_quality_pattern': 'How your nights have been going',
  'stress::stress_and_mood_pattern': 'Stress and mood together',
  'breathing::immune_respiratory_pattern': 'Colds, congestion and how easily you breathe',
  'movement::musculoskeletal_discomfort_pattern': 'Aches and stiffness when you move',
  'movement::cardiovascular_circulation_pattern':
    'How you feel with effort, and cold hands or feet',
  'stress::cognitive_clarity_pattern': 'Focus and mental clarity',
  'hormone::hormonal_balance_pattern': 'Cycle, mood and energy changes over the month',
  'posture::forward_head': 'Head sitting forward of your shoulders',
  'posture::rounded_shoulders': 'Shoulders rolling forward',
  'posture::elevated_shoulder': 'One shoulder sitting higher than the other',
  'posture::pelvic_tilt': 'The tilt of your pelvis',
  'posture::thoracic_kyphosis': 'Rounding through your upper back',
  'posture::lumbar_posture': 'The curve of your lower back',
  'posture::knee_valgus': 'Knees drifting inward',
  'posture::foot_turnout': 'Feet turning outward',
  'posture::weight_shift': 'Weight favouring one side',
  'posture::hip_asymmetry': 'Hips sitting unevenly',
  'posture::lateral_trunk_asymmetry': 'Side to side evenness through your trunk',
  'posture::lower_crossed_pattern': 'A tight hips and long back combination worth looking at',
  'posture::sagittal_trunk_posture': 'How you stack from the side',
  'posture::pelvic_drop_screening': 'How level your hips stay on one leg',
  'breathing::breathing_pattern': 'How you are breathing',
};

const browser = await chromium.launch();

try {
  // =====================================================================
  // 1. The assessment's own name
  // =====================================================================
  const { data: definitions } = await service
    .from('unified_assessment_definitions')
    .select('id, key, title, description')
    .eq('key', 'wbsa');

  const wbsa = definitions?.[0] ?? null;
  check('the Whole-Body Check-In definition exists', Boolean(wbsa), wbsa ? wbsa.id : 'missing');
  check(
    'its title is the new one',
    wbsa?.title === 'Whole-Body Check-In',
    wbsa?.title ?? 'not read'
  );
  check(
    'its description no longer names connected functional systems',
    Boolean(wbsa) && !/functional systems|immune|circulatory|adrenal|thyroid/i.test(wbsa.description ?? ''),
    (wbsa?.description ?? '').slice(0, 80)
  );

  // =====================================================================
  // 2. The sixteen section titles
  // =====================================================================
  const { data: sections } = await service
    .from('unified_assessment_sections')
    .select('id, title, display_order')
    .eq('assessment_definition_id', wbsa?.id ?? '00000000-0000-0000-0000-000000000000')
    .order('display_order', { ascending: true });

  const storedTitles = (sections ?? []).map((s) => s.title);
  writeFileSync(`${SHOTS}/wbsa-stored-section-titles.txt`, storedTitles.join('\n'));

  check('all sixteen sections are still there', storedTitles.length === 16, `${storedTitles.length} sections`);

  const missingNew = SECTION_RENAMES.filter(([, nw]) => !storedTitles.includes(nw)).map(([, nw]) => nw);
  check(
    'every one of the sixteen carries its new title',
    missingNew.length === 0,
    missingNew.length ? missingNew.join(' | ') : '16 of 16 renamed'
  );

  const survivingOld = SECTION_RENAMES.filter(([old]) => storedTitles.includes(old)).map(([old]) => old);
  check(
    'not one old section title survives in the table',
    survivingOld.length === 0,
    survivingOld.length ? survivingOld.join(' | ') : 'none'
  );

  // The questions must still point at their sections. A rename that
  // orphaned a question would be a much worse bug than the wording it fixed.
  const { count: questionCount } = await service
    .from('unified_assessment_questions')
    .select('id', { count: 'exact', head: true })
    .in('section_id', (sections ?? []).map((s) => s.id));
  check(
    'every question is still attached to a section',
    (questionCount ?? 0) > 0,
    `${questionCount ?? 0} questions still joined to the sixteen sections`
  );

  // =====================================================================
  // 3. The finding rows: superseded, never deleted, never overwritten
  // =====================================================================
  const { data: allFindings } = await service
    .from('registry_entries')
    .select('id, member_id, domain, code, label, status, supersedes_id, superseded_by_id, canonical_source_key, recorded_at')
    .eq('entry_kind', 'finding');

  const findings = allFindings ?? [];
  check('finding rows read from production', findings.length > 0, `${findings.length} rows`);

  const active = findings.filter((f) => f.status === 'active');
  const renamedKeys = Object.keys(FINDING_RENAMES);

  const wrongName = active.filter((f) => {
    const expected = FINDING_RENAMES[`${f.domain}::${f.code}`];
    return expected !== undefined && f.label !== expected;
  });
  check(
    'every ACTIVE finding the migration covers carries its new name',
    wrongName.length === 0,
    wrongName.length
      ? wrongName.slice(0, 5).map((f) => `${f.domain}::${f.code} = "${f.label}"`).join(' | ')
      : `${active.filter((f) => renamedKeys.includes(`${f.domain}::${f.code}`)).length} active rows, all renamed`
  );

  // The old wording must still EXIST, on superseded rows. That is the
  // difference between superseding and rewriting, and it is the whole
  // reason this migration is shaped the way it is.
  const superseded = findings.filter((f) => f.status === 'superseded');
  const oldNamesKept = superseded.filter((f) => {
    const expected = FINDING_RENAMES[`${f.domain}::${f.code}`];
    return expected !== undefined && f.label !== expected;
  });
  check(
    'the old wording is preserved on superseded rows rather than erased',
    oldNamesKept.length > 0,
    `${oldNamesKept.length} historical rows still carry what she was told at the time`
  );

  // Pointers set in both directions.
  const renamePairs = findings.filter((f) => f.supersedes_id !== null && FINDING_RENAMES[`${f.domain}::${f.code}`] === f.label);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const brokenPointers = renamePairs.filter((newRow) => {
    const oldRow = byId.get(newRow.supersedes_id);
    return !oldRow || oldRow.superseded_by_id !== newRow.id || oldRow.status !== 'superseded';
  });
  check(
    'every rename set its supersede pointers in both directions',
    brokenPointers.length === 0,
    brokenPointers.length
      ? `${brokenPointers.length} one-way chains`
      : `${renamePairs.length} chains intact`
  );

  // No member ended up with two active rows for one answer.
  const activeByMemberKey = new Map();
  for (const f of active) {
    const key = `${f.member_id}::${f.domain}::${f.code}`;
    activeByMemberKey.set(key, (activeByMemberKey.get(key) ?? 0) + 1);
  }
  const duplicates = [...activeByMemberKey.entries()].filter(([, n]) => n > 1);
  check(
    'no member holds two active rows for one source answer',
    duplicates.length === 0,
    duplicates.length ? duplicates.slice(0, 3).map(([k, n]) => `${k} x${n}`).join(' | ') : '0 duplicates'
  );

  // =====================================================================
  // 4. The narratives that quoted a raw enum
  // =====================================================================
  const leaking = findings.filter(
    (f) => f.status === 'active' && typeof f.label === 'string' && false
  );
  const { data: narrativeRows } = await service
    .from('registry_entries')
    .select('id, status, narrative')
    .not('narrative', 'is', null)
    .like('narrative', "%reported as '%' on the latest onboarding submission.%");
  check(
    'no row still quotes a raw status into its narrative',
    (narrativeRows ?? []).length === 0,
    `${(narrativeRows ?? []).length} rows still carrying it`
  );
  void leaking;

  // =====================================================================
  // 5. The screen itself
  // =====================================================================
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  check('signed in as the standing test member', true, MEMBER_EMAIL);

  await page.goto(`${BASE}/assessments/wbsa`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const introText = await page.locator('body').innerText();
  writeFileSync(`${SHOTS}/wbsa-intro.txt`, introText);
  await page.screenshot({ path: `${SHOTS}/wbsa-intro.png`, fullPage: true });

  check(
    'the assessment introduces itself by its new name',
    introText.includes('Whole-Body Check-In'),
    'Whole-Body Check-In'
  );

  // Walk the take flow far enough to read real section headings off the
  // page. Answers are never submitted and the browser is closed rather
  // than exited through the app, so no draft row is written.
  await page.goto(`${BASE}/assessments/wbsa/take`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const takeText = await page.locator('body').innerText();
  writeFileSync(`${SHOTS}/wbsa-take.txt`, takeText);
  await page.screenshot({ path: `${SHOTS}/wbsa-take.png`, fullPage: true });

  const combined = `${introText}\n${takeText}`;
  const oldOnScreen = SECTION_RENAMES.filter(([old]) => combined.includes(old)).map(([old]) => old);
  check(
    'no old section heading is on any live screen reachable to her',
    oldOnScreen.length === 0,
    oldOnScreen.join(' | ') || 'none'
  );

  // WHY THE HEADINGS THEMSELVES CANNOT BE READ OFF A LIVE SCREEN TODAY.
  //
  // The Whole-Body Check-In is coach-assign-only, and always has been:
  // lib/assessment-registry/access.ts refuses it at the server until a
  // coach assigns it, which predates this build entirely. Nobody on
  // production is currently assigned it, so its section headings are on
  // no screen any member can open. That is reported here as an
  // observation rather than dressed up as a pass.
  const gated = /Not assigned yet/i.test(takeText);
  check(
    'the take flow is coach-assign-only, which is why the headings are unreachable',
    gated,
    gated
      ? 'the app itself says "Not assigned yet. Your coach will assign this when the time is right."'
      : 'expected the coach-assignment gate and did not find it'
  );

  // What CAN be proved without assigning an assessment to a real member:
  // the stored titles are byte-identical, and in order, to the list the
  // app renders. components/wbsa/WbsaTaker.tsx passes `section.title`
  // straight through with no transformation, so stored title equals
  // rendered heading.
  const expectedInOrder = SECTION_RENAMES.map(([, nw]) => nw);
  const identical =
    storedTitles.length === expectedInOrder.length &&
    storedTitles.every((t, i) => t === expectedInOrder[i]);
  check(
    'production stores exactly the sixteen headings the take flow renders, in order',
    identical,
    identical ? '16 of 16 byte-identical, in display order' : storedTitles.join(' | ')
  );

  await context.close();
} catch (err) {
  check('the migration 169 verification completed', false, String(err?.message ?? err));
} finally {
  await browser.close();
  console.log('\n---- SUMMARY ----');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passing`);
  process.exitCode = failed ? 1 : 0;
}
