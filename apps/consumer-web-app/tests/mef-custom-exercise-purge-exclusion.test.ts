/**
 * Proves MEF-authored custom exercises (provider = 'mef_custom', migration
 * 129/130) are structurally excluded from the Your Move subscription-lapse
 * purge — real local Supabase, real purge function, no mocks, same
 * philosophy as tests/your-move-purge.test.ts (which this extends rather
 * than duplicates: that test already proves the purge works correctly for
 * real Your Move rows; this one proves a mixed-provider purge leaves the
 * mef_custom row completely untouched, including a simulated video_url
 * value it would never actually have — a real assertion that the
 * exclusion is by provider, not just because cue-only rows happen to have
 * nothing to clear).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { purgeYourMoveMedia } from '../scripts/exercise-media/purge-your-move-media';

const MEF_EXTERNAL_ID = `test-mef-custom-purge-${Date.now()}`;
const YOUR_MOVE_EXTERNAL_ID = `test-your-move-purge-${Date.now()}`;

async function cleanup(supabase: ReturnType<typeof serviceRoleClient>) {
  await supabase.from('exercise_catalog').delete().in('external_id', [MEF_EXTERNAL_ID, YOUR_MOVE_EXTERNAL_ID]);
}

describe('purgeYourMoveMedia leaves MEF-owned custom exercises untouched', () => {
  afterEach(async () => {
    await cleanup(serviceRoleClient());
  });

  it('clears a your_move row while leaving a co-existing mef_custom row completely unchanged', async () => {
    const supabase = serviceRoleClient();

    // The mef_custom row is seeded with a video_url it would never
    // actually have (cue-only content, no video) — specifically to prove
    // the purge skips it because of `provider`, not because there was
    // nothing to clear.
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    const { error: insertError } = await supabase.from('exercise_catalog').insert([
      {
        provider: 'mef_custom',
        external_id: MEF_EXTERNAL_ID,
        name: 'Test MEF Custom Purge Exercise',
        has_video: false,
        video_url: 'https://should-never-be-cleared.example/fake.mp4',
        video_url_expires_at: futureExpiry,
      },
      {
        provider: 'your_move',
        external_id: YOUR_MOVE_EXTERNAL_ID,
        name: 'Test Your Move Purge Exercise',
        has_video: true,
        video_url: 'https://vz-fake.b-cdn.net/fake/play_720p.mp4',
        video_url_expires_at: futureExpiry,
      },
    ]);
    expect(insertError).toBeNull();

    await purgeYourMoveMedia(supabase);

    const { data: mefRow } = await supabase
      .from('exercise_catalog')
      .select('name, video_url, video_url_expires_at')
      .eq('external_id', MEF_EXTERNAL_ID)
      .single();
    expect(mefRow?.name).toBe('Test MEF Custom Purge Exercise');
    expect(mefRow?.video_url).toBe('https://should-never-be-cleared.example/fake.mp4');
    expect(new Date(mefRow?.video_url_expires_at ?? '').getTime()).toBe(new Date(futureExpiry).getTime());

    const { data: yourMoveRow } = await supabase
      .from('exercise_catalog')
      .select('video_url, video_url_expires_at')
      .eq('external_id', YOUR_MOVE_EXTERNAL_ID)
      .single();
    expect(yourMoveRow?.video_url).toBeNull();
    expect(yourMoveRow?.video_url_expires_at).toBeNull();
  });

  it('every real mef_custom exercise in the catalog has no video and is invisible to the purge query', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase.from('exercise_catalog').select('external_id, has_video').eq('provider', 'mef_custom');
    expect(error).toBeNull();
    const rows = (data ?? []) as { external_id: string; has_video: boolean }[];
    expect(rows.length).toBeGreaterThanOrEqual(28);
    expect(rows.every((r) => r.has_video === false)).toBe(true);
  });
});
