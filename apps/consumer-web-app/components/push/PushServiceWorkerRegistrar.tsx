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
 *
 * =====================================================================
 * NOT ON THE SIGNED-OUT AUTH SCREENS, AND NOT BEFORE THE PAGE IS IDLE.
 * (2026-09-13)
 * =====================================================================
 *
 * This is mounted in the root layout, so it ran on /login and /signup too.
 * Those are the two screens where the browser is already racing: the app's
 * own JavaScript is hydrating, Cloudflare's bot check is fetching its
 * script and then running a challenge, and the member is typing. A service
 * worker registration is a fetch, a parse and an install on that same
 * thread, in exactly that window, for a visitor who has no account yet and
 * therefore cannot be sent a push by anybody.
 *
 * So it is skipped on the signed-out auth screens entirely (the very next
 * screen after signing in registers it, which is before any push could be
 * sent), and everywhere else it waits for the browser to be idle instead
 * of starting the moment the effect runs. Nothing about what is
 * registered, or about push delivery, changes.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { registerPushServiceWorker } from '@/lib/push/client';

/**
 * The signed-out screens. A visitor here has no account, so there is
 * nothing that could be pushed to this browser until she is through them.
 */
const SKIP_PREFIXES = ['/login', '/signup', '/verify', '/reset-password'];

export function PushServiceWorkerRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return undefined;
    }

    // requestIdleCallback where it exists (not Safari on older iOS), a
    // short timeout everywhere else, so this never runs inside the first
    // paint's own work.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(() => void registerPushServiceWorker());
      const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback;
      return () => {
        if (typeof cancel === 'function') cancel(handle);
      };
    }
    const timer = window.setTimeout(() => void registerPushServiceWorker(), 1500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
