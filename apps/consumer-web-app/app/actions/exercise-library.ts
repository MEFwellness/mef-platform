/**
 * Server actions for the Exercise Library — favoriting, recently-viewed
 * tracking, and exercise completion/notes/feedback (migration 81). Search/
 * detail reads go through app/api/exercises/route.ts (client-driven,
 * interactive search) or a direct server-side exercise_catalog read (the
 * exercise detail page); everything here is a first-party write with no
 * interactive round-trip needed, same convention as every other mutation
 * in app/actions/.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  addExerciseFavorite,
  isExerciseFavorited,
  listMyExerciseFavoriteIds,
  listMyExerciseFavorites,
  removeExerciseFavorite,
} from '@/lib/exercise-library/favorites';
import {
  listMyExerciseCompletions,
  listExerciseCompletionHistory,
  recordExerciseCompletion as recordExerciseCompletionRow,
} from '@/lib/exercise-library/completions';
import {
  listMyRecentlyViewedExercises,
  getMyMostRecentlyViewedExercise,
  recordExerciseView as recordExerciseViewRow,
} from '@/lib/exercise-library/recentViews';
import { searchExerciseCatalog, getExercisesByExternalIds } from '@/lib/your-move/catalog';
import { getExerciseMetadataMap } from '@/lib/exercise-library/metadata';
import { normalizeExerciseCatalogRow } from '@/lib/exercise-library/normalize';
import { computeFavoriteMovementTypes } from '@/lib/movement-profile/favoriteMovementTypes';
import {
  getOrCreateMovementProfile,
  upsertMovementProfileMemberFields,
} from '@/lib/movement-profile/data';
import { detectMovementProfileReviewSignals } from '@/lib/movement-profile/reviewDetection';
import { createMovementProfileReviewItem } from '@/lib/movement-profile/reviewItems';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { todaysLocalDate } from '@/lib/time/localDate';
import type {
  ExerciseComfortRating,
  ExerciseCompletionStatus,
  ExerciseDifficultyRating,
  ExerciseEnjoymentRating,
  ExerciseLibraryExercise,
  MemberExerciseCompletion,
  MemberExerciseRecentView,
} from '@mef/shared-types-contracts';
import { memberTimezone } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

async function resolveMemberId(): Promise<{
  supabase: ReturnType<typeof createClient>;
  memberId: string;
} | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;
  return { supabase, memberId: user.id };
}

/** Same shape as eveningReflection.ts's own resolveContext — timezone-aware "today" for the timeline events this file writes. */
async function resolveMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  return await memberTimezone(supabase, memberId);
}

export async function toggleExerciseFavorite(
  externalId: string,
  nextIsFavorited: boolean,
  exerciseName?: string
): Promise<ActionResult> {
  const context = await resolveMemberId();
  if (!context) return { error: 'Sign in required.' };

  const { supabase, memberId } = context;
  const ok = nextIsFavorited
    ? await addExerciseFavorite(supabase, memberId, 'your_move', externalId)
    : await removeExerciseFavorite(supabase, memberId, 'your_move', externalId);

  if (!ok) return { error: 'Could not update favorites. Please try again.' };

  // Best-effort side effects — never allowed to turn a successful favorite
  // toggle into a reported failure, same discipline as every other
  // recompute-and-record path in this codebase (see app/actions/movement.ts).
  try {
    const localDate = todaysLocalDate(await resolveMemberTimezone(supabase, memberId));
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: nextIsFavorited ? 'exercise_favorited' : 'exercise_unfavorited',
      localDate,
      title: nextIsFavorited
        ? `Favorited ${exerciseName ?? 'an exercise'}`
        : `Removed ${exerciseName ?? 'an exercise'} from favorites`,
      sourceFeature: 'exercise_library',
      sourceRecordId: null,
    });

    const favoriteMovementTypes = await computeFavoriteMovementTypes(supabase, memberId);
    const profile = await getOrCreateMovementProfile(supabase, memberId);
    if (profile) {
      await upsertMovementProfileMemberFields(supabase, memberId, {
        goals: profile.goals,
        equipmentAccess: profile.equipment_access,
        favoriteMovementTypes,
        mobilityPriorities: profile.mobility_priorities,
        stabilityPriorities: profile.stability_priorities,
        strengthPriorities: profile.strength_priorities,
        assessmentReferences: profile.assessment_references,
        programHistoryReferences: profile.program_history_references,
      });
    }
  } catch (err) {
    console.error('toggleExerciseFavorite side effects failed', err);
  }

  return {};
}

export async function getMyExerciseFavoriteIds(): Promise<string[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  const ids = await listMyExerciseFavoriteIds(
    context.supabase,
    context.memberId,
    'your_move'
  );
  return Array.from(ids);
}

export async function recordExerciseView(
  externalId: string,
  exerciseName: string
): Promise<ActionResult> {
  const context = await resolveMemberId();
  if (!context) return { error: 'Sign in required.' };

  const ok = await recordExerciseViewRow(
    context.supabase,
    context.memberId,
    'your_move',
    externalId,
    exerciseName
  );
  if (!ok) return { error: 'Could not record view.' };
  return {};
}

export async function getMyRecentlyViewedExercises(
  limit = 10
): Promise<MemberExerciseRecentView[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  return listMyRecentlyViewedExercises(context.supabase, context.memberId, limit);
}

export async function getMyResumeExercise(): Promise<MemberExerciseRecentView | null> {
  const context = await resolveMemberId();
  if (!context) return null;
  return getMyMostRecentlyViewedExercise(context.supabase, context.memberId);
}

export type RecordExerciseCompletionParams = {
  externalId: string;
  exerciseName: string;
  status: ExerciseCompletionStatus;
  durationSeconds?: number | null;
  memberNotes?: string | null;
  difficultyRating?: ExerciseDifficultyRating | null;
  comfortRating?: ExerciseComfortRating | null;
  enjoymentRating?: ExerciseEnjoymentRating | null;
};

export async function recordExerciseCompletion(
  params: RecordExerciseCompletionParams
): Promise<ActionResult> {
  const context = await resolveMemberId();
  if (!context) return { error: 'Sign in required.' };
  const { supabase, memberId } = context;

  // Read this exercise's prior history BEFORE inserting the new row — the
  // review-detection heuristics need a clean "before" snapshot to compare
  // the new completion against.
  const priorHistory = await listExerciseCompletionHistory(
    supabase,
    memberId,
    'your_move',
    params.externalId
  );

  const completion = await recordExerciseCompletionRow(supabase, {
    memberId,
    provider: 'your_move',
    externalId: params.externalId,
    exerciseName: params.exerciseName,
    status: params.status,
    durationSeconds: params.durationSeconds,
    memberNotes: params.memberNotes,
    difficultyRating: params.difficultyRating,
    comfortRating: params.comfortRating,
    enjoymentRating: params.enjoymentRating,
  });

  if (!completion) return { error: 'Could not record this exercise. Please try again.' };

  try {
    const localDate = todaysLocalDate(await resolveMemberTimezone(supabase, memberId));
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: params.status === 'skipped' ? 'exercise_skipped' : 'exercise_completed',
      localDate,
      title:
        params.status === 'skipped'
          ? `Skipped ${params.exerciseName}`
          : params.status === 'partial'
            ? `Partially completed ${params.exerciseName}`
            : `Completed ${params.exerciseName}`,
      detail: params.memberNotes ?? null,
      sourceFeature: 'exercise_library',
      sourceRecordId: completion.id,
    });
  } catch (err) {
    console.error('recordExerciseCompletion timeline write failed', err);
  }

  try {
    const signals = detectMovementProfileReviewSignals(completion, priorHistory);
    for (const signal of signals) {
      await createMovementProfileReviewItem(supabase, {
        memberId,
        reviewType: signal.reviewType,
        summary: signal.summary,
        detail: signal.detail,
        sourceFeature: 'exercise_library',
        sourceRecordId: completion.id,
        evidenceRefs: [{ type: 'member_exercise_completion', id: completion.id }],
      });
    }
  } catch (err) {
    console.error('recordExerciseCompletion review-detection failed', err);
  }

  return {};
}

export async function getMyRecentlyCompletedExercises(
  limit = 10
): Promise<MemberExerciseCompletion[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  const rows = await listMyExerciseCompletions(context.supabase, context.memberId, limit * 4);
  // One card per exercise, most recent occurrence — the "recently
  // completed" rail is about which exercises, not a full log (that's
  // getMyExerciseCompletionHistory below).
  const seen = new Set<string>();
  const deduped: MemberExerciseCompletion[] = [];
  for (const row of rows) {
    if (row.status === 'skipped') continue;
    if (seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export async function getMyExerciseCompletionHistory(
  externalId: string
): Promise<MemberExerciseCompletion[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  return listExerciseCompletionHistory(
    context.supabase,
    context.memberId,
    'your_move',
    externalId
  );
}

/**
 * Full favorite exercises, hydrated from exercise_catalog — powers the
 * "Favorites" rail on the Resume Experience. `member_exercise_favorites`
 * only stores provider+external_id (see its own type), so each favorited
 * id is re-fetched from our own catalog rather than adding an
 * exercise_name column purely for display; bounded to `limit` (rail-sized,
 * never the member's full favorites list). Legacy favorites (no confident
 * Your Move match, see migration 119) have no live catalog row to
 * hydrate — they're skipped here, not surfaced as broken cards; the
 * member's favorite is never deleted, just not re-visitable from this rail.
 */
export async function getMyFavoriteExercises(limit = 10): Promise<ExerciseLibraryExercise[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  const { supabase, memberId } = context;

  const favorites = (await listMyExerciseFavorites(supabase, memberId))
    .filter((f) => !f.is_legacy)
    .slice(0, limit);
  if (favorites.length === 0) return [];

  const externalIds = favorites.map((f) => f.external_id);
  const [catalogMap, metadataMap] = await Promise.all([
    getExercisesByExternalIds(supabase, externalIds),
    getExerciseMetadataMap(supabase, externalIds),
  ]);

  const exercises = favorites
    .map((favorite) => catalogMap.get(favorite.external_id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => normalizeExerciseCatalogRow(row, metadataMap.get(row.external_id) ?? null, true));

  return exercises;
}

/**
 * One "try this next" pick for the Resume Experience — biased toward the
 * member's favorite movement types (Movement Profile) when known, and away
 * from anything completed in their last 20 logged exercises, but never
 * hard-blocked by either (falls back to any random exercise) since a
 * best-effort suggestion is more valuable than none.
 */
export async function getSuggestedNextExercise(): Promise<ExerciseLibraryExercise | null> {
  const context = await resolveMemberId();
  if (!context) return null;
  const { supabase, memberId } = context;

  try {
    const [recentCompletions, profile] = await Promise.all([
      listMyExerciseCompletions(supabase, memberId, 20),
      getOrCreateMovementProfile(supabase, memberId),
    ]);
    const recentIds = new Set(recentCompletions.map((c) => c.external_id));
    const preferredCategory = profile?.favorite_movement_types?.[0];

    const result = await searchExerciseCatalog(supabase, {
      category: preferredCategory || undefined,
      random: true,
      limit: 5,
    });
    const pick = result.data.find((e) => !recentIds.has(e.external_id)) ?? result.data[0];
    if (!pick) return null;

    const [metadata, isFavorited] = await Promise.all([
      getExerciseMetadataMap(supabase, [pick.external_id]),
      isExerciseFavorited(supabase, memberId, 'your_move', pick.external_id),
    ]);
    return normalizeExerciseCatalogRow(pick, metadata.get(pick.external_id) ?? null, isFavorited);
  } catch (err) {
    console.error('getSuggestedNextExercise failed', err);
    return null;
  }
}
