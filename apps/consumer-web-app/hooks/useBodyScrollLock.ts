'use client';

/**
 * Locks background page scroll while a modal overlay is open — the floating
 * coach bottom sheet, the Root pop-up chain, the sign-out confirmation, and
 * every other sheet or dialog in the app.
 *
 * The lock itself lives in lib/scroll-lock/bodyScrollLock.ts and is
 * reference counted, so two components locking for the same modal (or two
 * modals open at once) can no longer strand the page pinned after both have
 * closed. See that module's own comment for the bug that made counting
 * necessary; this hook is only the React lifetime wrapper around it.
 */

import { useEffect } from 'react';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '@/lib/scroll-lock/bodyScrollLock';

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquireBodyScrollLock();
    return releaseBodyScrollLock;
  }, [locked]);
}
