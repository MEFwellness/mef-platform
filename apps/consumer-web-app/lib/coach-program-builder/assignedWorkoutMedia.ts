/**
 * The poster and cues a member's own program screen renders, per exercise.
 *
 * WHY THIS EXISTS. coach_assigned_workout_exercises is a frozen snapshot:
 * it stores the name, the prescription and the cues her coach approved,
 * and deliberately stores no media, because media is not part of what was
 * prescribed. To show her a video the screen still needs the catalog's
 * poster frame and its primary muscle, which is what this loads.
 *
 * ZERO VIDEO REQUESTS. Nothing here asks Your Move for anything. A poster
 * is a public URL for a frame this product extracted and stored itself
 * (migration 118), and the cues come from the member-facing three-column
 * view (migration 170). The video URL is fetched by exactly one component
 * in the product, on tap, and never from here. Opening a program, opening
 * a workout and scrolling its exercises therefore spend no Your Move
 * quota at all, which is asserted by
 * tests/program-screens-no-video-requests.test.ts.
 *
 * RLS DOES THE AUTHORIZATION. Migration 170 already lets a member read the
 * catalog row and the cue row for any exercise in one of her own published
 * assigned workouts, and nothing else. This function re-checks none of
 * that: it runs under her own session and gets back exactly the rows she
 * is allowed. An exercise the catalog no longer carries simply has no
 * entry in the map, and the screen falls back to the placeholder poster it
 * already had.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachAssignedWorkoutWithContent } from '@mef/shared-types-contracts';
import { getExercisesByExternalIds } from '../your-move/catalog';
import { getMemberExerciseCues } from '../exercise-library/metadata';
import { getExtractedPosterMap, toPublicMediaUrl } from '../your-move/posters';

/** What one exercise needs to render its media, keyed by external id in the map below. */
export interface AssignedExerciseMedia {
  primaryMuscle: string | null;
  category: string | null;
  posterUrl: string | null;
  /** Generated coaching cues, the fallback shown when a video will not load. */
  cues: string[];
}

export type AssignedExerciseMediaMap = Record<string, AssignedExerciseMedia>;

/**
 * A plain object rather than a Map: this crosses the server/client
 * component boundary, and a Map does not survive that serialization.
 */
export async function loadAssignedWorkoutMedia(
  supabase: SupabaseClient,
  workout: CoachAssignedWorkoutWithContent
): Promise<AssignedExerciseMediaMap> {
  const externalIds = Array.from(
    new Set(workout.sections.flatMap((section) => section.exercises.map((e) => e.external_id)))
  );
  if (externalIds.length === 0) return {};

  // None of the three depends on the others' results.
  const [catalog, cues, posters] = await Promise.all([
    getExercisesByExternalIds(supabase, externalIds),
    getMemberExerciseCues(supabase, externalIds),
    getExtractedPosterMap(supabase, externalIds),
  ]);

  const media: AssignedExerciseMediaMap = {};
  for (const externalId of externalIds) {
    const exercise = catalog.get(externalId);
    const poster = posters.get(externalId);
    media[externalId] = {
      primaryMuscle: exercise?.primary_muscle ?? null,
      category: exercise?.category ?? null,
      posterUrl: poster ? toPublicMediaUrl(poster.storage_path) : null,
      cues: cues.get(externalId) ?? [],
    };
  }
  return media;
}
