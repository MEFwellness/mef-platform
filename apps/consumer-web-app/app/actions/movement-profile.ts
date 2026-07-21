/**
 * Server actions for the Movement Profile (migration 81) — member-facing
 * reads/writes of their own goals/equipment/priorities, and coach-facing
 * reads/writes of the clinical fields + the Pending Coach Review worklist.
 * Authorization is enforced by RLS and the two upsert_movement_profile_*_fields
 * RPCs themselves (see migration 81) — these actions don't re-check roles,
 * same convention as app/actions/coach.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  getMovementProfile,
  getOrCreateMovementProfile,
  upsertMovementProfileCoachFields,
  upsertMovementProfileMemberFields,
} from '@/lib/movement-profile/data';
import {
  listMovementProfileReviewItemsForClient,
  resolveMovementProfileReviewItem,
} from '@/lib/movement-profile/reviewItems';
import { listClientExerciseCompletions } from '@/lib/exercise-library/completions';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { todaysLocalDate } from '@/lib/time/localDate';
import type {
  MemberExerciseCompletion,
  MemberMovementProfile,
  MovementProfileReviewItem,
  MovementProfileReviewStatus,
} from '@mef/shared-types-contracts';

async function resolveMemberId(): Promise<{
  supabase: ReturnType<typeof createClient>;
  memberId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, memberId: user.id };
}

// ---------------------------------------------------------------------------
// Member-facing
// ---------------------------------------------------------------------------

export async function getMyMovementProfile(): Promise<MemberMovementProfile | null> {
  const context = await resolveMemberId();
  if (!context) return null;
  return getOrCreateMovementProfile(context.supabase, context.memberId);
}

export type UpdateMyMovementProfileParams = {
  goals: string[];
  equipmentAccess: string[];
  mobilityPriorities: string[];
  stabilityPriorities: string[];
  strengthPriorities: string[];
};

/** Only touches the member-controlled columns — favoriteMovementTypes/assessmentReferences/programHistoryReferences are preserved from the existing row, never blanked out by a form that doesn't render them. */
export async function updateMyMovementProfile(
  params: UpdateMyMovementProfileParams
): Promise<ActionResult> {
  const context = await resolveMemberId();
  if (!context) return { error: 'Sign in required.' };
  const { supabase, memberId } = context;

  const existing = await getOrCreateMovementProfile(supabase, memberId);
  if (!existing) return { error: 'Could not load your Movement Profile. Please try again.' };

  const ok = await upsertMovementProfileMemberFields(supabase, memberId, {
    goals: params.goals,
    equipmentAccess: params.equipmentAccess,
    favoriteMovementTypes: existing.favorite_movement_types,
    mobilityPriorities: params.mobilityPriorities,
    stabilityPriorities: params.stabilityPriorities,
    strengthPriorities: params.strengthPriorities,
    assessmentReferences: existing.assessment_references,
    programHistoryReferences: existing.program_history_references,
  });

  if (!ok) return { error: 'Could not save your Movement Profile. Please try again.' };
  return {};
}

// ---------------------------------------------------------------------------
// Coach-facing — RLS's is_active_coach_for gate is what actually restricts
// these to an assigned coach; a non-assigned coach's read returns null/[]
// and their write RPC call raises, surfaced below as a generic error.
// ---------------------------------------------------------------------------

export async function getClientMovementProfile(
  clientId: string
): Promise<MemberMovementProfile | null> {
  const supabase = createClient();
  return getMovementProfile(supabase, clientId);
}

export async function getClientExerciseHistory(
  clientId: string,
  limit = 30
): Promise<MemberExerciseCompletion[]> {
  const supabase = createClient();
  return listClientExerciseCompletions(supabase, clientId, limit);
}

export async function getClientMovementProfileReviewQueue(
  clientId: string
): Promise<MovementProfileReviewItem[]> {
  const supabase = createClient();
  return listMovementProfileReviewItemsForClient(supabase, clientId);
}

export type UpdateClientMovementProfileParams = {
  movementLimitations: string[];
  exerciseRestrictions: string[];
  contraindications: string[];
  medicalRestrictions: string[];
  correctivePriorities: string[];
  exerciseClearance: string | null;
  assessmentInterpretation: string | null;
  coachObservations: string | null;
};

export async function updateClientMovementProfileCoachFields(
  clientId: string,
  params: UpdateClientMovementProfileParams
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const existing = await getMovementProfile(supabase, clientId);

  const ok = await upsertMovementProfileCoachFields(supabase, clientId, {
    movementLimitations: params.movementLimitations,
    exerciseRestrictions: params.exerciseRestrictions,
    contraindications: params.contraindications,
    medicalRestrictions: params.medicalRestrictions,
    correctivePriorities: params.correctivePriorities,
    // capability_summary stays untouched by this form — "do not
    // automatically score capability" extends to not letting a plain text
    // form silently overwrite a structured summary it doesn't render.
    capabilitySummary: existing?.capability_summary ?? null,
    exerciseClearance: params.exerciseClearance,
    assessmentInterpretation: params.assessmentInterpretation,
    coachObservations: params.coachObservations,
  });

  if (!ok) return { error: 'Could not save this client’s Movement Profile. Please try again.' };
  return {};
}

export async function resolveClientMovementProfileReviewItem(
  itemId: string,
  memberId: string,
  status: Extract<MovementProfileReviewStatus, 'acknowledged' | 'actioned' | 'dismissed'>,
  resolutionNotes?: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await resolveMovementProfileReviewItem(
    supabase,
    itemId,
    user.id,
    status,
    resolutionNotes ?? null
  );
  if (!ok) return { error: 'Could not update this review item. Please try again.' };

  if (status === 'actioned') {
    try {
      const { data: memberProfile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', memberId)
        .single();
      await recordTimelineEvent(supabase, {
        memberId,
        eventType: 'movement_coach_review',
        localDate: todaysLocalDate(memberProfile?.timezone ?? 'America/New_York'),
        title: 'Your coach reviewed your movement progress',
        sourceFeature: 'movement_profile_review_items',
        sourceRecordId: itemId,
      });
    } catch (err) {
      console.error('resolveClientMovementProfileReviewItem timeline write failed', err);
    }
  }

  return {};
}
