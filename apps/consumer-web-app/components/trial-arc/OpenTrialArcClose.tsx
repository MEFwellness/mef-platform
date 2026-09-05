'use client';

/**
 * "She opened her close." Renders nothing.
 *
 * THE SAME SHAPE AND THE SAME REASONS AS
 * components/trial-arc/OpenTrialArcRecap.tsx, which this is deliberately a
 * sibling of rather than a generalization: dropped into a server-rendered
 * screen, fired from a mounted effect so the write happens after the screen
 * has painted, guarded so React's development double mount cannot fire it
 * twice, and able to refresh exactly once when the server had nothing to
 * show yet.
 *
 * DELIBERATELY NOT A RENDER-TIME WRITE ON THE PAGE. The close page may read
 * her stored close; it may not compose one, and it may not record that she
 * saw it. A page render that composed one would compose it for every screen
 * Next prefetched, and a page render that stamped "opened" would make
 * Prompt 6's "she never opened it" unable to ever be true.
 *
 * THE REFRESH IS GUARDED, and the guard is deliberate rather than
 * defensive: if the server decides she may not have a close (the arc is not
 * launched for her, or she is not at day 7) then nothing is written and the
 * refreshed page still has none. Without the guard that is an infinite
 * refresh loop on a screen a member is looking at. sessionStorage is the
 * same "already done this" idiom the recap's opener uses, scoped per tab.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { sendBeacon, sendBeaconAwaited } from '@/lib/analytics/beacon';

const ATTEMPT_KEY = 'mef-trial-arc-close-composed';

function alreadyAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY) === '1';
  } catch {
    // A browser that will not give us session storage gets one attempt and
    // no refresh, which is the safe direction: a missing close is a quiet
    // screen, a refresh loop is not.
    return true;
  }
}

function rememberAttempt(): void {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, '1');
  } catch {
    // Nothing to do. The guard above already refuses to retry.
  }
}

export function OpenTrialArcClose({ hasClose }: { hasClose: boolean }) {
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // She already has one, so this is only the open stamp, and it never
    // needs the answer back.
    if (hasClose) {
      sendBeacon({ event: 'trial_arc_close_opened' });
      return;
    }

    if (alreadyAttempted()) return;
    rememberAttempt();
    void sendBeaconAwaited({ event: 'trial_arc_close_opened' }).then(() => {
      router.refresh();
    });
  }, [hasClose, router]);

  return null;
}
