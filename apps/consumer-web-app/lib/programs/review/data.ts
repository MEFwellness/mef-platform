/**
 * The review record itself. One file talks to program_phase_reviews.
 *
 * ONE LIVE REVIEW PER PROGRAM, where live means open OR drafted. Enforced
 * by a partial unique index on the table (migration 180) rather than by a
 * read-then-insert here, so a coach double-tapping Open Review lands back
 * on the review she already has instead of starting a second one.
 *
 * "LIVE" HAD TO INCLUDE DRAFTED, and the live run is why. The review screen
 * creates a review as a side effect of rendering, and a Next.js server
 * action revalidates the route it was called from, so the page re-renders
 * after every action. Once the coach had chosen an outcome the review was
 * 'drafted', an open-only reader found nothing, and the re-render inserted
 * a SECOND review. The screen was then holding a review that had never
 * drafted anything, and Discard discarded that instead of the real draft.
 *
 * THE STATUS LADDER, and what each rung means.
 *
 *   open        the coach is looking at it and has chosen nothing.
 *   drafted     she chose an outcome and it wrote an unpublished draft.
 *   approved    she approved the draft, and the member has it. This is the
 *               ONLY rung at which anything reached a member, and it is
 *               reached by an explicit second tap.
 *   discarded   she threw the draft away, or closed the program out.
 *
 * NO EM DASHES, per the house rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProgramPhaseReview,
  ProgramRecommendedOutcome,
  ProgramReviewOutcome,
  ProgramReviewStatus,
} from '@mef/shared-types-contracts';

/** The two states that mean "the coach is still working on this one". Approved and discarded are done. */
export const LIVE_REVIEW_STATUSES: readonly ProgramReviewStatus[] = ['open', 'drafted'];

/**
 * The review a coach is working on for this program, whether she has
 * drafted from it yet or not. At most one, by the index.
 */
export async function getLiveReview(
  supabase: SupabaseClient,
  input: { memberId: string; groupKey: string }
): Promise<ProgramPhaseReview | null> {
  const { data, error } = await supabase
    .from('program_phase_reviews')
    .select('*')
    .eq('member_id', input.memberId)
    .eq('program_group_key', input.groupKey)
    .in('status', LIVE_REVIEW_STATUSES as string[])
    .maybeSingle();
  if (error) {
    console.error('getLiveReview failed', error);
    return null;
  }
  return (data as ProgramPhaseReview | null) ?? null;
}

export async function getReview(
  supabase: SupabaseClient,
  reviewId: string
): Promise<ProgramPhaseReview | null> {
  const { data, error } = await supabase
    .from('program_phase_reviews')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();
  if (error) {
    console.error('getReview failed', error);
    return null;
  }
  return (data as ProgramPhaseReview | null) ?? null;
}

/** Every review this program has ever had, newest first. History, so a coach can see what she decided last time and why. */
export async function listReviewsForProgram(
  supabase: SupabaseClient,
  input: { memberId: string; groupKey: string }
): Promise<ProgramPhaseReview[]> {
  const { data, error } = await supabase
    .from('program_phase_reviews')
    .select('*')
    .eq('member_id', input.memberId)
    .eq('program_group_key', input.groupKey)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listReviewsForProgram failed', error);
    return [];
  }
  return (data ?? []) as ProgramPhaseReview[];
}

export interface CreateReviewInput {
  memberId: string;
  coachId: string;
  groupKey: string;
  programName: string;
  openedEarly: boolean;
  signalSnapshot: Record<string, unknown>;
  /** One of the six, or 'coach_review_required' when the engine deliberately recommended nothing (migration 181). */
  recommendedOutcome: ProgramRecommendedOutcome;
  recommendationReasoning: string;
}

/**
 * Opens a review, or returns the LIVE one if there already is one. Never
 * two, and never a second one just because the first has drafted
 * something: see this file's header.
 */
export async function openReview(
  supabase: SupabaseClient,
  input: CreateReviewInput
): Promise<ProgramPhaseReview | null> {
  const existing = await getLiveReview(supabase, {
    memberId: input.memberId,
    groupKey: input.groupKey,
  });
  if (existing) return existing;

  const { data, error } = await supabase
    .from('program_phase_reviews')
    .insert({
      member_id: input.memberId,
      coach_id: input.coachId,
      program_group_key: input.groupKey,
      program_name: input.programName,
      opened_early: input.openedEarly,
      signal_snapshot: input.signalSnapshot,
      recommended_outcome: input.recommendedOutcome,
      recommendation_reasoning: input.recommendationReasoning,
    })
    .select('*')
    .single();
  if (error) {
    // The unique index fired, which means somebody else opened it a
    // moment ago. Read theirs rather than reporting a failure.
    if (error.code === '23505') {
      return getLiveReview(supabase, { memberId: input.memberId, groupKey: input.groupKey });
    }
    console.error('openReview failed', error);
    return null;
  }
  return data as ProgramPhaseReview;
}

export interface RecordOutcomeInput {
  reviewId: string;
  outcome: ProgramReviewOutcome;
  status: ProgramReviewStatus;
  draftAssignmentIds?: string[];
  draftTemplateIds?: string[];
  draftProgramGroupKey?: string | null;
  approvedLoads?: Record<string, { load: number | null; unit: string | null }>;
  coachNotes?: string | null;
}

/** Records what the coach chose and what it produced. Writes nothing to any member-facing table. */
export async function recordReviewOutcome(
  supabase: SupabaseClient,
  input: RecordOutcomeInput
): Promise<ProgramPhaseReview | null> {
  const { data, error } = await supabase
    .from('program_phase_reviews')
    .update({
      chosen_outcome: input.outcome,
      chosen_at: new Date().toISOString(),
      status: input.status,
      draft_assignment_ids: input.draftAssignmentIds ?? [],
      draft_template_ids: input.draftTemplateIds ?? [],
      draft_program_group_key: input.draftProgramGroupKey ?? null,
      approved_loads: input.approvedLoads ?? {},
      coach_notes: input.coachNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.reviewId)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('recordReviewOutcome failed', error);
    return null;
  }
  return data as ProgramPhaseReview;
}

export async function setReviewStatus(
  supabase: SupabaseClient,
  reviewId: string,
  status: ProgramReviewStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('program_phase_reviews')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) {
    console.error('setReviewStatus failed', error);
    return false;
  }
  return true;
}
