/**
 * The daily notification job, end to end, with only its four real
 * boundaries replaced: the Priority Card engine, the push send, the
 * member reads and the receipt table. What is being proved here is the
 * ORDER and the CONSEQUENCES of the job's decisions, not that Supabase
 * can store a row (tests/push-decision-integration.test.ts proves the cap
 * against real RLS and a real unique index).
 *
 * The four properties that matter most, and each has a test that fails
 * without the line that provides it:
 *
 *   * The receipt is claimed BEFORE the push service is asked for
 *     anything, so a send that succeeds can never leave no record.
 *   * A send that fails is not retried, ever. The receipt stands.
 *   * The completion state is read a SECOND time, after the engine ran.
 *   * The scheduled pass never selects a test account; the administrator's
 *     force run reaches one, and skips the window as well.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PriorityRule, PriorityStatus } from '../lib/priority/types';

const buildPriorityView = vi.fn();
vi.mock('../lib/priority/service', async () => {
  const actual = await vi.importActual<typeof import('../lib/priority/service')>(
    '../lib/priority/service'
  );
  return { ...actual, buildPriorityView: (...a: unknown[]) => buildPriorityView(...a) };
});

const getDailyPriority = vi.fn();
vi.mock('../lib/priority/data', () => ({
  getDailyPriority: (...a: unknown[]) => getDailyPriority(...a),
}));

const getMemberPushState = vi.fn();
vi.mock('../lib/push/data', () => ({
  getMemberPushState: (...a: unknown[]) => getMemberPushState(...a),
}));

const sendPushToMember = vi.fn();
vi.mock('../lib/push/send', () => ({
  sendPushToMember: (...a: unknown[]) => sendPushToMember(...a),
}));

const buildPriorityContextForMember = vi.fn();
const readCheckinDoneToday = vi.fn();
vi.mock('../lib/push-decision/context', () => ({
  buildPriorityContextForMember: (...a: unknown[]) => buildPriorityContextForMember(...a),
  readCheckinDoneToday: (...a: unknown[]) => readCheckinDoneToday(...a),
}));

const loadNotifiableMember = vi.fn();
const listNotifiableMembers = vi.fn();
const getPushDelivery = vi.fn();
const claimPushDelivery = vi.fn();
const recordPushDeliveryOutcome = vi.fn(async (..._a: unknown[]) => undefined);
const loadCadenceHistory = vi.fn();
vi.mock('../lib/push-decision/data', () => ({
  loadNotifiableMember: (...a: unknown[]) => loadNotifiableMember(...a),
  listNotifiableMembers: (...a: unknown[]) => listNotifiableMembers(...a),
  getPushDelivery: (...a: unknown[]) => getPushDelivery(...a),
  claimPushDelivery: (...a: unknown[]) => claimPushDelivery(...a),
  recordPushDeliveryOutcome: (...a: unknown[]) => recordPushDeliveryOutcome(...a),
  loadCadenceHistory: (...a: unknown[]) => loadCadenceHistory(...a),
}));

import {
  runDailyNotificationPass,
  runNotificationDecisionForMember,
} from '../lib/push-decision/service';

const MEMBER = '11111111-1111-1111-1111-111111111111';
const supabase = {} as never;

/** 13:00 UTC is 09:00 in New York, so a default member is inside her window. */
const NINE_AM_NEW_YORK = new Date('2026-08-31T13:30:00.000Z');

function priorityView(
  rule: PriorityRule = 'daily_reset',
  overrides: { status?: PriorityStatus; title?: string; href?: string | null } = {}
) {
  return {
    selected: {
      rule,
      priorityKey: 'key',
      title: overrides.title ?? 'Take two minutes for your Daily Reset.',
      reason: null,
      help: 'help',
      href: overrides.href === undefined ? '/checkin' : overrides.href,
      actionType: 'reset',
      threadKey: `${rule}::key`,
      approach: 0,
      evidence: {},
    },
    status: overrides.status ?? 'active',
    localDate: '2026-08-31',
    bridge: null,
    isReEntry: false,
    welcomeLine: null,
    frictionQuestion: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NINE_AM_NEW_YORK);

  loadNotifiableMember.mockResolvedValue({
    memberId: MEMBER,
    timezone: 'America/New_York',
    storedSendHour: null,
    isTest: false,
    liveDeviceCount: 1,
  });
  getMemberPushState.mockResolvedValue({
    enabled: true,
    promptShownAt: null,
    promptAnswer: null,
    liveDeviceCount: 1,
  });
  getPushDelivery.mockResolvedValue(null);
  loadCadenceHistory.mockResolvedValue({ recent: [], openedSinceLastSent: false });
  buildPriorityContextForMember.mockResolvedValue({
    recentCheckins: [],
    todaysFocus: null,
    checkinDoneToday: false,
    totalCheckins: 0,
  });
  buildPriorityView.mockResolvedValue(priorityView());
  readCheckinDoneToday.mockResolvedValue(false);
  getDailyPriority.mockResolvedValue({ status: 'active' });
  claimPushDelivery.mockResolvedValue({ id: 'receipt-1', localDate: '2026-08-31' });
  sendPushToMember.mockResolvedValue({ sent: 1, retired: 0, failures: [] });
});

async function run(source: 'scheduled' | 'admin' = 'scheduled') {
  return runNotificationDecisionForMember(supabase, MEMBER, { source });
}

describe('the happy path', () => {
  it('sends the Priority Card’s own sentence and records one receipt', async () => {
    const decision = await run();

    expect(decision.outcome).toBe('sent');
    expect(decision.rule).toBe('daily_reset');
    expect(decision.body).toBe('Take two minutes for your Daily Reset.');
    expect(decision.url).toBe('/checkin');
    expect(decision.localDate).toBe('2026-08-31');
    expect(decision.localHour).toBe(9);
    expect(claimPushDelivery).toHaveBeenCalledTimes(1);
    expect(sendPushToMember).toHaveBeenCalledTimes(1);
    expect(recordPushDeliveryOutcome).toHaveBeenCalledWith(supabase, 'receipt-1', {
      sentDeviceCount: 1,
      retiredDeviceCount: 0,
    });
    expect(decision.sentence).toContain('Sent');
    expect(decision.sentence).not.toContain('—');
  });

  it('reads her local hour from her own timezone, not the host process’s', async () => {
    loadNotifiableMember.mockResolvedValue({
      memberId: MEMBER,
      timezone: 'America/Los_Angeles',
      storedSendHour: null,
      isTest: false,
      liveDeviceCount: 1,
    });
    // 13:30 UTC is 06:30 in Los Angeles, three hours before her window.
    const decision = await run();
    expect(decision.localHour).toBe(6);
    expect(decision.outcome).toBe('outside_window');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('the receipt is claimed before anything is sent', () => {
  it('claims first, then sends, in that order', async () => {
    const order: string[] = [];
    claimPushDelivery.mockImplementation(async () => {
      order.push('claim');
      return { id: 'receipt-1' };
    });
    sendPushToMember.mockImplementation(async () => {
      order.push('send');
      return { sent: 1, retired: 0, failures: [] };
    });

    await run();
    expect(order).toEqual(['claim', 'send']);
  });

  it('sends nothing when the claim was lost to a concurrent run', async () => {
    claimPushDelivery.mockResolvedValue(null);
    const decision = await run();

    expect(decision.outcome).toBe('receipt_lost_race');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('sends nothing when today already has a receipt, and says what it said', async () => {
    getPushDelivery.mockResolvedValue({
      id: 'earlier',
      localDate: '2026-08-31',
      sentAt: '2026-08-31T13:04:00.000Z',
      title: 'Your Daily Reset',
      cadence: 'daily',
    });

    const decision = await run();
    expect(decision.outcome).toBe('already_sent_today');
    expect(decision.sentence).toContain('Your Daily Reset');
    expect(claimPushDelivery).not.toHaveBeenCalled();
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('a failed send is never retried', () => {
  it('records nought sent, keeps the receipt, and reports it plainly', async () => {
    sendPushToMember.mockResolvedValue({
      sent: 0,
      retired: 0,
      failures: [{ deviceLabel: 'iPhone, Safari', status: 500, message: 'upstream unavailable' }],
    });

    const decision = await run();
    expect(decision.outcome).toBe('send_failed');
    expect(decision.sentDeviceCount).toBe(0);
    expect(recordPushDeliveryOutcome).toHaveBeenCalledWith(supabase, 'receipt-1', {
      sentDeviceCount: 0,
      retiredDeviceCount: 0,
    });
    expect(sendPushToMember).toHaveBeenCalledTimes(1);
    expect(decision.sentence).toContain('will not be tried again');
  });

  it('reports a device the push service said was gone, which the send layer has already retired', async () => {
    sendPushToMember.mockResolvedValue({ sent: 0, retired: 1, failures: [] });

    const decision = await run();
    expect(decision.outcome).toBe('send_failed');
    expect(decision.retiredDeviceCount).toBe(1);
    expect(decision.sentence).toContain('retired');
  });
});

describe('completion is read again at send time', () => {
  it('sends nothing when the check-in landed between the engine running and the send', async () => {
    // The engine saw no check-in; the recheck finds one.
    buildPriorityContextForMember.mockResolvedValue({
      recentCheckins: [],
      todaysFocus: null,
      checkinDoneToday: false,
      totalCheckins: 0,
    });
    readCheckinDoneToday.mockResolvedValue(true);

    const decision = await run();
    expect(readCheckinDoneToday).toHaveBeenCalled();
    expect(decision.outcome).toBe('already_done');
    expect(claimPushDelivery).not.toHaveBeenCalled();
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('sends nothing when she marked today done between the engine running and the send', async () => {
    getDailyPriority.mockResolvedValue({ status: 'done' });

    const decision = await run();
    expect(decision.outcome).toBe('already_done');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('sends nothing on a finished day with nothing else waiting', async () => {
    buildPriorityView.mockResolvedValue(priorityView('gentle_focus', { href: null }));
    readCheckinDoneToday.mockResolvedValue(true);

    const decision = await run();
    expect(decision.outcome).toBe('nothing_pending');
    expect(decision.sentence).toContain('nothing is waiting');
  });

  it('stays quiet on a safety day', async () => {
    buildPriorityView.mockResolvedValue(priorityView('safety', { href: null }));

    const decision = await run();
    expect(decision.outcome).toBe('safety_quiet');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('the two locks the send never gets past', () => {
  it('sends nothing when her switch is off', async () => {
    getMemberPushState.mockResolvedValue({
      enabled: false,
      promptShownAt: null,
      promptAnswer: null,
      liveDeviceCount: 1,
    });

    const decision = await run('admin');
    expect(decision.outcome).toBe('reminders_off');
    expect(buildPriorityView).not.toHaveBeenCalled();
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('sends nothing when there is nowhere to send', async () => {
    getMemberPushState.mockResolvedValue({
      enabled: true,
      promptShownAt: null,
      promptAnswer: null,
      liveDeviceCount: 0,
    });

    const decision = await run('admin');
    expect(decision.outcome).toBe('no_devices');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('test accounts', () => {
  beforeEach(() => {
    loadNotifiableMember.mockResolvedValue({
      memberId: MEMBER,
      timezone: 'America/New_York',
      storedSendHour: null,
      isTest: true,
      liveDeviceCount: 1,
    });
  });

  it('are never woken by the schedule', async () => {
    const decision = await run('scheduled');
    expect(decision.outcome).toBe('test_account');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('ARE reached by the administrator’s force run, which is the only way this is provable', async () => {
    const decision = await run('admin');
    expect(decision.outcome).toBe('sent');
    expect(decision.forced).toBe(true);
    expect(sendPushToMember).toHaveBeenCalledTimes(1);
  });
});

describe('the force run skips the window and nothing else', () => {
  beforeEach(() => {
    // Three in the morning, hers. The schedule would not touch her.
    vi.setSystemTime(new Date('2026-08-31T07:00:00.000Z'));
  });

  it('the schedule stays away', async () => {
    const decision = await run('scheduled');
    expect(decision.outcome).toBe('outside_window');
  });

  it('the force run goes ahead', async () => {
    const decision = await run('admin');
    expect(decision.outcome).toBe('sent');
  });

  it('but the force run still obeys the one a day cap', async () => {
    getPushDelivery.mockResolvedValue({
      id: 'earlier',
      localDate: '2026-08-31',
      sentAt: '2026-08-31T05:00:00.000Z',
      title: 'Your Daily Reset',
      cadence: 'daily',
    });
    const decision = await run('admin');
    expect(decision.outcome).toBe('already_sent_today');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });

  it('and still obeys the quiet period', async () => {
    loadCadenceHistory.mockResolvedValue({
      recent: ['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26'].map((d) => ({
        localDate: d,
        sentAt: `${d}T13:00:00.000Z`,
        openedWithin24h: false,
      })),
      openedSinceLastSent: false,
    });

    const decision = await run('admin');
    expect(decision.outcome).toBe('weekly_cadence');
    expect(decision.cadence).toBe('weekly');
    expect(decision.sentence).toContain('one a week');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('a member who cannot be read', () => {
  it('is reported rather than guessed at', async () => {
    loadNotifiableMember.mockResolvedValue(null);
    const decision = await run('admin');
    expect(decision.outcome).toBe('unknown_member');
    expect(sendPushToMember).not.toHaveBeenCalled();
  });
});

describe('the scheduled pass', () => {
  it('isolates one member’s failure from the rest', async () => {
    listNotifiableMembers.mockResolvedValue([
      { memberId: 'a', timezone: 'America/New_York', storedSendHour: null, isTest: false, liveDeviceCount: 1 },
      { memberId: 'b', timezone: 'America/New_York', storedSendHour: null, isTest: false, liveDeviceCount: 1 },
    ]);
    loadNotifiableMember.mockImplementation(async (_client: unknown, id: string) => {
      if (id === 'a') throw new Error('database is having a moment');
      return {
        memberId: 'b',
        timezone: 'America/New_York',
        storedSendHour: null,
        isTest: false,
        liveDeviceCount: 1,
      };
    });

    const result = await runDailyNotificationPass(supabase);
    expect(result.considered).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
  });

  it('counts a member whose window has not arrived without calling the engine for her', async () => {
    vi.setSystemTime(new Date('2026-08-31T07:00:00.000Z'));
    listNotifiableMembers.mockResolvedValue([
      { memberId: MEMBER, timezone: 'America/New_York', storedSendHour: null, isTest: false, liveDeviceCount: 1 },
    ]);

    const result = await runDailyNotificationPass(supabase);
    expect(result.outsideWindow).toBe(1);
    expect(result.sent).toBe(0);
    expect(buildPriorityView).not.toHaveBeenCalled();
  });
});
