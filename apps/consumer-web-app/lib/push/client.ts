/**
 * The browser half of turning reminders on: register the service worker,
 * ask the phone for permission, and hand back a subscription the server
 * can store.
 *
 * Everything here touches `window` or `navigator`, so it only ever runs
 * from a client component. The decisions it makes about what this browser
 * can do live in lib/push/platform.ts, which is pure and tested; this file
 * only gathers the facts and drives the browser APIs.
 */

import {
  resolvePushCapability,
  describeDevice,
  type PushCapability,
  type PushEnvironmentFacts,
} from './platform';
import type { PushSubscriptionJson } from './data';

export const PUSH_SERVICE_WORKER_PATH = '/sw.js';

/** iOS Safari's own non-standard "running from the Home Screen" flag. */
type IosNavigator = Navigator & { standalone?: boolean };

export function readPushEnvironment(): PushEnvironmentFacts {
  const nav = navigator as IosNavigator;
  const standaloneDisplay =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches);

  return {
    userAgent: nav.userAgent || '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    isStandalone: standaloneDisplay || nav.standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
  };
}

export function readPushCapability(): PushCapability {
  return resolvePushCapability(readPushEnvironment());
}

export function readDeviceLabel(): string {
  const nav = navigator as IosNavigator;
  return describeDevice(nav.userAgent || '', nav.maxTouchPoints ?? 0);
}

/**
 * The VAPID public key, base64url as web-push generates it, decoded to the
 * bytes `pushManager.subscribe` wants.
 */
export function decodeVapidKey(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_PATH);
    if (existing) return existing;
    return await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_PATH);
  } catch (error) {
    console.error('registerPushServiceWorker failed', error);
    return null;
  }
}

export type SubscribeOutcome =
  | { ok: true; subscription: PushSubscriptionJson; deviceLabel: string }
  /** She, or the phone, said no. Final until she changes it in the phone's own settings. */
  | { ok: false; reason: 'denied' }
  /** This browser cannot do push at all, or the app is not installed on an iPhone yet. */
  | { ok: false; reason: 'unsupported'; capability: PushCapability }
  /** Something went wrong that is worth showing rather than swallowing. */
  | { ok: false; reason: 'error'; message: string };

/**
 * Asks the phone for permission and returns a subscription. Never called
 * from a render: this triggers the native permission prompt, so it only
 * ever runs from a tap she made.
 */
export async function subscribeToPush(): Promise<SubscribeOutcome> {
  const capability = readPushCapability();
  if (capability !== 'ready') return { ok: false, reason: 'unsupported', capability };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return {
      ok: false,
      reason: 'error',
      message: 'Reminders are not set up on this site yet. Nothing is wrong with your phone.',
    };
  }

  const registration = await registerPushServiceWorker();
  if (!registration) {
    return { ok: false, reason: 'error', message: 'This browser would not start the background helper reminders need.' };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (error) {
    console.error('Notification.requestPermission failed', error);
    return { ok: false, reason: 'error', message: 'This browser would not show the permission request.' };
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const ready = await navigator.serviceWorker.ready;
    const existing = await ready.pushManager.getSubscription();

    // A subscription made against a different application server key can
    // never be sent to, so it is replaced rather than reused.
    if (existing) {
      const json = existing.toJSON() as PushSubscriptionJson;
      const sameKey = matchesApplicationServerKey(existing, vapidPublicKey);
      if (sameKey && json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        return { ok: true, subscription: json, deviceLabel: readDeviceLabel() };
      }
      await existing.unsubscribe();
    }

    const created = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey) as BufferSource,
    });
    const json = created.toJSON() as PushSubscriptionJson;
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'error', message: 'This browser returned an incomplete subscription.' };
    }
    return { ok: true, subscription: json, deviceLabel: readDeviceLabel() };
  } catch (error) {
    console.error('pushManager.subscribe failed', error);
    return { ok: false, reason: 'error', message: 'This browser could not finish setting reminders up.' };
  }
}

function matchesApplicationServerKey(subscription: PushSubscription, vapidPublicKey: string): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false;
  try {
    const current = new Uint8Array(key as ArrayBuffer);
    const expected = decodeVapidKey(vapidPublicKey);
    if (current.length !== expected.length) return false;
    return current.every((byte, index) => byte === expected[index]);
  } catch (error) {
    return false;
  }
}

/** Retires the browser's own subscription when she turns reminders off, so the phone stops holding one. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    return endpoint;
  } catch (error) {
    console.error('unsubscribeFromPush failed', error);
    return null;
  }
}
