import { describe, it, expect } from 'vitest';
import { normalizeExerciseApiExercise } from '../lib/exercise-library/normalize';
import type { ExerciseApiExercise } from '../lib/exercise-library/apiClient';

function baseExercise(overrides: Partial<ExerciseApiExercise> = {}): ExerciseApiExercise {
  return {
    id: 'Test_Exercise',
    name: 'Test Exercise',
    ...overrides,
  };
}

describe('normalizeExerciseApiExercise — media fields', () => {
  it('always maps imageUrl to null, even when the API returns image paths — ExerciseAPI.dev does not host images (see the function’s own doc comment) and MEF has no base URL to prepend', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ images: ['Test_Exercise/0.jpg', 'Test_Exercise/1.jpg'] }),
      null,
      false
    );
    expect(normalized.imageUrl).toBeNull();
  });

  it('maps videoUrl from the first video entry — ExerciseAPI.dev-hosted video URLs are real and absolute', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({
        videos: [
          {
            url: 'https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4',
            format: 'mp4',
            resolution: '480p',
            aspectRatio: '16:9',
            durationSeconds: 5,
          },
        ],
      }),
      null,
      false
    );
    expect(normalized.videoUrl).toBe('https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4');
  });

  it('leaves both media fields null for an exercise with neither images nor videos', () => {
    const normalized = normalizeExerciseApiExercise(baseExercise(), null, false);
    expect(normalized.imageUrl).toBeNull();
    expect(normalized.videoUrl).toBeNull();
  });
});
