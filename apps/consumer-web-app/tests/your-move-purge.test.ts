/**
 * Proves the Your Move cancellation-compliance purge is real, not
 * vacuous: seeds a your_move_exercise_links row, a source='your_move'
 * extracted poster (+ its actual storage object), AND a source=
 * 'exercise_api_dev' extracted poster (+ its object) that must survive.
 * Runs the real purge script's exported function against the real local
 * Supabase instance — no mocks — then asserts the your_move-derived rows
 * and storage object are gone and the exercise_api_dev one is untouched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { upsertYourMoveLink, getYourMoveLink } from '../lib/your-move/links';
import { upsertExtractedPoster, getExtractedPoster, EXERCISE_MEDIA_BUCKET } from '../lib/your-move/posters';
import { purgeYourMoveMedia } from '../scripts/exercise-media/purge-your-move-media';

const TEST_EXTERNAL_ID_YOUR_MOVE = `test-purge-ym-${Date.now()}`;
const TEST_EXTERNAL_ID_API_DEV = `test-purge-api-${Date.now()}`;
const YOUR_MOVE_POSTER_PATH = `posters/your_move/${TEST_EXTERNAL_ID_YOUR_MOVE}.jpg`;
const API_DEV_POSTER_PATH = `posters/exercise_api_dev/${TEST_EXTERNAL_ID_API_DEV}.jpg`;

async function cleanup(supabase: ReturnType<typeof serviceRoleClient>) {
  await supabase.from('your_move_exercise_links').delete().eq('external_id', TEST_EXTERNAL_ID_YOUR_MOVE);
  await supabase
    .from('exercise_extracted_posters')
    .delete()
    .in('external_id', [TEST_EXTERNAL_ID_YOUR_MOVE, TEST_EXTERNAL_ID_API_DEV]);
  await supabase.storage.from(EXERCISE_MEDIA_BUCKET).remove([YOUR_MOVE_POSTER_PATH, API_DEV_POSTER_PATH]);
}

describe('purgeYourMoveMedia', () => {
  afterEach(async () => {
    await cleanup(serviceRoleClient());
  });

  it('removes every your_move-derived row and storage object, and leaves exercise_api_dev-derived ones untouched', async () => {
    const supabase = serviceRoleClient();
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    await upsertYourMoveLink(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID_YOUR_MOVE,
      yourMoveExerciseId: 'ym-fake-id',
      matchReasoning: 'test fixture',
    });
    await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .upload(YOUR_MOVE_POSTER_PATH, fakeJpeg, { contentType: 'image/jpeg', upsert: true });
    await upsertExtractedPoster(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID_YOUR_MOVE,
      source: 'your_move',
      storagePath: YOUR_MOVE_POSTER_PATH,
    });

    await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .upload(API_DEV_POSTER_PATH, fakeJpeg, { contentType: 'image/jpeg', upsert: true });
    await upsertExtractedPoster(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID_API_DEV,
      source: 'exercise_api_dev',
      storagePath: API_DEV_POSTER_PATH,
    });

    // Sanity check the fixtures actually exist before purging — otherwise
    // a no-op purge would trivially "pass."
    expect(await getYourMoveLink(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_YOUR_MOVE)).not.toBeNull();
    expect(
      await getExtractedPoster(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_YOUR_MOVE)
    ).not.toBeNull();
    expect(
      await getExtractedPoster(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_API_DEV)
    ).not.toBeNull();

    await purgeYourMoveMedia(supabase);

    expect(await getYourMoveLink(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_YOUR_MOVE)).toBeNull();
    expect(
      await getExtractedPoster(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_YOUR_MOVE)
    ).toBeNull();

    const { data: yourMoveObjectStillThere } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .list('posters/your_move', { search: TEST_EXTERNAL_ID_YOUR_MOVE });
    expect(yourMoveObjectStillThere).toEqual([]);

    // exercise_api_dev-derived poster must survive — it has nothing to do
    // with Your Move and needs no manifest entry.
    const survivingPoster = await getExtractedPoster(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID_API_DEV);
    expect(survivingPoster).not.toBeNull();
    const { data: apiDevObjectStillThere } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .list('posters/exercise_api_dev', { search: TEST_EXTERNAL_ID_API_DEV });
    expect(apiDevObjectStillThere).toHaveLength(1);
  });
});
