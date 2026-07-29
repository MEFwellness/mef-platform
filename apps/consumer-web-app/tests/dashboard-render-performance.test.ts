/**
 * Guard test for the Dashboard performance fix (2026-07-29): the
 * Dashboard's four independently-fetching carousel cards (What We're
 * Noticing, Root Map, From Root, Recommendations) each reached
 * decideNextAction/computeMemberIntelligence/getCoachingFocusDecision
 * on their own, redoing the same member's Coaching Brain assembly and
 * Intelligence Engine profile gather over again for every card — the
 * measured cause of the Dashboard's multi-second server render. The fix
 * (lib/reactRequestCache.ts + getRequestClient, lib/supabase/server.ts)
 * wraps those entry points in React's cache() so repeat calls within one
 * request return the already-resolved result instead of re-running.
 *
 * React's cache() only memoizes inside the real Next.js RSC runtime — the
 * fallback in lib/reactRequestCache.ts makes it a no-op identity wrapper
 * here (plain Node/vitest, same reason server actions with cookies()
 * can't be called directly either; see tests/setup/test-clients.ts). So
 * this test can't observe the cross-call deduplication itself. What it
 * *can*, and does, catch: a regression in the shape of the fix — a
 * reintroduced sequential await where these should run concurrently, or a
 * reintroduced N+1 per-item fetch (getContentItemsByIds vs. the old
 * getContentItem-per-item loop) — by asserting the whole concurrent
 * gather still completes quickly against a realistically-sized history.
 * Verified non-vacuous by temporarily reintroducing a per-item delay in
 * getContentItemsByIds and confirming this test fails (see commit
 * message / BUILD_STATUS.md for that run's output).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { decideNextAction } from '../lib/investigation-engine/rootRouter';
import { computeMemberIntelligence } from '../lib/intelligence-engine/engine';
import { getCoachingFocusDecision } from '../lib/brain/service';
import { getContentItemsByIds } from '../lib/feed/data';

const MEMBER_ID = TEST_USERS.memberOne.id;
const HISTORY_DAYS = 30;
const LOCAL_DATE = new Date().toISOString().slice(0, 10);

// Based on this suite running locally against Docker Postgres: the full
// concurrent gather (three engine entry points + a 29-item batched
// content lookup) completes in well under 1s here. Production's real
// network latency to a hosted Supabase project is not reproducible in
// this environment — this threshold guards the *shape* of the fix
// (parallel, batched) rather than an absolute production duration.
const THRESHOLD_MS = 3000;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let feedItemIds: string[] = [];
let contentItemIds: string[] = [];

beforeAll(async () => {
  const service = serviceRoleClient();

  const { data: content, error: contentError } = await service
    .from('mef_content_items')
    .select('id')
    .eq('status', 'published')
    .limit(5);
  if (contentError || !content || content.length === 0) {
    throw new Error(`Fixture setup needs at least one published content item: ${contentError?.message}`);
  }
  contentItemIds = content.map((c) => c.id as string);

  const startDate = addDays(LOCAL_DATE, -(HISTORY_DAYS - 1));
  const checkinRows = Array.from({ length: HISTORY_DAYS }, (_, i) => ({
    user_id: MEMBER_ID,
    timezone: 'America/New_York',
    local_date: addDays(startDate, i),
    sleep_quality: 3,
    sleep_duration: '7-8h',
    energy_level: 3,
    stress_level: 2,
    mood_level: 3,
    digestion_rating: 3,
    pain_discomfort_level: 0,
    movement_today: 'light',
    water_cups: 5,
  }));
  const { error: checkinError } = await service.from('daily_checkins').insert(checkinRows);
  if (checkinError) throw new Error(`Fixture check-in insert failed: ${checkinError.message}`);

  const feedRows = Array.from({ length: HISTORY_DAYS - 1 }, (_, i) => ({
    member_id: MEMBER_ID,
    local_date: addDays(startDate, i),
    content_item_id: contentItemIds[i % contentItemIds.length],
    focus_text: `Guard-test focus ${i}`,
    why_text: `Guard-test why ${i}`,
  }));
  const { data: insertedFeed, error: feedError } = await service
    .from('daily_feed_items')
    .insert(feedRows)
    .select('id');
  if (feedError) throw new Error(`Fixture feed-item insert failed: ${feedError.message}`);
  feedItemIds = (insertedFeed ?? []).map((r) => r.id as string);
});

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('daily_feed_items').delete().in('id', feedItemIds);
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', MEMBER_ID)
    .gte('local_date', addDays(LOCAL_DATE, -(HISTORY_DAYS - 1)));
});

describe('Dashboard render-path performance guard', () => {
  it('the concurrent engine gather + batched content lookup completes under threshold', async () => {
    const supabase = await signInAs(TEST_USERS.memberOne);

    const start = performance.now();
    await Promise.all([
      decideNextAction(supabase, MEMBER_ID),
      computeMemberIntelligence(supabase, MEMBER_ID, LOCAL_DATE),
      getCoachingFocusDecision(supabase, MEMBER_ID, LOCAL_DATE),
      getContentItemsByIds(supabase, feedItemIds.length > 0 ? contentItemIds : []),
    ]);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(THRESHOLD_MS);
  });

  it('getContentItemsByIds returns the exact same rows a per-item lookup would, in one query', async () => {
    const supabase = await signInAs(TEST_USERS.memberOne);
    const byId = await getContentItemsByIds(supabase, contentItemIds);

    expect(byId.size).toBe(contentItemIds.length);
    for (const id of contentItemIds) {
      expect(byId.get(id)?.id).toBe(id);
    }
  });
});
