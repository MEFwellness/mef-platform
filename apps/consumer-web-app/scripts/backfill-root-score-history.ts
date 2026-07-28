#!/usr/bin/env npx tsx
/**
 * Backfills root_score_snapshots for a member's already-seeded
 * daily_checkins history — item 5 of the daily-loop follow-up batch.
 *
 * The Root Score is precomputed and stored per (member_id, local_date) in
 * root_score_snapshots (lib/scoring/data.ts) — it is never computed live
 * from daily_checkins at chart-render time. calculateAndPersistRootScore
 * (lib/scoring/service.ts) only ever runs for "today," triggered by a
 * real page load or check-in submission; there is no cron/backfill job
 * (deliberately deferred — see that file's own header comment). So
 * scripts/seed-production-test-accounts.mjs, which inserts daily_checkins
 * rows directly via service-role rather than through the app's own
 * submit-check-in path, left root_score_snapshots empty for every
 * backdated day it seeded — the Progress page's Root Score graph only
 * ever had however many days someone happened to load /dashboard on.
 *
 * This script calls the SAME real scoring service the app itself uses
 * (calculateAndPersistRootScore) once per day, oldest to newest, so
 * momentum/resilience build up exactly as they would have if the member
 * had used the app daily — no separate/duplicated scoring math. It is a
 * standalone TypeScript script (not folded into the .mjs seed script
 * itself) because lib/scoring/* is real application TypeScript with `@/`
 * path imports; the seed script's own plain-.mjs, no-build-step
 * discipline can't import it directly, so this runs via `npx tsx`
 * instead. seed-production-test-accounts.mjs shells out to this script
 * for each member after seeding that member's check-in history, so one
 * `node scripts/seed-production-test-accounts.mjs` run still produces
 * complete history end to end.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill-root-score-history.ts <memberId> <startDate> <endDate> [timezone]
 */
import { createClient } from '@supabase/supabase-js';
import { calculateAndPersistRootScore } from '../lib/scoring/service';
import { addDaysToLocalDate } from '../lib/feed/dateMath';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}.`);
  }
  return value;
}

const SUPABASE_URL = requiredEnv('SEED_SUPABASE_URL');
const SERVICE_ROLE_KEY = requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY');

function requiredArg(value: string | undefined, position: string): string {
  if (!value) {
    throw new Error(
      `Missing ${position}. Usage: npx tsx scripts/backfill-root-score-history.ts <memberId> <startDate> <endDate> [timezone]`
    );
  }
  return value;
}

const [, , memberIdArg, startDateArg, endDateArg, timezoneArg] = process.argv;
const memberId = requiredArg(memberIdArg, 'memberId');
const startDate = requiredArg(startDateArg, 'startDate');
const endDate = requiredArg(endDateArg, 'endDate');
const resolvedTimezone = timezoneArg ?? 'America/New_York';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Clear any snapshots this member already has in (or beyond) the seeded
  // range first — same "delete then re-insert this run's own range"
  // idempotency the check-in/forecast seeders already use, so re-running
  // the seed with a shifted "today" never leaves a stale snapshot behind.
  const { error: deleteError } = await supabase
    .from('root_score_snapshots')
    .delete()
    .eq('member_id', memberId)
    .gte('local_date', startDate);
  if (deleteError) throw new Error(`clearing existing root_score_snapshots failed: ${deleteError.message}`);

  let count = 0;
  let localDate = startDate;
  while (localDate <= endDate) {
    const snapshot = await calculateAndPersistRootScore(supabase, memberId, {
      localDate,
      timezone: resolvedTimezone,
    });
    if (snapshot) count += 1;
    localDate = addDaysToLocalDate(localDate, 1);
  }

  console.log(`  seeded ${count} Root Score snapshots (${startDate} .. ${endDate}) for member ${memberId}`);
}

main().catch((err) => {
  console.error('backfill-root-score-history FAILED:', err.message);
  process.exit(1);
});
