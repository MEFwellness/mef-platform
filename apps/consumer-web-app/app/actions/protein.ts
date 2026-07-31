/**
 * Member-facing actions for Protein Phase 1a — profile setup, safety
 * screen, and target calculation. No food entry/barcode/ledger/photo
 * estimate concepts here (later phases). Same shape as
 * app/actions/primal-pattern.ts: requireMemberId() auth guard, delegates
 * persistence to lib/protein/store.ts and lib/health-safety/store.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  getProteinProfile,
  upsertProteinProfile,
  getActiveProteinTarget,
  createProteinTargetRequest,
} from '@/lib/protein/store';
import { getNutritionSafetyProfile, upsertNutritionSafetyFlags } from '@/lib/health-safety/store';
import { hasProteinSafetyOverride, EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '@/lib/health-safety/types';
import { computeProteinGrams, getSuggestedProteinRange, type ProteinGuidanceRange } from '@/lib/protein/calculation';
import { resolveProteinTrack } from '@/lib/protein/track';
import { PROTEIN_SAFETY_BLOCK_MESSAGE } from '@/lib/protein/copy';
import type { ActivityLevelKey, ProteinTrack } from '@/lib/protein/types';

export type ProteinSafetyAnswers = {
  hasKidneyDisease: boolean;
  hasSignificantLiverDisease: boolean;
  isPregnant: boolean;
  hasEatingDisorder: boolean;
  hasMedicalProteinLimit: boolean;
};

export type ProteinSetupState =
  | { stage: 'not_started' }
  | { stage: 'blocked'; message: string }
  | { stage: 'pending_review' }
  | {
      stage: 'active';
      track: ProteinTrack;
      activeGrams: number;
      isCoachEdited: boolean;
      suggestedRange: ProteinGuidanceRange | null;
    };

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getMyProteinSetupState(): Promise<ProteinSetupState | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();

  const safetyProfile = await getNutritionSafetyProfile(supabase, memberId);
  if (safetyProfile && hasProteinSafetyOverride(safetyProfile.flags)) {
    return { stage: 'blocked', message: PROTEIN_SAFETY_BLOCK_MESSAGE };
  }

  const profile = await getProteinProfile(supabase, memberId);
  if (!profile) return { stage: 'not_started' };

  const activeTarget = await getActiveProteinTarget(supabase, memberId);
  if (!activeTarget) return { stage: 'pending_review' };

  const suggestedRange =
    activeTarget.track === 'self_guided' ? getSuggestedProteinRange(activeTarget.activeGrams!) : null;

  return {
    stage: 'active',
    track: activeTarget.track,
    activeGrams: activeTarget.activeGrams!,
    isCoachEdited: activeTarget.isCoachEdited,
    suggestedRange,
  };
}

export type SubmitProteinProfileInput = {
  bodyWeightLb: number;
  activityLevel: ActivityLevelKey;
  safety: ProteinSafetyAnswers;
};

export async function submitMyProteinProfile(
  input: SubmitProteinProfileInput
): Promise<{ blocked: true; message: string } | { blocked: false; state: ProteinSetupState } | ActionResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { error: 'Sign in required.' };

  if (!Number.isFinite(input.bodyWeightLb) || input.bodyWeightLb <= 0 || input.bodyWeightLb >= 1000) {
    return { error: 'Enter a valid body weight in pounds.' };
  }

  const supabase = createClient();

  // Merge into whatever safety flags already exist (e.g. from the Primal
  // Pattern assessment's diabetes-focused questions) rather than
  // clobbering them — these two features share one table by design (see
  // migration 133's header comment).
  const existingSafetyProfile = await getNutritionSafetyProfile(supabase, memberId);
  const mergedFlags = {
    ...(existingSafetyProfile?.flags ?? EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS),
    hasKidneyDisease: input.safety.hasKidneyDisease,
    hasSignificantLiverDisease: input.safety.hasSignificantLiverDisease,
    isPregnant: input.safety.isPregnant,
    hasEatingDisorder: input.safety.hasEatingDisorder,
    hasMedicalProteinLimit: input.safety.hasMedicalProteinLimit,
  };

  const savedFlags = await upsertNutritionSafetyFlags(supabase, memberId, mergedFlags, memberId, 'member');

  if (hasProteinSafetyOverride(savedFlags.flags)) {
    // No automatic target is calculated or stored — the flow stops here.
    return { blocked: true, message: PROTEIN_SAFETY_BLOCK_MESSAGE };
  }

  await upsertProteinProfile(supabase, memberId, {
    bodyWeightLb: input.bodyWeightLb,
    activityLevel: input.activityLevel,
  });

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('membership_tier')
    .eq('id', memberId)
    .single();
  const track = resolveProteinTrack(profileRow?.membership_tier ?? null);

  const computedGrams = computeProteinGrams(input.bodyWeightLb, input.activityLevel);

  const { error } = await createProteinTargetRequest(supabase, memberId, {
    track,
    bodyWeightLb: input.bodyWeightLb,
    activityLevel: input.activityLevel,
    computedGrams,
  });
  if (error) return { error };

  if (track === 'self_guided') {
    return {
      blocked: false,
      state: {
        stage: 'active',
        track,
        activeGrams: computedGrams,
        isCoachEdited: false,
        suggestedRange: getSuggestedProteinRange(computedGrams),
      },
    };
  }

  return { blocked: false, state: { stage: 'pending_review' } };
}
