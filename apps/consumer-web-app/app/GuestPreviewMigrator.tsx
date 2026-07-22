'use client';

import { useEffect, useRef } from 'react';
import { migrateGuestPreview } from './actions/guest-preview';
import {
  clearGuestPreview,
  getGuestPreviewState,
  hasPendingGuestData,
  isGuestPreviewMigrated,
  markGuestPreviewMigrated,
} from '@/lib/guest-preview/storage';

/**
 * Mounted once in the root layout so it runs on every page. Almost always
 * a no-op: hasPendingGuestData() is a plain localStorage read with no
 * network call, so a normal signed-in member (the common case on every
 * page load) never triggers the server action below. Only a browser that
 * still has leftover guest quiz answers reaches migrateGuestPreview(),
 * which itself no-ops silently if there's no session yet (e.g. still on
 * an auth page) — see app/actions/guest-preview.ts.
 */
export function GuestPreviewMigrator() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (isGuestPreviewMigrated() || !hasPendingGuestData()) return;

    const state = getGuestPreviewState();
    if (!state) return;

    attempted.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    migrateGuestPreview(state.answers, timezone)
      .then((result) => {
        if (result.migrated) {
          clearGuestPreview();
          markGuestPreviewMigrated();
        } else {
          // No session yet, or a transient error — leave local data in
          // place and allow a later page load to retry.
          attempted.current = false;
        }
      })
      .catch(() => {
        attempted.current = false;
      });
  }, []);

  return null;
}
