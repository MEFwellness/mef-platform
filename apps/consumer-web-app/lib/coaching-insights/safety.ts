/**
 * Coaching Intelligence Engine — composed safety gate. This is the one
 * place that checks BOTH of this codebase's independent safety systems
 * together (see lib/food-lens/coachingNarrative.ts and
 * lib/food-products/coachingNarrative.ts, which each duplicate this
 * check inline rather than sharing a helper — a gap this file closes for
 * this engine, and a reasonable one for those to adopt later):
 *
 * - General Coaching Safety System (lib/safety/, migration 28) —
 *   restrictedTopics: a member currently flagged here gets ALL dynamic
 *   coaching suppressed, not just nutrition-flavored statements, matching
 *   every other consumer's "restrictedTopics.length > 0 -> suppress
 *   entirely" precedent.
 * - Nutrition Safety Overrides (lib/health-safety/, migration 65) —
 *   hasActiveOverride: a member with an active diabetes/insulin/pregnancy/
 *   clinician-plan flag never gets a nutrition-sourced statement (Food
 *   Lens observations), but can still see check-in/progress-only
 *   statements — the same "their health profile takes priority, but
 *   don't go dark entirely" posture Prompt 4 established for Food Lens's
 *   own coaching.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberRestrictedTopics } from '@/lib/feed/data';
import { getNutritionSafetyProfile } from '@/lib/health-safety/store';

export type CoachingSafetyGate = {
  /** True -> generate nothing at all this cycle; show safetyMessage instead. */
  suppressAll: boolean;
  /** True -> generation proceeds, but any source observation from 'food_lens' must be excluded before it ever reaches a level generator. */
  suppressNutrition: boolean;
  /** Approved, static copy — only meaningful when suppressAll is true. */
  safetyMessage: string | null;
};

const SAFETY_PAUSED_MESSAGE =
  "Your coaching insights are paused for now — check in with your assigned coach if you'd like to talk through how you've been doing.";

export async function getCoachingSafetyGate(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachingSafetyGate> {
  const [restrictedTopics, nutritionSafetyProfile] = await Promise.all([
    getMemberRestrictedTopics(supabase, memberId),
    getNutritionSafetyProfile(supabase, memberId),
  ]);

  const suppressAll = restrictedTopics.length > 0;
  return {
    suppressAll,
    suppressNutrition: nutritionSafetyProfile?.hasActiveOverride ?? false,
    safetyMessage: suppressAll ? SAFETY_PAUSED_MESSAGE : null,
  };
}
