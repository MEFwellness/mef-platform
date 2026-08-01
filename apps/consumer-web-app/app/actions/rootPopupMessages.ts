/**
 * apps/consumer-web-app/app/actions/rootPopupMessages.ts
 *
 * Root's pop-up messages — proactive Root coaching messages that expect a
 * response or acknowledgment, surfaced as a modal right after login
 * instead of only sitting as a card. Today these are the Core Values
 * Snapshot and Life Signal Check Weekly Experiment day-3/day-7 follow-ups
 * (components/core-values-snapshot/CvsFollowUpCards.tsx); everything here
 * is written so a future message of the same shape (a real
 * answer/acknowledge affordance, not just an observation) only needs a
 * new case in getMyRootPopupMessageAction, not a new dismissal/eligibility
 * system.
 *
 * No parallel data store for "is there a message" — this thinly wraps the
 * existing getMyCvsExperimentStatusAction/getMyLscExperimentStatusAction
 * and the shared resolveCvsCheckinPending rule
 * (lib/core-values-snapshot/experiment.ts), same discipline as every other
 * file in app/actions. When both a Core Values Snapshot and a Life Signal
 * Check follow-up are pending at once, Core Values Snapshot (the older
 * experience) wins the pop-up slot first — the loser simply waits as its
 * own dashboard card until the winner is resolved, same "one at a time"
 * rule already used between day 3 and day 7 within a single experience.
 */

'use server';

import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { getMyCvsExperimentStatusAction } from './coreValuesSnapshot';
import { getMyLscExperimentStatusAction } from './lifeSignalCheck';
import { resolveCvsCheckinPending, type CvsDailyLogRow } from '@/lib/core-values-snapshot/experiment';
import {
  cvsPopupMessageKey,
  lscPopupMessageKey,
  getRootPopupDismissal,
  ignoreRootPopupMessage,
  isRootPopupDueThisLogin,
  snoozeRootPopupMessage,
  type RootPopupDismissalStatus,
} from '@/lib/root-popup-messages/data';

export type RootPopupMessage =
  | { kind: 'cvs_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'cvs_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
    }
  | { kind: 'lsc_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'lsc_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
    };

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/** The one Root message (if any) currently pending a response/acknowledgment, regardless of whether it's due to pop up this login. Used both to decide the pop-up and to badge the underlying card as high priority once snoozed. Core Values Snapshot is checked before Life Signal Check (oldest experience first); day 3 always wins over day 7 within either. */
async function findMyPendingRootPopupMessage(): Promise<RootPopupMessage | null> {
  const cvsStatus = await getMyCvsExperimentStatusAction();
  if (cvsStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: cvsStatus.isDay3Eligible,
      day3Answered: cvsStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: cvsStatus.isDay7Eligible,
      day7Acknowledged: cvsStatus.experiment.day7AcknowledgedAt !== null,
    });
    if (pending === 'day3') {
      return {
        kind: 'cvs_day3',
        messageKey: cvsPopupMessageKey('day3', cvsStatus.experiment.id),
        experimentId: cvsStatus.experiment.id,
        topLabelText: cvsStatus.experiment.title,
      };
    }
    if (pending === 'day7') {
      return {
        kind: 'cvs_day7',
        messageKey: cvsPopupMessageKey('day7', cvsStatus.experiment.id),
        experimentId: cvsStatus.experiment.id,
        topLabelText: cvsStatus.experiment.title,
        logs: cvsStatus.logs,
        durationDays: cvsStatus.experiment.durationDays,
      };
    }
  }

  const lscStatus = await getMyLscExperimentStatusAction();
  if (lscStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: lscStatus.isDay3Eligible,
      day3Answered: lscStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: lscStatus.isDay7Eligible,
      day7Acknowledged: lscStatus.experiment.day7AcknowledgedAt !== null,
    });
    if (pending === 'day3') {
      return {
        kind: 'lsc_day3',
        messageKey: lscPopupMessageKey('day3', lscStatus.experiment.id),
        experimentId: lscStatus.experiment.id,
        topLabelText: lscStatus.experiment.title,
      };
    }
    if (pending === 'day7') {
      return {
        kind: 'lsc_day7',
        messageKey: lscPopupMessageKey('day7', lscStatus.experiment.id),
        experimentId: lscStatus.experiment.id,
        topLabelText: lscStatus.experiment.title,
        logs: lscStatus.logs,
        durationDays: lscStatus.experiment.durationDays,
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
 */
export async function getMyRootPopupMessageAction(): Promise<RootPopupMessage | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const message = await findMyPendingRootPopupMessage();
  if (!message) return null;

  const supabase = createClient();
  const dismissal = await getRootPopupDismissal(supabase, user.id, message.messageKey);
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
