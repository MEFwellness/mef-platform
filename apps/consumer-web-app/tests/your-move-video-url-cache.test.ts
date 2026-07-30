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
import { VIDEO_URL_CACHE_TTL_MS, cacheVideoUrl, isVideoUrlCacheValid, getExerciseByExternalId } from '../lib/your-move/catalog';

const YOUR_MOVE_URL_EXPIRY_MS = 48 * 60 * 60 * 1000;
const TEST_EXTERNAL_ID = `test-cache-ttl-${Date.now()}`;

describe("guard test (b): Your Move video URL cache never outlives the vendor's own 48h expiry", () => {
  afterEach(async () => {
    await serviceRoleClient().from('exercise_catalog').delete().eq('external_id', TEST_EXTERNAL_ID);
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
    await supabase
      .from('exercise_catalog')
      .insert({ provider: 'your_move', external_id: TEST_EXTERNAL_ID, name: 'Fake Exercise', has_video: true });
    const row = await getExerciseByExternalId(supabase, TEST_EXTERNAL_ID);
    await cacheVideoUrl(supabase, row!.id, 'https://example.test/fake-video.mp4');

    const fresh = await getExerciseByExternalId(supabase, TEST_EXTERNAL_ID);
    expect(isVideoUrlCacheValid(fresh!)).toBe(true);

    // Simulate the same row well past a 48h expiry, directly (never
    // relying on real wall-clock time in a test) — proves expired rows
    // are actually rejected, not just that valid ones are accepted.
    const expiredRow = {
      ...fresh!,
      video_url_expires_at: new Date(Date.now() - YOUR_MOVE_URL_EXPIRY_MS).toISOString(),
    };
    expect(isVideoUrlCacheValid(expiredRow)).toBe(false);
  });

  it('a row with no cached URL at all is treated as expired (forces a real fetch, never silently "valid")', () => {
    expect(isVideoUrlCacheValid({ video_url: null, video_url_expires_at: null })).toBe(false);
  });
});
