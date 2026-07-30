/**
 * Guard test (d) — code-path proof: a mapped exercise fetches and plays
 * its Your Move video by ID. The real end-to-end version of this (an
 * actual Your Move API call) is deliberately deferred — this trial
 * account's monthly exercise quota is a scarce, real resource, and
 * spending it is being held until explicitly triggered (see the build
 * report). This test proves the exact same code path
 * (resolveYourMoveVideoUrl, called by app/api/exercises/[id]/video-url/
 * route.ts on every real tap-to-play) against a mocked Your Move HTTP
 * response — real database rows, real cache read/write, only the
 * network call to ymove.app itself is faked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { upsertYourMoveLink } from '../lib/your-move/links';
import { resolveYourMoveVideoUrl } from '../lib/your-move/videoPlayback';

const TEST_EXTERNAL_ID = `test-playback-${Date.now()}`;
const FAKE_YOUR_MOVE_ID = 'ym-fake-playback-id';
const FAKE_VIDEO_URL = 'https://vz-fake.b-cdn.net/fake/play_720p.mp4?token=abc&expires=123';

function yourMoveCallCount(): number {
  const mockFn = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
  return mockFn.mock.calls.filter((call) => {
    const url = typeof call[0] === 'string' ? call[0] : String(call[0]);
    return url.startsWith('https://exercise-api.ymove.app');
  }).length;
}

function mockYourMoveGetExercise() {
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      // Only intercept the Your Move API itself — everything else (the
      // Supabase client's own REST calls, which also use global fetch)
      // must pass through untouched, or every DB read/write in this test
      // silently breaks.
      if (!url.startsWith('https://exercise-api.ymove.app')) {
        return realFetch(input, init);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: FAKE_YOUR_MOVE_ID,
            title: 'Fake Exercise',
            slug: 'fake-exercise',
            muscleGroup: 'chest',
            equipment: 'barbell',
            hasVideo: true,
            hasVideoWhite: true,
            hasVideoGym: false,
            videoUrl: FAKE_VIDEO_URL,
          },
        }),
      } as Response;
    })
  );
}

describe('guard test (d): mapped exercise fetches and plays its Your Move video by ID', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await serviceRoleClient().from('your_move_exercise_links').delete().eq('external_id', TEST_EXTERNAL_ID);
  });

  it('resolves a real videoUrl for a mapped exercise on a cache miss, via exactly one Your Move request', async () => {
    const supabase = serviceRoleClient();
    await upsertYourMoveLink(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID,
      yourMoveExerciseId: FAKE_YOUR_MOVE_ID,
      matchReasoning: 'test fixture',
    });

    mockYourMoveGetExercise();
    const result = await resolveYourMoveVideoUrl(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID);

    expect(result).toEqual({ status: 'ok', videoUrl: FAKE_VIDEO_URL });
    expect(yourMoveCallCount()).toBe(1);
  });

  it('does NOT re-fetch from Your Move on a cache hit — the whole point of the ~10min cache is avoiding a second request for a rapid replay', async () => {
    const supabase = serviceRoleClient();
    await upsertYourMoveLink(supabase, {
      provider: 'exercise_api_dev',
      externalId: TEST_EXTERNAL_ID,
      yourMoveExerciseId: FAKE_YOUR_MOVE_ID,
      matchReasoning: 'test fixture',
    });

    mockYourMoveGetExercise();
    const first = await resolveYourMoveVideoUrl(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID);
    expect(first.status).toBe('ok');
    expect(yourMoveCallCount()).toBe(1);

    const second = await resolveYourMoveVideoUrl(supabase, 'exercise_api_dev', TEST_EXTERNAL_ID);
    expect(second).toEqual({ status: 'ok', videoUrl: FAKE_VIDEO_URL });
    // Still exactly 1 — the second call was served from the DB cache, not a new request.
    expect(yourMoveCallCount()).toBe(1);
  });

  it('returns not_mapped for an exercise with no your_move_exercise_links row — never fabricates a video for an unmatched exercise', async () => {
    const supabase = serviceRoleClient();
    const result = await resolveYourMoveVideoUrl(supabase, 'exercise_api_dev', `${TEST_EXTERNAL_ID}-unmapped`);
    expect(result).toEqual({ status: 'not_mapped' });
  });
});
