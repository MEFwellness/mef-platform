/**
 * Data access for member_movement_profiles (migration 81) — the permanent
 * Movement Profile. Reads go straight to the table (RLS: member_read_own /
 * coach_read_assigned); writes go exclusively through one of the two
 * security-definer RPCs the migration defines
 * (upsert_movement_profile_member_fields / upsert_movement_profile_coach_fields)
 * — same "no general write surface" trust boundary as
 * lib/health-profile/orchestration.ts's upsert_member_health_profile call.
 * Never call `.update()` on this table directly; there is no RLS policy
 * that would allow it to succeed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HealthTimelineEvidenceRef, MemberMovementProfile } from '@mef/shared-types-contracts';

export async function getMovementProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberMovementProfile | null> {
  const { data, error } = await supabase
    .from('member_movement_profiles')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getMovementProfile failed', error);
    return null;
  }
  return data as MemberMovementProfile | null;
}

export type MovementProfileMemberFieldsInput = {
  goals: string[];
  equipmentAccess: string[];
  favoriteMovementTypes: string[];
  mobilityPriorities: string[];
  stabilityPriorities: string[];
  strengthPriorities: string[];
  assessmentReferences: HealthTimelineEvidenceRef[];
  programHistoryReferences: HealthTimelineEvidenceRef[];
};

/** Applies the "Automatic Updates" write level — always safe to call directly for the signed-in member's own profile. */
export async function upsertMovementProfileMemberFields(
  supabase: SupabaseClient,
  memberId: string,
  input: MovementProfileMemberFieldsInput
): Promise<boolean> {
  const { error } = await supabase.rpc('upsert_movement_profile_member_fields', {
    p_member: memberId,
    p_goals: input.goals,
    p_equipment_access: input.equipmentAccess,
    p_favorite_movement_types: input.favoriteMovementTypes,
    p_mobility_priorities: input.mobilityPriorities,
    p_stability_priorities: input.stabilityPriorities,
    p_strength_priorities: input.strengthPriorities,
    p_assessment_references: input.assessmentReferences,
    p_program_history_references: input.programHistoryReferences,
  });

  if (error) {
    console.error('upsertMovementProfileMemberFields failed', error);
    return false;
  }
  return true;
}

export type MovementProfileCoachFieldsInput = {
  movementLimitations: string[];
  exerciseRestrictions: string[];
  contraindications: string[];
  medicalRestrictions: string[];
  correctivePriorities: string[];
  capabilitySummary: Record<string, unknown> | null;
  exerciseClearance: string | null;
  assessmentInterpretation: string | null;
  coachObservations: string | null;
};

/** Applies the "Coach Controlled" write level — only succeeds when the caller is an active coach assigned to this member (or an admin); enforced inside the RPC itself, not just by this wrapper. */
export async function upsertMovementProfileCoachFields(
  supabase: SupabaseClient,
  memberId: string,
  input: MovementProfileCoachFieldsInput
): Promise<boolean> {
  const { error } = await supabase.rpc('upsert_movement_profile_coach_fields', {
    p_member: memberId,
    p_movement_limitations: input.movementLimitations,
    p_exercise_restrictions: input.exerciseRestrictions,
    p_contraindications: input.contraindications,
    p_medical_restrictions: input.medicalRestrictions,
    p_corrective_priorities: input.correctivePriorities,
    p_capability_summary: input.capabilitySummary,
    p_exercise_clearance: input.exerciseClearance,
    p_assessment_interpretation: input.assessmentInterpretation,
    p_coach_observations: input.coachObservations,
  });

  if (error) {
    console.error('upsertMovementProfileCoachFields failed', error);
    return false;
  }
  return true;
}

const EMPTY_MEMBER_FIELDS: MovementProfileMemberFieldsInput = {
  goals: [],
  equipmentAccess: [],
  favoriteMovementTypes: [],
  mobilityPriorities: [],
  stabilityPriorities: [],
  strengthPriorities: [],
  assessmentReferences: [],
  programHistoryReferences: [],
};

/** Reads the member's profile, creating an empty row (via the member-fields RPC's own upsert) the first time one is needed — e.g. the first exercise favorite or the first visit to the Movement Profile page. */
export async function getOrCreateMovementProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberMovementProfile | null> {
  const existing = await getMovementProfile(supabase, memberId);
  if (existing) return existing;

  const created = await upsertMovementProfileMemberFields(supabase, memberId, EMPTY_MEMBER_FIELDS);
  if (!created) return null;
  return getMovementProfile(supabase, memberId);
}
