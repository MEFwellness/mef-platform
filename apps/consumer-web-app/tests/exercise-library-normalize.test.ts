import { describe, it, expect } from 'vitest';
import { normalizeExerciseCatalogRow } from '../lib/exercise-library/normalize';
import { toPublicMediaUrl } from '../lib/your-move/posters';
import type { ExerciseCatalogRow, MefExerciseMetadata, ExerciseExtractedPoster } from '@mef/shared-types-contracts';

function baseExercise(overrides: Partial<ExerciseCatalogRow> = {}): ExerciseCatalogRow {
  return {
    id: 'row-1',
    provider: 'your_move',
    external_id: 'test-exercise',
    name: 'Test Exercise',
    slug: 'test-exercise',
    description: null,
    instructions: [],
    exercise_tips: [],
    primary_muscle: 'glutes',
    secondary_muscles: [],
    equipment: 'bodyweight',
    category: 'strength',
    difficulty: 'beginner',
    exercise_type: [],
    has_video: false,
    has_video_white: false,
    has_video_gym: false,
    // Generated in the database from has_video; the fixtures mirror that
    // rather than setting it independently, so a fixture can never claim a
    // combination Postgres would refuse to produce.
    is_client_assignable: false,
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
    provider: 'your_move',
    external_id: 'test-exercise',
    source: 'your_move',
    storage_path: 'posters/your_move/test-exercise.jpg',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function metadataWithCues(cues: string[]): MefExerciseMetadata {
  return {
    id: 'meta-1',
    provider: 'your_move',
    external_id: 'test-exercise',
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
    corrective_roles: [],
    muscles_stretched: [],
    muscles_strengthened: [],
    strain_level: null,
    spinal_flexion_core: false,
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

describe('normalizeExerciseCatalogRow — media fields', () => {
  it('has no video and no cues for a plain exercise with neither', () => {
    const normalized = normalizeExerciseCatalogRow(baseExercise(), null, false);
    expect(normalized.hasVideo).toBe(false);
    expect(normalized.posterUrl).toBeNull();
    expect(normalized.cues).toEqual([]);
  });

  it('hasVideo reflects the catalog row, never an eagerly-populated videoUrl (fetched fresh at play time)', () => {
    const normalized = normalizeExerciseCatalogRow(baseExercise({ has_video: true }), null, false);
    expect(normalized.hasVideo).toBe(true);
    expect((normalized as unknown as { videoUrl?: unknown }).videoUrl).toBeUndefined();
  });

  it('resolves posterUrl from an extracted poster to a public exercise-media URL', () => {
    const normalized = normalizeExerciseCatalogRow(baseExercise({ has_video: true }), null, false, extractedPoster());
    expect(normalized.posterUrl).toBe(toPublicMediaUrl('posters/your_move/test-exercise.jpg'));
  });

  it('falls back to metadata.coaching_cues only when there is no video', () => {
    const cues = ['Stand tall, feet hip-width', 'Drive through the heels', 'Feel it in the glutes'];
    const normalized = normalizeExerciseCatalogRow(baseExercise(), metadataWithCues(cues), false);
    expect(normalized.hasVideo).toBe(false);
    expect(normalized.cues).toEqual(cues);
  });

  it('never surfaces cues when the exercise has video — cues are read as a runtime fallback (tap-to-play failure), not returned eagerly here', () => {
    const cues = ['Stand tall, feet hip-width'];
    const normalized = normalizeExerciseCatalogRow(baseExercise({ has_video: true }), metadataWithCues(cues), false);
    expect(normalized.cues).toEqual([]);
  });

  it('carries isFavorited through unchanged', () => {
    expect(normalizeExerciseCatalogRow(baseExercise(), null, true).isFavorited).toBe(true);
    expect(normalizeExerciseCatalogRow(baseExercise(), null, false).isFavorited).toBe(false);
  });
});
