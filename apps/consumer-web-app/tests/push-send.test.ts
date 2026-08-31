/**
 * Sending a push: the two rules every send obeys.
 *
 *  1. THE PREFERENCE DECIDES, NOT THE ROWS. Her single on/off switch is
 *     read first, and off ends the send even if devices are somehow still
 *     saved. Turning it off already revokes them, so this is the second
 *     lock, and it is here because "stops all sends" has to be true of the
 *     send itself and not only of the switch.
 *  2. A DEVICE THAT IS GONE IS RETIRED, NOT RETRIED. A push service
 *     answers 404 or 410 when the subscription no longer exists, which is
 *     what happens when the app is deleted from a phone. That answer is
 *     final, so the row is revoked rather than tried again forever.
 *
 * web-push and the database access are both replaced here, because what is
 * being proved is the decisions this file makes, not that a third party
 * can encrypt a payload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

const getMemberPushState = vi.fn();
const listLivePushDevices = vi.fn();
const revokePushSubscriptionByEndpoint = vi.fn(async () => true);
vi.mock('../lib/push/data', () => ({
  getMemberPushState: (...args: unknown[]) => getMemberPushState(...args),
  listLivePushDevices: (...args: unknown[]) => listLivePushDevices(...args),
  revokePushSubscriptionByEndpoint: (...args: unknown[]) => revokePushSubscriptionByEndpoint(...args),
}));

import { isGoneStatus, isPushSendingConfigured, getVapidConfig, sendPushToMember } from '../lib/push/send';

const MEMBER = '11111111-1111-1111-1111-111111111111';
const PAYLOAD = { title: 'Rooted Reset', body: 'Something is ready.', url: '/dashboard' };
const supabase = {} as never;

function device(endpoint: string, label: string) {
  return {
    id: endpoint,
    memberId: MEMBER,
    endpoint,
    subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
    deviceLabel: label,
    createdAt: '2026-08-30T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  process.env.VAPID_SUBJECT = 'mailto:info@mefwellness.com';
  sendNotification.mockResolvedValue(undefined);
  getMemberPushState.mockResolvedValue({ enabled: true, promptShownAt: null, promptAnswer: null, liveDeviceCount: 1 });
  listLivePushDevices.mockResolvedValue([device('https://push.test/one', 'iPhone, Safari')]);
});

describe('the preference decides', () => {
  it('sends nothing at all when her switch is off, even with a live device saved', async () => {
    getMemberPushState.mockResolvedValue({ enabled: false, promptShownAt: null, promptAnswer: null, liveDeviceCount: 1 });

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.skipped).toContain('turned off');
  });

  it('says plainly when there was nowhere to send rather than reporting a silent success', async () => {
    listLivePushDevices.mockResolvedValue([]);

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(result.sent).toBe(0);
    expect(result.skipped).toContain('no device saved');
  });
});

describe('a send that works', () => {
  it('reaches every saved device once, with the payload as JSON', async () => {
    listLivePushDevices.mockResolvedValue([
      device('https://push.test/one', 'iPhone, Safari'),
      device('https://push.test/two', 'Android, Chrome'),
    ]);

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(result).toEqual({ sent: 2, retired: 0, failures: [] });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification.mock.calls[0][1]).toBe(JSON.stringify(PAYLOAD));
    expect(sendNotification.mock.calls[0][2].vapidDetails.privateKey).toBe('test-private-key');
  });
});

describe('a device that is gone', () => {
  it('is retired, not counted as a failure to retry tomorrow', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 410, body: 'gone' });

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(revokePushSubscriptionByEndpoint).toHaveBeenCalledWith(supabase, 'https://push.test/one');
    expect(result.retired).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.sent).toBe(0);
  });

  it('does not retire a device over a temporary refusal', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 429, body: 'too many requests' });

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(revokePushSubscriptionByEndpoint).not.toHaveBeenCalled();
    expect(result.retired).toBe(0);
    expect(result.failures).toEqual([
      { deviceLabel: 'iPhone, Safari', status: 429, message: 'too many requests' },
    ]);
  });

  it('one dead device does not stop the others being reached', async () => {
    listLivePushDevices.mockResolvedValue([
      device('https://push.test/one', 'Old phone'),
      device('https://push.test/two', 'New phone'),
    ]);
    sendNotification.mockRejectedValueOnce({ statusCode: 404 });

    const result = await sendPushToMember(supabase, MEMBER, PAYLOAD);

    expect(result.sent).toBe(1);
    expect(result.retired).toBe(1);
  });

  it('knows which answers mean gone', () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(null)).toBe(false);
  });
});

describe('configuration', () => {
  it('names the missing variable rather than failing deep inside a send', () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(isPushSendingConfigured()).toBe(false);
    expect(() => getVapidConfig()).toThrow(/VAPID_PRIVATE_KEY/);

    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    expect(() => getVapidConfig()).toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/);
  });

  it('has a contact for the push service even when none is configured', () => {
    delete process.env.VAPID_SUBJECT;
    expect(getVapidConfig().subject).toBe('mailto:info@mefwellness.com');
  });
});
