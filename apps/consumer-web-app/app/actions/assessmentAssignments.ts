/**
 * Coach assignment minimum interface (section 10) — assign a registered
 * assessment to a client, required/optional, with an availability/due
 * date and a short reason; cancel it; list what's assigned. RLS on
 * assessment_assignments (migration 77) is the real enforcement — every
 * action here just performs the write/read and reports whatever Postgres
 * allows, same "not this function's job to re-check the role" idiom as
 * every other coach action in app/actions/coach.ts.
 *
 * TWO THINGS WERE ADDED ON 2026-09-05, and neither of them changes what
 * completes an assignment.
 *
 * 1. THE DELIVERY RECEIPT (migration 210). `trackAssignmentDeliveredAction`
 *    below is the only write path into member_assignment_deliveries, and it
 *    is reached from a mounted effect on a surface that genuinely displayed
 *    the assignment, never from a render. It is the Weekly Reflection's
 *    receipt (migration 191) applied to this ledger, deliberately reusing
 *    its beacon, its once-only claim and its state vocabulary rather than
 *    inventing a second way to say the same thing.
 *
 * 2. THE DUE DATE IS NOW READ. It has been stored since migration 77 and
 *    nothing ever looked at it. `getClientAssessmentAssignments` resolves
 *    lateness at read time from the assignment's own status, its stored
 *    due date and the member's own calendar day. There is no overdue
 *    column, no job and no sweep, and a cancelled or completed assignment
 *    is never late. lib/assignments/status.ts is the whole rule.
 *
 * MIGRATION 144'S TRIGGER IS STILL THE ONLY THING THAT COMPLETES AN
 * ASSIGNMENT. Nothing added here writes status, completed_attempt_id or
 * updated_at on assessment_assignments.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { findAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import type { AssessmentKey } from '@/lib/assessment-registry/types';
import type { ActionResult } from './auth';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import {
  claimAssignmentDelivery,
  isAssignmentPresentation,
  listAssignmentDeliveries,
} from '@/lib/assignments/data';
import {
  assignmentStatusLine,
  resolveAssignmentProgress,
  type AssignmentProgress,
  type AssignmentRowStatus,
} from '@/lib/assignments/status';

export type AssessmentAssignment = {
  id: string;
  assessmentDefinitionId: string;
  /**
   * The coach who sent it. An auth user id and never a name: naming them
   * is a profiles read under RLS, which a coach may only do for themselves
   * and their own clients (lib/coach-assign/data.ts).
   */
  assignedBy: string;
  isRequired: boolean;
  reason: string | null;
  dueAt: string | null;
  status: AssignmentRowStatus;
  createdAt: string;
  /**
   * Whether it reached her, and whether it is late. Resolved on the server
   * against her own calendar day, because the panel that renders it is a
   * client component and a client component that decided "today" for
   * itself would decide it in the reader's zone on one pass and UTC on the
   * other (the standing rule, lib/time/memberToday.ts).
   */
  progress: AssignmentProgress;
  /**
   * That same state as the one sentence a coach reads.
   *
   * IT ARRIVES ALREADY WRITTEN, from the server, exactly as the Weekly
   * Reflection panel's status line does and for the identical reason: its
   * day names have to be read in the MEMBER's timezone, and the panel is a
   * client component, so formatting there would format them in the coach's
   * zone and differently in the two render passes.
   */
  statusLine: string;
};

/**
 * Every assignment this client has, newest first, each one carrying what
 * is actually true about it.
 *
 * THREE READS, NOT ONE PER ROW. The assignments, her timezone and every
 * receipt for those assignments, and then one pure resolver per row. A
 * receipt query per assignment is the shape the Home speed build spent a
 * whole build removing.
 *
 * A FAILED RECEIPT READ IS NOT AN EMPTY ONE. `readable: false` carries
 * through to every row and resolves to 'unreadable', so a broken read
 * cannot become "they have not seen it" on a coach's screen.
 */
export async function getClientAssessmentAssignments(
  clientId: string
): Promise<AssessmentAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select(
      'id, assessment_definition_id, assigned_by, is_required, reason, due_at, status, created_at, updated_at, cancelled_at'
    )
    .eq('member_id', clientId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const [timezone, deliveries] = await Promise.all([
    memberTimezone(supabase, clientId),
    listAssignmentDeliveries(
      supabase,
      clientId,
      data.map((row) => row.id as string)
    ),
  ]);
  const memberToday = todaysLocalDate(timezone);

  return data.map((row) => ({
    id: row.id,
    assessmentDefinitionId: row.assessment_definition_id,
    assignedBy: row.assigned_by,
    isRequired: row.is_required,
    reason: row.reason,
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
    progress: resolveAssignmentProgress({
      status: row.status,
      createdAt: row.created_at,
      dueAt: row.due_at,
      cancelledAt: row.cancelled_at,
      // Migration 144's trigger stamps updated_at at the moment it closes
      // the assignment out, so on a completed row this is when she
      // finished. It is deliberately not read for any other status.
      completedAt: row.status === 'completed' ? row.updated_at : null,
      deliveredAt: deliveries.byAssignmentId.get(row.id as string)?.deliveredAt ?? null,
      memberToday,
      readable: deliveries.ok,
    }),
  })).map((assignment) => ({
    ...assignment,
    statusLine: assignmentStatusLine(assignment.progress, { timeZone: timezone }),
  }));
}

/**
 * Records that a coach assignment reached her screen.
 *
 * THE ONLY WRITE PATH INTO member_assignment_deliveries, and it exists for
 * the reason migration 210 states: an open assignment could not tell "she
 * has seen it and has not sat down to it" apart from "she has not opened
 * the app since it was sent". It is the Weekly Reflection's
 * `trackWeeklyReflectionDeliveredAction` applied to this ledger, with the
 * identical once-only claim behind it.
 *
 * NOT A COMPLETION, AND NOT AN ATTEMPT. It writes one row in one table
 * that nothing else reads as progress. `assessment_assignments` is not
 * touched, no draft is created, and migration 144's trigger remains the
 * only thing that ever moves an assignment to completed.
 *
 * THE SERVER DECIDES EVERYTHING EXCEPT WHICH ROW AND WHICH SURFACE. The
 * member comes from her own session, and the assignment is re-read through
 * her own RLS-scoped client before anything is written, so a hand-built
 * POST cannot record a receipt against another member's assignment or
 * against an id that is not an assignment at all.
 *
 * THREE REASONS IT WRITES NOTHING, and each is silent on purpose: no
 * session, the assignment is not hers (the read returns nothing under her
 * own policies), or it is no longer open. A finished or cancelled
 * assignment is not a delivery: she cannot be looking at either surface,
 * because both are drawn only while it is pending, so this can only ever
 * be a stale tab, and a receipt written there would sit against a row
 * whose real story is already told. A receipt is worth nothing to her and
 * a failure here must never reach her screen.
 */
export async function trackAssignmentDeliveredAction(
  assignmentId: unknown,
  presentation: unknown
): Promise<void> {
  if (typeof assignmentId !== 'string' || assignmentId.length === 0) return;
  if (!isAssignmentPresentation(presentation)) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from('assessment_assignments')
      .select('id, status')
      .eq('id', assignmentId)
      .eq('member_id', user.id)
      .maybeSingle();

    if (error || !data) return;
    if (data.status !== 'pending') return;

    await claimAssignmentDelivery(supabase, user.id, assignmentId, presentation);
  } catch (error) {
    console.error('trackAssignmentDeliveredAction failed', error);
  }
}

export async function assignAssessmentAction(
  clientId: string,
  assessmentKey: AssessmentKey,
  options: { isRequired: boolean; reason: string; dueAt: string; stage: string }
): Promise<ActionResult> {
  const entry = findAssessmentRegistryEntry(assessmentKey);
  if (!entry) return { error: 'Unknown assessment.' };

  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  // Idempotent: one active (pending) assignment per member per
  // questionnaire, enforced for real at the DB level by a partial unique
  // index (migration 144). Checking first means a coach who assigns
  // something already pending never sees an error, they just get the
  // existing assignment back — same "an accidental duplicate click is not
  // a failure" posture as the rest of this app's write paths.
  const { data: existing } = await supabase
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', entry.databaseId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return {};

  // is_active_coach_for RLS (migration 77) is what actually rejects an
  // assignment for a client this coach isn't assigned to — not this check.
  // A new assignment changes what `getMemberAssessmentFacts` answers, so
  // anything later in this request must not be handed the old answer.
  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: entry.databaseId,
    assigned_by: user.id,
    is_required: options.isRequired,
    reason: options.reason.trim() || null,
    due_at: options.dueAt || null,
    stage: options.stage || 'standard',
  });

  // A race with another concurrent assign click hits the partial unique
  // index (migration 144) as a 23505 conflict — treated as success, same
  // idempotent outcome as the check above finding it first.
  if (error && error.code !== '23505') return { error: error.message };
  return {};
}

export async function cancelAssessmentAssignmentAction(
  assignmentId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: cancelled, error } = await supabase
    .from('assessment_assignments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq('id', assignmentId)
    .eq('status', 'pending')
    .select('member_id')
    .maybeSingle();

  if (error) return { error: error.message };
  // Same reason as the assign path above.
  if (cancelled?.member_id) forgetMemberAssessmentFacts(cancelled.member_id as string);
  return {};
}
