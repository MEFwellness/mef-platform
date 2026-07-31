/**
 * Proves a real MEF-authored custom exercise renders as a cue-only card
 * through the actual production code path — real local Supabase, the real
 * normalizeExerciseCatalogRow() function, no mocks — same pattern as this
 * repo's other exercise-library integration tests (e.g.
 * tests/exercise-library-cue-generation.test.ts drives the generator in
 * isolation; this drives the full catalog-row -> normalize -> card-shape
 * pipeline for a real seeded row).
 */
import { describe, it, expect } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { normalizeExerciseCatalogRow } from '../lib/exercise-library/normalize';
import type { ExerciseCatalogRow, MefExerciseMetadata } from '@mef/shared-types-contracts';

describe('MEF custom exercises render as cue-only cards', () => {
  it('Chin Tuck – Supine has no video/poster and shows real coaching cues', async () => {
    const supabase = serviceRoleClient();

    const { data: catalogRow, error: catalogError } = await supabase
      .from('exercise_catalog')
      .select('*')
      .eq('provider', 'mef_custom')
      .eq('external_id', 'mef-custom-chin-tuck-supine')
      .single();
    expect(catalogError).toBeNull();

    const { data: metadataRow, error: metadataError } = await supabase
      .from('mef_exercise_metadata')
      .select('*')
      .eq('provider', 'mef_custom')
      .eq('external_id', 'mef-custom-chin-tuck-supine')
      .single();
    expect(metadataError).toBeNull();

    const exercise = normalizeExerciseCatalogRow(
      catalogRow as ExerciseCatalogRow,
      metadataRow as MefExerciseMetadata,
      false
    );

    expect(exercise.provider).toBe('mef_custom');
    expect(exercise.name).toBe('Chin Tuck – Supine');
    expect(exercise.hasVideo).toBe(false);
    expect(exercise.posterUrl).toBeNull();
    // This is exactly what ExerciseCard/ExerciseDetailView render via
    // CuesPlaceholder when hasVideo is false — the real card-visible content.
    expect(exercise.cues.length).toBeGreaterThanOrEqual(4);
    expect(exercise.cues.some((c) => c.toLowerCase().includes('chin'))).toBe(true);
  });

  it('every MEF custom exercise has at least 4 coaching cues and no video', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase
      .from('mef_exercise_metadata')
      .select('external_id, coaching_cues')
      .eq('provider', 'mef_custom');
    expect(error).toBeNull();

    const rows = (data ?? []) as { external_id: string; coaching_cues: string[] }[];
    expect(rows.length).toBeGreaterThanOrEqual(28);
    for (const row of rows) {
      expect(row.coaching_cues.length, `${row.external_id} has too few cues`).toBeGreaterThanOrEqual(4);
    }

    const { data: catalogRows, error: catalogError } = await supabase
      .from('exercise_catalog')
      .select('external_id, has_video')
      .eq('provider', 'mef_custom');
    expect(catalogError).toBeNull();
    expect((catalogRows ?? []).every((r) => (r as { has_video: boolean }).has_video === false)).toBe(true);
  });
});
