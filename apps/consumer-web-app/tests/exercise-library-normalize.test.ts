import { describe, it, expect } from 'vitest';
import { normalizeExerciseApiExercise } from '../lib/exercise-library/normalize';
import { toPublicMediaUrl } from '../lib/your-move/posters';
import type { ExerciseApiExercise } from '../lib/exercise-library/apiClient';
import type {
  MefExerciseMetadata,
  YourMoveExerciseLink,
  ExerciseExtractedPoster,
} from '@mef/shared-types-contracts';

function baseExercise(overrides: Partial<ExerciseApiExercise> = {}): ExerciseApiExercise {
  return {
    id: 'Test_Exercise',
    name: 'Test Exercise',
    ...overrides,
  };
}

function yourMoveLink(overrides: Partial<YourMoveExerciseLink> = {}): YourMoveExerciseLink {
  return {
    id: 'link-1',
    provider: 'exercise_api_dev',
    external_id: 'Test_Exercise',
    your_move_exercise_id: 'ym-123',
    match_confidence: 'confident',
    match_reasoning: 'exact movement match',
    video_url: null,
    video_url_expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function extractedPoster(overrides: Partial<ExerciseExtractedPoster> = {}): ExerciseExtractedPoster {
  return {
    id: 'poster-1',
    provider: 'exercise_api_dev',
    external_id: 'Test_Exercise',
    source: 'your_move',
    storage_path: 'posters/your_move/Test_Exercise.jpg',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function metadataWithCues(cues: string[]): MefExerciseMetadata {
  return {
    id: 'meta-1',
    provider: 'exercise_api_dev',
    external_id: 'Test_Exercise',
    program_section: null,
    movement_category: null,
    body_region: [],
    equipment: [],
    difficulty: null,
    corrective_focus: [],
    mobility_focus: [],
    strength_focus: [],
    stability_focus: [],
    contraindications: [],
    coaching_cues: cues,
    regressions: [],
    progressions: [],
    goal_tags: [],
    limitation_tags: [],
    coach_notes: null,
    created_by: null,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('normalizeExerciseApiExercise — media fields', () => {
  it('has no video/image/cues, and imageUrl null, for a plain exercise with none of the three', () => {
    const normalized = normalizeExerciseApiExercise(baseExercise(), null, false);
    expect(normalized.hasVideo).toBe(false);
    expect(normalized.videoSource).toBeNull();
    expect(normalized.videoUrl).toBeNull();
    expect(normalized.imageUrl).toBeNull();
    expect(normalized.cues).toEqual([]);
  });

  it('never populates imageUrl from ExerciseAPI.dev images — that vendor field is a dead relative path (see the function’s own doc comment)', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ images: ['Test_Exercise/0.jpg'] }),
      null,
      false
    );
    expect(normalized.imageUrl).toBeNull();
  });

  it('eagerly maps videoUrl from ExerciseAPI.dev when there is no Your Move link — that vendor’s URLs do not expire', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ videos: [{ url: 'https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4' }] }),
      null,
      false
    );
    expect(normalized.hasVideo).toBe(true);
    expect(normalized.videoSource).toBe('exercise_api_dev');
    expect(normalized.videoUrl).toBe('https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4');
  });

  it('Your Move dominance: a link present wins even when ExerciseAPI.dev also has a video, and videoUrl stays null (fetch-at-play-time, never eager)', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ videos: [{ url: 'https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4' }] }),
      null,
      false,
      yourMoveLink()
    );
    expect(normalized.hasVideo).toBe(true);
    expect(normalized.videoSource).toBe('your_move');
    expect(normalized.videoUrl).toBeNull();
  });

  it('resolves posterUrl from an extracted poster to a public exercise-media URL', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise(),
      null,
      false,
      yourMoveLink(),
      extractedPoster()
    );
    expect(normalized.posterUrl).toBe(toPublicMediaUrl('posters/your_move/Test_Exercise.jpg'));
  });

  it('falls back to an open-license image only when there is no video from either source', () => {
    const normalized = normalizeExerciseApiExercise(baseExercise(), null, false, null, null, 'open-license/Test_Exercise.jpg');
    expect(normalized.hasVideo).toBe(false);
    expect(normalized.imageUrl).toBe(toPublicMediaUrl('open-license/Test_Exercise.jpg'));
  });

  it('never sets imageUrl from an open-license row when a video exists (video always wins over the Phase 3 fallback)', () => {
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ videos: [{ url: 'https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4' }] }),
      null,
      false,
      null,
      null,
      'open-license/Test_Exercise.jpg'
    );
    expect(normalized.imageUrl).toBeNull();
  });

  it('falls back to metadata.coaching_cues only when there is neither video nor image', () => {
    const cues = ['Stand tall, feet hip-width', 'Drive through the heels', 'Feel it in the glutes'];
    const normalized = normalizeExerciseApiExercise(baseExercise(), metadataWithCues(cues), false);
    expect(normalized.hasVideo).toBe(false);
    expect(normalized.imageUrl).toBeNull();
    expect(normalized.cues).toEqual(cues);
  });

  it('never surfaces cues when a video or image already covers the exercise', () => {
    const cues = ['Stand tall, feet hip-width'];
    const normalized = normalizeExerciseApiExercise(
      baseExercise({ videos: [{ url: 'https://cdn.exerciseapi.dev/v1/Test_Exercise.mp4' }] }),
      metadataWithCues(cues),
      false
    );
    expect(normalized.cues).toEqual([]);
  });
});
