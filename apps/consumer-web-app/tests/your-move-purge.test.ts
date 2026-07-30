/**
 * Proves the Your Move cancellation-compliance purge is real, not
 * vacuous: seeds a real exercise_catalog row with a cached video_url, an
 * extracted poster row (+ its actual storage object). Runs the real purge
 * script's exported function against the real local Supabase instance —
 * no mocks — then asserts the poster row/object are gone and the cached
 * video URL is cleared, while the catalog row's own metadata (name,
 * instructions, etc. — our own data, not Your Move's proprietary media)
 * survives untouched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { upsertExtractedPoster, getExtractedPoster, EXERCISE_MEDIA_BUCKET } from '../lib/your-move/posters';
import { purgeYourMoveMedia } from '../scripts/exercise-media/purge-your-move-media';

const TEST_EXTERNAL_ID = `test-purge-${Date.now()}`;
const POSTER_PATH = `posters/your_move/${TEST_EXTERNAL_ID}.jpg`;

async function cleanup(supabase: ReturnType<typeof serviceRoleClient>) {
  await supabase.from('exercise_extracted_posters').delete().eq('external_id', TEST_EXTERNAL_ID);
  await supabase.from('exercise_catalog').delete().eq('external_id', TEST_EXTERNAL_ID);
  await supabase.storage.from(EXERCISE_MEDIA_BUCKET).remove([POSTER_PATH]);
}

describe('purgeYourMoveMedia', () => {
  afterEach(async () => {
    await cleanup(serviceRoleClient());
  });

  it('removes every extracted poster row + storage object and clears cached video URLs, while leaving catalog metadata intact', async () => {
    const supabase = serviceRoleClient();
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    const { error: insertError } = await supabase.from('exercise_catalog').insert({
      provider: 'your_move',
      external_id: TEST_EXTERNAL_ID,
      name: 'Test Purge Exercise',
      has_video: true,
      video_url: 'https://vz-fake.b-cdn.net/fake/play_720p.mp4',
      video_url_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(insertError).toBeNull();

    await supabase.storage.from(EXERCISE_MEDIA_BUCKET).upload(POSTER_PATH, fakeJpeg, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    await upsertExtractedPoster(supabase, { externalId: TEST_EXTERNAL_ID, storagePath: POSTER_PATH });

    // Sanity check the fixtures actually exist before purging — otherwise
    // a no-op purge would trivially "pass."
    expect(await getExtractedPoster(supabase, TEST_EXTERNAL_ID)).not.toBeNull();
    const { data: beforeCatalog } = await supabase
      .from('exercise_catalog')
      .select('video_url')
      .eq('external_id', TEST_EXTERNAL_ID)
      .single();
    expect(beforeCatalog?.video_url).not.toBeNull();

    await purgeYourMoveMedia(supabase);

    expect(await getExtractedPoster(supabase, TEST_EXTERNAL_ID)).toBeNull();

    const { data: objectStillThere } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .list('posters/your_move', { search: TEST_EXTERNAL_ID });
    expect(objectStillThere).toEqual([]);

    const { data: afterCatalog } = await supabase
      .from('exercise_catalog')
      .select('name, video_url, video_url_expires_at')
      .eq('external_id', TEST_EXTERNAL_ID)
      .single();
    // Our own catalog metadata is not Your Move's proprietary media —
    // never purged — but the cached video URL is cleared.
    expect(afterCatalog?.name).toBe('Test Purge Exercise');
    expect(afterCatalog?.video_url).toBeNull();
    expect(afterCatalog?.video_url_expires_at).toBeNull();
  });
});
