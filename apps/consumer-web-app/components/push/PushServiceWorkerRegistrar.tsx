'use client';

/**
 * Registers the service worker (public/sw.js) once, after paint.
 *
 * A push can only be delivered to a browser that has this registered, and
 * a registration outlives the tab that made it, so doing it here means a
 * member who turned reminders on months ago keeps receiving them without
 * having to open the settings screen again.
 *
 * Renders nothing, decides nothing and writes nothing to the database.
 * Registering a service worker is a browser-local act, not state that
 * belongs to a decision, which is why it is safe from a mounted effect
 * here while a row insert would not be.
 *
 * The worker itself handles push and notification taps only. There is no
 * fetch handler and no cache, so this cannot change what any page serves.
 */

import { useEffect } from 'react';
import { registerPushServiceWorker } from '@/lib/push/client';

export function PushServiceWorkerRegistrar() {
  useEffect(() => {
    void registerPushServiceWorker();
  }, []);

  return null;
}
