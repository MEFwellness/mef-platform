'use client';

/**
 * "She opened her recap." Renders nothing.
 *
 * SAME SHAPE AND THE SAME REASONS AS components/programs/MarkProgramOpened.tsx
 * and components/trial-arc/TrackTrialArcDelivered.tsx: dropped into a
 * server-rendered screen, fired from a mounted effect so the write happens
 * after the screen has painted, and guarded so React's development double
 * mount cannot fire it twice.
 *
 * DELIBERATELY NOT A RENDER-TIME WRITE ON THE PAGE. The recap page may read
 * her stored recap; it may not compose one, and it may not record that she
 * saw it. A page render that composed a recap would compose one for every
 * screen Next prefetched, and a page render that stamped "opened" would
 * make the next prompt's "she never opened it" unable to ever be true.
 *
 * THE ONE THING THIS DOES THAT THE OTHER TRACKERS DO NOT: it can refresh.
 *
 * The beacon behind it composes her recap when she does not have one yet,
 * which is a real case rather than a defensive one. She can press the day 6
 * pop-up's button in the same second it appears and navigate here while the
 * pop-up's own beacon is still in flight, and she can reach this screen on
 * day 7 having never opened the app on day 6. In both, the page has just
 * rendered with no recap to show. So when the page tells this component
 * there was none (`hasRecap` false), it AWAITS the beacon and then refreshes
 * the route, and the second render has her week on it.
 *
 * IT REFRESHES AT MOST ONCE, and the guard is deliberate rather than
 * defensive: if the server decides she may not have a recap (the arc is not
 * launched for her, or she is not at day 6 yet) then nothing is written and
 * the refreshed page still has none. Without the guard that is an infinite
 * refresh loop on a screen a member is looking at. sessionStorage is the
 * same "already done this" idiom useCloseScreenReveal uses, scoped per tab
 * so a genuinely new visit tomorrow can try again.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { sendBeacon, sendBeaconAwaited } from '@/lib/analytics/beacon';

const ATTEMPT_KEY = 'mef-trial-arc-recap-composed';

function alreadyAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY) === '1';
  } catch {
    // A browser that will not give us session storage gets one attempt and
    // no refresh, which is the safe direction: a missing recap is a quiet
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

export function OpenTrialArcRecap({ hasRecap }: { hasRecap: boolean }) {
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // She already has one, so this is only the open stamp, and it never
    // needs the answer back.
    if (hasRecap) {
      sendBeacon({ event: 'trial_arc_recap_opened' });
      return;
    }

    if (alreadyAttempted()) return;
    rememberAttempt();
    void sendBeaconAwaited({ event: 'trial_arc_recap_opened' }).then(() => {
      router.refresh();
    });
  }, [hasRecap, router]);

  return null;
}
