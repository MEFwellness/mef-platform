/**
 * Sending a push. Server only: it reads the VAPID private key, which never
 * reaches a browser.
 *
 * NOTHING IN THIS BUILD CALLS THIS ON A SCHEDULE. The only caller today is
 * the administrator's "send a test notification" tool. The daily decision
 * job that works out whether there is genuinely something waiting, and
 * sends at most one reminder, is a later build; this is the piece it will
 * call, written once here so that build adds a decision and not a second
 * delivery path.
 *
 * TWO RULES EVERY SEND OBEYS.
 *
 * 1. THE PREFERENCE DECIDES, NOT THE ROWS. Her single on/off preference is
 *    read first and an "off" ends the send, even if devices are somehow
 *    still saved. Turning it off already revokes them, so this is the
 *    second lock rather than the only one, and it is here because "stops
 *    all sends" has to be true of the send itself.
 *
 * 2. A DEVICE THAT IS GONE IS RETIRED, NOT RETRIED. A push service answers
 *    404 or 410 when a subscription no longer exists, which is what
 *    happens when the app is deleted from a phone or notifications are
 *    turned off in the phone's own settings. That answer is final, so the
 *    row is revoked there and then instead of being tried again tomorrow
 *    forever.
 */

import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMemberPushState,
  listLivePushDevices,
  revokePushSubscriptionByEndpoint,
  type PushSubscriptionJson,
} from './data';

export type PushPayload = {
  title: string;
  body: string;
  /** An in-app path. The service worker opens this when the notification is tapped. */
  url: string;
  tag?: string;
};

export type PushSendResult = {
  sent: number;
  /** Devices the push service reported as gone, now revoked. */
  retired: number;
  /** Devices that failed for some other reason, with what the push service said. */
  failures: { deviceLabel: string | null; status: number | null; message: string }[];
  /** Set when nothing was even attempted, with the plain reason why. */
  skipped?: string;
};

/**
 * Reads the three VAPID variables. Same discipline as
 * lib/supabase/env.ts: fail here, by name, rather than deep inside a send
 * with an opaque error.
 */
export function getVapidConfig(): { subject: string; publicKey: string; privateKey: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@mefwellness.com';

  const missing: string[] = [];
  if (!publicKey) missing.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Push notifications are not configured: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing. ` +
        'Set them in .env.local for local development, or in Vercel under ' +
        'Project Settings, Environment Variables, for a deployed environment, then redeploy.'
    );
  }

  return { subject, publicKey: publicKey!, privateKey: privateKey! };
}

/** True when this environment could send a push at all. Lets a screen say so instead of throwing. */
export function isPushSendingConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type WebPushError = { statusCode?: number; body?: string; message?: string };

async function sendToOneDevice(
  subscription: PushSubscriptionJson,
  payload: PushPayload
): Promise<{ ok: true } | { ok: false; status: number | null; message: string }> {
  const { subject, publicKey, privateKey } = getVapidConfig();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: { subject, publicKey, privateKey },
        // Apple rejects a push with no urgency, and a reminder is not
        // time critical in the sense that word has here.
        urgency: 'normal',
        TTL: 60 * 60 * 12,
      }
    );
    return { ok: true };
  } catch (error) {
    const pushError = error as WebPushError;
    return {
      ok: false,
      status: typeof pushError.statusCode === 'number' ? pushError.statusCode : null,
      message: pushError.body || pushError.message || 'The push service refused this notification.',
    };
  }
}

/** A push service saying the subscription itself is gone. Final, so the row is retired. */
export function isGoneStatus(status: number | null): boolean {
  return status === 404 || status === 410;
}

export async function sendPushToMember(
  supabase: SupabaseClient,
  memberId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  const empty: PushSendResult = { sent: 0, retired: 0, failures: [] };

  const state = await getMemberPushState(supabase, memberId);
  if (!state.enabled) {
    return { ...empty, skipped: 'Reminders are turned off for this member, so nothing was sent.' };
  }

  const devices = await listLivePushDevices(supabase, memberId);
  if (devices.length === 0) {
    return { ...empty, skipped: 'This member has no device saved, so there was nowhere to send.' };
  }

  const result: PushSendResult = { sent: 0, retired: 0, failures: [] };

  for (const device of devices) {
    const outcome = await sendToOneDevice(device.subscription, payload);
    if (outcome.ok) {
      result.sent += 1;
      continue;
    }

    if (isGoneStatus(outcome.status)) {
      await revokePushSubscriptionByEndpoint(supabase, device.endpoint);
      result.retired += 1;
      continue;
    }

    result.failures.push({
      deviceLabel: device.deviceLabel,
      status: outcome.status,
      message: outcome.message,
    });
  }

  return result;
}
