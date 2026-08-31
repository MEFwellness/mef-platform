/**
 * THE DAILY NOTIFICATION DECISION.
 *
 * One member, one local day, one answer. Everything the job does for a
 * member happens in runNotificationDecisionForMember below, and the
 * scheduled pass is nothing but that function in a loop.
 *
 * THE ITEM IS THE PRIORITY CARD'S, NOT THIS FILE'S. There is no second
 * selection engine here and there must never be one. The job calls
 * lib/priority/service.ts's buildPriorityView, which is the exact call
 * Home, Today and the Root pop-up chain make, so the sentence on her lock
 * screen is by construction the sentence at the top of the app when she
 * opens it. lib/push-decision/context.ts gathers that function's four
 * inputs from the same accessors the signed-in path uses, addressed by
 * member id rather than by cookie.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN.
 *
 *   1. who she is, and her own clock          (never a UTC date)
 *   2. test account, on the schedule only
 *   3. her send window, on the schedule only
 *   4. her switch, and whether a device exists
 *   5. today's receipt: one a day, full stop
 *   6. cadence: five ignored in a row means one a week
 *   7. the Priority Card's verdict
 *   8. the completion recheck, read AGAIN, at send time
 *   9. claim the receipt
 *  10. send
 *
 * Every cheap, certain "no" is asked before the expensive engine runs, so
 * a member who cannot be sent to costs one round trip rather than twenty.
 * The two exceptions are deliberate: the completion recheck sits AFTER the
 * engine because it is checking the engine's own answer, and the receipt
 * is claimed as late as possible so a run that was never going to send
 * does not spend her day.
 *
 * WHAT THE ADMINISTRATOR'S FORCE RUN CHANGES, AND ALL IT CHANGES. It
 * skips step 2 and step 3, and says so in its answer. It does not skip her
 * switch, her devices, the receipt, the cadence, the card, the recheck or
 * the claim, because a tool that skipped those would be proving a
 * different job from the one that runs at nine in the morning.
 *
 * THERE IS NO RETRY PATH ANYWHERE IN THIS FILE. A send that fails is
 * recorded as having failed and today is over for that member. Two
 * notifications in a day is a worse failure than none.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriorityRule } from '../priority/types';
import { buildPriorityView } from '../priority/service';
import { getDailyPriority } from '../priority/data';
import { getMemberPushState } from '../push/data';
import { sendPushToMember } from '../push/send';
import { nowInTimezone, toLocalDateString } from '../time/localDate';
import {
  IGNORED_STREAK_FOR_WEEKLY,
  resolveCadence,
  type Cadence,
} from './cadence';
import { buildPriorityContextForMember, readCheckinDoneToday } from './context';
import {
  claimPushDelivery,
  getPushDelivery,
  listNotifiableMembers,
  loadNotifiableMember,
  loadCadenceHistory,
  recordPushDeliveryOutcome,
} from './data';
import { buildNotificationPayload, isWorthInterrupting, type DecisionOutcome } from './decide';
import { explainDecision } from './explain';
import { isInsideSendWindow, resolveSendHour } from './window';

export type NotificationRunSource = 'scheduled' | 'admin';

export type NotificationDecision = {
  memberId: string;
  outcome: DecisionOutcome;
  /** One plain sentence saying what was decided and why. See ./explain.ts. */
  sentence: string;
  timezone: string;
  /** Her own calendar day, never a UTC one. */
  localDate: string;
  localHour: number;
  sendHour: number;
  cadence: Cadence;
  ignoredStreak: number;
  /** Which rung of the Priority Card was in play, when the run got that far. */
  rule: PriorityRule | null;
  title: string | null;
  body: string | null;
  url: string | null;
  sentDeviceCount: number;
  retiredDeviceCount: number;
  /** Anything a push service said that was not "gone". Empty on a clean run. */
  failures: string[];
  /** True when this run skipped the test-account exclusion and the send window. */
  forced: boolean;
};

function decision(
  base: {
    memberId: string;
    timezone: string;
    localDate: string;
    localHour: number;
    sendHour: number;
    forced: boolean;
  },
  outcome: DecisionOutcome,
  extra: Partial<NotificationDecision> & {
    alreadySentAt?: string | null;
    alreadySentTitle?: string | null;
    daysSinceLastSent?: number | null;
    failureDetail?: string | null;
  } = {}
): NotificationDecision {
  const built: NotificationDecision = {
    ...base,
    outcome,
    sentence: '',
    cadence: extra.cadence ?? 'daily',
    ignoredStreak: extra.ignoredStreak ?? 0,
    rule: extra.rule ?? null,
    title: extra.title ?? null,
    body: extra.body ?? null,
    url: extra.url ?? null,
    sentDeviceCount: extra.sentDeviceCount ?? 0,
    retiredDeviceCount: extra.retiredDeviceCount ?? 0,
    failures: extra.failures ?? [],
  };

  built.sentence = explainDecision({
    outcome,
    timezone: base.timezone,
    localHour: base.localHour,
    sendHour: base.sendHour,
    title: built.title,
    body: built.body,
    alreadySentAt: extra.alreadySentAt ?? null,
    alreadySentTitle: extra.alreadySentTitle ?? null,
    ignoredStreak: built.ignoredStreak,
    daysSinceLastSent: extra.daysSinceLastSent ?? null,
    sentDeviceCount: built.sentDeviceCount,
    failureDetail: extra.failureDetail ?? null,
  });

  return built;
}

export async function runNotificationDecisionForMember(
  supabase: SupabaseClient,
  memberId: string,
  options: { source: NotificationRunSource }
): Promise<NotificationDecision> {
  const forced = options.source === 'admin';

  // 1. Who she is, and what her own clock says. Never a UTC date.
  const member = await loadNotifiableMember(supabase, memberId);
  if (!member) {
    return decision(
      {
        memberId,
        timezone: 'UTC',
        localDate: '',
        localHour: 0,
        sendHour: resolveSendHour(null),
        forced,
      },
      'unknown_member'
    );
  }

  const timezone = member.timezone;
  const nowLocal = nowInTimezone(timezone);
  const localDate = toLocalDateString(nowLocal);
  // nowInTimezone returns her wall clock expressed as a UTC instant, so
  // the UTC hour of that value IS her local hour. Reading getHours() here
  // would read the host process's zone instead, which on Vercel is UTC and
  // on a developer's laptop is not.
  const localHour = nowLocal.getUTCHours();
  const sendHour = resolveSendHour(member.storedSendHour);
  const base = { memberId, timezone, localDate, localHour, sendHour, forced };

  // 2. The schedule never wakes a seeded fixture up.
  if (member.isTest && !forced) return decision(base, 'test_account');

  // 3. Her own send window. The force-run tool deliberately ignores it.
  if (!forced && !isInsideSendWindow(localHour, sendHour)) {
    return decision(base, 'outside_window');
  }

  // 4. Her switch, then her devices. Both are read again inside
  //    lib/push/send.ts, which is the lock that actually stops a send;
  //    these are here so the answer says WHICH of the two it was.
  const pushState = await getMemberPushState(supabase, memberId);
  if (!pushState.enabled) return decision(base, 'reminders_off');
  if (pushState.liveDeviceCount === 0) return decision(base, 'no_devices');

  // 5. One a day. The receipt is read before anything expensive runs, and
  //    claimed again at step 9, which is the claim that actually enforces
  //    it. This read only exists so a blocked run can say when and what.
  const existing = await getPushDelivery(supabase, memberId, localDate);
  if (existing) {
    return decision(base, 'already_sent_today', {
      alreadySentAt: existing.sentAt,
      alreadySentTitle: existing.title,
      cadence: existing.cadence,
    });
  }

  // 6. Root never nags.
  const history = await loadCadenceHistory(supabase, memberId, IGNORED_STREAK_FOR_WEEKLY);
  const verdict = resolveCadence({
    recent: history.recent,
    openedSinceLastSent: history.openedSinceLastSent,
    todayLocalDate: localDate,
  });
  if (!verdict.allowedToday) {
    return decision(base, 'weekly_cadence', {
      cadence: verdict.cadence,
      ignoredStreak: verdict.ignoredStreak,
      daysSinceLastSent: verdict.daysSinceLastSent,
    });
  }

  // 7. The Priority Card's own decision, from the Priority Card's own
  //    function. Nothing here chooses anything.
  const context = await buildPriorityContextForMember(supabase, memberId, localDate);
  const view = await buildPriorityView(supabase, memberId, localDate, context);
  if (!view) {
    return decision(base, 'no_priority', {
      cadence: verdict.cadence,
      ignoredStreak: verdict.ignoredStreak,
    });
  }

  // 8. THE RECHECK, AT SEND TIME. Both facts are read a second time, from
  //    the database, after the engine has run: she may have finished the
  //    thing between the evaluation above and this line, and on a pass
  //    over many members that gap is real. The stored row's status is the
  //    authority on "she already acted", and today's check-in is the
  //    authority on "the Daily Reset is done", which the stored rule alone
  //    cannot answer (see ./decide.ts).
  const [checkinDoneNow, rowNow] = await Promise.all([
    readCheckinDoneToday(supabase, memberId, localDate),
    getDailyPriority(supabase, memberId, localDate),
  ]);
  const atSendTime = rowNow ? { ...view, status: rowNow.status } : view;
  const worth = isWorthInterrupting(atSendTime, checkinDoneNow);
  if (!worth.pending) {
    return decision(base, worth.outcome, {
      cadence: verdict.cadence,
      ignoredStreak: verdict.ignoredStreak,
      rule: atSendTime.selected.rule,
    });
  }

  const payload = buildNotificationPayload(atSendTime);

  // 9. Claim the day. A lost claim means somebody else is already sending.
  const receipt = await claimPushDelivery(supabase, memberId, localDate, {
    priorityRule: atSendTime.selected.rule,
    priorityKey: atSendTime.selected.priorityKey,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    cadence: verdict.cadence,
    source: options.source,
  });
  if (!receipt.claimed) {
    return decision(
      base,
      receipt.reason === 'conflict' ? 'receipt_lost_race' : 'receipt_write_failed',
      {
        cadence: verdict.cadence,
        ignoredStreak: verdict.ignoredStreak,
        rule: atSendTime.selected.rule,
        failureDetail: receipt.reason === 'refused' ? receipt.detail : null,
      }
    );
  }

  // 10. Send. Whatever happens now, today is spent.
  const result = await sendPushToMember(supabase, memberId, payload);
  await recordPushDeliveryOutcome(supabase, receipt.claimed.id, {
    sentDeviceCount: result.sent,
    retiredDeviceCount: result.retired,
  });

  const failures = result.failures.map(
    (failure) =>
      `${failure.deviceLabel ?? 'A device'} refused it${failure.status ? ` (${failure.status})` : ''}: ${failure.message}`
  );

  const common = {
    cadence: verdict.cadence,
    ignoredStreak: verdict.ignoredStreak,
    rule: atSendTime.selected.rule,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    sentDeviceCount: result.sent,
    retiredDeviceCount: result.retired,
    failures,
  };

  if (result.sent === 0) {
    const detail =
      result.skipped ??
      (failures.length > 0
        ? failures.join(' ')
        : result.retired > 0
          ? 'every saved device was gone and has been retired'
          : null);
    return decision(base, 'send_failed', { ...common, failureDetail: detail });
  }

  return decision(base, 'sent', common);
}

export type NotificationPassResult = {
  /** Members the pass considered at all: reminders on, a live device, not a test account. */
  considered: number;
  sent: number;
  /** Members whose window had not arrived. The ordinary majority on any hourly run. */
  outsideWindow: number;
  nothingWaiting: number;
  alreadySentToday: number;
  quietPeriod: number;
  failed: number;
  /** One line per member the pass actually sent to or failed on. Never a line per member skipped for the clock. */
  notable: { memberId: string; outcome: DecisionOutcome; rule: PriorityRule | null }[];
};

/**
 * The scheduled pass. Every member with reminders on and a device that is
 * not revoked, one at a time, each isolated: one member's failure never
 * stops the pass.
 *
 * Sequential on purpose. This runs once an hour against a set that is
 * bounded by "people who have said yes on a phone", each member costs one
 * priority engine run, and a burst of parallel engine runs against one
 * database buys nothing at this size while making a slow query into a
 * pile-up.
 */
export async function runDailyNotificationPass(
  supabase: SupabaseClient
): Promise<NotificationPassResult> {
  const members = await listNotifiableMembers(supabase);

  const result: NotificationPassResult = {
    considered: members.length,
    sent: 0,
    outsideWindow: 0,
    nothingWaiting: 0,
    alreadySentToday: 0,
    quietPeriod: 0,
    failed: 0,
    notable: [],
  };

  for (const member of members) {
    let outcome: NotificationDecision;
    try {
      outcome = await runNotificationDecisionForMember(supabase, member.memberId, {
        source: 'scheduled',
      });
    } catch (error) {
      console.error('daily notification pass: member failed', member.memberId, error);
      result.failed += 1;
      continue;
    }

    switch (outcome.outcome) {
      case 'sent':
        result.sent += 1;
        result.notable.push({ memberId: member.memberId, outcome: 'sent', rule: outcome.rule });
        break;
      case 'outside_window':
        result.outsideWindow += 1;
        break;
      case 'already_sent_today':
        result.alreadySentToday += 1;
        break;
      case 'weekly_cadence':
        result.quietPeriod += 1;
        break;
      case 'nothing_pending':
      case 'already_done':
      case 'safety_quiet':
      case 'no_priority':
        result.nothingWaiting += 1;
        break;
      default:
        result.failed += 1;
        result.notable.push({
          memberId: member.memberId,
          outcome: outcome.outcome,
          rule: outcome.rule,
        });
        break;
    }
  }

  return result;
}
