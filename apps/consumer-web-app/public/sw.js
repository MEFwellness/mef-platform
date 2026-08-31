/*
 * Rooted Reset service worker.
 *
 * Push handling only. There is deliberately no fetch handler and no
 * caching here: this build's job is to receive a notification and open the
 * right screen when it is tapped, and an offline cache is a separate
 * decision with its own staleness problems. Adding one later means adding
 * a fetch handler to this file, not replacing it.
 *
 * The payload the server sends is JSON: { title, body, url, tag }. `url`
 * is the app path the tap should land on, and it is the only part of the
 * payload this file acts on rather than displays. A push that arrives with
 * no body at all, or with something that is not JSON, still shows a
 * notification rather than nothing, because a silent push on iOS spends
 * the app's delivery budget and can get push switched off for the site.
 */

const DEFAULT_TITLE = 'Rooted Reset';
const DEFAULT_BODY = 'Something is ready for you.';
const DEFAULT_URL = '/dashboard';

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close. There
  // is no cached asset that an older worker could still be serving, so
  // there is nothing to lose by activating at once.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (error) {
    // Not JSON. Whatever text arrived is still better than a blank body.
    try {
      return { body: event.data.text() };
    } catch (innerError) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
  const body = typeof payload.body === 'string' && payload.body ? payload.body : DEFAULT_BODY;
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // One a day at most, so a tag is about replacing a reminder that is
      // still sitting unread rather than about batching.
      tag: typeof payload.tag === 'string' && payload.tag ? payload.tag : 'rooted-reset',
      renotify: false,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const path = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : DEFAULT_URL;
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the app is already open somewhere, move that window rather than
      // opening a second copy of the app beside it.
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.focus().then((focused) => (focused || client).navigate(target));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
