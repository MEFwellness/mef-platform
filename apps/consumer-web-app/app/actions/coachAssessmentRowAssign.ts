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
import { listAssignableTemplates } from '@/lib/assignments/assignableCatalog';
import { assignAssessmentAction } from './assessmentAssignments';
import { assignStressLoadDeepDiveAction } from './stressLoad';
import { assignOwningYourValueAction } from './owningYourValue';
import { assignWhereYourJoyLivesAction } from './whereYourJoyLives';
import { assignTheGivingLedgerAction } from './theGivingLedger';
import { assignTheWeightOfYesAction } from './theWeightOfYes';
import { assignBeingSeenAction } from './beingSeen';
import { assignWhatYouPutDownAction } from './whatYouPutDown';
import { assignYourOwnCompanyAction } from './yourOwnCompany';
import { assignTheLifeYoureBuildingAction } from './theLifeYoureBuilding';

export type AssignRowResult = { ok: true } | { ok: false; error: string };

/** Each deep-dive's own action, by the row id lib/assignments/assignableCatalog.ts gives it. */
const OWN_ACTION_BY_ROW_ID: Record<
  string,
  (clientId: string, options?: { dueDate?: string }) => Promise<{ ok: boolean; error?: string }>
> = {
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
