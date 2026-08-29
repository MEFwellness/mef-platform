/**
 * Persistence for member_protein_profile and member_protein_targets
 * (migration 133). Same trust boundary as every other store module in
 * this codebase: takes an already-authenticated client, RLS is the real
 * authorization boundary, not this code.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyTestAccountExclusion,
  rejectTestMemberRow,
  resolveTestAccountExclusion,
} from '@/lib/staff/testAccounts';
import type {
  ActivityLevelKey,
  PendingProteinTargetQueueEntry,
  ProteinProfile,
  ProteinTarget,
  ProteinTrack,
} from './types';

const PROFILE_TABLE = 'member_protein_profile';
const TARGETS_TABLE = 'member_protein_targets';

type ProfileRow = {
  member_id: string;
  body_weight_lb: number;
  activity_level: ActivityLevelKey;
  updated_at: string;
};

type TargetRow = {
  id: string;
  member_id: string;
  track: ProteinTrack;
  body_weight_lb: number;
  activity_level: ActivityLevelKey;
  computed_grams: number;
  status: 'pending_coach_review' | 'active';
  active_grams: number | null;
  is_coach_edited: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

function mapProfileRow(row: ProfileRow): ProteinProfile {
  return {
    memberId: row.member_id,
    bodyWeightLb: row.body_weight_lb,
    activityLevel: row.activity_level,
    updatedAt: row.updated_at,
  };
}

function mapTargetRow(row: TargetRow): ProteinTarget {
  return {
    id: row.id,
    memberId: row.member_id,
    track: row.track,
    bodyWeightLb: row.body_weight_lb,
    activityLevel: row.activity_level,
    computedGrams: row.computed_grams,
    status: row.status,
    activeGrams: row.active_grams,
    isCoachEdited: row.is_coach_edited,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

export async function getProteinProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<ProteinProfile | null> {
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error || !data) return null;
  return mapProfileRow(data as ProfileRow);
}

export async function upsertProteinProfile(
  supabase: SupabaseClient,
  memberId: string,
  input: { bodyWeightLb: number; activityLevel: ActivityLevelKey }
): Promise<ProteinProfile> {
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .upsert(
      {
        member_id: memberId,
        body_weight_lb: input.bodyWeightLb,
        activity_level: input.activityLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save protein profile: ${error?.message ?? 'unknown error'}`);
  }
  return mapProfileRow(data as ProfileRow);
}

/**
 * The member's current active target, if any. Returns null both when the
 * member has never submitted and when their most recent submission is
 * still pending_coach_review — RLS only ever returns a status='active'
 * row to the member it belongs to, so the two cases are indistinguishable
 * from this query alone by design (see migration 133's header comment).
 * Callers that need to tell those two apart should also check
 * getProteinProfile: a profile with no active target is "pending review"
 * for a structured-track member, since profile submission and target
 * creation always happen together (createProteinTargetRequest below).
 */
export async function getActiveProteinTarget(
  supabase: SupabaseClient,
  memberId: string
): Promise<ProteinTarget | null> {
  const { data, error } = await supabase
    .from(TARGETS_TABLE)
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapTargetRow(data as TargetRow);
}

/**
 * Creates a new calculation request. Self-guided rows are created already
 * active (no coach review needed for that track); structured-program rows
 * are created pending_coach_review. Deliberately doesn't .select() the
 * row back — a pending row wouldn't be readable by the member's own
 * client anyway (RLS), and the caller already has every value it needs
 * from its own inputs to render an immediate confirmation.
 */
export async function createProteinTargetRequest(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    track: ProteinTrack;
    bodyWeightLb: number;
    activityLevel: ActivityLevelKey;
    computedGrams: number;
  }
): Promise<{ error: string | null }> {
  const isSelfGuided = input.track === 'self_guided';
  const { error } = await supabase.from(TARGETS_TABLE).insert({
    member_id: memberId,
    track: input.track,
    body_weight_lb: input.bodyWeightLb,
    activity_level: input.activityLevel,
    computed_grams: input.computedGrams,
    status: isSelfGuided ? 'active' : 'pending_coach_review',
    active_grams: isSelfGuided ? input.computedGrams : null,
  });

  return { error: error?.message ?? null };
}

/** Coach queue: every pending request for this coach's assigned members (RLS scopes visibility automatically). */
/**
 * A3 (2026-08-28): the coach's pending-protein queue, and the PENDING
 * PROTEIN count on the coach dashboard that reads the same rows, had no
 * test-account exclusion. It does now, at the query, the same rule the
 * Safety Review Queue and the client list use.
 */
export async function listPendingProteinTargetsForCoach(
  supabase: SupabaseClient
): Promise<PendingProteinTargetQueueEntry[]> {
  const exclusion = await resolveTestAccountExclusion(supabase);

  const { data, error } = await applyTestAccountExclusion(
    supabase
      .from(TARGETS_TABLE)
      .select('*')
      .eq('status', 'pending_coach_review')
      .order('created_at', { ascending: true }),
    exclusion,
    'member_id'
  );

  if (error || !data) return [];

  const rows = data as TargetRow[];
  const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('id, display_name, is_test').in('id', memberIds)
    : { data: [] };
  const nameById = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null }) => [
      p.id,
      p.display_name ?? 'Unnamed client',
    ])
  );
  const isTestById = new Map(
    (profiles ?? []).map((p: { id: string; is_test?: boolean | null }) => [p.id, Boolean(p.is_test)])
  );

  return rows.map((row) => ({
    ...mapTargetRow(row),
    memberName: nameById.get(row.member_id) ?? 'Unnamed client',
    memberIsTest: isTestById.get(row.member_id) ?? false,
  }));
}

/**
 * The same row, read as a coach: a target belonging to a test account is
 * not found, whether it was reached from the queue or by typing
 * `/coach/protein-review/<id>`. Approving one is the same lookup, so the
 * write path is closed by the same call.
 */
export async function getProteinTargetForCoach(
  supabase: SupabaseClient,
  targetId: string
): Promise<ProteinTarget | null> {
  const target = await getProteinTargetById(supabase, targetId);
  const exclusion = await resolveTestAccountExclusion(supabase);
  return rejectTestMemberRow(target, exclusion, (row) => row.memberId);
}

export async function getProteinTargetById(
  supabase: SupabaseClient,
  targetId: string
): Promise<ProteinTarget | null> {
  const { data, error } = await supabase
    .from(TARGETS_TABLE)
    .select('*')
    .eq('id', targetId)
    .maybeSingle();

  if (error || !data) return null;
  return mapTargetRow(data as TargetRow);
}

/** Approve as-is (activeGrams === computed) or with an edit (activeGrams different) — same action either way. */
export async function approveProteinTarget(
  supabase: SupabaseClient,
  targetId: string,
  input: { coachId: string; activeGrams: number; isCoachEdited: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(TARGETS_TABLE)
    .update({
      status: 'active',
      active_grams: input.activeGrams,
      is_coach_edited: input.isCoachEdited,
      approved_by: input.coachId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId)
    .eq('status', 'pending_coach_review');

  return { error: error?.message ?? null };
}
