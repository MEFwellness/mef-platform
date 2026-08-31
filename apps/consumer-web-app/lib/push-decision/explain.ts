/**
 * "Sent X because Y", or "sent nothing because Z", in one sentence.
 *
 * WHO READS THIS. Only an administrator, in the force-run tool. It is not
 * member copy and never reaches a phone, but it obeys the same two rules
 * anyway: no em dashes, and no jargon. Somebody looking at this screen is
 * trying to answer "why did my phone not buzz", and "the ladder resolved
 * to gentle_focus" does not answer it.
 *
 * PURE, AND TOTAL. A switch over every DecisionOutcome with no default, so
 * adding an outcome fails the typecheck here until it has a sentence.
 * That is the point: an outcome nobody can read is an outcome nobody can
 * debug.
 *
 * "They" rather than "she": this prints for whoever the administrator
 * picked, and the tool beside it already says "that member".
 */

import { formatInTimeZone } from '../time/displayDate';
import type { DecisionOutcome } from './decide';
import { formatSendHour, sendWindowEndHour } from './window';

export type ExplainInput = {
  outcome: DecisionOutcome;
  timezone: string;
  /** Her own wall-clock hour when the run happened. */
  localHour: number;
  sendHour: number;
  /** The notification, when one was built. */
  title: string | null;
  body: string | null;
  /** Today's existing receipt, when one blocked the run. */
  alreadySentAt: string | null;
  alreadySentTitle: string | null;
  /** Cadence facts, for the quiet-period sentence. */
  ignoredStreak: number;
  daysSinceLastSent: number | null;
  /** Send results, when a send was attempted. */
  sentDeviceCount: number;
  failureDetail: string | null;
};

function devices(count: number): string {
  return count === 1 ? '1 device' : `${count} devices`;
}

function days(count: number | null): string {
  if (count === null) return 'some time ago';
  if (count === 0) return 'today';
  if (count === 1) return '1 day ago';
  return `${count} days ago`;
}

export function explainDecision(input: ExplainInput): string {
  const quoted = input.title && input.body ? `"${input.title}: ${input.body}"` : 'a reminder';

  switch (input.outcome) {
    case 'sent':
      return `Sent ${quoted} because that is today's one thing on their Priority Card and it is still waiting. It reached ${devices(input.sentDeviceCount)}.`;

    case 'unknown_member':
      return 'Sent nothing because there is no member with that id.';

    case 'test_account':
      return 'Sent nothing because this is a test account, and the daily schedule never selects one. Running it from this tool does reach them, which is what this tool is for.';

    case 'outside_window':
      return `Sent nothing because their send window is ${formatSendHour(input.sendHour)} to ${formatSendHour(sendWindowEndHour(input.sendHour))} in their own timezone, and it is ${formatSendHour(input.localHour)} for them right now.`;

    case 'reminders_off':
      return 'Sent nothing because reminders are turned off for this member.';

    case 'no_devices':
      return 'Sent nothing because this member has no device saved right now, so there was nowhere to send.';

    case 'already_sent_today': {
      const at = input.alreadySentAt
        ? formatInTimeZone(
            input.alreadySentAt,
            { hour: 'numeric', minute: '2-digit' },
            input.timezone
          )
        : 'earlier';
      const what = input.alreadySentTitle ? ` It said "${input.alreadySentTitle}".` : '';
      return `Sent nothing because they already had today's one notification at ${at} their time.${what} One a day is the cap, and the record of it is what enforces that.`;
    }

    case 'weekly_cadence':
      return `Sent nothing because their last ${input.ignoredStreak} reminders all went unopened, so they are on one a week for now. The last one was ${days(input.daysSinceLastSent)}, and they go back to one a day as soon as they open the app.`;

    case 'no_priority':
      return "Sent nothing because today's Priority Card could not be worked out for this member, so there was nothing honest to name.";

    case 'nothing_pending':
      return "Sent nothing because nothing is waiting. They have done today's Daily Reset and have no other item outstanding.";

    case 'already_done':
      return "Sent nothing because today's one thing is already done.";

    case 'safety_quiet':
      return 'Sent nothing because they have an unresolved safety flag. On that day Root asks nothing of them, so nothing is sent to their phone either.';

    case 'receipt_lost_race':
      return "Sent nothing because another run claimed today's one notification at the same moment. That is the cap working, not a fault.";

    case 'send_failed':
      return `Nothing reached a device${input.failureDetail ? `: ${input.failureDetail}` : '.'} Today's one notification is spent and will not be tried again, because a retry is how a member ends up with two.`;
  }
}
