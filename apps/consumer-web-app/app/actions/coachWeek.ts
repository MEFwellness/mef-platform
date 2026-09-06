'use server';

/**
 * The coach's "This Week" band, assembled.
 *
 * A PURE READ, AND IT MUST STAY ONE. Nothing in this path inserts, claims,
 * upserts or schedules anything. It is reached from a page render, and the
 * standing rule is that a render only reads. Every function it calls below
 * is a listed reader; none of them is a claim, a receipt or a completion.
 *
 * IT COMPOSES, IT DOES NOT COMPUTE. Every number and every state comes
 * back from the system that already owns it:
 *
 *   check-ins            listCheckinDatesForRecap, which is the Weekly
 *                        Reflection recap's own reader over its own
 *                        window, counted by countLoggedDays, which is the
 *                        one file that owns "how many days has she logged"
 *   the reflection       getClientWeeklyReflectionStatusAction, which
 *                        writes the sentence in HER timezone
 *   programs             listAssignedWorkoutsForMember, filtered to the
 *                        window on the stored scheduled_date
 *   experiments          getClientLifestyleExperiments, which has already
 *                        applied deriveEffectiveStatus
 *   the Reset Plan       getClientResetPlanAction, whose three explicit
 *                        states are the only thing counted
 *   assignments          getClientAssessmentAssignments, which already
 *                        resolves the receipt and the due date and writes
 *                        the sentence
 *
 * ONE WEEK, AND IT IS THE RECAP'S. lib/coach-week/window.ts imports the
 * Friday helpers from lib/weekly-reflection/week.ts rather than restating
 * them, so the band and the recap cannot name different weeks.
 *
 * PROGRAM TIER ONLY, decided by hasWeeklyReflectionAccess, which is the
 * one function in this app that answers "is she on the 24 week program".
 * Any other tier gets null and the band does not render at all.
 *
 * THE VISIBILITY CHECK IS ITS OWN, not the layout's. The client route tree
 * carries a layout that already turns a seeded test account into a 404,
 * and this asks again anyway, because a server action is reachable without
 * that layout ever running.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate, localDateStringFor } from '@/lib/time/localDate';
import { countLoggedDays } from '@/lib/member-counts/checkinCounts';
import { fetchMemberAccessFacts } from '@/lib/membership/service';
import { hasWeeklyReflectionAccess } from '@/lib/weekly-reflection/access';
import { listCheckinDatesForRecap } from '@/lib/weekly-reflection/data';
import { listAssignedWorkoutsForMember } from '@/lib/coach-program-builder/assignments';
import { listAssessmentRegistryEntries } from '@/lib/assessment-registry/registry';
import { STRESS_LOAD_DEFINITION_ID } from '@/lib/stress-load/constants';
import { STRESS_LOAD_LABEL } from '@/lib/stress-load/copy';
import { thisWeekWindowFor, withinThisWeek } from '@/lib/coach-week/window';
import {
  assignmentRow,
  checkinRow,
  experimentRow,
  programRow,
  reflectionRow,
  resetPlanRow,
  type AssignmentForBand,
} from '@/lib/coach-week/rows';
import type { ThisWeekBand } from '@/lib/coach-week/types';
import { getClientWeeklyReflectionStatusAction } from './weeklyReflection';
import { getClientLifestyleExperiments } from './lifestyleExperiments';
import { getClientResetPlanAction } from './resetPlan';
import { getClientAssessmentAssignments } from './assessmentAssignments';

/**
 * The band for one client, or null when there is none to show.
 *
 * Null for three separate reasons, and all three are "do not render the
 * band" rather than "render an empty one": nobody is signed in, the viewer
 * is not staff or may not see this member, or she is not on the program
 * tier. An empty band would be a claim that there was nothing to say.
 */
export async function getClientThisWeekBandAction(clientId: string): Promise<ThisWeekBand | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();

  const isCoachOrAdmin =
    (await hasActiveRole(supabase, user.id, 'coach')) ||
    (await hasActiveRole(supabase, user.id, 'platform_administrator'));
  if (!isCoachOrAdmin) return null;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return null;

  // HER calendar day, resolved on the server from her stored timezone. The
  // whole band hangs off this one value, and none of it is decided in a
  // browser.
  const timezone = await memberTimezone(supabase, clientId);
  const localDate = todaysLocalDate(timezone);

  const facts = await fetchMemberAccessFacts(supabase, clientId);
  if (!hasWeeklyReflectionAccess(facts)) return null;

  const window = thisWeekWindowFor(localDate);

  const [checkinDates, reflectionStatus, workouts, experiments, resetPlan, assignments] =
    await Promise.all([
      listCheckinDatesForRecap(supabase, clientId, window.weekStart),
      getClientWeeklyReflectionStatusAction(clientId),
      listAssignedWorkoutsForMember(supabase, clientId),
      getClientLifestyleExperiments(clientId),
      getClientResetPlanAction(clientId),
      getClientAssessmentAssignments(clientId),
    ]);

  // The recap's reader already applied the window at the query, so this is
  // the same set of dates the recap counted. countLoggedDays is what turns
  // rows into days, in the one place that owns it.
  const checkinCount = countLoggedDays(checkinDates.map((local_date) => ({ local_date })));

  const workoutsInWindow = workouts.filter((workout) =>
    withinThisWeek(workout.scheduled_date, window)
  );

  // Running and expired experiments are shown whatever week they started
  // in, because both are open questions today. A closed one is shown only
  // when it closed inside the window, which is what makes it news.
  const experimentsForBand = experiments.filter((experiment) => {
    if (experiment.status === 'active' || experiment.status === 'expired_no_reflection') return true;
    if (!experiment.closedAt) return false;
    return withinThisWeek(localDateStringFor(experiment.closedAt, timezone), window);
  });

  // The registry names every assessment a member can be sent EXCEPT the
  // Stress & Load Deep-Dive, which is coach assigned only and has no
  // registry entry on purpose. It shares the assignment ledger with the
  // rest, so without this line its row on the band reads "Assessment" and
  // a coach cannot tell which of two open assignments is late.
  const nameByDefinitionId = new Map<string, string>([
    ...listAssessmentRegistryEntries().map(
      (entry) => [entry.databaseId, entry.displayName] as const
    ),
    [STRESS_LOAD_DEFINITION_ID, STRESS_LOAD_LABEL],
  ]);
  const toBandAssignment = (assignment: (typeof assignments)[number]): AssignmentForBand => ({
    id: assignment.id,
    name: nameByDefinitionId.get(assignment.assessmentDefinitionId) ?? 'Assessment',
    statusLine: assignment.statusLine,
    open: assignment.status === 'pending',
    overdue: assignment.progress.due.isOverdue,
  });

  const open = assignments.filter((a) => a.status === 'pending').map(toBandAssignment);
  const closedInWindow = assignments
    .filter((a) => {
      if (a.status === 'pending') return false;
      const at = a.progress.delivery.kind === 'completed' || a.progress.delivery.kind === 'cancelled'
        ? a.progress.delivery.at
        : null;
      if (!at) return false;
      return withinThisWeek(localDateStringFor(at, timezone), window);
    })
    .map(toBandAssignment);

  return {
    window,
    rows: [
      checkinRow(checkinCount),
      reflectionRow(reflectionStatus?.line ?? null),
      programRow(workoutsInWindow),
      experimentRow(experimentsForBand),
      resetPlanRow(
        resetPlan
          ? { startLocalDate: resetPlan.plan.startLocalDate, logs: resetPlan.logs }
          : null
      ),
      assignmentRow({ open, closedInWindow }),
    ],
  };
}
