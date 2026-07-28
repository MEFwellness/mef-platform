#!/usr/bin/env node
/**
 * Seeds the production QA/test accounts (Part 1 of the daily-loop
 * follow-up batch): one coach and THREE member states, all flagged
 * `is_test = true` (migration 114) so none can ever be confused with a
 * real member or show up in a real coach's caseload / an admin's user
 * count.
 *
 * Three member states, not one — this doubles as the fixture for two
 * separate needs: the screenshot tool's existing `memberPopulated` /
 * `memberEmpty` slots (scripts/screenshots/config.mjs), and the three
 * Energy Forecast states a live verification pass needs to see (brand
 * new, a few days in and below the 5-scored-forecast calibration
 * threshold, and enough graded forecasts to show both accuracy rates):
 *   - populated   — 40 days of check-in history + ~35 days of scored
 *                   forecasts (her and Root both), realistic misses, not
 *                   suspiciously perfect.
 *   - belowThreshold — 4 days of check-in history + 3 scored forecasts
 *                      (under MIN_SCORED_FORECASTS_FOR_CALIBRATION = 5).
 *   - empty       — zero check-ins, zero forecasts, a genuine day-one account.
 *
 * Requires production credentials as environment variables — never
 * hardcoded, never falls back to a local/dev value (a missing var throws
 * immediately, same discipline scripts/screenshots/config.mjs already
 * uses for its own `live` target):
 *   SEED_SUPABASE_URL               — the production Supabase project's API URL
 *   SEED_SUPABASE_SERVICE_ROLE_KEY  — its service-role key (Settings -> API)
 *   SEED_MEMBER_POPULATED_EMAIL / SEED_MEMBER_POPULATED_PASSWORD
 *   SEED_MEMBER_BELOW_THRESHOLD_EMAIL / SEED_MEMBER_BELOW_THRESHOLD_PASSWORD
 *   SEED_MEMBER_EMPTY_EMAIL / SEED_MEMBER_EMPTY_PASSWORD
 *   SEED_COACH_EMAIL / SEED_COACH_PASSWORD
 *
 * Usage: set the env vars above, then from apps/consumer-web-app:
 *   node scripts/seed-production-test-accounts.mjs
 *
 * Idempotent: an existing account (by email) is reused, not recreated,
 * and re-flagged is_test = true. Check-in/forecast seeding deletes and
 * re-inserts its own date range each run rather than accumulating
 * duplicates — safe to re-run.
 */
import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. This script refuses to guess or fall back to a ` +
        "local/dev value when seeding production — see this file's own header comment."
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('SEED_SUPABASE_URL');
const SERVICE_ROLE_KEY = requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY');
const COACH_EMAIL = requiredEnv('SEED_COACH_EMAIL');
const COACH_PASSWORD = requiredEnv('SEED_COACH_PASSWORD');

const TIMEZONE = 'America/New_York';
// Mirrors lib/energy-forecast/constants.ts's MIN_SCORED_FORECASTS_FOR_CALIBRATION.
const MIN_SCORED_FORECASTS_FOR_CALIBRATION = 5;

const MEMBER_CONFIGS = [
  {
    key: 'populated',
    email: requiredEnv('SEED_MEMBER_POPULATED_EMAIL'),
    password: requiredEnv('SEED_MEMBER_POPULATED_PASSWORD'),
    checkinDays: 40,
    forecastDays: 35, // enough scored days on both sides to clear MIN_SCORED_FORECASTS_FOR_CALIBRATION
  },
  {
    key: 'belowThreshold',
    email: requiredEnv('SEED_MEMBER_BELOW_THRESHOLD_EMAIL'),
    password: requiredEnv('SEED_MEMBER_BELOW_THRESHOLD_PASSWORD'),
    checkinDays: 4,
    forecastDays: 3, // deliberately under the calibration threshold
  },
  {
    key: 'empty',
    email: requiredEnv('SEED_MEMBER_EMPTY_EMAIL'),
    password: requiredEnv('SEED_MEMBER_EMPTY_PASSWORD'),
    checkinDays: 0,
    forecastDays: 0,
  },
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayLocalDate() {
  return new Date().toISOString().slice(0, 10);
}

function clampScale(value) {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function seededRandom(seed) {
  // Deterministic per-day pseudo-random in [0, 1) — mulberry32.
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Realistic, non-flat daily variation: a slow drift, a weekly cycle, and
 * real day-to-day noise — never a constant or a smooth monotonic line,
 * which would make every chart and the correlation engine's own
 * hasSufficientVariation check look fake or get rejected outright. `salt`
 * offsets the seed per-member so the three accounts don't share an
 * identical-looking history.
 */
function buildDayProfile(i, totalDays, salt) {
  const dayOfWeek = i % 7;
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
  const weeklyTrend = Math.sin((i / Math.max(totalDays, 1)) * Math.PI * 1.5) * 0.6;
  const noise = (seededRandom(i * 97 + 13 + salt) - 0.5) * 1.8;
  const weekendBoost = isWeekend ? 0.4 : 0;

  const sleepQuality = clampScale(3.2 + weeklyTrend + weekendBoost + noise);
  const stress = clampScale(4.2 - sleepQuality * 0.5 + (seededRandom(i * 53 + 7 + salt) - 0.5) * 1.4);
  const energy = clampScale(2.6 + sleepQuality * 0.4 - stress * 0.15 + (seededRandom(i * 31 + 3 + salt) - 0.5) * 1.2);
  const mood = clampScale(3 + (energy - 3) * 0.5 + (seededRandom(i * 71 + 11 + salt) - 0.5) * 1.2);

  const painRoll = seededRandom(i * 41 + 19 + salt);
  const pain = painRoll > 0.78 ? clampScale(3 + painRoll * 2) - 1 : Math.max(0, clampScale(1 + noise * 0.5) - 1);

  const sleepDurations = ['5-6h', '6-7h', '7-8h', '7-8h', '8h+'];
  const sleepDuration = sleepDurations[Math.floor(seededRandom(i * 61 + 5 + salt) * sleepDurations.length)];

  const bedtimeHour = 22 + Math.floor(seededRandom(i * 83 + 17 + salt) * 2);
  const bedtimeMin = Math.floor(seededRandom(i * 89 + 23 + salt) * 60);
  const wakeHour = 6 + Math.floor(seededRandom(i * 101 + 29 + salt) * 2);
  const wakeMin = Math.floor(seededRandom(i * 103 + 31 + salt) * 60);

  const movementOptions = ['none', 'light', 'light', 'moderate', 'full_session'];
  const movementToday = movementOptions[Math.floor(seededRandom(i * 107 + 37 + salt) * movementOptions.length)];

  const waterCups = Math.round(3 + seededRandom(i * 109 + 41 + salt) * 6);
  const digestion = clampScale(3 + (seededRandom(i * 113 + 43 + salt) - 0.5) * 2);

  return {
    energy,
    sleepQuality,
    stress,
    mood,
    pain,
    sleepDuration,
    actualBedtime: `${String(bedtimeHour).padStart(2, '0')}:${String(bedtimeMin).padStart(2, '0')}`,
    actualWakeTime: `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`,
    movementToday,
    waterCups,
    digestion,
    nightWakingCount: seededRandom(i * 127 + 47 + salt) > 0.7 ? Math.ceil(seededRandom(i * 131 + 53 + salt) * 2) : 0,
    nightSweats: seededRandom(i * 137 + 59 + salt) > 0.9,
    morningSoreness: clampScale(2 + (seededRandom(i * 139 + 61 + salt) - 0.5) * 2),
    bowelMovementStatus: seededRandom(i * 149 + 67 + salt) > 0.85 ? 'constipated' : 'normal',
  };
}

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  already exists: ${email} (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  console.log(`  created: ${email} (${data.user.id})`);
  return data.user.id;
}

async function markAsTest(userId, label) {
  const { error } = await supabase.from('profiles').update({ is_test: true }).eq('id', userId);
  if (error) throw new Error(`marking ${label} (${userId}) is_test failed: ${error.message}`);
  console.log(`  flagged is_test=true: ${label} (${userId})`);
}

async function grantCoachRole(userId) {
  const { data: existing } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'coach')
    .is('revoked_at', null)
    .maybeSingle();
  if (existing) {
    console.log('  coach role already granted');
    return;
  }
  const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'coach' });
  if (error) throw new Error(`granting coach role failed: ${error.message}`);
  console.log('  coach role granted');
}

async function ensureAssignment(coachId, clientId) {
  const { data: existing } = await supabase
    .from('coach_client_assignments')
    .select('id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    console.log('  assignment already active');
    return;
  }
  const { error } = await supabase
    .from('coach_client_assignments')
    .insert({ coach_id: coachId, client_id: clientId, status: 'active', assigned_by: coachId });
  if (error) throw new Error(`assigning member to coach failed: ${error.message}`);
  console.log('  member assigned to coach');
}

/** Returns the ordered local_dates and each day's real energy_level, keyed for buildForecastRows to grade against. */
async function seedCheckinHistory(memberId, numDays, salt) {
  if (numDays === 0) {
    const today = todayLocalDate();
    await supabase.from('daily_checkins').delete().eq('user_id', memberId).gte('local_date', addDays(today, -365));
    console.log('  no check-in history seeded (brand-new member state)');
    return { dates: [], energyByDate: new Map() };
  }

  const today = todayLocalDate();
  const startDate = addDays(today, -(numDays - 1));
  const dates = [];
  const energyByDate = new Map();
  const rows = [];

  for (let i = 0; i < numDays; i++) {
    const localDate = addDays(startDate, i);
    const p = buildDayProfile(i, numDays, salt);
    dates.push(localDate);
    energyByDate.set(localDate, p.energy);
    rows.push({
      user_id: memberId,
      timezone: TIMEZONE,
      local_date: localDate,
      sleep_quality: p.sleepQuality,
      sleep_duration: p.sleepDuration,
      energy_level: p.energy,
      stress_level: p.stress,
      mood_level: p.mood,
      digestion_rating: p.digestion,
      pain_discomfort_level: p.pain,
      movement_today: p.movementToday,
      water_cups: p.waterCups,
      actual_bedtime: p.actualBedtime,
      actual_wake_time: p.actualWakeTime,
      night_waking_count: p.nightWakingCount,
      night_sweats: p.nightSweats,
      morning_soreness: p.morningSoreness,
      bowel_movement_status: p.bowelMovementStatus,
      new_or_worsening_concern: false,
    });
  }

  await supabase.from('daily_checkins').delete().eq('user_id', memberId).gte('local_date', startDate);
  const { error } = await supabase.from('daily_checkins').insert(rows);
  if (error) throw new Error(`seeding check-in history failed: ${error.message}`);
  console.log(`  seeded ${rows.length} days of check-in history (${startDate} .. ${today})`);
  return { dates, energyByDate };
}

/**
 * Scored forecast rows for the most recent `numForecastDays` of the
 * seeded check-in history — her prediction and Root's, each graded
 * against that day's REAL energy_level with a realistic, non-perfect
 * miss distribution (mostly within a point, occasionally further off).
 * Root's own miss is drawn independently so the two accuracy rates don't
 * suspiciously match.
 */
async function seedForecastHistory(memberId, dates, energyByDate, numForecastDays, salt) {
  await supabase.from('energy_forecasts').delete().eq('member_id', memberId);
  await supabase.from('root_energy_forecasts').delete().eq('member_id', memberId);

  if (numForecastDays === 0 || dates.length < 2) {
    console.log('  no forecast history seeded');
    return;
  }

  const scoredDates = dates.slice(-numForecastDays);
  const herRows = [];
  const rootRows = [];

  // Deliberately imperfect on both sides — ACCURACY_TOLERANCE = 1 means a
  // gap of exactly ±1 still counts as a "hit," so only a gap of ±2 (or
  // more) is a real miss. Her thresholds target roughly a 75% real
  // accuracy rate; Root's target roughly 65% -- worse than her, on
  // purpose, per the brief's "if Root is worse than she is, say so"
  // rather than two suspiciously identical, suspiciously perfect rates.
  for (const date of scoredDates) {
    const idx = dates.indexOf(date);
    if (idx <= 0) continue; // needs a prior day to have "made the forecast from"
    const madeFrom = dates[idx - 1];
    const actual = energyByDate.get(date);

    const herRoll = seededRandom(idx * 173 + 71 + salt);
    const herSign = seededRandom(idx * 181 + salt) > 0.5 ? 1 : -1;
    const herMiss = herRoll < 0.55 ? 0 : herRoll < 0.75 ? herSign : 2 * herSign;
    const herPredicted = clampScale(actual - herMiss);
    herRows.push({
      member_id: memberId,
      forecast_date: date,
      made_from_local_date: madeFrom,
      predicted_energy_level: herPredicted,
      actual_energy_level: actual,
      gap: actual - herPredicted,
      scored_at: new Date().toISOString(),
    });

    const rootRoll = seededRandom(idx * 197 + 83 + salt);
    const rootSign = seededRandom(idx * 199 + salt) > 0.5 ? 1 : -1;
    const rootMiss = rootRoll < 0.45 ? 0 : rootRoll < 0.65 ? rootSign : 2 * rootSign;
    const rootPredicted = clampScale(actual - rootMiss);
    rootRows.push({
      member_id: memberId,
      forecast_date: date,
      predicted_energy_level: rootPredicted,
      method: 'recent_average',
      basis_observation_count: Math.min(7, idx),
      actual_energy_level: actual,
      gap: actual - rootPredicted,
      scored_at: new Date().toISOString(),
    });
  }

  if (herRows.length > 0) {
    const { error: herError } = await supabase.from('energy_forecasts').insert(herRows);
    if (herError) throw new Error(`seeding her forecast history failed: ${herError.message}`);
  }
  if (rootRows.length > 0) {
    const { error: rootError } = await supabase.from('root_energy_forecasts').insert(rootRows);
    if (rootError) throw new Error(`seeding Root forecast history failed: ${rootError.message}`);
  }
  console.log(
    `  seeded ${herRows.length} scored forecasts each for her and Root ` +
      `(${herRows.length >= MIN_SCORED_FORECASTS_FOR_CALIBRATION ? 'at/above' : 'below'} the calibration threshold of ${MIN_SCORED_FORECASTS_FOR_CALIBRATION})`
  );
}

async function main() {
  console.log(`Seeding production test accounts against ${SUPABASE_URL}\n`);

  const memberIds = {};
  for (const [i, config] of MEMBER_CONFIGS.entries()) {
    console.log(`Member (${config.key}):`);
    const memberId = await ensureUser(config.email, config.password);
    await markAsTest(memberId, `member:${config.key}`);
    const { dates, energyByDate } = await seedCheckinHistory(memberId, config.checkinDays, i * 1000);
    await seedForecastHistory(memberId, dates, energyByDate, config.forecastDays, i * 1000);
    memberIds[config.key] = memberId;
    console.log('');
  }

  console.log('Coach account:');
  const coachId = await ensureUser(COACH_EMAIL, COACH_PASSWORD);
  await markAsTest(coachId, 'coach');
  await grantCoachRole(coachId);
  console.log('');

  console.log('Assignments (coach sees all three test member states):');
  for (const config of MEMBER_CONFIGS) {
    await ensureAssignment(coachId, memberIds[config.key]);
  }

  console.log('\nDone.');
  for (const config of MEMBER_CONFIGS) {
    console.log(`  member:${config.key} = ${memberIds[config.key]}`);
  }
  console.log(`  coach = ${coachId}`);
  console.log(
    '\nNext: run the correlation-engine and driver-state-engine cron routes once (or wait for their ' +
      'scheduled run) so the pattern/correlation charts have something computed from the populated ' +
      "account's history."
  );
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
