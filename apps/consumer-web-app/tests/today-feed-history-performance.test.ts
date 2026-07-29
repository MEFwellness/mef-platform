/**
 * Guard test for /today's Feed History fix (2026-07-29 follow-up).
 * `app/actions/feed.ts`'s `getFeedHistory()` (the "revisit a past day"
 * data /today reads) built up to 30 `(feedItem, content)` pairs by
 * calling `getContentItem()` once per item — the same N+1 shape found and
 * fixed on the Dashboard (see tests/dashboard-render-performance.test.ts),
 * just in a different call site. Fixed by batching through the same
 * `getContentItemsByIds()` helper.
 *
 * `getFeedHistory()` itself can't be called directly here — it creates
 * its own client via `createClient()`, which calls `cookies()` and throws
 * outside a real Next.js request (see tests/setup/test-clients.ts) — so
 * this exercises the exact same batched-lookup path directly against real
 * local Supabase, matching how the fixed function itself now works
 * (listFeedHistory, then one getContentItemsByIds call).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { listFeedHistory, getContentItemsByIds } from '../lib/feed/data';

const MEMBER_ID = TEST_USERS.memberOne.id;
const FEED_DAYS = 30;
const THRESHOLD_MS = 2000;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);
const startDate = addDays(today, -(FEED_DAYS - 1));
let feedItemIds: string[] = [];
let contentIds: string[] = [];

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('daily_feed_items').delete().in('id', feedItemIds);
});

describe('/today Feed History performance guard', () => {
  it('batched content lookup for 30 feed items completes under threshold and matches per-item results', async () => {
    const service = serviceRoleClient();

    const { data: content } = await service
      .from('mef_content_items')
      .select('id')
      .eq('status', 'published')
      .limit(5);
    contentIds = (content ?? []).map((c) => c.id as string);
    expect(contentIds.length).toBeGreaterThan(0);

    const feedRows = Array.from({ length: FEED_DAYS }, (_, i) => ({
      member_id: MEMBER_ID,
      local_date: addDays(startDate, i),
      content_item_id: contentIds[i % contentIds.length],
      focus_text: `Today-guard focus ${i}`,
      why_text: `Today-guard why ${i}`,
    }));
    const { data: insertedFeed, error } = await service
      .from('daily_feed_items')
      .insert(feedRows)
      .select('id');
    if (error) throw new Error(`Fixture feed-item insert failed: ${error.message}`);
    feedItemIds = (insertedFeed ?? []).map((r) => r.id as string);

    const start = performance.now();
    const items = await listFeedHistory(service, MEMBER_ID, FEED_DAYS);
    const byId = await getContentItemsByIds(
      service,
      items.map((i) => i.content_item_id)
    );
    const pairs = items.map((feedItem) => ({
      feedItem,
      content: byId.get(feedItem.content_item_id) ?? null,
    }));
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(THRESHOLD_MS);
    expect(pairs.length).toBe(FEED_DAYS);
    for (const pair of pairs) {
      expect(pair.content?.id).toBe(pair.feedItem.content_item_id);
    }
  });
});
