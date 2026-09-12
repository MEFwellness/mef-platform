'use server';

/**
 * The Breathing Pattern Check-In's COACH side: the panel read and the
 * Assign action.
 *
 * =====================================================================
 * WHY THIS IS A SEPARATE FILE FROM app/actions/breathingCheckIn.ts.
 * =====================================================================
 *
 * Both functions below reach lib/breathing-check-in/coachView.ts, which
 * reaches lib/breathing-check-in/coachCopy.ts, which holds the name of the
 * underlying instrument, the published reference threshold and the per
 * item points. None of those may reach a member surface.
 *
 * Her taker imports the submit action, so anything in ITS module is on her
 * import graph. With one combined actions module the instrument's name was
 * two hops from her screen, and the guard that exists to prove otherwise
 * (tests/breathing-check-in-layers.test.tsx) failed on exactly that path.
 * The split is the fix, and the guard is what keeps it.
 *
 * NOTHING HERE RUNS ON A RENDER. Both functions are called because a coach
 * pressed something or opened his own client page.
 *
 * EVERY PERMISSION CHECK IS HERE AND ALSO IN THE DATABASE. The coach or
 * administrator role check below refuses early with a sentence a coach can
 * read; migration 231's own policies, and the is_active_coach_for policy on
 * assessment_assignments (migration 77), are what actually refuse a client
 * this coach is not assigned to.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { listAssignmentDeliveries } from '@/lib/assignments/data';
import {
  assignmentStatusLine,
  dueAtForLocalDate,
  dueAtInDays,
  resolveAssignmentProgress,
  type AssignmentProgress,
} from '@/lib/assignments/status';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import {
  BPC_DEFAULT_DUE_IN_DAYS,
  BPC_DEFINITION_ID,
} from '@/lib/breathing-check-in/constants';
import {
  fetchPendingBpcAssignment,
  listBpcSessions,
} from '@/lib/breathing-check-in/data';
import { buildBpcCoachReading, type BpcCoachReading } from '@/lib/breathing-check-in/coachView';

export type CoachBpcSession = {
  id: string;
  completedAt: string | null;
  contentVersion: number;
  reading: BpcCoachReading;
};

export type CoachBpcPanelState = {
  pendingAssignedAt: string | null;
  pendingProgress: AssignmentProgress | null;
  /** The server's own sentence, written in the MEMBER's timezone. */
  pendingStatusLine: string | null;
  memberId: string | null;
  /** Every finished sitting, newest first. Nothing is ever overwritten. */
  sessions: CoachBpcSession[];
};

const EMPTY_PANEL: CoachBpcPanelState = {
  pendingAssignedAt: null,
  pendingProgress: null,
  pendingStatusLine: null,
  memberId: null,
  sessions: [],
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 *
 * THE READING IS BUILT HERE, AFTER THE COACH CHECK, so the instrument's
 * name and the per item points are assembled on a request that has already
 * been established as a coach's or an administrator's.
 */
export async function getClientBreathingCheckInPanelAction(
  clientId: string
): Promise<CoachBpcPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [assignmentRead, sessionRead, timezone] = await Promise.all([
    fetchPendingBpcAssignment(supabase, clientId),
    listBpcSessions(supabase, clientId),
    memberTimezone(supabase, clientId),
  ]);

  const open = assignmentRead.assignment;
  const deliveries = await listAssignmentDeliveries(supabase, clientId, open ? [open.id] : []);

  const pendingProgress = open
    ? resolveAssignmentProgress({
        status: 'pending',
        createdAt: open.createdAt,
        dueAt: open.dueAt,
        deliveredAt: deliveries.byAssignmentId.get(open.id)?.deliveredAt ?? null,
        memberToday: todaysLocalDate(timezone),
        readable: deliveries.ok,
      })
    : null;

  return {
    pendingAssignedAt: open?.createdAt ?? null,
    pendingProgress,
    pendingStatusLine: pendingProgress
      ? assignmentStatusLine(pendingProgress, { timeZone: timezone })
      : null,
    memberId: clientId,
    sessions: sessionRead.records
      // A sitting with no stored result is one that was never finished, and
      // listBpcSessions only returns finished ones, so this is a guard
      // against a row written by a version that did not store results
      // rather than an ordinary case.
      .filter((record) => record.results !== null)
      .map((record) => ({
        id: record.id,
        completedAt: record.completedAt,
        contentVersion: record.contentVersion,
        reading: buildBpcCoachReading(record.answers, record.results!),
      })),
  };
}

export type AssignBpcResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the check-in to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system. Seven days from HER own today unless
 * the caller names a day, resolved from her timezone rather than the
 * coach's browser or the server's zone.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting,
 * with no special case here: a completed assignment has left 'pending', so
 * the partial unique index no longer covers it, and the previous sitting
 * stays exactly where it is.
 */
export async function assignBreathingCheckInAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignBpcResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const existing = await fetchPendingBpcAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure.
  if (existing.assignment) return { ok: true };

  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        BPC_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: BPC_DEFINITION_ID,
    assigned_by: user.id,
    is_required: true,
    reason: null,
    stage: 'standard',
    due_at: dueAt,
  });

  if (error && error.code !== '23505') return { ok: false, error: error.message };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}
