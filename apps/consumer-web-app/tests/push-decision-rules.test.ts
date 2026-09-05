/**
 * The daily notification decision's four pure rules, on a table of inputs.
 *
 *   1. WHAT IS WORTH INTERRUPTING HER FOR. Three rungs never are, and one
 *      of the three ('daily_reset' after she has checked in) is the whole
 *      point of rechecking completion at send time rather than trusting
 *      the stored rule.
 *   2. WHEN. Her own hour, never UTC, with a catch-up window that never
 *      crosses her midnight.
 *   3. HOW OFTEN. Five ignored in a row drops her to one a week, and
 *      opening the app restores daily even when the last reminder still
 *      counts as ignored.
 *   4. WHAT IT SAYS. The card's own title, verbatim, trimmed only when a
 *      phone genuinely could not fit it, and no em dash anywhere.
 *
 * Nothing here touches a database, a clock or a network. Every one of
 * these functions is reached by the real job with exactly these arguments.
 */
import { describe, it, expect } from 'vitest';
import type { PriorityRule, PriorityStatus, PriorityView } from '../lib/priority/types';
import { buildNotificationPayload, isWorthInterrupting } from '../lib/push-decision/decide';
import {
  DEFAULT_SEND_HOUR,
  SEND_WINDOW_CATCH_UP_HOURS,
  isInsideSendWindow,
  resolveSendHour,
  sendWindowEndHour,
} from '../lib/push-decision/window';
import {
  IGNORED_STREAK_FOR_WEEKLY,
  WEEKLY_CADENCE_DAYS,
  openedWithin24h,
  resolveCadence,
} from '../lib/push-decision/cadence';
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_FOR,
  trimNotificationBody,
} from '../lib/push-decision/copy';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES } from '../lib/priority/types';

const EM_DASH = '—';

function view(
  rule: PriorityRule,
  overrides: { status?: PriorityStatus; title?: string; href?: string | null } = {}
): PriorityView {
  return {
    selected: {
      rule,
      priorityKey: 'key',
      title: overrides.title ?? 'Take two minutes for your Daily Reset.',
      reason: null,
      help: 'help',
      href: overrides.href === undefined ? '/checkin' : overrides.href,
      openTarget: null,
      actionType: 'reset',
      threadKey: `${rule}::key`,
      approach: 0,
      evidence: {} as never,
    },
    status: overrides.status ?? 'active',
    localDate: '2026-08-31',
    bridge: null,
    isReEntry: false,
    welcomeLine: null,
    frictionQuestion: null,
  };
}

// ---------------------------------------------------------------------
// 1. What is worth interrupting her for
// ---------------------------------------------------------------------

describe('is there genuinely something waiting', () => {
  it('sends nothing on gentle_focus, which is the card having something kind to say on a finished day', () => {
    const verdict = isWorthInterrupting(view('gentle_focus'), true);
    expect(verdict.pending).toBe(false);
    expect(verdict.pending === false && verdict.outcome).toBe('nothing_pending');
  });

  it('sends nothing on safety, because that card exists to stop asking things of her', () => {
    const verdict = isWorthInterrupting(view('safety'), false);
    expect(verdict.pending).toBe(false);
    expect(verdict.pending === false && verdict.outcome).toBe('safety_quiet');
  });

  it('sends the Daily Reset when it is genuinely not done', () => {
    const verdict = isWorthInterrupting(view('daily_reset'), false);
    expect(verdict.pending).toBe(true);
    expect(verdict.pending === true && verdict.rule).toBe('daily_reset');
  });

  it('THE RECHECK: the stored rule still says daily_reset, but the check-in now exists, so nothing is sent', () => {
    // This is the case the send-time recheck exists for. The stored row is
    // authoritative for the day and legitimately still says daily_reset
    // after she has checked in, because the single permitted revision may
    // already have been spent. The check-in itself is the deciding fact.
    const verdict = isWorthInterrupting(view('daily_reset'), true);
    expect(verdict.pending).toBe(false);
    expect(verdict.pending === false && verdict.outcome).toBe('already_done');
  });

  it.each(['done', 'saved'] as const)('sends nothing once she has marked today %s', (status) => {
    const verdict = isWorthInterrupting(view('reset_plan_commitment', { status }), false);
    expect(verdict.pending).toBe(false);
    expect(verdict.pending === false && verdict.outcome).toBe('already_done');
  });

  it('sends every other rung of the ladder', () => {
    const sendable = [...PRIORITY_LADDER, ...PRIORITY_OVERRIDES].filter(
      (rule) => rule !== 'gentle_focus' && rule !== 'safety'
    );
    for (const rule of sendable) {
      const verdict = isWorthInterrupting(view(rule), false);
      expect(verdict.pending, `${rule} should be worth sending`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// 2. When
// ---------------------------------------------------------------------

describe('her own send window', () => {
  it('defaults to nine in the morning when nothing is stored', () => {
    expect(resolveSendHour(null)).toBe(DEFAULT_SEND_HOUR);
    expect(resolveSendHour(undefined)).toBe(9);
  });

  it('uses a stored hour when there is one', () => {
    expect(resolveSendHour(6)).toBe(6);
    expect(resolveSendHour(0)).toBe(0);
    expect(resolveSendHour(23)).toBe(23);
  });

  it('falls back rather than coercing a nonsense value, so 24 never becomes midnight', () => {
    expect(resolveSendHour(24)).toBe(DEFAULT_SEND_HOUR);
    expect(resolveSendHour(-1)).toBe(DEFAULT_SEND_HOUR);
    expect(resolveSendHour(9.5)).toBe(DEFAULT_SEND_HOUR);
    expect(resolveSendHour(Number.NaN)).toBe(DEFAULT_SEND_HOUR);
  });

  it('opens at her hour and stays open for the catch-up hours', () => {
    expect(isInsideSendWindow(8, 9)).toBe(false);
    expect(isInsideSendWindow(9, 9)).toBe(true);
    expect(isInsideSendWindow(9 + SEND_WINDOW_CATCH_UP_HOURS, 9)).toBe(true);
    expect(isInsideSendWindow(9 + SEND_WINDOW_CATCH_UP_HOURS + 1, 9)).toBe(false);
  });

  it('NEVER CROSSES HER MIDNIGHT: a member who sends at 23 has a window of 23 only', () => {
    expect(sendWindowEndHour(23)).toBe(23);
    expect(isInsideSendWindow(23, 23)).toBe(true);
    expect(isInsideSendWindow(0, 23)).toBe(false);
    expect(isInsideSendWindow(1, 23)).toBe(false);
  });

  it('clamps a window that would otherwise reach tomorrow', () => {
    expect(sendWindowEndHour(22)).toBe(23);
    expect(sendWindowEndHour(9)).toBe(11);
  });
});

// ---------------------------------------------------------------------
// 3. How often
// ---------------------------------------------------------------------

const SENT = '2026-08-20T13:00:00.000Z';

describe('ignored means the app went unopened, not that she did not do the thing', () => {
  it('counts a sign-in inside the twenty four hours after the send', () => {
    expect(openedWithin24h(SENT, ['2026-08-20T18:00:00.000Z'])).toBe(true);
    expect(openedWithin24h(SENT, ['2026-08-21T12:59:00.000Z'])).toBe(true);
  });

  it('does not count a sign-in before the send, or more than a day after it', () => {
    expect(openedWithin24h(SENT, ['2026-08-20T12:59:00.000Z'])).toBe(false);
    expect(openedWithin24h(SENT, ['2026-08-21T13:01:00.000Z'])).toBe(false);
  });

  it('does not count nothing at all', () => {
    expect(openedWithin24h(SENT, [])).toBe(false);
  });
});

function delivery(localDate: string, openedWithin: boolean) {
  return { localDate, sentAt: `${localDate}T13:00:00.000Z`, openedWithin24h: openedWithin };
}

describe('Root never nags', () => {
  it('stays on one a day for a member who has never had a reminder', () => {
    const verdict = resolveCadence({
      recent: [],
      openedSinceLastSent: false,
      todayLocalDate: '2026-08-31',
    });
    expect(verdict.cadence).toBe('daily');
    expect(verdict.allowedToday).toBe(true);
    expect(verdict.ignoredStreak).toBe(0);
  });

  it('stays on one a day at four ignored in a row, and drops at five', () => {
    const four = ['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'].map((d) =>
      delivery(d, false)
    );
    expect(
      resolveCadence({ recent: four, openedSinceLastSent: false, todayLocalDate: '2026-08-31' })
        .cadence
    ).toBe('daily');

    const five = [...four, delivery('2026-08-26', false)];
    expect(five).toHaveLength(IGNORED_STREAK_FOR_WEEKLY);
    const verdict = resolveCadence({
      recent: five,
      openedSinceLastSent: false,
      todayLocalDate: '2026-08-31',
    });
    expect(verdict.cadence).toBe('weekly');
    expect(verdict.ignoredStreak).toBe(5);
  });

  it('breaks the streak on the most recent opened reminder, however old the ones behind it are', () => {
    const recent = [
      delivery('2026-08-30', true),
      delivery('2026-08-29', false),
      delivery('2026-08-28', false),
      delivery('2026-08-27', false),
      delivery('2026-08-26', false),
    ];
    const verdict = resolveCadence({
      recent,
      openedSinceLastSent: true,
      todayLocalDate: '2026-08-31',
    });
    expect(verdict.ignoredStreak).toBe(0);
    expect(verdict.cadence).toBe('daily');
  });

  it('RESTORES DAILY THE MOMENT SHE OPENS THE APP, even when the last reminder still counts as ignored', () => {
    // Five ignored in a row, so the streak is real; but she signed in
    // thirty hours after the last one, which is too late to have "opened
    // it" and is exactly what "until she opens the app again" means.
    const recent = [
      delivery('2026-08-30', false),
      delivery('2026-08-29', false),
      delivery('2026-08-28', false),
      delivery('2026-08-27', false),
      delivery('2026-08-26', false),
    ];
    const quiet = resolveCadence({
      recent,
      openedSinceLastSent: false,
      todayLocalDate: '2026-08-31',
    });
    expect(quiet.cadence).toBe('weekly');

    const back = resolveCadence({
      recent,
      openedSinceLastSent: true,
      todayLocalDate: '2026-08-31',
    });
    expect(back.cadence).toBe('daily');
    expect(back.allowedToday).toBe(true);
    expect(back.ignoredStreak).toBe(5);
  });

  it('on one a week, refuses until seven of her own days have passed', () => {
    const recent = ['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26'].map((d) =>
      delivery(d, false)
    );
    const tooSoon = resolveCadence({
      recent,
      openedSinceLastSent: false,
      todayLocalDate: '2026-09-05',
    });
    expect(tooSoon.daysSinceLastSent).toBe(6);
    expect(tooSoon.allowedToday).toBe(false);

    const due = resolveCadence({
      recent,
      openedSinceLastSent: false,
      todayLocalDate: '2026-09-06',
    });
    expect(due.daysSinceLastSent).toBe(WEEKLY_CADENCE_DAYS);
    expect(due.allowedToday).toBe(true);
    expect(due.cadence).toBe('weekly');
  });
});

// ---------------------------------------------------------------------
// 4. What it says
// ---------------------------------------------------------------------

describe('the notification carries the card’s own words', () => {
  it('uses the card title as the body, verbatim', () => {
    const payload = buildNotificationPayload(
      view('reset_plan_commitment', { title: 'Walk for ten minutes after lunch.' })
    );
    expect(payload.body).toBe('Walk for ten minutes after lunch.');
    expect(payload.title).toBe(NOTIFICATION_TITLE_FOR.reset_plan_commitment);
  });

  it('opens the card’s own screen, and Home when the card names none', () => {
    expect(buildNotificationPayload(view('daily_reset')).url).toBe('/checkin');
    expect(buildNotificationPayload(view('re_entry', { href: null })).url).toBe('/dashboard');
  });

  it('leaves a body that fits completely alone', () => {
    const short = 'Take two minutes for your Daily Reset.';
    expect(trimNotificationBody(short)).toBe(short);
  });

  it('trims a long body at a word boundary rather than mid-word', () => {
    const long = `${'word '.repeat(60)}end`;
    const trimmed = trimNotificationBody(long);
    expect(trimmed.length).toBeLessThanOrEqual(NOTIFICATION_BODY_MAX);
    expect(trimmed.endsWith('...')).toBe(true);
    expect(trimmed.slice(0, -3).endsWith('word')).toBe(true);
  });

  it('has a title for every rung, so a new rule cannot ship without one', () => {
    for (const rule of [...PRIORITY_LADDER, ...PRIORITY_OVERRIDES]) {
      expect(NOTIFICATION_TITLE_FOR[rule], `${rule} needs a title`).toBeTruthy();
    }
  });

  it('has no em dash in any title', () => {
    for (const title of Object.values(NOTIFICATION_TITLE_FOR)) {
      expect(title).not.toContain(EM_DASH);
    }
  });
});
