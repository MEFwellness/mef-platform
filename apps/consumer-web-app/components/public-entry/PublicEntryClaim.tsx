'use client';

/**
 * Binds a member to the public arrival she came from, once, the first time
 * a session exists in a browser that holds a visitor token.
 *
 * ALMOST ALWAYS A NO-OP. readVisitorToken() is a plain localStorage read
 * with no network call, and it deliberately never mints a token, so a
 * member who never took the public experience does nothing here on any page
 * load, ever. Only a browser that genuinely holds one reaches the route.
 * Same shape and same reasoning as app/GuestPreviewMigrator.tsx, which is
 * mounted beside it.
 *
 * WHY IT POSTS TO A ROUTE HANDLER RATHER THAN CALLING A SERVER ACTION. A
 * Server Action makes Next re-render the whole current route on the server
 * and stream the payload back. This is mounted in the root layout, so on
 * every page. See lib/analytics/beacon.ts for what that cost when it was
 * measured on Home.
 *
 * THE RETRY CONTRACT. `retry: true` means "no session yet, ask again on a
 * later page load", which is what happens while she is still on the signup
 * or verify screen. `retry: false` means stop asking, either because the
 * bind now exists or because the token names nothing.
 */

import { useEffect, useRef } from 'react';
import { isClaimed, markClaimed, readVisitorToken } from '@/lib/public-entry/storage';

export function PublicEntryClaim() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (isClaimed()) return;
    const token = readVisitorToken();
    if (!token) return;

    attempted.current = true;

    void fetch('/api/public-entry/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorToken: token }),
      keepalive: true,
    })
      .then(async (response) => {
        if (response.status === 204) {
          attempted.current = false;
          return;
        }
        const body = (await response.json()) as { claimed?: boolean; retry?: boolean };
        if (body.claimed || body.retry === false) {
          markClaimed();
          return;
        }
        attempted.current = false;
      })
      .catch(() => {
        attempted.current = false;
      });
  }, []);

  return null;
}
