/**
 * Gathers the real, already-stored facts status.ts needs to compute a
 * status for every registered assessment, for one member, in a small
 * fixed number of queries — never once per assessment. Every table read
 * here is RLS-scoped to `member_id = auth.uid()` (or the coach/admin
 * equivalents), so this is safe to call with the ordinary server client;
 * it never uses the service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { forgetReads, readOnce } from '../data/readOnce';
import { listAssessmentRegistryEntries } from './registry';
import { membershipKeyForAccessTier, resolveMembershipKey } from './membership';
import type { AssessmentKey } from './types';
import type { MemberAssessmentFacts, ProgramEnrollmentFacts } from './status';

/**
 * ONE READ PER REQUEST (Home speed build, 2026-08-28). Seven different
 * callers ask this on one Home load: the questionnaire catalog twice, the
 * visibility layer, the priority engine, the Root router, and
 * `checkAssessmentAccess`. Each was six real round trips, so Home spent
 * forty-two of them on one answer that cannot change mid-render.
 *
 * Forgotten by `forgetMemberAssessmentFacts` below, which every write that
 * changes an assignment, a schedule, a plan or a completion calls.
 */
export async function getMemberAssessmentFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<AssessmentKey, MemberAssessmentFacts>> {
  return readOnce(`${FACTS_KEY_PREFIX}${memberId}`, () => readMemberAssessmentFacts(supabase, memberId));
}

const FACTS_KEY_PREFIX = 'assessmentFacts:';

/** Called by every write that changes what `getMemberAssessmentFacts` would answer, so a request that assigns, completes or re-plans then re-reads sees its own write. */
export function forgetMemberAssessmentFacts(memberId: string): void {
  forgetReads(`${FACTS_KEY_PREFIX}${memberId}`);
}

async function readMemberAssessmentFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<AssessmentKey, MemberAssessmentFacts>> {
  const entries = listAssessmentRegistryEntries();

  const [
    profileResult,
    subscriptionResult,
    enrollmentResult,
    statusResult,
    assignmentResult,
    scheduleResult,
  ] = await Promise.all([
      supabase.from('profiles').select('membership_tier').eq('id', memberId).maybeSingle(),
      // THE PLAN IS THE GATE (2026-08-27). Her real plan, the one assigned
      // on /admin/access, not the near-always-NULL legacy column below.
      // See membershipKeyForAccessTier for why the two exist and why this
      // one wins.
      supabase
        .from('member_subscriptions')
        .select('tier, status')
        .eq('member_id', memberId)
        .maybeSingle(),
      supabase
        .from('program_enrollments')
        .select('program_key, status, current_phase_key, enrolled_at')
        .eq('member_id', memberId)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('assessment_status_by_member')
        .select(
          'assessment_definition_id, status, latest_completed_attempt_id, latest_completed_at'
        )
        .eq('member_id', memberId),
      supabase
        .from('assessment_assignments')
        .select('id, assessment_definition_id, is_required, reason, due_at, available_at, stage')
        .eq('member_id', memberId)
        .eq('status', 'pending'),
      supabase
        .from('reassessment_schedules')
        .select('id, assessment_definition_id, stage, due_at')
        .eq('member_id', memberId)
        .eq('status', 'pending'),
    ]);

  // The subscription row is authoritative. The legacy profiles column is
  // read only for an account created before migration 159 that somehow has
  // no subscription row at all AND carries a real (non-null) tier of its
  // own; anything else resolves through the fail-closed plan mapping.
  const membershipKey = subscriptionResult.data
    ? membershipKeyForAccessTier(
        subscriptionResult.data.tier ?? null,
        subscriptionResult.data.status ?? null
      )
    : profileResult.data?.membership_tier
      ? resolveMembershipKey(profileResult.data.membership_tier)
      : 'free_trial';

  const enrollment: ProgramEnrollmentFacts | null = enrollmentResult.data
    ? {
        programKey: enrollmentResult.data.program_key,
        status: enrollmentResult.data.status,
        currentPhaseKey: enrollmentResult.data.current_phase_key,
        enrolledAt: enrollmentResult.data.enrolled_at,
      }
    : null;

  const statusByDefinitionId = new Map(
    (statusResult.data ?? []).map((row) => [row.assessment_definition_id, row])
  );
  const assignmentByDefinitionId = new Map(
    (assignmentResult.data ?? []).map((row) => [row.assessment_definition_id, row])
  );
  const scheduleByDefinitionId = new Map(
    (scheduleResult.data ?? []).map((row) => [row.assessment_definition_id, row])
  );

  const facts = new Map<AssessmentKey, MemberAssessmentFacts>();

  for (const entry of entries) {
    const statusRow = statusByDefinitionId.get(entry.databaseId);
    const assignmentRow = assignmentByDefinitionId.get(entry.databaseId);
    const scheduleRow = scheduleByDefinitionId.get(entry.databaseId);

    facts.set(entry.key, {
      membershipKey,
      enrollment,
      completionStatus: statusRow?.status ?? 'not_started',
      latestCompletedAt: statusRow?.latest_completed_at ?? null,
      latestCompletedAttemptId: statusRow?.latest_completed_attempt_id ?? null,
      pendingAssignment: assignmentRow
        ? {
            id: assignmentRow.id,
            isRequired: assignmentRow.is_required,
            reason: assignmentRow.reason,
            dueAt: assignmentRow.due_at,
            availableAt: assignmentRow.available_at,
            stage: assignmentRow.stage,
          }
        : null,
      pendingReassessmentSchedule: scheduleRow
        ? { id: scheduleRow.id, stage: scheduleRow.stage, dueAt: scheduleRow.due_at }
        : null,
    });
  }

  return facts;
}
