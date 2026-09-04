'use client';

/**
 * Records that the Quick Wellness Check taken in this browser was hers,
 * once, the first time a session exists.
 *
 * WHAT IT REPLACED. app/GuestPreviewMigrator.tsx, which sat in this exact
 * slot and copied the guest's seven answers into a real daily_checkins row
 * on the first page load after signup, with nothing recording that they had
 * come from a stranger with no account. This writes no member data at all.
 * The answers themselves are already fenced server side in
 * guest_wellness_check_answers (migration 202); all this does is say which
 * account the run belonged to. There is deliberately no promotion path: if
 * those answers ever become something Root uses, it will be because she was
 * shown them and said yes.
 *
 * ALMOST ALWAYS A NO-OP. readGuestVisitorToken() is a plain localStorage
 * read with no network call, and it deliberately never mints a token, so a
 * member who never took the quiz does nothing here on any page load, ever.
 *
 * WHY IT POSTS TO A ROUTE HANDLER RATHER THAN CALLING A SERVER ACTION. A
 * Server Action makes Next re-render the whole current route on the server
 * and stream the payload back. This is mounted in the root layout, so on
 * every page. See lib/analytics/beacon.ts for what that cost when it was
 * measured on Home.
 *
 * THE RETRY CONTRACT. `retry: true` means "no session yet, ask again on a
 * later page load", which is what happens while she is still on the signup
 * or verify screen. `retry: false` means stop asking.
 */

import { useEffect, useRef } from 'react';
import {
  isGuestPreviewClaimed,
  markGuestPreviewClaimed,
  readGuestVisitorToken,
} from '@/lib/guest-preview/storage';

export function GuestPreviewClaim() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (isGuestPreviewClaimed()) return;
    const token = readGuestVisitorToken();
    if (!token) return;

    attempted.current = true;

    void fetch('/api/guest-preview/claim', {
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
          markGuestPreviewClaimed();
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
