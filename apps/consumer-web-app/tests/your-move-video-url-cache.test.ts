/**
 * Guard test (b): no long-lived stored Your Move video URL may exist
 * anywhere. cacheVideoUrl is the ONLY place this app ever writes a Your
 * Move video_url to the database — this test proves its TTL is a small
 * fraction of Your Move's 48h pre-signed-URL expiry, and that a cached
 * row past that TTL is correctly treated as expired (forces a real
 * re-fetch, never served stale).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { VIDEO_URL_CACHE_TTL_MS, cacheVideoUrl, isVideoUrlCacheValid, upsertYourMoveLink, getYourMoveLink } from '../lib/your-move/links';

const YOUR_MOVE_URL_EXPIRY_MS = 48 * 60 * 60 * 1000;
const TEST_EXTERNAL_ID = `test-cache-ttl-${Date.now()}`;

describe('guard test (b): Your Move video URL cache never outlives the vendor\'s own 48h expiry', () => {
  afterEach(async () => {
    await serviceRoleClient().from('your_move_exercise_links').delete().eq('external_id', TEST_EXTERNAL_ID);
  });

  it('the cache TTL constant is well under 48 hours', () => {
    expect(VIDEO_URL_CACHE_TTL_MS).toBeLessThan(YOUR_MOVE_URL_EXPIRY_MS);
    // "well under," not just technically under — this is the actual
    // guard: a TTL of, say, 47 hours would technically satisfy "< 48h"
    // while still being a long-lived cache in spirit.
    expect(VIDEO_URL_CACHE_TTL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('a freshly cached URL is valid; the exact same row is treated as expired once its expiry timestamp is in the past', async () => {
    const supabase = serviceRoleClient();
    await upsertYourMoveLink(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID,
      yourMoveExerciseId: 'ym-fake',
      matchReasoning: 'test fixture',
    });
    const link = await getYourMoveLink(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID);
    await cacheVideoUrl(supabase, link!.id, 'https://example.test/fake-video.mp4');

    const fresh = await getYourMoveLink(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID);
    expect(isVideoUrlCacheValid(fresh!)).toBe(true);

    // Simulate the same row well past a 48h expiry, directly (never
    // relying on real wall-clock time in a test) — proves expired rows
    // are actually rejected, not just that valid ones are accepted.
    const expiredLink = {
      ...fresh!,
      video_url_expires_at: new Date(Date.now() - YOUR_MOVE_URL_EXPIRY_MS).toISOString(),
    };
    expect(isVideoUrlCacheValid(expiredLink)).toBe(false);
  });

  it('a row with no cached URL at all is treated as expired (forces a real fetch, never silently "valid")', () => {
    expect(
      isVideoUrlCacheValid({
        id: 'x',
        provider: 'exercise_api_dev',
        external_id: 'x',
        your_move_exercise_id: 'ym-x',
        match_confidence: 'confident',
        match_reasoning: null,
        video_url: null,
        video_url_expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    ).toBe(false);
  });
});
