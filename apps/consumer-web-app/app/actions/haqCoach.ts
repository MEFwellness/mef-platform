'use server';

/**
 * The Health Appraisal's COACH side, ASSIGN ONLY.
 *
 * THE READING LIVES IN app/actions/haqCoachReading.ts, and the split is not
 * tidiness. The coach's Assessment Status block is a client component and it
 * imports the shared row-assign action, which imports this module: with the
 * reading in here, the totals and the hidden values would be on a client
 * component's import graph, which is exactly what
 * tests/haq-member-safety.test.ts exists to refuse. It caught it.
 *
 * A SEPARATE FILE FROM app/actions/haq.ts on purpose, the reason
 * app/actions/breathingCheckInCoach.ts gives: the member's screen imports
 * that module, so anything placed in it is on her import graph, and the
 * coach's reading will need the numbers she must never reach.
 *
 * EVERY PERMISSION CHECK IS HERE AND ALSO IN THE DATABASE. The role check
 * refuses early with a sentence a coach can read; the is_active_coach_for
 * policy on assessment_assignments (migration 77) is what actually refuses a
 * client this coach is not assigned to.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { dueAtForLocalDate, dueAtInDays } from '@/lib/assignments/status';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { HAQ_DEFAULT_DUE_IN_DAYS, HAQ_DEFINITION_ID } from '@/lib/haq/constants';
import { fetchPendingHaqAssignment } from '@/lib/haq/data';

export type AssignHaqResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the Health Appraisal to one client, in the existing
 * assessment_assignments ledger. Seven days from HER own today unless a day
 * is named. An open assignment already there is success, not a duplicate.
 *
 * Sending it again after she finished is a new assignment, and her next
 * Begin opens a new instance; the finished one is never touched.
 */
export async function assignHaqAction(clientId: string, options?: { dueDate?: string }): Promise<AssignHaqResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return { ok: false, error: 'Not allowed.' };

  const existing = await fetchPendingHaqAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  if (existing.value) return { ok: true };

  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(todaysLocalDate(await memberTimezone(supabase, clientId)), HAQ_DEFAULT_DUE_IN_DAYS);

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: HAQ_DEFINITION_ID,
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
