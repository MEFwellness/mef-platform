/**
 * Movement Profile-informed exercise recommendations for the builder's
 * exercise picker. Reads a member's member_movement_profiles (migration
 * 81) — movement_limitations, corrective_priorities, exercise_restrictions
 * — and matches them against mef_exercise_metadata's corrective_focus/
 * limitation_tags/goal_tags (migration 80) by normalized keyword overlap.
 * Both sides are coach-curated free text (not a fixed enum — see each
 * migration's own header), so this matches on normalized substrings
 * rather than a hardcoded mapping table: a coach tagging an exercise's
 * corrective_focus with "forward head" will surface it for a member whose
 * Movement Profile lists "Forward Head" as a limitation, regardless of
 * exact casing/punctuation, without this file needing to know every
 * limitation label in advance.
 *
 * Pure recommendation surface only — per the prompt's explicit "Do NOT
 * automatically assign them. Only recommend. Coach always decides," this
 * never writes anything; it's read by the builder UI to bias what the
 * coach sees first, nothing more.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MefExerciseMetadata, MemberMovementProfile } from '@mef/shared-types-contracts';
import { loadAssignableExerciseMetadata } from '../exercise-library/assignable';

/** The free-text, coach-curated tag vocabulary matcher. Exported because more than one caller matches against the same tags, and there is no reason to reimplement the normalization rules per caller. */
export function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '');
}

/** True if any word (3+ chars, to skip noise like "of"/"the") from a profile tag appears in any metadata tag, or vice versa. Exported for reuse — see normalize's own comment above. */
export function tagsOverlap(profileTags: string[], metadataTags: string[]): boolean {
  const metadataWords = new Set(
    metadataTags.flatMap((tag) =>
      normalize(tag)
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    )
  );
  return profileTags.some((profileTag) => {
    const normalizedProfileTag = normalize(profileTag);
    if (normalizedProfileTag.length === 0) return false;
    const profileWords = normalizedProfileTag.split(/\s+/).filter((w) => w.length >= 3);
    return profileWords.some((word) => metadataWords.has(word));
  });
}

export type RecommendedExerciseMetadata = MefExerciseMetadata & {
  /** Which of the member's profile fields this recommendation matched on — shown as a chip in the picker so the coach knows why it's suggested. */
  matchReasons: string[];
};

/** Recommended mef_exercise_metadata rows for a given member, ranked by how many profile fields they matched, capped at `limit`. Returns [] when the member has no Movement Profile signal yet (nothing to recommend from) rather than falling back to an arbitrary catalog slice. */
export async function getRecommendedExerciseMetadataForMember(
  supabase: SupabaseClient,
  profile: MemberMovementProfile | null,
  limit = 12
): Promise<RecommendedExerciseMetadata[]> {
  if (!profile) return [];

  const limitations = profile.movement_limitations ?? [];
  const correctivePriorities = profile.corrective_priorities ?? [];
  const restrictions = profile.exercise_restrictions ?? [];
  const goals = profile.goals ?? [];

  if (
    limitations.length === 0 &&
    correctivePriorities.length === 0 &&
    restrictions.length === 0 &&
    goals.length === 0
  ) {
    return [];
  }

  // Pull the coach-curated metadata catalog once — scanning it in app code
  // for tag overlap is cheap at this size and avoids needing a bespoke
  // full-text search index. Read in full, and only what may reach a member:
  // this used to be a flat `.limit(500)` over an 853-row table, so 41% of
  // the catalog could never be recommended and nothing said so.
  const data = await loadAssignableExerciseMetadata(
    supabase,
    'getRecommendedExerciseMetadataForMember'
  );
  if (data.length === 0) return [];

  const scored = data.map((metadata) => {
    const matchReasons: string[] = [];
    if (tagsOverlap(limitations, metadata.corrective_focus))
      matchReasons.push('Movement limitation');
    if (tagsOverlap(limitations, metadata.limitation_tags))
      matchReasons.push('Movement limitation');
    if (tagsOverlap(correctivePriorities, metadata.corrective_focus))
      matchReasons.push('Corrective priority');
    if (tagsOverlap(restrictions, metadata.contraindications)) {
      // An exercise contraindicated for one of this member's restrictions
      // is a match to actively exclude, never surface as a suggestion.
      matchReasons.length = 0;
      return { metadata, score: -1, matchReasons: [] as string[] };
    }
    if (tagsOverlap(goals, metadata.goal_tags)) matchReasons.push('Member goal');

    return {
      metadata,
      score: matchReasons.length,
      matchReasons: Array.from(new Set(matchReasons)),
    };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({ ...entry.metadata, matchReasons: entry.matchReasons }));
}
