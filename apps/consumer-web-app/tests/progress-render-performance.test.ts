/**
 * Guard test for the /progress performance pass (2026-07-29 follow-up).
 * Measured against production: /progress was the slowest page in the app
 * (5.2-5.5s), because two of its independent data sources —
 * `recalculateIntelligenceCore` (lib/intelligence-core/service.ts, reached
 * via getMyWellnessStorySummary) and `recalculateWellnessIntelligence`
 * (lib/intelligence/service.ts, reached via getMyWellnessPatterns) — both
 * recompute-and-persist on every single page view (by design, not a bug
 * this task touches) but each had its own fixable inefficiency:
 * `recalculateWellnessIntelligence` fetched its feed history's content one
 * row at a time (getContentItem-per-item, up to 100 items) instead of one
 * batched query; `recalculateIntelligenceCore` awaited four independent
 * reads one at a time and wrote observations/dimensions in sequential
 * per-item loops despite each item being independent of the others.
 *
 * Same environment caveat as tests/dashboard-render-performance.test.ts:
 * this suite runs in plain Node/vitest, not the real Next.js RSC runtime,
 * so it measures the fixed functions' own concurrency (parallel reads,
 * parallel writes, batched lookup), not anything tied to React's cache().
 * Correctness of what recalculateIntelligenceCore persists (exact
 * observation/dimension counts, no duplicates on re-run) is already
 * covered end-to-end by tests/intelligence-core-integration.test.ts,
 * unchanged and still passing — this file only adds the timing guard
 * that suite doesn't have.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { recalculateIntelligenceCore } from '../lib/intelligence-core/service';
import { recalculateWellnessIntelligence } from '../lib/intelligence/service';

const AS_OF = '2016-06-30';
const MEMBER_ID = TEST_USERS.memberOne.id;

// Local Docker Postgres, no real network latency — this guards the code's
// own shape (parallel vs. serial, batched vs. N+1), not a production
// duration.
const THRESHOLD_MS = 4000;

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function submitCheckin(client: Awaited<ReturnType<typeof signInAs>>, localDate: string) {
  const { error } = await client.rpc('submit_daily_checkin', {
    p_timezone: 'America/New_York',
    p_local_date: localDate,
    p_mood_level: 3,
    p_sleep_quality: 3,
    p_sleep_duration: '6-7h',
    p_energy_level: 3,
    p_stress_level: 3,
    p_water_cups: 6,
    p_digestion_rating: 3,
    p_pain_discomfort_level: 1,
    p_movement_today: 'light',
    p_new_or_worsening_concern: false,
    p_optional_notes: null,
    p_actual_bedtime: null,
    p_actual_wake_time: null,
    p_night_waking_count: null,
    p_night_sweats: null,
    p_morning_soreness: null,
    p_bowel_movement_status: null,
  });
  if (error) throw error;
}

const CHECKIN_DAYS = 40;
const dates = Array.from({ length: CHECKIN_DAYS }, (_, i) => addDays(AS_OF, -(CHECKIN_DAYS - 1 - i)));
let feedItemIds: string[] = [];

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('daily_feed_items').delete().in('id', feedItemIds);
  for (const table of [
    'wellness_identity_observations',
    'wellness_profile_dimensions',
    'wellness_coaching_style_profile',
    'wellness_recommendation_feedback',
    'wellness_insights',
  ]) {
    await service.from(table).delete().eq('member_id', MEMBER_ID);
  }
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', MEMBER_ID)
    .gte('local_date', dates[0])
    .lte('local_date', AS_OF);
});

describe('/progress render-path performance guard', () => {
  it('recalculateIntelligenceCore and recalculateWellnessIntelligence together complete under threshold', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    for (let i = 0; i < dates.length; i += 12) {
      await Promise.all(dates.slice(i, i + 12).map((d) => submitCheckin(memberClient, d)));
    }

    const service = serviceRoleClient();
    const { data: content } = await service
      .from('mef_content_items')
      .select('id')
      .eq('status', 'published')
      .limit(5);
    const contentIds = (content ?? []).map((c) => c.id as string);
    expect(contentIds.length).toBeGreaterThan(0);

    const feedRows = dates.slice(0, -1).map((localDate, i) => ({
      member_id: MEMBER_ID,
      local_date: localDate,
      content_item_id: contentIds[i % contentIds.length],
      focus_text: `Guard-test focus ${i}`,
      why_text: `Guard-test why ${i}`,
    }));
    const { data: insertedFeed, error: feedError } = await service
      .from('daily_feed_items')
      .insert(feedRows)
      .select('id');
    if (feedError) throw new Error(`Fixture feed-item insert failed: ${feedError.message}`);
    feedItemIds = (insertedFeed ?? []).map((r) => r.id as string);

    const start = performance.now();
    await Promise.all([
      recalculateIntelligenceCore(memberClient, MEMBER_ID, AS_OF),
      recalculateWellnessIntelligence(memberClient, MEMBER_ID, AS_OF),
    ]);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(THRESHOLD_MS);
  }, 30_000);
});
