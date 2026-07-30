/**
 * Exercise catalog name-deduplication. Your Move's own vendor catalog
 * (fetch-your-move-catalog.ts) contains real duplicate rows under
 * different external_ids — the same exercise name inserted twice (or
 * with only spacing/casing/punctuation differences, e.g. a trailing
 * "(1)" vendor-export collision marker). fetch-your-move-catalog.ts
 * upserts strictly on (provider, external_id) and never checks name, so
 * nothing in the ingestion path catches this — see
 * scripts/exercise-media/dedupe-exercise-catalog.ts for the one-time (and
 * safe-to-rerun) cleanup that uses these functions.
 *
 * Reuses matching.ts's normalizeExerciseName (the same normalizer already
 * proven for cross-provider ExerciseAPI.dev -> Your Move matching) as the
 * base — this file only adds the one extra rule that normalizer doesn't
 * need: stripping a trailing "(N)" collision-marker suffix.
 */
import { normalizeExerciseName } from '../your-move/matching';
import type { ExerciseCatalogRow } from '@mef/shared-types-contracts';

/** Strips a trailing vendor-export collision marker like "(1)"/"(2)" — e.g. "Squats to knee(1)" should collide with "Squats to knee". Does not strip meaningful parentheticals like "(L)"/"(air squat)" since those aren't pure-digit. */
function stripCollisionSuffix(name: string): string {
  return name.replace(/\s*\(\s*\d+\s*\)\s*$/, '');
}

export function normalizeCatalogName(name: string): string {
  return normalizeExerciseName(stripCollisionSuffix(name));
}

export function groupByNormalizedName<T extends { name: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeCatalogName(row.name);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return groups;
}

export function findDuplicateGroups<T extends { name: string }>(rows: T[]): T[][] {
  return [...groupByNormalizedName(rows).values()].filter((group) => group.length > 1);
}

type Scorable = Pick<
  ExerciseCatalogRow,
  | 'has_video'
  | 'instructions'
  | 'exercise_tips'
  | 'description'
  | 'primary_muscle'
  | 'secondary_muscles'
  | 'equipment'
  | 'category'
  | 'difficulty'
>;

/**
 * Best-data score: has_video beats everything, then more complete
 * instructions, then more complete metadata generally. Matches the task's
 * stated keeper rule: "has video > more complete instructions > more
 * complete metadata."
 */
export function catalogCompletenessScore(row: Scorable): number {
  return (
    (row.has_video ? 100_000 : 0) +
    row.instructions.length * 1_000 +
    row.exercise_tips.length * 100 +
    (row.description ? 10 : 0) +
    (row.primary_muscle ? 10 : 0) +
    row.secondary_muscles.length * 10 +
    (row.equipment ? 10 : 0) +
    (row.category ? 10 : 0) +
    (row.difficulty ? 10 : 0)
  );
}

export function chooseKeeper<T extends Scorable & { external_id: string }>(
  rows: T[]
): { keeper: T; discards: T[] } {
  if (rows.length === 0) throw new Error('chooseKeeper requires at least one row.');
  const sorted = [...rows].sort((a, b) => {
    const scoreDiff = catalogCompletenessScore(b) - catalogCompletenessScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    // Deterministic tie-break so re-running the script always picks the same keeper.
    return a.external_id.localeCompare(b.external_id);
  });
  const [keeper, ...discards] = sorted as [T, ...T[]];
  return { keeper, discards };
}

/**
 * Fields on the keeper to update so nothing unique on a discarded
 * duplicate is lost. Scalar fields only fill a keeper gap (never
 * overwrite a keeper value the keeper already has); array fields union.
 * instructions/exercise_tips are NOT unioned across rows (they're each an
 * ordered, internally-coherent set of steps for one telling of the
 * exercise — splicing two different phrasings together would produce
 * garbled instructions) — the keeper's own steps are kept if it has any,
 * and a discard's steps are only borrowed wholesale if the keeper has
 * none at all.
 */
export function mergeCatalogFields(
  keeper: ExerciseCatalogRow,
  discards: ExerciseCatalogRow[]
): Partial<ExerciseCatalogRow> {
  let description = keeper.description;
  let primaryMuscle = keeper.primary_muscle;
  let equipment = keeper.equipment;
  let category = keeper.category;
  let difficulty = keeper.difficulty;
  let instructions = keeper.instructions;
  let exerciseTips = keeper.exercise_tips;
  let hasVideo = keeper.has_video;
  let hasVideoWhite = keeper.has_video_white;
  let hasVideoGym = keeper.has_video_gym;
  let videoUrl = keeper.video_url;
  let videoUrlExpiresAt = keeper.video_url_expires_at;
  const secondaryMuscles = new Set(keeper.secondary_muscles);
  const exerciseType = new Set(keeper.exercise_type);

  for (const discard of discards) {
    description = description || discard.description;
    primaryMuscle = primaryMuscle || discard.primary_muscle;
    equipment = equipment || discard.equipment;
    category = category || discard.category;
    difficulty = difficulty || discard.difficulty;
    if (instructions.length === 0) instructions = discard.instructions;
    if (exerciseTips.length === 0) exerciseTips = discard.exercise_tips;
    hasVideo = hasVideo || discard.has_video;
    hasVideoWhite = hasVideoWhite || discard.has_video_white;
    hasVideoGym = hasVideoGym || discard.has_video_gym;
    videoUrl = videoUrl || discard.video_url;
    videoUrlExpiresAt = videoUrlExpiresAt || discard.video_url_expires_at;
    for (const m of discard.secondary_muscles) secondaryMuscles.add(m);
    for (const t of discard.exercise_type) exerciseType.add(t);
  }

  return {
    description,
    primary_muscle: primaryMuscle,
    equipment,
    category,
    difficulty,
    instructions,
    exercise_tips: exerciseTips,
    has_video: hasVideo,
    has_video_white: hasVideoWhite,
    has_video_gym: hasVideoGym,
    video_url: videoUrl,
    video_url_expires_at: videoUrlExpiresAt,
    secondary_muscles: Array.from(secondaryMuscles),
    exercise_type: Array.from(exerciseType),
  };
}

const DEFAULT_ARRAY_METADATA_COLUMNS = [
  'body_region',
  'equipment',
  'corrective_focus',
  'mobility_focus',
  'strength_focus',
  'stability_focus',
  'contraindications',
  'coaching_cues',
  'regressions',
  'progressions',
  'goal_tags',
  'limitation_tags',
] as const;

const SCALAR_METADATA_COLUMNS = ['program_section', 'movement_category', 'difficulty', 'coach_notes'] as const;

/**
 * Same union-array / keeper-wins-else-fallback merge shape already
 * established by migrate-legacy-exercise-references.ts's
 * migrateMefExerciseMetadata collision handling — reused here (not
 * re-derived) since mef_exercise_metadata's dedupe need is identical:
 * two rows describing the same exercise, one must absorb the other's
 * curation before the duplicate row is deleted.
 */
export function mergeMetadataFields(
  keeper: Record<string, unknown>,
  discards: Record<string, unknown>[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const col of DEFAULT_ARRAY_METADATA_COLUMNS) {
    const values = new Set<string>((keeper[col] as string[] | undefined) ?? []);
    for (const discard of discards) {
      for (const v of (discard[col] as string[] | undefined) ?? []) values.add(v);
    }
    merged[col] = Array.from(values);
  }
  for (const col of SCALAR_METADATA_COLUMNS) {
    let value = keeper[col] ?? null;
    for (const discard of discards) {
      value = value ?? discard[col] ?? null;
    }
    merged[col] = value;
  }
  return merged;
}
