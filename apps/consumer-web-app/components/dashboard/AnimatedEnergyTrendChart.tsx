'use client';

/**
 * Home dashboard redesign — the "Energy Trend line draws in" requirement,
 * without touching components/EnergyTrendChart.tsx's own line/dot/area
 * rendering (that component is also used by app/progress/page.tsx and
 * the coach client view, app/coach/clients/[id]/page.tsx — see its own
 * showBars doc comment). A left-to-right clip-path wipe around the
 * chart achieves the same "drawing in" feel as animating the SVG stroke
 * directly, entirely from the outside. Respects prefers-reduced-motion
 * by skipping straight to fully revealed.
 *
 * 2026-07-27 animation task: this used to draw in once, on mount,
 * regardless of scroll position (a plain requestAnimationFrame right
 * after first render) — if the chart was below the fold at page load,
 * its 1.1s wipe had already finished, unseen, before the member ever
 * scrolled to it. Replaced with its own dedicated IntersectionObserver
 * (deliberately NOT the shared components/dashboard/RevealOnScroll.tsx —
 * see that decision's own reasoning, now recorded on components/
 * ScrollDrawIn.tsx below) so the wipe plays for real, every time the card
 * is actually looked at: reset to the closed clip-path the moment the
 * card scrolls fully out of view, replayed the moment it scrolls back in.
 *
 * 2026-07-27 follow-up task ("Your Wellness Story" gets the same
 * treatment): the observer/clip-path/reduced-motion logic that used to
 * live entirely in this file was lifted out, unchanged in behavior, into
 * components/ScrollDrawIn.tsx — see that file's own doc comment for the
 * full reasoning (including the zero-width-never-intersects trap and why
 * this still isn't folded into RevealOnScroll). This component is now a
 * thin wrapper: same threshold, same reset-on-exit, same everything on
 * Home, just delegating instead of duplicating, so the Progress page's
 * Root Score chart (components/AnimatedRootScoreTrendChart.tsx) can reuse
 * the exact same scroll-watcher rather than a second implementation.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';
import { ScrollDrawIn } from '@/components/ScrollDrawIn';

export function AnimatedEnergyTrendChart({ checkins }: { checkins: DailyCheckin[] }) {
  return (
    <ScrollDrawIn>
      <EnergyTrendChart checkins={checkins} showBars />
    </ScrollDrawIn>
  );
}
