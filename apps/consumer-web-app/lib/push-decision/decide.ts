/**
 * IS THERE GENUINELY SOMETHING WAITING, AND MAY IT BE SENT.
 *
 * The whole of the daily job's judgment, as pure functions of facts the
 * caller has already gathered. No database, no clock, no timezone, no
 * network. lib/push-decision/service.ts does the gathering and the
 * sending; every decision below can be proved on a table of inputs.
 *
 * THE ITEM IS NEVER CHOSEN HERE. Which one thing matters today is the
 * Priority Card's decision and only the Priority Card's decision, taken
 * by lib/priority/service.ts's buildPriorityView, the same call Home and
 * Today make. This file is handed that verdict and answers a different,
 * smaller question: is that verdict worth a phone buzzing.
 *
 * THREE RUNGS ARE NEVER WORTH IT, AND EACH FOR ITS OWN REASON.
 *
 *   'gentle_focus'  is the fallback for a member who has ALREADY done
 *                   today's Daily Reset and has nothing else outstanding.
 *                   It is the card's way of having something kind to say
 *                   on a finished day. There is nothing waiting, so
 *                   nothing is sent. This is the "if nothing is pending,
 *                   send nothing" case, and it is a rung rather than an
 *                   absence because the card always shows something.
 *
 *   'safety'        is the card telling her that nothing at all is being
 *                   asked of her today, because she raised something a
 *                   human is now looking at. Pushing that to a lock
 *                   screen would be interrupting her to say she is not
 *                   being interrupted, and worse, it would put a
 *                   notification about a disclosure on a screen anyone
 *                   near her can read. Root stays quiet.
 *
 *   'daily_reset' once today's check-in exists
 *                   is the safety recheck. The stored row is
 *                   authoritative for the day and legitimately still says
 *                   'daily_reset' after she has checked in (the single
 *                   permitted revision may already have been spent), so
 *                   "the card says Daily Reset" is not the same fact as
 *                   "the Daily Reset is undone". The second fact is the
 *                   one that decides.
 *
 * A DONE OR SAVED STATUS ENDS IT TOO. Both are her own decision about
 * today's card, recorded on today's row, and neither is something to be
 * reminded about.
 */

import type { PriorityRule, PriorityView } from '../priority/types';
import type { PushPayload } from '../push/send';
import {
  NOTIFICATION_FALLBACK_URL,
  NOTIFICATION_TAG,
  NOTIFICATION_TITLE_FOR,
  trimNotificationBody,
} from './copy';

/**
 * Every way a run can end. One of these is always the answer, and the
 * administrator's tool prints the sentence for whichever it was.
 */
export type DecisionOutcome =
  | 'sent'
  | 'unknown_member'
  | 'reminders_off'
  | 'no_devices'
  | 'test_account'
  | 'outside_window'
  | 'already_sent_today'
  | 'weekly_cadence'
  | 'no_priority'
  | 'nothing_pending'
  | 'already_done'
  | 'safety_quiet'
  | 'receipt_lost_race'
  | 'send_failed';

/** Why the card's verdict is or is not worth interrupting her for. */
export type PendingVerdict =
  | { pending: true; rule: PriorityRule }
  | { pending: false; outcome: 'nothing_pending' | 'already_done' | 'safety_quiet' };

/**
 * The one place "is something genuinely waiting" is decided.
 *
 * @param checkinDoneToday  Read at SEND time, not at evaluation time. See
 *                          the 'daily_reset' note in this file's header.
 */
export function isWorthInterrupting(
  view: PriorityView,
  checkinDoneToday: boolean
): PendingVerdict {
  if (view.status === 'done' || view.status === 'saved') {
    return { pending: false, outcome: 'already_done' };
  }

  const rule = view.selected.rule;

  if (rule === 'safety') return { pending: false, outcome: 'safety_quiet' };
  if (rule === 'gentle_focus') return { pending: false, outcome: 'nothing_pending' };
  if (rule === 'daily_reset' && checkinDoneToday) {
    return { pending: false, outcome: 'already_done' };
  }

  return { pending: true, rule };
}

/**
 * The notification, built from the card she is about to be pointed at.
 *
 * The body is the card's own title and nothing else, so the phone and the
 * app say the same sentence. The path is the card's own href when it has
 * one; a rung with no screen of its own (re-entry) opens Home, which is
 * where its card is.
 */
export function buildNotificationPayload(view: PriorityView): PushPayload {
  return {
    title: NOTIFICATION_TITLE_FOR[view.selected.rule],
    body: trimNotificationBody(view.selected.title),
    url: view.selected.href ?? NOTIFICATION_FALLBACK_URL,
    tag: NOTIFICATION_TAG,
  };
}
