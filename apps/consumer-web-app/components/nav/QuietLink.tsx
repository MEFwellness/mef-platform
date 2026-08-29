'use client';

/**
 * A LINK THAT DOES NOT ASK THE SERVER FOR ITS DESTINATION UNTIL SHE REACHES
 * FOR IT.
 *
 * Next prefetches a `<Link>` the moment it scrolls into view, and a prefetch
 * of a dynamic route is a real request that a real serverless function
 * answers. Home carries nineteen links. Left alone, opening Home asks the
 * server to get thirteen other screens ready on the chance she taps one of
 * them, and she taps at most one.
 *
 * Measured on production (median of three, warm function, her own session,
 * so RLS is exactly what it would be for her):
 *
 *   /dashboard        1.06s per prefetch   <- the Home tab, on every screen
 *   /today            0.29s
 *   /progress         0.30s
 *   /food-lens        0.32s
 *   /checkin          0.31s
 *   /root-score       0.32s
 *   /case             0.33s
 *   /movement         0.33s
 *   /recommendations  0.40s
 *   /noticing         0.31s
 *   /programs/<id>    0.35s, and 198 bytes of routing stub
 *
 * A fetch of a static asset from the same place costs 0.14s, so roughly half
 * of each of those is the trip and the rest is the server.
 *
 * WHAT A PREFETCH ACTUALLY BUYS, WHICH IS LESS THAN IT SOUNDS. A route with
 * a `loading.tsx` prefetches the layouts and that loading state, never the
 * page: measured against production, a prefetch of `/dashboard` returns the
 * settling skeleton and no greeting, and touches no rows. So what she gets
 * for it is the skeleton a few hundred milliseconds sooner, and the real
 * content still costs its full render at tap time either way. A route with
 * NO `loading.tsx` cannot be prefetched at all, which is why
 * `/programs/<id>` answers with 198 bytes of routing stub: that one is paid
 * for and buys nothing whatsoever.
 *
 * SO THE RULE IS: automatic prefetch is for the links she taps most days and
 * whose targets are cheap. That is the bottom bar's Check-In, Today,
 * Progress and Food Lens tabs, and the day's one Priority Card button.
 * Everything else on Home uses this component.
 *
 * IT IS NOT "NO PREFETCH". Next still prefetches on `touchstart` and on
 * hover when `prefetch` is false, and it fetches the full route rather than
 * just the loading state when it does. On a phone `touchstart` fires the
 * instant her finger lands, before the tap completes, so the request is
 * already in flight while her finger is still on the glass. The prefetch
 * moves from "every link she scrolled past" to "the one link she is
 * touching", which is the whole change.
 */

import Link from 'next/link';
import type { ComponentProps } from 'react';

export function QuietLink(props: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  return <Link {...props} prefetch={false} />;
}
