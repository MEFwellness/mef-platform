'use server';

/**
 * The one entry point behind the inline Assign button on an assessment row.
 *
 * IT IS A DISPATCHER, NOT A SECOND WRITE PATH. Two kinds of assessment
 * land in the same `assessment_assignments` ledger and each already has
 * exactly one function that writes it: `assignAssessmentAction` for the
 * registry's questionnaires, and the nine `assign...Action` functions for
 * the coach-assigned deep-dives, each with its own default due date and
 * its own idempotent duplicate-click behaviour. This calls those. It
 * inserts nothing itself, it invents no default, and it does not know what
 * a due date means. Deleting it would remove a button, not a capability.
 *
 * WHY IT EXISTS AT ALL. The rows now sit in one list, so one button has to
 * be able to send any of them, and a client component picking between ten
 * imported server actions by a string is the same dispatch written in the
 * place that can be lied to. Here, an unknown row id is refused before
 * anything is read.
 *
 * THE SERVER REFUSES WHAT THE FORM DOES NOT OFFER. A deep-dive is always
 * required and stores no reason, and its own action has no argument for
 * either, so a hand-made POST carrying them changes nothing: the values
 * are dropped here rather than quietly written somewhere. The inline form
 * draws its fields from the same capability table
 * (lib/coach-detail/assessmentStatus.ts), so what a coach can type and
 * what the ledger can hold are one decision.
 *
 * EVERY PERMISSION CHECK IS STILL DOWNSTREAM. The coach or admin role
 * check, and the `is_active_coach_for` RLS policy that actually rejects an
 * assignment for a client this coach is not assigned to, live in the
 * actions this calls, exactly as they did when their own cards called
 * them.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { listAssignableTemplates } from '@/lib/assignments/assignableCatalog';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { dueAtForLocalDate, dueAtInDays } from '@/lib/assignments/status';
import { RESEND_DEFAULT_DUE_IN_DAYS } from '@/lib/coach-assign/constants';
import { assignAssessmentAction } from './assessmentAssignments';
import { assignStressLoadDeepDiveAction } from './stressLoad';
import { assignBodySystemsSurveyAction } from './bodySystems';
import { assignWholeBodySignalAction } from './wholeBodySignal';
import { assignHealthIntakeAction } from './healthIntake';
import { assignOwningYourValueAction } from './owningYourValue';
import { assignWhereYourJoyLivesAction } from './whereYourJoyLives';
import { assignTheGivingLedgerAction } from './theGivingLedger';
import { assignTheWeightOfYesAction } from './theWeightOfYes';
import { assignBeingSeenAction } from './beingSeen';
import { assignWhatYouPutDownAction } from './whatYouPutDown';
import { assignYourOwnCompanyAction } from './yourOwnCompany';
import { assignTheLifeYoureBuildingAction } from './theLifeYoureBuilding';

export type AssignRowResult = { ok: true } | { ok: false; error: string };

/** Each coach-assigned experience's own action, by the row id lib/assignments/assignableCatalog.ts gives it. */
const OWN_ACTION_BY_ROW_ID: Record<
  string,
  (clientId: string, options?: { dueDate?: string }) => Promise<{ ok: boolean; error?: string }>
> = {
  'body-systems-survey': assignBodySystemsSurveyAction,
  'whole-body-signal': assignWholeBodySignalAction,
  'health-lifestyle-intake': assignHealthIntakeAction,
  'stress-load-deep-dive': assignStressLoadDeepDiveAction,
  'owning-your-value': assignOwningYourValueAction,
  'where-your-joy-lives': assignWhereYourJoyLivesAction,
  'the-giving-ledger': assignTheGivingLedgerAction,
  'the-weight-of-yes': assignTheWeightOfYesAction,
  'being-seen': assignBeingSeenAction,
  'what-you-put-down': assignWhatYouPutDownAction,
  'your-own-company': assignYourOwnCompanyAction,
  'the-life-youre-building': assignTheLifeYoureBuildingAction,
};

/** A bare calendar day or nothing. Anything else is dropped rather than passed on as a guess. */
function calendarDay(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export async function assignAssessmentRowAction(
  clientId: unknown,
  rowId: unknown,
  options: { isRequired?: unknown; reason?: unknown; dueDate?: unknown }
): Promise<AssignRowResult> {
  if (typeof clientId !== 'string' || clientId.length === 0)
    return { ok: false, error: 'Unknown client.' };
  if (typeof rowId !== 'string' || rowId.length === 0)
    return { ok: false, error: 'Unknown assessment.' };

  const template = listAssignableTemplates().find((row) => row.id === rowId);
  if (!template) return { ok: false, error: 'That assessment cannot be sent from here.' };

  const dueDate = calendarDay(options.dueDate);

  if (template.assignKey === null) {
    const send = OWN_ACTION_BY_ROW_ID[rowId];
    if (!send) return { ok: false, error: 'That assessment cannot be sent from here.' };
    // Neither a reason nor a Required flag is passed on, because the row
    // cannot hold either: a deep-dive is written as required with no
    // reason by its own action, and the form draws no field for them.
    const result = await send(clientId, dueDate ? { dueDate } : undefined);
    if (!result.ok) return { ok: false, error: result.error ?? 'That could not be sent.' };
    revalidatePath(`/coach/clients/${clientId}/detail`);
    return { ok: true };
  }

  const result = await assignAssessmentAction(clientId, template.assignKey, {
    isRequired: options.isRequired !== false,
    reason: typeof options.reason === 'string' ? options.reason : '',
    dueAt: dueDate,
    stage: 'standard',
  });
  if (result.error) return { ok: false, error: result.error };
  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}


/**
 * Sending again something this client is already sitting on.
 *
 * WHY IT IS NOT THE ASSIGN PATH. A client may never hold two open copies
 * of one instrument: migration 144's partial unique index makes a second
 * pending row impossible, and every assign action above therefore treats
 * "one is already open" as success and writes nothing. That is the right
 * answer to an accidental double click and the wrong answer to a coach who
 * deliberately pressed Resend, who would be told it worked while nothing
 * moved. This moves the open row's due date instead, which is the only
 * thing a resend can honestly change.
 *
 * IT CREATES NOTHING WHEN NOTHING IS OPEN. A page held open while the
 * client finished would otherwise resend into a row that is no longer
 * pending. Finding none, this hands straight back to the ordinary assign
 * path, which writes the new cycle the coach was asking for. So a stale
 * screen produces the outcome the coach intended rather than a silent
 * no-op or an error about a state they could not have known about.
 *
 * ONLY THE INSTRUMENTS THE SCREEN OFFERS IT FOR. `allowsReassign` decides
 * which rows draw the control, and it decides here too, so a hand made
 * POST cannot move a due date on something the screen does not offer it
 * for.
 *
 * THE PERMISSION CHECK THAT MATTERS IS STILL THE DATABASE'S. The role
 * check below refuses early with a sentence a coach can read; the
 * is_active_coach_for update policy on assessment_assignments (migration
 * 77) is what actually refuses a client this coach is not assigned to, and
 * it is unchanged.
 */
export async function resendAssessmentRowAction(
  clientId: unknown,
  rowId: unknown,
  options: { dueDate?: unknown }
): Promise<AssignRowResult> {
  if (typeof clientId !== 'string' || clientId.length === 0)
    return { ok: false, error: 'Unknown client.' };
  if (typeof rowId !== 'string' || rowId.length === 0)
    return { ok: false, error: 'Unknown assessment.' };

  const template = listAssignableTemplates().find((row) => row.id === rowId);
  if (!template) return { ok: false, error: 'That assessment cannot be sent from here.' };
  if (!template.allowsReassign)
    return { ok: false, error: 'That assessment cannot be sent again from here.' };

  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return { ok: false, error: 'Not allowed.' };

  const { data: open, error: readError } = await supabase
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', template.definitionId)
    .eq('status', 'pending')
    .maybeSingle();

  if (readError) return { ok: false, error: 'Could not read the assignments for this client.' };

  // Nothing open any more. The coach asked for it to be sent, so send it.
  const dueDate = calendarDay(options.dueDate);
  if (!open) {
    return assignAssessmentRowAction(clientId, rowId, { dueDate });
  }

  /*
    THE DUE WINDOW IS RESET FROM HER OWN TODAY, never from the server's.
    A coach in California pressing this at 6pm is already on tomorrow in
    UTC, and a deadline that quietly lost a day is the exact class of bug
    lib/time/memberToday.ts exists to end.
  */
  const dueAt = dueDate
    ? dueAtForLocalDate(dueDate)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        RESEND_DEFAULT_DUE_IN_DAYS
      );

  const { data: moved, error } = await supabase
    .from('assessment_assignments')
    .update({ due_at: dueAt, updated_at: new Date().toISOString() })
    .eq('id', open.id as string)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  // "NO ERROR" IS NOT "IT WORKED": an update matching no row under RLS
  // returns nothing and no error, so the row is read back rather than
  // assumed.
  if (!moved) return { ok: false, error: 'That could not be resent.' };

  forgetMemberAssessmentFacts(clientId);
  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}
