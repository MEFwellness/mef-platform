/**
 * apps/consumer-web-app/app/actions/rootPopupMessages.ts
 *
 * Root's pop-up messages — proactive Root coaching messages that expect a
 * response or acknowledgment, surfaced as a modal right after login
 * instead of only sitting as a card. Today these are the Core Values
 * Snapshot and Life Signal Check Weekly Experiment day-3/day-7 follow-ups
 * (components/core-values-snapshot/CvsFollowUpCards.tsx), plus each
 * experience's "start it later" offer (CvsExperimentPanel.tsx /
 * LscExperimentPanel.tsx via components/dashboard/ActiveExperimentsSection.tsx) —
 * everything here is written so a future message of the same shape (a
 * real answer/acknowledge/act affordance, not just an observation) only
 * needs a new case in getMyRootPopupMessageAction, not a new
 * dismissal/eligibility system.
 *
 * The offer message pops up at most once ever, unlike day3/day7 (which
 * keep returning on every new login until answered or explicitly
 * ignored) — see getMyRootPopupMessageAction's offer branch. The
 * dashboard card is the permanent, unlimited home for starting the
 * experiment either way; the pop-up is just a one-time spotlight on it.
 *
 * No parallel data store for "is there a message" — this thinly wraps the
 * existing getMyCvsExperimentStatusAction/getMyLscExperimentStatusAction
 * (plus getMyCvsOfferAction/getMyLscOfferAction for the offer case) and
 * the shared resolveCvsCheckinPending rule
 * (lib/core-values-snapshot/experiment.ts), same discipline as every other
 * file in app/actions. When more than one of a member's messages (across
 * both experiences, and now including each experience's own offer) are
 * pending at once, Core Values Snapshot (the older experience) wins the
 * pop-up slot first, and within an experience day 3 beats day 7 beats the
 * offer — the loser simply waits as its own dashboard card until the
 * winner is resolved, same "one at a time" rule already used between day
 * 3 and day 7 within a single experience.
 */

'use server';

import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { getMyCvsExperimentStatusAction, getMyCvsOfferAction } from './coreValuesSnapshot';
import { getMyLscExperimentStatusAction, getMyLscOfferAction } from './lifeSignalCheck';
import { getMyRplExperimentStatusAction, getMyRplOfferAction } from './readinessPulse';
import { getMyResetPlanDashboardStateAction } from './resetPlan';
import { getMyPendingQuestionnaireAssignments } from './assessmentAssignments';
import { resolveCvsCheckinPending, type CvsDailyLogRow } from '@/lib/core-values-snapshot/experiment';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';
import type { LscScoring } from '@/lib/life-signal-check/types';
import type { RplScoring } from '@/lib/readiness-pulse/types';
import type { Signal } from '@/lib/life-signal-check/constants';
import type { ResetPlanDailyLog } from '@/lib/reset-plan/types';
import {
  cvsPopupMessageKey,
  lscPopupMessageKey,
  rplPopupMessageKey,
  resetPlanPopupMessageKey,
  questionnaireAssignedPopupMessageKey,
  getRootPopupDismissal,
  ignoreRootPopupMessage,
  isOfferPopupDue,
  isRootPopupDueThisLogin,
  pickFirstDueOneTimeMessage,
  snoozeRootPopupMessage,
  type RootPopupDismissalStatus,
} from '@/lib/root-popup-messages/data';
import { fetchGoalCallbackContext } from '@/lib/memory-callback/data';
import { buildGoalCallback } from '@/lib/memory-callback/copy';

export type RootPopupMessage =
  | { kind: 'cvs_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'cvs_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      /** Root Presence System, requirement 4 — her real stated goal, when one exists, for the day-7 message to honestly reference. */
      goalCallback: string | null;
    }
  | { kind: 'cvs_offer'; messageKey: string; sessionId: string; scoring: CvsScoring }
  | { kind: 'lsc_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'lsc_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      goalCallback: string | null;
    }
  | { kind: 'lsc_offer'; messageKey: string; sessionId: string; scoring: LscScoring }
  | { kind: 'rpl_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'rpl_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      goalCallback: string | null;
    }
  | { kind: 'rpl_offer'; messageKey: string; sessionId: string; scoring: RplScoring }
  | { kind: 'reset_plan_day3'; messageKey: string; planId: string; focusSignal: Signal }
  | { kind: 'reset_plan_day7'; messageKey: string; planId: string; focusSignal: Signal; logs: ResetPlanDailyLog[] }
  | {
      kind: 'questionnaire_assigned';
      messageKey: string;
      assignmentId: string;
      displayName: string;
      primaryHref: string;
    };

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/** The one Root message (if any) currently pending a response/acknowledgment/action, regardless of whether it's due to pop up this login. Used both to decide the pop-up and to badge the underlying card as high priority once snoozed. Core Values Snapshot is checked before Life Signal Check (oldest experience first); within either, day 3 wins over day 7, and day 7 wins over that experience's own start-it-later offer (offer can only exist when no experiment is running yet, so it's never actually competing with day 3/7 for the same experience — this ordering only matters across the two experiences). */
async function findMyPendingRootPopupMessage(): Promise<RootPopupMessage | null> {
  // Real bug found while building the Personal Reset Plan's own day-3/
  // day-7 pop-up case: once any experience's one-time "start it later"
  // offer had been shown once (and dismissed via the auto-ignore-on-mount
  // effect in RootMessagePopupClient), getMyCvsOfferAction/etc kept
  // returning that same real, eligible offer object forever (a completed
  // session with no active experiment is a permanent condition, not a
  // one-time one) — and this function used to return the very first
  // eligible offer it found with no dismissal check of its own, trusting
  // getMyRootPopupMessageAction's single outer isOfferPopupDue check to
  // filter it. That works for the FIRST experience checked, but once that
  // one offer turns out to already be dismissed, the whole call returns
  // null instead of ever falling through to check Life Signal Check,
  // Readiness Pulse, or (the case that surfaced this) the Personal Reset
  // Plan's own pending day-3/day-7 message — a member who had ever simply
  // declined the Core Values Snapshot Weekly Experiment could never again
  // see ANY later pop-up, of any kind, for the rest of their membership.
  // Fixed by checking each offer's own dismissal right here and
  // continuing to the next experience when it's already been shown,
  // exactly the same "skip past what's already resolved" discipline
  // resolveCvsCheckinPending already applies to day3-vs-day7.
  const memberId = await requireMemberId();
  const supabase = memberId ? createClient() : null;

  async function isOfferStillDue(messageKey: string): Promise<boolean> {
    if (!memberId || !supabase) return true;
    const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
    return isOfferPopupDue(dismissal);
  }

  /** Root Presence System, requirement 4 — fetched lazily, only when a day-7 message is actually about to be returned, so every other call to this function pays no extra query. */
  async function goalCallbackForDay7(): Promise<string | null> {
    if (!memberId || !supabase) return null;
    return buildGoalCallback(await fetchGoalCallbackContext(supabase, memberId));
  }

  // Coach-assigned questionnaire (Assignment-Gated Questionnaires task) —
  // checked first, ahead of every self-serve Root message below: a coach's
  // direct action for this member takes priority over Root's own day3/
  // day7/offer messages. Uses pickFirstDueOneTimeMessage (lib/root-popup-
  // messages/data.ts) for the exact same guarded "check due-ness, then
  // fall through to the next candidate" discipline as every offer branch
  // below — see that helper's own doc comment and
  // tests/root-popup-messages.test.ts for the regression coverage proving
  // a dismissed earlier assignment can never suppress a later, still-due
  // one (the real starvation bug this function's header comment
  // describes). A member can have more than one pending assignment;
  // oldest-assigned-and-still-undismissed wins.
  const pendingAssignments = await getMyPendingQuestionnaireAssignments();
  const candidates = pendingAssignments.map((assignment) => ({
    ...assignment,
    messageKey: questionnaireAssignedPopupMessageKey(assignment.assignmentId),
  }));
  console.error('TEMP_DEBUG waterfall candidates', candidates);
  for (const c of candidates) {
    console.error('TEMP_DEBUG isOfferStillDue check', c.messageKey, await isOfferStillDue(c.messageKey));
  }
  const dueAssignment = await pickFirstDueOneTimeMessage(candidates, isOfferStillDue);
  console.error('TEMP_DEBUG dueAssignment result', dueAssignment);
  if (dueAssignment) {
    return {
      kind: 'questionnaire_assigned',
      messageKey: dueAssignment.messageKey,
      assignmentId: dueAssignment.assignmentId,
      displayName: dueAssignment.displayName,
      primaryHref: dueAssignment.primaryHref,
    };
  }

  const cvsStatus = await getMyCvsExperimentStatusAction();
  // Real bug fixed alongside the same one in
  // components/dashboard/ActiveExperimentsSection.tsx: getMyCvsExperimentStatusAction/
  // getMyLscExperimentStatusAction return the member's most recent
  // experiment no matter how long ago it wrapped up (completed/abandoned/
  // expired and acknowledged), so `cvsStatus`/`lscStatus` stay truthy
  // forever once a single experiment has ever existed. That silently
  // skipped the offer check below (an `else` branch that could then never
  // run), which is why the one-time "start it later" pop-up never fired
  // for a member who had any prior experiment history at all, including
  // simply declining a fresh session after an earlier one had finished.
  // Fix: only treat a still-'active' experiment as blocking the offer.
  const cvsPending = cvsStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: cvsStatus.isDay3Eligible,
        day3Answered: cvsStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: cvsStatus.isDay7Eligible,
        day7Acknowledged: cvsStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (cvsPending === 'day3') {
    return {
      kind: 'cvs_day3',
      messageKey: cvsPopupMessageKey('day3', cvsStatus!.experiment.id),
      experimentId: cvsStatus!.experiment.id,
      topLabelText: cvsStatus!.experiment.title,
    };
  }
  if (cvsPending === 'day7') {
    return {
      kind: 'cvs_day7',
      messageKey: cvsPopupMessageKey('day7', cvsStatus!.experiment.id),
      experimentId: cvsStatus!.experiment.id,
      topLabelText: cvsStatus!.experiment.title,
      logs: cvsStatus!.logs,
      durationDays: cvsStatus!.experiment.durationDays,
      goalCallback: await goalCallbackForDay7(),
    };
  }
  if (!cvsStatus || cvsStatus.experiment.status !== 'active') {
    const offer = await getMyCvsOfferAction();
    if (offer) {
      const messageKey = cvsPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'cvs_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  const lscStatus = await getMyLscExperimentStatusAction();
  const lscPending = lscStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: lscStatus.isDay3Eligible,
        day3Answered: lscStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: lscStatus.isDay7Eligible,
        day7Acknowledged: lscStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (lscPending === 'day3') {
    return {
      kind: 'lsc_day3',
      messageKey: lscPopupMessageKey('day3', lscStatus!.experiment.id),
      experimentId: lscStatus!.experiment.id,
      topLabelText: lscStatus!.experiment.title,
    };
  }
  if (lscPending === 'day7') {
    return {
      kind: 'lsc_day7',
      messageKey: lscPopupMessageKey('day7', lscStatus!.experiment.id),
      experimentId: lscStatus!.experiment.id,
      topLabelText: lscStatus!.experiment.title,
      logs: lscStatus!.logs,
      durationDays: lscStatus!.experiment.durationDays,
      goalCallback: await goalCallbackForDay7(),
    };
  }
  if (!lscStatus || lscStatus.experiment.status !== 'active') {
    const offer = await getMyLscOfferAction();
    if (offer) {
      const messageKey = lscPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'lsc_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  const rplStatus = await getMyRplExperimentStatusAction();
  const rplPending = rplStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: rplStatus.isDay3Eligible,
        day3Answered: rplStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: rplStatus.isDay7Eligible,
        day7Acknowledged: rplStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (rplPending === 'day3') {
    return {
      kind: 'rpl_day3',
      messageKey: rplPopupMessageKey('day3', rplStatus!.experiment.id),
      experimentId: rplStatus!.experiment.id,
      topLabelText: rplStatus!.experiment.title,
    };
  }
  if (rplPending === 'day7') {
    return {
      kind: 'rpl_day7',
      messageKey: rplPopupMessageKey('day7', rplStatus!.experiment.id),
      experimentId: rplStatus!.experiment.id,
      topLabelText: rplStatus!.experiment.title,
      logs: rplStatus!.logs,
      durationDays: rplStatus!.experiment.durationDays,
      goalCallback: await goalCallbackForDay7(),
    };
  }
  if (!rplStatus || rplStatus.experiment.status !== 'active') {
    const offer = await getMyRplOfferAction();
    if (offer) {
      const messageKey = rplPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'rpl_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  // Personal Reset Plan — day-3 before day-7, same as every experience
  // above, but no offer case: the plan's own dashboard card (not a
  // one-time pop-up) is its only "start it" surface, per the build brief.
  const resetPlanState = await getMyResetPlanDashboardStateAction();
  if (resetPlanState.kind === 'active' && resetPlanState.plan.focusSignal) {
    if (resetPlanState.isDay3Eligible && !resetPlanState.day3Answered) {
      return {
        kind: 'reset_plan_day3',
        messageKey: resetPlanPopupMessageKey('day3', resetPlanState.plan.id),
        planId: resetPlanState.plan.id,
        focusSignal: resetPlanState.plan.focusSignal,
      };
    }
    if (resetPlanState.isDay7Eligible && !resetPlanState.day7Acknowledged) {
      return {
        kind: 'reset_plan_day7',
        messageKey: resetPlanPopupMessageKey('day7', resetPlanState.plan.id),
        planId: resetPlanState.plan.id,
        focusSignal: resetPlanState.plan.focusSignal,
        logs: resetPlanState.logs,
      };
    }
  }

  return null;
}

/** The dismissal state (if any) for a specific message key — used by the dashboard card to decide whether to show the "waiting on you" badge once a member has snoozed the pop-up. */
export async function getMyRootPopupDismissalAction(
  messageKey: string
): Promise<{ status: RootPopupDismissalStatus } | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
  return dismissal ? { status: dismissal.status } : null;
}

/**
 * The message (if any) that should interrupt this member as a pop-up on
 * this login. Oldest unhandled message first (Core Values Snapshot before
 * Life Signal Check, and within each, resolveCvsCheckinPending already
 * checks day 3 before day 7), one at a time — a second pending message,
 * if one ever exists, simply waits its turn as a card until this one is
 * resolved. Never returns a message for an 'ignored' dismissal, and only
 * returns a 'snoozed' one once a real login has happened since the snooze.
 *
 * The two offer kinds (cvs_offer/lsc_offer) are the one exception to that
 * "snoozed comes back next login" rule: they pop up at most once, ever.
 * RootMessagePopupClient marks the offer dismissed (status 'ignored') the
 * moment it's shown, so any dismissal row at all — not just an
 * 'ignored' one — permanently retires the pop-up for that offer. The
 * member always still has the dashboard card as an unlimited, un-timed
 * way to start it later.
 */
export async function getMyRootPopupMessageAction(): Promise<RootPopupMessage | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const message = await findMyPendingRootPopupMessage();
  if (!message) return null;

  const supabase = createClient();
  const dismissal = await getRootPopupDismissal(supabase, user.id, message.messageKey);

  if (
    message.kind === 'cvs_offer' ||
    message.kind === 'lsc_offer' ||
    message.kind === 'rpl_offer' ||
    message.kind === 'questionnaire_assigned'
  ) {
    return isOfferPopupDue(dismissal) ? message : null;
  }

  const due = isRootPopupDueThisLogin(dismissal, user.last_sign_in_at ?? null);
  return due ? message : null;
}

export async function snoozeRootPopupMessageAction(messageKey: string): Promise<{ ok: boolean }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false };

  const supabase = createClient();
  const ok = await snoozeRootPopupMessage(supabase, memberId, messageKey);
  return { ok };
}

export async function ignoreRootPopupMessageAction(messageKey: string): Promise<{ ok: boolean }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false };

  const supabase = createClient();
  const ok = await ignoreRootPopupMessage(supabase, memberId, messageKey);
  return { ok };
}
